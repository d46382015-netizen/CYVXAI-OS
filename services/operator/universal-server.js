"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { RuntimeError, verifyToken, now } = require("../../runtime/missions/base");
const { createCompanyOperatorRuntime, readBody, sendJson, match } = require("./server");
const { UniversalOperator, UNIVERSAL_ENTITY_TYPES } = require("./universal");

function securityHeaders(res, production) {
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("x-frame-options", "SAMEORIGIN");
  res.setHeader("referrer-policy", "no-referrer");
  res.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("content-security-policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'");
  if (production) res.setHeader("strict-transport-security", "max-age=31536000; includeSubDomains");
}

function createUniversalOperatorRuntime(options = {}) {
  if (!options.runtime) throw new Error("createUniversalOperatorRuntime requires the CYVX mission runtime");
  const runtime = options.runtime;
  const legacyRuntime = options.legacyRuntime || createCompanyOperatorRuntime({ ...options, runtime });
  const operator = options.operator || new UniversalOperator(runtime, { ...options, legacy: legacyRuntime.operator });
  const production = (options.nodeEnv || process.env.NODE_ENV) === "production";
  const bodyLimit = Number(options.bodyLimit || process.env.CYVX_OPERATOR_BODY_LIMIT || 256 * 1024);
  const uiFile = path.resolve(options.uiFile || path.join(runtime.repoRoot, "ui", "universal-operator.html"));
  const corsAllowlist = new Set(String(options.corsAllowlist || process.env.CYVX_OPERATOR_CORS_ALLOWLIST || "")
    .split(",").map((value) => value.trim()).filter(Boolean));
  if (production && !corsAllowlist.size) throw new RuntimeError("CORS_ALLOWLIST_REQUIRED", "CYVX_OPERATOR_CORS_ALLOWLIST is required in production", 500);

  function authenticate(req) {
    const header = String(req.headers.authorization || "");
    if (!header.startsWith("Bearer ")) throw new RuntimeError("AUTH_REQUIRED", "Bearer authentication is required", 401);
    return verifyToken(header.slice(7), runtime.authSecret, runtime.db);
  }

  function optionalAuthenticate(req) {
    try { return authenticate(req); } catch { return null; }
  }

  async function handle(req, res, suppliedUrl) {
    const url = suppliedUrl || new URL(req.url, "http://cyvx-universal.local");
    const correlationId = String(req.headers["x-correlation-id"] || crypto.randomUUID()).slice(0, 128);
    const universalPath = url.pathname === "/operator" || url.pathname === "/universal" || url.pathname.startsWith("/api/v2/operator/") || url.pathname.startsWith("/e/") || ["/healthz", "/readyz"].includes(url.pathname);
    if (!universalPath) return legacyRuntime.handle(req, res, url);

    securityHeaders(res, production);
    res.setHeader("x-correlation-id", correlationId);
    try {
      const origin = String(req.headers.origin || "");
      if (origin) {
        if (!corsAllowlist.has(origin) && !(runtime.allowLocalAuth && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(origin))) throw new RuntimeError("CORS_REJECTED", "Origin is not allowed", 403);
        res.setHeader("access-control-allow-origin", origin);
        res.setHeader("vary", "origin");
        res.setHeader("access-control-allow-headers", "authorization,content-type,x-correlation-id");
        res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
      }
      if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }

      if (req.method === "GET" && ["/operator", "/universal"].includes(url.pathname)) {
        if (!fs.existsSync(uiFile)) throw new RuntimeError("UI_NOT_FOUND", "Universal operator UI is unavailable", 404);
        const body = fs.readFileSync(uiFile);
        res.statusCode = 200;
        res.setHeader("content-type", "text/html; charset=utf-8");
        res.setHeader("content-length", body.length);
        return res.end(body);
      }
      if (req.method === "GET" && url.pathname === "/healthz") {
        return sendJson(res, 200, { ok: true, universal: operator.health(), venture_adapter: legacyRuntime.operator.health() }, correlationId);
      }
      if (req.method === "GET" && url.pathname === "/readyz") {
        const mission = runtime.readiness();
        const health = operator.health();
        const ready = health.ok && mission.dependencies.database.ready;
        return sendJson(res, ready ? 200 : 503, { ok: ready, universal: health, mission_runtime: mission }, correlationId);
      }
      if (req.method === "GET" && url.pathname === "/api/v2/operator/entity-types") {
        return sendJson(res, 200, { ok: true, entity_types: UNIVERSAL_ENTITY_TYPES }, correlationId);
      }

      let params;
      if ((params = match(url.pathname, "/e/:slug")) && req.method === "GET") {
        const workspace = operator.getWorkspace(params.slug, optionalAuthenticate(req));
        if (workspace.redirect) {
          res.statusCode = 302;
          res.setHeader("location", workspace.redirect);
          return res.end();
        }
        res.statusCode = 200;
        res.setHeader("content-type", "text/html; charset=utf-8");
        res.setHeader("content-length", workspace.content.length);
        return res.end(workspace.content);
      }

      const auth = authenticate(req);
      auth.correlation_id = correlationId;
      const input = ["GET", "HEAD"].includes(req.method) ? {} : await readBody(req, bodyLimit);

      if (req.method === "GET" && url.pathname === "/api/v2/operator/entities") {
        return sendJson(res, 200, { ok: true, entities: operator.listEntities(auth), relationships: operator.listRelationships(auth) }, correlationId);
      }
      if (req.method === "POST" && url.pathname === "/api/v2/operator/entities") {
        return sendJson(res, 201, { ok: true, operator: operator.createEntity(input, auth) }, correlationId);
      }
      if ((params = match(url.pathname, "/api/v2/operator/entities/:id")) && req.method === "GET") {
        return sendJson(res, 200, { ok: true, operator: operator.getEntity(params.id, auth) }, correlationId);
      }
      if ((params = match(url.pathname, "/api/v2/operator/entities/:id/approve")) && req.method === "POST") {
        return sendJson(res, 200, { ok: true, operator: operator.approveEntity(params.id, input, auth) }, correlationId);
      }
      if ((params = match(url.pathname, "/api/v2/operator/entities/:id/tick")) && req.method === "POST") {
        return sendJson(res, 200, { ok: true, tick: operator.runTick(params.id, auth), operator: operator.getEntity(params.id, auth) }, correlationId);
      }
      if ((params = match(url.pathname, "/api/v2/operator/entities/:id/run")) && req.method === "POST") {
        return sendJson(res, 200, { ok: true, result: operator.runToIdle(params.id, auth, Math.min(100, Number(input.maximum_ticks) || 30)) }, correlationId);
      }
      if ((params = match(url.pathname, "/api/v2/operator/entities/:id/control")) && req.method === "POST") {
        return sendJson(res, 200, { ok: true, operator: operator.controlEntity(params.id, input.command, auth) }, correlationId);
      }
      if ((params = match(url.pathname, "/api/v2/operator/entities/:id/metrics")) && req.method === "POST") {
        return sendJson(res, 201, { ok: true, result: operator.recordMetric(params.id, input, auth) }, correlationId);
      }
      if ((params = match(url.pathname, "/api/v2/operator/actions/:id/approval")) && req.method === "POST") {
        return sendJson(res, 200, { ok: true, operator: operator.approveAction(params.id, input, auth) }, correlationId);
      }
      if (req.method === "POST" && url.pathname === "/api/v2/operator/relationships") {
        return sendJson(res, 201, { ok: true, relationships: operator.createRelationship(input, auth) }, correlationId);
      }
      if (req.method === "POST" && url.pathname === "/api/v2/operator/tick") {
        if (auth.role !== "admin") throw new RuntimeError("PERMISSION_DENIED", "Only administrators may run the universal portfolio tick", 403);
        return sendJson(res, 200, { ok: true, ticks: operator.runAllOnce() }, correlationId);
      }
      if (req.method === "GET" && url.pathname === "/api/v2/operator/export") {
        const entities = operator.listEntities(auth).map((entity) => operator.getEntity(entity.id, auth));
        return sendJson(res, 200, { ok: true, export: { schema_version: 2, generated_at: now(), organization_id: auth.organization_id, entities, relationships: operator.listRelationships(auth), platform: operator.platform.snapshot() } }, correlationId);
      }
      throw new RuntimeError("NOT_FOUND", "Route not found", 404);
    } catch (error) {
      runtime.logger.write(error.status >= 500 || !error.status ? "error" : "warn", "universal_operator.http_failed", {
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

  return { runtime, operator, legacyRuntime, handle, health: () => operator.health() };
}

function createUniversalOperatorHttpServer(operatorRuntime) {
  const server = http.createServer((req, res) => operatorRuntime.handle(req, res, new URL(req.url, "http://cyvx-universal.local")));
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
  createUniversalOperatorRuntime,
  createUniversalOperatorHttpServer,
};