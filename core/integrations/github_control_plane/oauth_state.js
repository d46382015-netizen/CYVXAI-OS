"use strict";

const crypto = require("node:crypto");

function createOAuthStateService(options = {}) {
  const secret = String(options.secret || process.env.GITHUB_OAUTH_STATE_SECRET || "").trim();
  const store = options.store;
  const now = options.now || (() => Date.now());
  const ttlSeconds = Math.max(60, Math.min(1800, Number(options.ttlSeconds || 600)));
  if (!store) throw new Error("GitHubAuthStore is required");

  function configured() {
    return secret.length >= 32;
  }

  function issue(input = {}) {
    if (!configured()) throw configurationError("GITHUB_OAUTH_STATE_SECRET must be at least 32 characters");
    const userId = String(input.user_id || "").trim();
    if (!userId) {
      const error = new Error("Authenticated CYVX user is required");
      error.code = "USER_REQUIRED";
      error.statusCode = 401;
      throw error;
    }
    const issuedAt = Math.floor(now() / 1000);
    const expiresAt = issuedAt + ttlSeconds;
    const id = crypto.randomBytes(24).toString("base64url");
    const payload = {
      id,
      user_id: userId,
      return_to: safeReturnTo(input.return_to),
      issued_at: new Date(issuedAt * 1000).toISOString(),
      expires_at: new Date(expiresAt * 1000).toISOString(),
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
    store.putState(id, payload);
    return { state: `${encoded}.${signature}`, payload };
  }

  function verify(token, options = {}) {
    if (!configured()) throw configurationError("GITHUB_OAUTH_STATE_SECRET must be at least 32 characters");
    const parts = String(token || "").split(".");
    if (parts.length !== 2) throw stateError("invalid_oauth_state", "OAuth state is malformed");
    const [encoded, signature] = parts;
    const expected = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
    if (!safeEqual(signature, expected)) throw stateError("invalid_oauth_state", "OAuth state signature is invalid");

    let payload;
    try { payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")); }
    catch { throw stateError("invalid_oauth_state", "OAuth state payload is invalid"); }
    if (!payload.id || !payload.user_id || !payload.expires_at) throw stateError("invalid_oauth_state", "OAuth state is incomplete");

    const stored = store.getState(payload.id);
    if (!stored) throw stateError("unknown_oauth_state", "OAuth state was not issued by this runtime");
    if (stored.consumed_at) throw stateError("replayed_oauth_state", "OAuth state has already been used");
    if (Date.parse(payload.expires_at) <= now()) throw stateError("expired_oauth_state", "OAuth state has expired");
    if (stored.user_id !== payload.user_id || stored.expires_at !== payload.expires_at) throw stateError("invalid_oauth_state", "OAuth state does not match durable state");

    if (options.consume !== false) store.consumeState(payload.id, new Date(now()).toISOString());
    return payload;
  }

  function health() {
    return {
      configured: configured(),
      secret_configured: Boolean(secret),
      ttl_seconds: ttlSeconds,
      store: store.health(),
    };
  }

  return { configured, health, issue, verify };
}

function safeReturnTo(value) {
  const text = String(value || "/").trim();
  if (!text.startsWith("/") || text.startsWith("//")) return "/";
  return text.slice(0, 500);
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""), "utf8");
  const b = Buffer.from(String(right || ""), "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function stateError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = 400;
  return error;
}

function configurationError(message) {
  const error = new Error(message);
  error.code = "GITHUB_OAUTH_NOT_CONFIGURED";
  error.statusCode = 503;
  return error;
}

module.exports = { createOAuthStateService };
