"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { GovernanceKernel, GovernanceError } = require("../core/governance");
const { migrateDatabase, verifyToken, issueToken, JsonLogger } = require("../runtime/missions/base");

function readJson(req, limit = 256 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new GovernanceError("REQUEST_TOO_LARGE", `Request body exceeds ${limit} bytes`, 413));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch { reject(new GovernanceError("INVALID_JSON", "Request body must be valid JSON", 400)); }
    });
    req.on("error", reject);
  });
}

function match(pathname, pattern) {
  const keys = [];
  const expression = pattern.split("/").map((part) => {
    if (part.startsWith(":")) { keys.push(part.slice(1)); return "([^/]+)"; }
    return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }).join("/");
  const found = pathname.match(new RegExp(`^${expression}$`));
  return found ? Object.fromEntries(keys.map((key, index) => [key, decodeURIComponent(found[index + 1])])) : null;
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

function handleError(res, error, correlationId, logger) {
  const status = Number(error.status || 500);
  logger.write(status >= 500 ? "error" : "warn", "governance.request_failed", {
    correlation_id: correlationId,
    code: error.code || "INTERNAL_ERROR",
    message: error.message
  });
  const payload = {
    ok: false,
    error: status >= 500 ? "INTERNAL_ERROR" : error.code || "REQUEST_FAILED",
    message: status >= 500 ? "An internal error occurred" : error.message
  };
  if (status < 500 && error.details !== undefined) payload.details = error.details;
  return sendJson(res, status, payload, correlationId);
}

function createGovernanceRuntime(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || path.join(__dirname, ".."));
  const dataRoot = path.resolve(options.dataRoot || process.env.CYVX_DATA_ROOT || path.join(os.homedir(), ".cyvx"));
  const migrated = migrateDatabase({ repoRoot, dataRoot, dbPath: options.dbPath });
  const { db, dbPath } = migrated;
  const production = (options.nodeEnv || process.env.NODE_ENV) === "production";
  const allowLocalAuth = options.allowLocalAuth !== undefined
    ? options.allowLocalAuth
    : process.env.CYVX_ALLOW_INSECURE_LOCAL === "true" || !production;
  const authSecret = String(options.authSecret || process.env.CYVX_AUTH_SECRET || (allowLocalAuth ? "local-development-secret-change-before-production-123" : ""));
  if (authSecret.length < 32) {
    db.close();
    throw new GovernanceError("AUTH_SECRET_INVALID", "CYVX_AUTH_SECRET must contain at least 32 characters", 500);
  }
  const governanceSecret = String(options.governanceSecret || process.env.CYVX_GOVERNANCE_SECRET || authSecret);
  const logger = options.logger || new JsonLogger(path.join(dataRoot, "logs", "governance-runtime.jsonl"));
  const kernel = new GovernanceKernel({ db, repoRoot, secret: governanceSecret, logger });
  const uiFile = path.join(repoRoot, "ui", "governance.html");
  const bodyLimit = Math.max(1024, Number(options.bodyLimit || process.env.CYVX_REQUEST_BODY_LIMIT || 256 * 1024));
  const corsAllowlist = new Set(String(options.corsAllowlist || process.env.CYVX_CORS_ALLOWLIST || "")
    .split(",").map((value) => value.trim()).filter(Boolean));
  if (production && !corsAllowlist.size) {
    db.close();
    throw new GovernanceError("CORS_ALLOWLIST_REQUIRED", "CYVX_CORS_ALLOWLIST is required in production", 500);
  }

  function authenticate(req) {
    const header = String(req.headers.authorization || "");
    if (!header.startsWith("Bearer ")) throw new GovernanceError("AUTH_REQUIRED", "Bearer authentication is required", 401);
    return verifyToken(header.slice(7), authSecret, db);
  }

  async function handle(req, res) {
    const url = new URL(req.url, "http://cyvx.local");
    const correlationId = String(req.headers["x-correlation-id"] || crypto.randomUUID()).slice(0, 128);
    securityHeaders(res, production);
    res.setHeader("x-correlation-id", correlationId);
    try {
      const origin = String(req.headers.origin || "");
      if (origin) {
        if (!corsAllowlist.has(origin)) throw new GovernanceError("CORS_REJECTED", "Origin is not allowed", 403);
        res.setHeader("access-control-allow-origin", origin);
        res.setHeader("vary", "origin");
        res.setHeader("access-control-allow-headers", "authorization,content-type,x-correlation-id");
        res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
      }
      if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
      if (req.method === "GET" && url.pathname === "/governance") {
        const body = fs.readFileSync(uiFile);
        res.statusCode = 200;
        res.setHeader("content-type", "text/html; charset=utf-8");
        res.setHeader("content-length", body.length);
        return res.end(body);
      }
      if (req.method === "GET" && ["/healthz", "/api/v1/governance/health"].includes(url.pathname)) {
        const database = Number(db.prepare("SELECT 1 AS ok").get().ok) === 1;
        return sendJson(res, database ? 200 : 503, {
          ok: database,
          service: "cyvx-autonomous-governance",
          database: { ready: database, path: dbPath },
          ledger: kernel.verifyLedger({ user_id: "health", organization_id: "default", role: "viewer" }),
          timestamp: new Date().toISOString()
        }, correlationId);
      }
      if (req.method === "POST" && url.pathname === "/api/v1/auth/token") {
        if (!allowLocalAuth) throw new GovernanceError("LOCAL_AUTH_DISABLED", "Local token issuance is disabled", 404);
        const input = await readJson(req, bodyLimit);
        const organizationId = String(input.organization_id || "default");
        const userId = String(input.user_id || "");
        const user = db.prepare("SELECT id,organization_id,role,active FROM users WHERE organization_id=? AND id=?")
          .get(organizationId, userId);
        if (!user || !user.active) throw new GovernanceError("AUTH_REJECTED", "Authentication principal is not active", 401);
        const ttl = Math.min(3600, Math.max(60, Number(input.ttl_seconds) || 3600));
        const token = issueToken({ sub: user.id, organization_id: user.organization_id, role: user.role }, authSecret, ttl);
        return sendJson(res, 200, { ok: true, token, expires_in: ttl, principal: user }, correlationId);
      }

      const auth = authenticate(req);
      const input = ["POST", "PUT", "PATCH"].includes(req.method) ? await readJson(req, bodyLimit) : {};
      let params;
      if (req.method === "GET" && url.pathname === "/api/v1/governance/dashboard") {
        return sendJson(res, 200, { ok: true, dashboard: kernel.dashboard(auth, { limit: url.searchParams.get("limit") }) }, correlationId);
      }
      if (req.method === "GET" && url.pathname === "/api/v1/governance/constitution") {
        return sendJson(res, 200, { ok: true, constitution: kernel.getConstitution(auth) }, correlationId);
      }
      if (req.method === "GET" && url.pathname === "/api/v1/governance/ledger/verify") {
        return sendJson(res, 200, { ok: true, report: kernel.verifyLedger(auth) }, correlationId);
      }
      if (req.method === "POST" && url.pathname === "/api/v1/governance/packages") {
        return sendJson(res, 201, { ok: true, package: kernel.submit(auth, input) }, correlationId);
      }
      if ((params = match(url.pathname, "/api/v1/governance/packages/:id")) && req.method === "GET") {
        return sendJson(res, 200, { ok: true, package: kernel.getPackage(auth, params.id) }, correlationId);
      }
      if ((params = match(url.pathname, "/api/v1/governance/packages/:id/supervisor-review")) && req.method === "POST") {
        return sendJson(res, 200, { ok: true, package: kernel.supervisorReview(auth, params.id, input) }, correlationId);
      }
      if ((params = match(url.pathname, "/api/v1/governance/packages/:id/boss-review")) && req.method === "POST") {
        return sendJson(res, 200, { ok: true, package: kernel.bossReview(auth, params.id, input) }, correlationId);
      }
      if ((params = match(url.pathname, "/api/v1/governance/grants/:id/consume")) && req.method === "POST") {
        return sendJson(res, 200, { ok: true, grant: kernel.consumeGrant(auth, params.id, input) }, correlationId);
      }
      if ((params = match(url.pathname, "/api/v1/governance/grants/:id/revoke")) && req.method === "POST") {
        return sendJson(res, 200, { ok: true, grant: kernel.revokeGrant(auth, params.id, input.reason) }, correlationId);
      }
      if (req.method === "POST" && url.pathname === "/api/v1/governance/controls") {
        return sendJson(res, 200, { ok: true, controls: kernel.setControls(auth, input) }, correlationId);
      }
      throw new GovernanceError("NOT_FOUND", "Route not found", 404);
    } catch (error) {
      return handleError(res, error, correlationId, logger);
    }
  }

  return {
    repoRoot, dataRoot, dbPath, db, kernel, logger, authSecret, allowLocalAuth, handle,
    close() { db.close(); }
  };
}

function createGovernanceServer(runtime) {
  const server = http.createServer((req, res) => runtime.handle(req, res));
  return {
    server,
    listen(port = 8790, host = "127.0.0.1") {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => resolve(server.address()));
      });
    },
    close() { return new Promise((resolve) => server.close(resolve)); }
  };
}

async function main() {
  const runtime = createGovernanceRuntime();
  const server = createGovernanceServer(runtime);
  const port = Number(process.env.CYVX_GOVERNANCE_PORT || 8790);
  const host = String(process.env.CYVX_GOVERNANCE_HOST || "127.0.0.1");
  const address = await server.listen(port, host);
  runtime.logger.write("info", "governance.started", { host: address.address, port: address.port, db_path: runtime.dbPath });
  process.stdout.write(`${JSON.stringify({ ok: true, service: "cyvx-autonomous-governance", url: `http://${host}:${address.port}/governance`, db_path: runtime.dbPath })}\n`);
  const shutdown = async (signal) => {
    runtime.logger.write("info", "governance.stopping", { signal });
    await server.close();
    runtime.close();
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.code || "START_FAILED", message: error.message })}\n`);
    process.exit(1);
  });
}

module.exports = { createGovernanceRuntime, createGovernanceServer, readJson, match };
