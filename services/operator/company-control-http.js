"use strict";

const crypto = require("node:crypto");
const http = require("node:http");
const { RuntimeError, verifyToken } = require("../../runtime/missions/base");
const { readBody, sendJson, match } = require("./server");
const { createCompanyControlHttpRuntime } = require("./company-control-server");

function securityHeaders(res, production) {
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("x-frame-options", "SAMEORIGIN");
  res.setHeader("referrer-policy", "no-referrer");
  res.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("content-security-policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; form-action 'self'");
  if (production) res.setHeader("strict-transport-security", "max-age=31536000; includeSubDomains");
}

function createCompanyControlHttpServer(options = {}) {
  const runtime = options.runtime;
  if (!runtime) throw new Error("createCompanyControlHttpServer requires the CYVX mission runtime");
  const production = (options.nodeEnv || process.env.NODE_ENV) === "production";
  const corsAllowlist = new Set(String(options.corsAllowlist || process.env.CYVX_OPERATOR_CORS_ALLOWLIST || "")
    .split(",").map((value) => value.trim()).filter(Boolean));
  if (production && !corsAllowlist.size) {
    throw new RuntimeError("CORS_ALLOWLIST_REQUIRED", "CYVX_OPERATOR_CORS_ALLOWLIST is required in production", 500);
  }

  function authenticate(req) {
    const header = String(req.headers.authorization || "");
    if (!header.startsWith("Bearer ")) throw new RuntimeError("AUTH_REQUIRED", "Bearer authentication is required", 401);
    return verifyToken(header.slice(7), runtime.authSecret, runtime.db);
  }

  const application = createCompanyControlHttpRuntime({
    ...options, runtime, authenticate, sendJson, readBody, match,
  });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://cyvx-company-control.local");
    const correlationId = String(req.headers["x-correlation-id"] || crypto.randomUUID()).slice(0, 128);
    securityHeaders(res, production);
    res.setHeader("x-correlation-id", correlationId);
    try {
      const origin = String(req.headers.origin || "");
      if (origin) {
        if (!corsAllowlist.has(origin) && !(runtime.allowLocalAuth && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(origin))) {
          throw new RuntimeError("CORS_REJECTED", "Origin is not allowed", 403);
        }
        res.setHeader("access-control-allow-origin", origin);
        res.setHeader("vary", "origin");
        res.setHeader("access-control-allow-headers", "authorization,content-type,x-correlation-id");
        res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
      }
      if (req.method === "OPTIONS") {
        res.statusCode = 204;
        return res.end();
      }
      if (await application.handle(req, res, url, { correlationId })) return;
      throw new RuntimeError("NOT_FOUND", "Route not found", 404);
    } catch (error) {
      runtime.logger.write(error.status >= 500 || !error.status ? "error" : "warn", "company_control.http_failed", {
        method: req.method, path: url.pathname, correlation_id: correlationId,
        code: error.code || null, error: error.message,
      });
      const status = Number(error.status || 500);
      return sendJson(res, status, {
        ok: false,
        error: status === 500 ? "INTERNAL_ERROR" : error.code || "REQUEST_FAILED",
        message: status === 500 ? "An internal error occurred" : error.message,
        ...(status !== 500 && error.details !== undefined ? { details: error.details } : {}),
      }, correlationId);
    }
  });

  return {
    ...application,
    server,
    listen(port = 3021, host = "127.0.0.1") {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => resolve(server.address()));
      });
    },
    close() { return new Promise((resolve) => server.close(resolve)); },
  };
}

module.exports = { createCompanyControlHttpServer };
