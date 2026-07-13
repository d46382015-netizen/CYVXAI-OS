"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { RuntimeError, verifyToken, now } = require("../../runtime/missions/base");
const { CompanyOperator } = require("./index");

function readBody(req, limit = 256 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    req.on("data", (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > limit) {
        chunks.length = 0;
        fail(new RuntimeError("REQUEST_TOO_LARGE", `Request body exceeds ${limit} bytes`, 413));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      if (!chunks.length) return resolve({});
      try { return resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch { return reject(new RuntimeError("INVALID_JSON", "Request body must be valid JSON", 400)); }
    });
    req.on("error", fail);
  });
}

function sendJson(res, status, payload, correlationId) {
  const body = Buffer.from(`${JSON.stringify({ ...payload, correlation_id: correlationId })}\n`);
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("content-length", body.length);
  res.end(body);
}

function securityHeaders(res, production) {
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("x-frame-options", "SAMEORIGIN");
  res.setHeader("referrer-policy", "no-referrer");
  res.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("content-security-policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'");
  if (production) res.setHeader("strict-transport-security", "max-age=31536000; includeSubDomains");
}

function match(pathname, pattern) {
  const keys = [];
  const expression = pattern.split("/").map((part) => {
    if (part.startsWith(":")) { keys.push(part.slice(1)); return "([^/]+)"; }
    return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }).join("/");
  const found = pathname.match(new RegExp(`^${expression}$`));
  if (!found) return null;
  return Object.fromEntries(keys.map((key, index) => [key, decodeURIComponent(found[index + 1])]));
}

function createWindowLimiter(options = {}) {
  const buckets = new Map();
  const limit = Number(options.limit || 20);
  const windowMs = Number(options.windowMs || 60_000);
  return function enforce(key) {
    const timestamp = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || timestamp - bucket.startedAt >= windowMs) {
      buckets.set(key, { startedAt: timestamp, count: 1 });
      return;
    }
    if (bucket.count >= limit) throw new RuntimeError("RATE_LIMITED", "Rate limit exceeded", 429);
    bucket.count += 1;
    if (buckets.size > 10_000) {
      for (const [entry, value] of buckets) if (timestamp - value.startedAt >= windowMs) buckets.delete(entry);
    }
  };
}

function createCompanyOperatorRuntime(options = {}) {
  if (!options.runtime) throw new Error("createCompanyOperatorRuntime requires the CYVX mission runtime");
  const runtime = options.runtime;
  const operator = options.operator || new CompanyOperator(runtime, options);
  const production = (options.nodeEnv || process.env.NODE_ENV) === "production";
  const bodyLimit = Number(options.bodyLimit || process.env.CYVX_OPERATOR_BODY_LIMIT || 256 * 1024);
  const leadBodyLimit = Number(options.leadBodyLimit || process.env.CYVX_OPERATOR_LEAD_BODY_LIMIT || 32 * 1024);
  const leadLimit = createWindowLimiter({
    limit: Number(options.leadRateLimit || process.env.CYVX_OPERATOR_LEAD_RATE_LIMIT || 10),
    windowMs: 60_000,
  });
  const uiFile = path.resolve(options.uiFile || path.join(runtime.repoRoot, "ui", "operator.html"));
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

  async function handle(req, res, suppliedUrl) {
    const url = suppliedUrl || new URL(req.url, "http://cyvx-operator.local");
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
      if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }

      if (req.method === "GET" && ["/", "/operator"].includes(url.pathname)) {
        if (!fs.existsSync(uiFile)) throw new RuntimeError("UI_NOT_FOUND", "Company operator UI is unavailable", 404);
        const body = fs.readFileSync(uiFile);
        res.statusCode = 200;
        res.setHeader("content-type", "text/html; charset=utf-8");
        res.setHeader("content-length", body.length);
        return res.end(body);
      }
      if (req.method === "GET" && ["/healthz", "/api/v1/operator/health"].includes(url.pathname)) {
        return sendJson(res, 200, { ok: true, health: operator.health() }, correlationId);
      }
      if (req.method === "GET" && ["/readyz", "/api/v1/operator/readiness"].includes(url.pathname)) {
        const health = operator.health();
        const mission = runtime.readiness();
        const ready = health.ok && mission.dependencies.database.ready;
        return sendJson(res, ready ? 200 : 503, { ok: ready, operator: health, mission_runtime: mission }, correlationId);
      }
      let params;
      if ((params = match(url.pathname, "/c/:slug")) && req.method === "GET") {
        const page = operator.getLanding(params.slug);
        res.statusCode = 200;
        res.setHeader("content-type", "text/html; charset=utf-8");
        res.setHeader("content-length", page.content.length);
        return res.end(page.content);
      }
      if ((params = match(url.pathname, "/api/v1/operator/companies/:id/leads")) && req.method === "POST") {
        const peer = String(req.socket && req.socket.remoteAddress || "unknown");
        leadLimit(`${peer}:${params.id}`);
        const input = await readBody(req, leadBodyLimit);
        const lead = operator.recordLead(params.id, input);
        return sendJson(res, 201, { ok: true, lead }, correlationId);
      }
      if (req.method === "POST" && url.pathname === "/api/v1/operator/auth/token") {
        if (!runtime.allowLocalAuth) throw new RuntimeError("LOCAL_AUTH_DISABLED", "Local token issuance is disabled", 404);
        const input = await readBody(req, bodyLimit);
        const organizationId = String(input.organization_id || "default");
        const userId = String(input.user_id || "admin-local");
        const row = runtime.db.prepare("SELECT id,organization_id,role,active FROM users WHERE organization_id=? AND id=?")
          .get(organizationId, userId);
        if (!row || !row.active) throw new RuntimeError("AUTH_REJECTED", "Authentication principal is not active", 401);
        const ttl = Math.min(3600, Math.max(60, Number(input.ttl_seconds) || 3600));
        const token = runtime.issueToken({ sub: row.id, organization_id: row.organization_id, role: row.role }, ttl);
        return sendJson(res, 200, { ok: true, token, expires_in: ttl, principal: row }, correlationId);
      }

      const auth = authenticate(req);
      auth.correlation_id = correlationId;
      const input = ["GET", "HEAD"].includes(req.method) ? {} : await readBody(req, bodyLimit);

      if (req.method === "GET" && url.pathname === "/api/v1/operator/companies") {
        return sendJson(res, 200, { ok: true, companies: operator.listCompanies(auth) }, correlationId);
      }
      if (req.method === "POST" && url.pathname === "/api/v1/operator/companies") {
        return sendJson(res, 201, { ok: true, operator: operator.createCompany(input, auth) }, correlationId);
      }
      if ((params = match(url.pathname, "/api/v1/operator/companies/:id")) && req.method === "GET") {
        return sendJson(res, 200, { ok: true, operator: operator.getCompany(params.id, auth) }, correlationId);
      }
      if ((params = match(url.pathname, "/api/v1/operator/companies/:id/approve")) && req.method === "POST") {
        return sendJson(res, 200, { ok: true, operator: operator.approveCompany(params.id, input, auth) }, correlationId);
      }
      if ((params = match(url.pathname, "/api/v1/operator/companies/:id/tick")) && req.method === "POST") {
        return sendJson(res, 200, { ok: true, tick: operator.runTick(params.id, auth), operator: operator.getCompany(params.id, auth) }, correlationId);
      }
      if ((params = match(url.pathname, "/api/v1/operator/companies/:id/run")) && req.method === "POST") {
        return sendJson(res, 200, { ok: true, result: operator.runToIdle(params.id, auth, Math.min(100, Number(input.maximum_ticks) || 20)) }, correlationId);
      }
      if ((params = match(url.pathname, "/api/v1/operator/companies/:id/control")) && req.method === "POST") {
        return sendJson(res, 200, { ok: true, operator: operator.controlCompany(params.id, input.command, auth) }, correlationId);
      }
      if ((params = match(url.pathname, "/api/v1/operator/companies/:id/metrics")) && req.method === "POST") {
        return sendJson(res, 201, { ok: true, result: operator.recordMetric(params.id, input, auth) }, correlationId);
      }
      if ((params = match(url.pathname, "/api/v1/operator/companies/:id/leads")) && req.method === "GET") {
        return sendJson(res, 200, { ok: true, leads: operator.listLeads(params.id, auth) }, correlationId);
      }
      if ((params = match(url.pathname, "/api/v1/operator/actions/:id/approval")) && req.method === "POST") {
        return sendJson(res, 200, { ok: true, operator: operator.approveAction(params.id, input, auth) }, correlationId);
      }
      if (req.method === "POST" && url.pathname === "/api/v1/operator/tick") {
        if (auth.role !== "admin") throw new RuntimeError("PERMISSION_DENIED", "Only administrators may run the portfolio tick", 403);
        return sendJson(res, 200, { ok: true, ticks: operator.runAllOnce() }, correlationId);
      }
      if (req.method === "GET" && url.pathname === "/api/v1/operator/export") {
        const companies = operator.listCompanies(auth).map((company) => operator.getCompany(company.id, auth));
        return sendJson(res, 200, { ok: true, export: { schema_version: 1, generated_at: now(), organization_id: auth.organization_id, companies } }, correlationId);
      }
      throw new RuntimeError("NOT_FOUND", "Route not found", 404);
    } catch (error) {
      runtime.logger.write(error.status >= 500 || !error.status ? "error" : "warn", "company_operator.http_failed", {
        method: req.method, path: url.pathname, correlation_id: correlationId, code: error.code, error: error.message,
      });
      const status = Number(error.status || 500);
      return sendJson(res, status, {
        ok: false,
        error: status === 500 ? "INTERNAL_ERROR" : error.code || "REQUEST_FAILED",
        message: status === 500 ? "An internal error occurred" : error.message,
        ...(status !== 500 && error.details !== undefined ? { details: error.details } : {}),
      }, correlationId);
    }
  }

  return { runtime, operator, handle, health: () => operator.health() };
}

function createCompanyOperatorHttpServer(operatorRuntime) {
  const server = http.createServer((req, res) => operatorRuntime.handle(req, res, new URL(req.url, "http://cyvx-operator.local")));
  return {
    server,
    listen(port = 3020, host = "127.0.0.1") {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => resolve(server.address()));
      });
    },
    close() { return new Promise((resolve) => server.close(resolve)); },
  };
}

module.exports = {
  createCompanyOperatorRuntime,
  createCompanyOperatorHttpServer,
  readBody,
  sendJson,
  match,
};