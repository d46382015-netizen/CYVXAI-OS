"use strict";

const crypto = require("node:crypto");

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

function resolveRequestId(req) {
  const incoming = String(req.headers && req.headers["x-request-id"] || "").trim();
  return REQUEST_ID_PATTERN.test(incoming) ? incoming : crypto.randomUUID();
}

function applySecurityHeaders(res, secure = false) {
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("x-frame-options", "DENY");
  res.setHeader("referrer-policy", "no-referrer");
  res.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=()");
  res.setHeader("cross-origin-opener-policy", "same-origin");
  res.setHeader("x-permitted-cross-domain-policies", "none");
  if (secure) res.setHeader("strict-transport-security", "max-age=31536000; includeSubDomains");
}

function clientAddress(req) {
  const forwarded = String(req.headers && req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || String(req.socket && req.socket.remoteAddress || "unknown");
}

function isSecureRequest(req) {
  const forwarded = String(req.headers && req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  return forwarded === "https" || Boolean(req.socket && req.socket.encrypted);
}

function safePathname(rawUrl) {
  try {
    return new URL(rawUrl || "/", "http://localhost").pathname;
  } catch {
    return "/invalid-url";
  }
}

function normalizePath(pathname) {
  return String(pathname || "/")
    .replace(/[0-9a-f]{20,}/gi, ":id")
    .replace(/\/\d+(?=\/|$)/g, "/:id")
    .replace(/\/deliveries\/[^/]+\/retry$/i, "/deliveries/:id/retry");
}

module.exports = {
  applySecurityHeaders,
  clientAddress,
  isSecureRequest,
  normalizePath,
  resolveRequestId,
  safePathname,
};
