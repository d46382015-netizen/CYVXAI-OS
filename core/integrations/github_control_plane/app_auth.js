"use strict";

const crypto = require("node:crypto");

class GitHubAppClient {
  constructor(options = {}) {
    this.appId = String(options.appId || process.env.GITHUB_APP_ID || "").trim();
    this.privateKey = normalizePrivateKey(options.privateKey || process.env.GITHUB_PRIVATE_KEY_PEM || "");
    this.fetchImpl = options.fetch || global.fetch;
    this.apiBase = String(options.apiBase || process.env.CYVX_GITHUB_API_BASE || "https://api.github.com").replace(/\/$/, "");
    this.userAgent = options.userAgent || "CYVXAI-OS";
    this.now = options.now || (() => Date.now());
    this.safetySeconds = Math.max(30, Number(options.safetySeconds || 120));
    this.cache = new Map();
  }

  configured() {
    return Boolean(this.appId && this.privateKey && typeof this.fetchImpl === "function");
  }

  createJwt(options = {}) {
    if (!this.appId) throw configurationError("GITHUB_APP_ID is required");
    if (!this.privateKey) throw configurationError("GITHUB_PRIVATE_KEY_PEM is required");
    const nowSeconds = Math.floor(Number(options.nowMs || this.now()) / 1000);
    const issuedAt = nowSeconds - Math.max(0, Number(options.clockSkewSeconds || 60));
    const expiresAt = nowSeconds + Math.min(540, Math.max(60, Number(options.ttlSeconds || 540)));
    const header = base64UrlJson({ alg: "RS256", typ: "JWT" });
    const payload = base64UrlJson({ iat: issuedAt, exp: expiresAt, iss: this.appId });
    const signingInput = `${header}.${payload}`;
    const signature = crypto.sign("RSA-SHA256", Buffer.from(signingInput), this.privateKey).toString("base64url");
    return `${signingInput}.${signature}`;
  }

  async getInstallationToken(installationId, options = {}) {
    const id = requirePositiveInteger(installationId, "installationId");
    const cacheKey = cacheKeyFor(id, options);
    const cached = this.cache.get(cacheKey);
    const nowMs = this.now();
    if (!options.forceRefresh && cached && cached.expiresAtMs - this.safetySeconds * 1000 > nowMs) {
      return cloneToken(cached, true);
    }

    const body = {};
    if (Array.isArray(options.repositoryIds) && options.repositoryIds.length) {
      body.repository_ids = options.repositoryIds.map((value) => requirePositiveInteger(value, "repositoryId"));
    }
    if (options.permissions && typeof options.permissions === "object") body.permissions = options.permissions;

    const data = await this.requestAppJson(`/app/installations/${id}/access_tokens`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (!data || !data.token || !data.expires_at) throw new Error("GitHub installation token response was incomplete");
    const expiresAtMs = Date.parse(data.expires_at);
    if (!Number.isFinite(expiresAtMs)) throw new Error("GitHub installation token expiration was invalid");
    const record = {
      token: String(data.token),
      expiresAt: String(data.expires_at),
      expiresAtMs,
      installationId: id,
      permissions: data.permissions || body.permissions || {},
      repositories: Array.isArray(data.repositories) ? data.repositories : [],
      cachedAt: new Date(nowMs).toISOString(),
    };
    this.cache.set(cacheKey, record);
    return cloneToken(record, false);
  }

  async requestAppJson(pathname, options = {}) {
    if (!this.configured()) throw configurationError("GitHub App authentication is not configured");
    if (typeof this.fetchImpl !== "function") throw configurationError("Fetch is unavailable");
    const response = await this.fetchImpl(this.apiBase + pathname, {
      method: options.method || "GET",
      headers: Object.assign({
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.createJwt()}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": this.userAgent,
        "Content-Type": "application/json",
      }, options.headers || {}),
      body: options.body,
    });
    return parseGitHubResponse(response);
  }

  async requestInstallationJson(installationId, pathname, options = {}) {
    const token = await this.getInstallationToken(installationId, options.token || {});
    const response = await this.fetchImpl(this.apiBase + pathname, {
      method: options.method || "GET",
      headers: Object.assign({
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": this.userAgent,
        "Content-Type": "application/json",
      }, options.headers || {}),
      body: options.body,
    });
    return parseGitHubResponse(response);
  }

  clearInstallation(installationId) {
    const prefix = `${requirePositiveInteger(installationId, "installationId")}:`;
    for (const key of this.cache.keys()) if (key.startsWith(prefix)) this.cache.delete(key);
  }

  health() {
    const nowMs = this.now();
    const tokens = Array.from(this.cache.values());
    return {
      configured: this.configured(),
      app_id_configured: Boolean(this.appId),
      private_key_configured: Boolean(this.privateKey),
      fetch_available: typeof this.fetchImpl === "function",
      cached_installation_tokens: tokens.length,
      valid_cached_installation_tokens: tokens.filter((item) => item.expiresAtMs - this.safetySeconds * 1000 > nowMs).length,
    };
  }
}

function normalizePrivateKey(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.includes("\\n") ? text.replace(/\\n/g, "\n") : text;
}

function cacheKeyFor(installationId, options = {}) {
  const repositoryIds = Array.isArray(options.repositoryIds) ? options.repositoryIds.map(Number).sort((a, b) => a - b) : [];
  const permissions = options.permissions && typeof options.permissions === "object" ? Object.keys(options.permissions).sort().reduce((out, key) => {
    out[key] = options.permissions[key];
    return out;
  }, {}) : {};
  return `${installationId}:${crypto.createHash("sha256").update(JSON.stringify({ repositoryIds, permissions })).digest("hex")}`;
}

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

async function parseGitHubResponse(response) {
  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); }
    catch { data = { raw: text }; }
  }
  if (!response.ok) {
    const error = new Error(data && (data.message || data.error) || response.statusText || "GitHub request failed");
    error.statusCode = response.status;
    error.github = data;
    throw error;
  }
  return data;
}

function cloneToken(record, fromCache) {
  return {
    token: record.token,
    expires_at: record.expiresAt,
    installation_id: record.installationId,
    permissions: JSON.parse(JSON.stringify(record.permissions || {})),
    repositories: JSON.parse(JSON.stringify(record.repositories || [])),
    from_cache: Boolean(fromCache),
  };
}

function requirePositiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new Error(`${name} must be a positive integer`);
  return number;
}

function configurationError(message) {
  const error = new Error(message);
  error.code = "GITHUB_APP_NOT_CONFIGURED";
  error.statusCode = 503;
  return error;
}

module.exports = {
  GitHubAppClient,
  normalizePrivateKey,
};
