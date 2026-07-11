"use strict";

const crypto = require("node:crypto");
const { authorizeRequest, isProduction, truthy } = require("./production_guard");
const { normalizeRole } = require("./authorization_policy");

class IdentityGateway {
  constructor(options = {}) {
    this.env = options.env || process.env;
    this.fetch = options.fetch || globalThis.fetch;
    this.clock = options.clock || (() => Date.now());
    this.required = options.required ?? truthy(this.env.CYVX_REQUIRE_IDENTITY);
    this.issuer = normalizeUrl(options.issuer || this.env.CYVX_OIDC_ISSUER || inferIssuer(this.env));
    this.audience = String(options.audience || this.env.CYVX_OIDC_AUDIENCE || "authenticated").trim();
    this.jwksUrl = normalizeUrl(options.jwksUrl || this.env.CYVX_OIDC_JWKS_URL || (this.issuer ? `${this.issuer}/.well-known/jwks.json` : ""));
    this.sharedSecret = String(options.sharedSecret || this.env.CYVX_OIDC_JWT_SECRET || "");
    this.serviceTenantId = String(options.serviceTenantId || this.env.CYVX_SERVICE_TENANT_ID || "*").trim();
    this.clockToleranceSeconds = positive(options.clockToleranceSeconds || this.env.CYVX_OIDC_CLOCK_TOLERANCE_SECONDS, 30);
    this.cacheTtlMs = positive(options.cacheTtlMs || this.env.CYVX_OIDC_JWKS_CACHE_MS, 10 * 60 * 1000);
    this.cache = { expiresAt: 0, keys: new Map(), pending: null, lastError: null, lastSuccessAt: null };
  }

  configured() {
    return Boolean(this.issuer && this.audience && (this.jwksUrl || this.sharedSecret));
  }

  async resolve(req, options = {}) {
    const token = extractBearerToken(req);
    if (token) return this.verifyToken(token);
    if (authorizeRequest(req, this.env)) {
      return Object.freeze({
        authenticated: true,
        kind: "service",
        sub: "cyvx-service",
        user_id: "cyvx-service",
        tenant_id: this.serviceTenantId,
        role: "service",
        roles: ["service"],
        aal: "aal2",
        claims: {},
      });
    }
    if (options.allowAnonymous || !this.required) return anonymousContext();
    throw authError("AUTHENTICATION_REQUIRED", 401, "A valid bearer token or service credential is required.");
  }

  async verifyToken(token) {
    const parsed = parseJwt(token);
    const algorithm = String(parsed.header.alg || "");
    if (!["RS256", "ES256", "HS256"].includes(algorithm)) throw authError("JWT_ALGORITHM_REJECTED", 401, "The token signing algorithm is not allowed.");
    const signingInput = Buffer.from(`${parsed.encodedHeader}.${parsed.encodedPayload}`);
    let valid = false;
    if (algorithm === "HS256") {
      if (!this.sharedSecret) throw authError("JWT_SHARED_SECRET_MISSING", 503, "The symmetric JWT verifier is not configured.");
      const expected = crypto.createHmac("sha256", this.sharedSecret).update(signingInput).digest();
      valid = safeBufferEqual(expected, parsed.signature);
    } else {
      const jwk = await this.#key(parsed.header.kid);
      const key = crypto.createPublicKey({ key: jwk, format: "jwk" });
      const verifyOptions = algorithm === "ES256" ? { key, dsaEncoding: "ieee-p1363" } : key;
      valid = crypto.verify("sha256", signingInput, verifyOptions, parsed.signature);
    }
    if (!valid) throw authError("JWT_SIGNATURE_INVALID", 401, "The token signature is invalid.");
    validateClaims(parsed.payload, {
      issuer: this.issuer,
      audience: this.audience,
      nowSeconds: Math.floor(this.clock() / 1000),
      toleranceSeconds: this.clockToleranceSeconds,
    });
    return contextFromClaims(parsed.payload);
  }

  snapshot() {
    return {
      configured: this.configured(),
      required: this.required,
      issuer: this.issuer || null,
      audience: this.audience || null,
      verification: this.jwksUrl ? "jwks" : this.sharedSecret ? "shared-secret" : "unconfigured",
      jwks_cached_keys: this.cache.keys.size,
      jwks_last_success_at: this.cache.lastSuccessAt,
      jwks_last_error: this.cache.lastError,
      service_tenant_configured: Boolean(this.serviceTenantId && this.serviceTenantId !== "*"),
    };
  }

  async #key(kid) {
    if (!kid) throw authError("JWT_KID_REQUIRED", 401, "A key identifier is required for asymmetric tokens.");
    if (this.cache.expiresAt <= this.clock() || !this.cache.keys.has(kid)) await this.#refreshKeys();
    const key = this.cache.keys.get(kid);
    if (!key) throw authError("JWT_KEY_NOT_FOUND", 401, "The token signing key is not recognized.");
    return key;
  }

  async #refreshKeys() {
    if (this.cache.pending) return this.cache.pending;
    if (!this.jwksUrl || typeof this.fetch !== "function") throw authError("JWKS_UNAVAILABLE", 503, "JWKS verification is not configured.");
    this.cache.pending = (async () => {
      try {
        const response = await this.fetch(this.jwksUrl, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000) });
        if (!response.ok) throw new Error(`JWKS request failed with HTTP ${response.status}`);
        const body = await response.json();
        if (!body || !Array.isArray(body.keys)) throw new Error("JWKS response does not contain a keys array");
        const keys = new Map();
        for (const key of body.keys) if (key && key.kid && key.kty) keys.set(String(key.kid), key);
        if (!keys.size) throw new Error("JWKS response did not contain usable keys");
        this.cache.keys = keys;
        this.cache.expiresAt = this.clock() + this.cacheTtlMs;
        this.cache.lastSuccessAt = new Date(this.clock()).toISOString();
        this.cache.lastError = null;
      } catch (error) {
        this.cache.lastError = error.message;
        throw authError("JWKS_FETCH_FAILED", 503, error.message);
      } finally {
        this.cache.pending = null;
      }
    })();
    return this.cache.pending;
  }
}

function contextFromClaims(claims) {
  const appMetadata = object(claims.app_metadata);
  const rawRoles = [];
  for (const source of [claims.roles, appMetadata.roles]) {
    if (Array.isArray(source)) rawRoles.push(...source);
    else if (typeof source === "string") rawRoles.push(...source.split(/[ ,]+/));
  }
  const directRole = appMetadata.role || claims.cyvx_role || claims.role;
  if (directRole && directRole !== "authenticated" && directRole !== "anon") rawRoles.push(directRole);
  const roles = [...new Set((rawRoles.length ? rawRoles : ["viewer"]).map(normalizeRole))];
  const tenantId = String(claims.tenant_id || appMetadata.tenant_id || "").trim();
  if (!claims.sub) throw authError("JWT_SUBJECT_REQUIRED", 401, "The token subject is missing.");
  if (!tenantId) throw authError("JWT_TENANT_REQUIRED", 403, "The token does not contain a trusted tenant identifier.");
  return Object.freeze({
    authenticated: true,
    kind: "user",
    sub: String(claims.sub),
    user_id: String(claims.sub),
    tenant_id: tenantId,
    role: roles[0],
    roles,
    aal: claims.aal === "aal2" ? "aal2" : "aal1",
    session_id: claims.session_id || null,
    email: typeof claims.email === "string" ? claims.email : null,
    claims,
  });
}

function validateClaims(claims, options) {
  const now = options.nowSeconds;
  const tolerance = options.toleranceSeconds;
  if (options.issuer && String(claims.iss || "").replace(/\/$/, "") !== options.issuer) throw authError("JWT_ISSUER_INVALID", 401, "The token issuer is invalid.");
  if (options.audience && !audienceMatches(claims.aud, options.audience)) throw authError("JWT_AUDIENCE_INVALID", 401, "The token audience is invalid.");
  if (!Number.isFinite(Number(claims.exp)) || Number(claims.exp) < now - tolerance) throw authError("JWT_EXPIRED", 401, "The token has expired.");
  if (claims.nbf !== undefined && Number(claims.nbf) > now + tolerance) throw authError("JWT_NOT_ACTIVE", 401, "The token is not active yet.");
  if (claims.iat !== undefined && Number(claims.iat) > now + tolerance) throw authError("JWT_ISSUED_IN_FUTURE", 401, "The token issue time is invalid.");
}

function parseJwt(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw authError("JWT_MALFORMED", 401, "The bearer token is malformed.");
  try {
    return {
      encodedHeader: parts[0],
      encodedPayload: parts[1],
      header: JSON.parse(base64UrlDecode(parts[0]).toString("utf8")),
      payload: JSON.parse(base64UrlDecode(parts[1]).toString("utf8")),
      signature: base64UrlDecode(parts[2]),
    };
  } catch {
    throw authError("JWT_MALFORMED", 401, "The bearer token could not be decoded.");
  }
}

function extractBearerToken(req) {
  const authorization = String(req && req.headers && req.headers.authorization || "");
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function anonymousContext() {
  return Object.freeze({ authenticated: false, kind: "anonymous", sub: null, user_id: null, tenant_id: null, role: "anonymous", roles: [], aal: "aal1", claims: {} });
}

function audienceMatches(claim, expected) {
  return Array.isArray(claim) ? claim.map(String).includes(expected) : String(claim || "") === expected;
}

function inferIssuer(env) {
  const base = String(env.SUPABASE_URL || env.CYVX_POSTGREST_URL || "").replace(/\/$/, "");
  return base ? `${base}/auth/v1` : "";
}

function normalizeUrl(value) {
  const text = String(value || "").trim().replace(/\/$/, "");
  if (!text) return "";
  try { return new URL(text).toString().replace(/\/$/, ""); }
  catch { return text; }
}

function base64UrlDecode(value) {
  const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="), "base64");
}

function safeBufferEqual(left, right) {
  if (!Buffer.isBuffer(left) || !Buffer.isBuffer(right) || left.length !== right.length || !left.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function positive(value, fallback) { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback; }
function authError(code, statusCode, message) { const error = new Error(message); error.code = code; error.statusCode = statusCode; return error; }

module.exports = {
  IdentityGateway,
  anonymousContext,
  audienceMatches,
  contextFromClaims,
  extractBearerToken,
  parseJwt,
  validateClaims,
};
