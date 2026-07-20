"use strict";

const crypto = require("node:crypto");
const http = require("node:http");
const { URL } = require("node:url");
const { RuntimeError } = require("../../runtime/missions/base");
const { AutonomousCompanyRuntime } = require("./index");
const { renderControlRoom } = require("./ui");

function json(response, status, payload, headers = {}) {
  const body = `${JSON.stringify(payload)}\n`;
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...headers,
  });
  response.end(body);
}

function html(response, status, body) {
  response.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    "referrer-policy": "no-referrer",
  });
  response.end(body);
}

async function readJson(request, maximumBytes = 262144) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximumBytes) throw new RuntimeError("BODY_TOO_LARGE", `Request body exceeds ${maximumBytes} bytes`, 413);
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString("utf8");
  try { return JSON.parse(raw); } catch { throw new RuntimeError("INVALID_JSON", "Request body must be valid JSON", 400); }
}

function timingSafeToken(actual, expected) {
  const left = Buffer.from(String(actual || ""));
  const right = Buffer.from(String(expected || ""));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function normalizeOrganization(value) {
  const output = String(value || "default").trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(output)) throw new RuntimeError("VALIDATION_ERROR", "Invalid organization identifier", 422);
  return output;
}

function createAuth(request, token) {
  const authorization = String(request.headers.authorization || "");
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!timingSafeToken(supplied, token)) throw new RuntimeError("UNAUTHORIZED", "A valid autonomous company runtime bearer token is required", 401);
  return {
    user_id: String(request.headers["x-cyvx-user"] || "company-runtime-admin").slice(0, 120),
    organization_id: normalizeOrganization(request.headers["x-cyvx-organization"]),
    role: "admin",
    correlation_id: String(request.headers["x-correlation-id"] || crypto.randomUUID()).slice(0, 160),
  };
}

function createRateLimiter(limit = 10, windowMs = 60000) {
  const buckets = new Map();
  return function allow(key) {
    const timestamp = Date.now();
    const current = buckets.get(key);
    if (!current || current.resetAt <= timestamp) {
      buckets.set(key, { count: 1, resetAt: timestamp + windowMs });
      return true;
    }
    current.count += 1;
    if (buckets.size > 5000) {
      for (const [bucketKey, bucket] of buckets) if (bucket.resetAt <= timestamp) buckets.delete(bucketKey);
    }
    return current.count <= limit;
  };
}

function createAutonomousCompanyHttpServer(companyRuntime, options = {}) {
  if (!(companyRuntime instanceof AutonomousCompanyRuntime) && !companyRuntime?.createCompany) throw new Error("AutonomousCompanyRuntime is required");
  const production = (options.environment || process.env.NODE_ENV) === "production";
  const token = options.token || process.env.CYVX_COMPANY_RUNTIME_TOKEN || (!production ? crypto.randomBytes(32).toString("base64url") : "");
  if (!token || token.length < 32) throw new Error("CYVX_COMPANY_RUNTIME_TOKEN must contain at least 32 characters in production");
  const bodyLimit = Number(options.bodyLimit || process.env.CYVX_COMPANY_RUNTIME_BODY_LIMIT || 262144);
  const leadBodyLimit = Number(options.leadBodyLimit || process.env.CYVX_COMPANY_RUNTIME_LEAD_BODY_LIMIT || 32768);
  const allowLead = createRateLimiter(Number(options.leadRateLimit || process.env.CYVX_COMPANY_RUNTIME_LEAD_RATE_LIMIT || 10), 60000);

  const server = http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url || "/", "http://localhost");
    const pathname = requestUrl.pathname;
    try {
      if (request.method === "GET" && pathname === "/healthz") {
        return json(response, 200, { ok: true, service: "cyvx-autonomous-company-runtime", model_provider: companyRuntime.model.name, timestamp: new Date().toISOString() });
      }
      if (request.method === "GET" && (pathname === "/" || pathname === "/control-room")) {
        return html(response, 200, renderControlRoom({ localToken: production ? "" : token }));
      }
      const leadMatch = pathname.match(/^\/api\/v1\/company-runtime\/companies\/([^/]+)\/leads$/);
      if (request.method === "POST" && leadMatch) {
        const peer = String(request.socket.remoteAddress || "unknown");
        if (!allowLead(`${peer}:${leadMatch[1]}`)) throw new RuntimeError("RATE_LIMITED", "Lead intake rate limit exceeded", 429);
        const input = await readJson(request, leadBodyLimit);
        const lead = companyRuntime.operator.recordLead(decodeURIComponent(leadMatch[1]), input);
        return json(response, 201, { ok: true, lead: { id: lead.id, status: lead.status, received_at: lead.received_at } });
      }

      const auth = createAuth(request, token);
      if (request.method === "GET" && pathname === "/api/v1/company-runtime/companies") {
        return json(response, 200, { ok: true, companies: companyRuntime.listCompanies(auth) });
      }
      if (request.method === "POST" && pathname === "/api/v1/company-runtime/companies") {
        const input = await readJson(request, bodyLimit);
        return json(response, 201, { ok: true, company: companyRuntime.createCompany(input, auth) });
      }
      const companyMatch = pathname.match(/^\/api\/v1\/company-runtime\/companies\/([^/]+)$/);
      if (request.method === "GET" && companyMatch) {
        return json(response, 200, { ok: true, company: companyRuntime.getCompany(decodeURIComponent(companyMatch[1]), auth) });
      }
      const actionMatch = pathname.match(/^\/api\/v1\/company-runtime\/companies\/([^/]+)\/(approve|tick|run|outcomes|tasks|integrations)$/);
      if (request.method === "POST" && actionMatch) {
        const companyId = decodeURIComponent(actionMatch[1]);
        const action = actionMatch[2];
        const input = await readJson(request, bodyLimit);
        if (action === "approve") return json(response, 200, { ok: true, company: companyRuntime.approveCompany(companyId, input, auth) });
        if (action === "tick") return json(response, 200, { ok: true, tick: await companyRuntime.runTick(companyId, auth) });
        if (action === "run") return json(response, 200, { ok: true, result: await companyRuntime.runToIdle(companyId, auth, input.maximum_ticks || 100) });
        if (action === "outcomes") return json(response, 201, { ok: true, outcome: companyRuntime.recordOutcome(companyId, input, auth) });
        if (action === "tasks") return json(response, 201, { ok: true, task: companyRuntime.queueTask(companyId, input, auth) });
        if (action === "integrations") return json(response, 201, { ok: true, integration: companyRuntime.registerIntegration(companyId, input, auth) });
      }
      const integrationsMatch = pathname.match(/^\/api\/v1\/company-runtime\/companies\/([^/]+)\/integrations$/);
      if (request.method === "GET" && integrationsMatch) {
        return json(response, 200, { ok: true, integrations: companyRuntime.listIntegrations(decodeURIComponent(integrationsMatch[1]), auth) });
      }
      const dispatchMatch = pathname.match(/^\/api\/v1\/company-runtime\/companies\/([^/]+)\/integrations\/([^/]+)\/dispatch$/);
      if (request.method === "POST" && dispatchMatch) {
        const input = await readJson(request, bodyLimit);
        const delivery = await companyRuntime.dispatchIntegration(decodeURIComponent(dispatchMatch[1]), decodeURIComponent(dispatchMatch[2]), input, auth);
        return json(response, delivery.status === "delivered" ? 200 : 502, { ok: delivery.status === "delivered", delivery });
      }
      return json(response, 404, { ok: false, error: { code: "NOT_FOUND", message: "Route not found" } });
    } catch (error) {
      const status = Number(error.status || 500);
      return json(response, status, { ok: false, error: { code: error.code || "INTERNAL_ERROR", message: status >= 500 && production ? "Internal server error" : error.message } });
    }
  });

  return {
    token,
    raw: server,
    listen(port = 3030, host = "127.0.0.1") {
      return new Promise((resolve, reject) => {
        const onError = (error) => { server.off("listening", onListening); reject(error); };
        const onListening = () => { server.off("error", onError); resolve(server.address()); };
        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(port, host);
      });
    },
    close() {
      return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}

module.exports = { createAutonomousCompanyHttpServer, readJson };
