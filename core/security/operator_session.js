"use strict";

const crypto = require("node:crypto");

function createOperatorSession(options = {}) {
  const secret = String(options.secret || process.env.CYVX_OPERATOR_SESSION_SECRET || "").trim();
  const ownerUserId = String(options.ownerUserId || process.env.CYVX_OWNER_ID || "").trim();
  const now = options.now || (() => Date.now());
  const ttlSeconds = Math.max(300, Math.min(86_400, Number(options.ttlSeconds || 3_600)));
  const cookieName = options.cookieName || "cyvx_operator";

  function configured() {
    return secret.length >= 32 && Boolean(ownerUserId);
  }

  function issue(res, input = {}) {
    if (!configured()) throw configurationError();
    const issuedAt = Math.floor(now() / 1000);
    const payload = {
      sub: String(input.user_id || ownerUserId),
      iat: issuedAt,
      exp: issuedAt + ttlSeconds,
      nonce: crypto.randomBytes(16).toString("base64url"),
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
    setCookie(res, `${encoded}.${signature}`, ttlSeconds, input.secure !== false);
    return { user_id: payload.sub, expires_at: new Date(payload.exp * 1000).toISOString() };
  }

  function verify(req) {
    if (!configured()) return null;
    const token = parseCookies(req.headers.cookie || "")[cookieName];
    if (!token) return null;
    const [encoded, signature, extra] = String(token).split(".");
    if (!encoded || !signature || extra) return null;
    const expected = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
    if (!safeEqual(signature, expected)) return null;
    let payload;
    try { payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")); }
    catch { return null; }
    if (!payload.sub || !payload.exp || Number(payload.exp) <= Math.floor(now() / 1000)) return null;
    if (payload.sub !== ownerUserId) return null;
    return payload;
  }

  function userId(req) {
    const payload = verify(req);
    return payload ? String(payload.sub) : "";
  }

  function clear(res, secure = true) {
    setCookie(res, "", 0, secure);
  }

  function health() {
    return {
      configured: configured(),
      owner_id_configured: Boolean(ownerUserId),
      session_secret_configured: secret.length >= 32,
      ttl_seconds: ttlSeconds,
      cookie_name: cookieName,
    };
  }

  function setCookie(res, value, maxAge, secure) {
    const parts = [
      `${cookieName}=${value}`,
      "Path=/",
      `Max-Age=${Math.max(0, Number(maxAge || 0))}`,
      "HttpOnly",
      "SameSite=Lax",
    ];
    if (secure) parts.push("Secure");
    res.setHeader("set-cookie", parts.join("; "));
  }

  return { clear, configured, health, issue, userId, verify };
}

function parseCookies(header) {
  return String(header || "").split(";").reduce((out, part) => {
    const index = part.indexOf("=");
    if (index < 0) return out;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) out[key] = value;
    return out;
  }, {});
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function configurationError() {
  const error = new Error("CYVX operator session is not configured");
  error.code = "OPERATOR_SESSION_NOT_CONFIGURED";
  error.statusCode = 503;
  return error;
}

module.exports = { createOperatorSession, parseCookies };
