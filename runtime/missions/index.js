"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { MissionEngine, VALID_TRANSITIONS } = require("../../core/missions");
const { createMissionAPI, handleError } = require("../../api/missions");
const {
  APP_VERSION, SCHEMA_VERSION, RuntimeError, JsonLogger, now, id, migrateDatabase,
  issueToken, verifyToken, authorize,
} = require("./base");
const { SqliteMissionStore, rowPayload, requireMission, requireApproval, requireAssignedAgent } = require("./store");
const { EvidenceService } = require("./evidence");
const { JobQueue, MissionWorker } = require("./jobs");

function readJson(req, limit) {
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
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch { reject(new RuntimeError("INVALID_JSON", "Request body must be valid JSON", 400)); }
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

function positiveInteger(value, name, minimum = 1) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum) {
    throw new RuntimeError("CONFIG_INVALID", `${name} must be an integer greater than or equal to ${minimum}`, 500);
  }
  return parsed;
}

function clientIp(req) { return String(req.socket && req.socket.remoteAddress || "unknown"); }
function rateLimit(db, key, limit, windowMs = 60_000) {
  const current = Date.now();
  db.exec("BEGIN IMMEDIATE");
  try {
    const row = db.prepare("SELECT * FROM rate_limits WHERE bucket_key=?").get(key);
    if (!row || current - Number(row.window_started_at) >= windowMs) {
      db.prepare("INSERT OR REPLACE INTO rate_limits(bucket_key,window_started_at,request_count,updated_at) VALUES(?,?,1,?)")
        .run(key, current, now());
      db.exec("COMMIT");
      return;
    }
    if (Number(row.request_count) >= limit) throw new RuntimeError("RATE_LIMITED", "Rate limit exceeded", 429);
    db.prepare("UPDATE rate_limits SET request_count=request_count+1,updated_at=? WHERE bucket_key=?").run(now(), key);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function createMissionRuntime(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || path.join(__dirname, "../.."));
  const dataRoot = path.resolve(options.dataRoot || process.env.CYVX_DATA_ROOT || path.join(os.homedir(), ".cyvx"));
  const migrated = migrateDatabase({ repoRoot, dataRoot, dbPath: options.dbPath });
  const { db, dbPath } = migrated;
  const logger = options.logger || new JsonLogger(options.logPath || path.join(dataRoot, "logs", "mission-runtime.jsonl"));
  const artifactRoot = path.resolve(options.artifactRoot || process.env.CYVX_EVIDENCE_ROOT || path.join(dataRoot, "evidence"));
  const store = new SqliteMissionStore(db, logger);
  const evidence = new EvidenceService({ db, store, artifactRoot, logger });
  const queue = new JobQueue({ db, store, logger, leaseMs: options.leaseMs || process.env.CYVX_JOB_LEASE_MS || 1500 });
  const engine = new MissionEngine(store);
  const api = createMissionAPI(store, { db, evidence, queue });
  const production = (options.nodeEnv || process.env.NODE_ENV) === "production";
  const allowLocalAuth = options.allowLocalAuth !== undefined
    ? options.allowLocalAuth
    : process.env.CYVX_ALLOW_INSECURE_LOCAL === "true" || !production;
  const authSecret = String(options.authSecret || process.env.CYVX_AUTH_SECRET || (allowLocalAuth ? "local-development-secret-change-before-production-123" : ""));
  if (authSecret.length < 32) {
    db.close();
    throw new RuntimeError("AUTH_SECRET_INVALID", "CYVX_AUTH_SECRET must contain at least 32 characters", 500);
  }
  const bodyLimit = positiveInteger(options.bodyLimit || process.env.CYVX_REQUEST_BODY_LIMIT || 256 * 1024, "request body limit", 256);
  const mutationLimit = positiveInteger(options.mutationLimit || process.env.CYVX_MUTATION_RATE_LIMIT || 120, "mutation rate limit");
  const authLimit = positiveInteger(options.authLimit || process.env.CYVX_AUTH_RATE_LIMIT || 20, "authentication rate limit");
  const workerFreshMs = positiveInteger(options.workerFreshMs || process.env.CYVX_WORKER_FRESH_MS || 5000, "worker freshness window", 100);
  const corsAllowlist = new Set(String(options.corsAllowlist || process.env.CYVX_CORS_ALLOWLIST || "")
    .split(",").map((value) => value.trim()).filter(Boolean));
  if (production && !corsAllowlist.size) {
    db.close();
    throw new RuntimeError("CORS_ALLOWLIST_REQUIRED", "CYVX_CORS_ALLOWLIST is required in production", 500);
  }
  const uiFile = path.join(repoRoot, "ui", "missions.html");

  function authenticate(req) {
    const header = String(req.headers.authorization || "");
    if (!header.startsWith("Bearer ")) throw new RuntimeError("AUTH_REQUIRED", "Bearer authentication is required", 401);
    return verifyToken(header.slice(7), authSecret, db);
  }

  function readiness() {
    let database = false;
    try { database = Number(db.prepare("SELECT 1 AS ok").get().ok) === 1; } catch { database = false; }
    const heartbeat = db.prepare("SELECT worker_id,heartbeat_at,current_job_id FROM worker_heartbeats ORDER BY heartbeat_at DESC LIMIT 1").get();
    const worker = Boolean(heartbeat && Date.now() - Date.parse(heartbeat.heartbeat_at) <= workerFreshMs);
    return {
      ok: database && worker,
      ready: database && worker,
      version: APP_VERSION,
      schema_version: SCHEMA_VERSION,
      dependencies: { database: { ready: database, path: dbPath }, worker: { ready: worker, heartbeat: heartbeat || null } },
      timestamp: now(),
    };
  }

  function listMissions(auth) {
    return db.prepare("SELECT * FROM missions WHERE organization_id=? ORDER BY created_at DESC")
      .all(auth.organization_id).map(rowPayload);
  }

  function cancelMission(req, res, missionId, input) {
    const result = store.withContext({ organization_id: req.auth.organization_id, actor: req.auth.user_id, correlation_id: req.correlation_id, causation_id: req.causation_id }, () => store.transaction((state) => {
      const mission = state.missions.find((item) => item.id === missionId);
      if (!mission) throw new RuntimeError("NOT_FOUND", "Mission not found", 404);
      if (!(VALID_TRANSITIONS[mission.status] || []).includes("cancelled")) throw new RuntimeError("INVALID_STATE", `Mission cannot be cancelled from ${mission.status}`, 409);
      mission.status = "cancelled";
      mission.updated_at = now();
      mission.audit_trail.push({ timestamp: now(), state: "cancelled", actor: req.auth.user_id, reason: String(input.reason || "Mission cancelled").slice(0, 500) });
      state.events.push({ id: id("event"), type: "mission.cancelled", timestamp: now(), data: { mission_id: mission.id, reason: input.reason || null } });
      db.prepare("UPDATE jobs SET status='cancelled',completed_at=?,updated_at=?,lease_owner=NULL,lease_expires_at=NULL WHERE organization_id=? AND mission_id=? AND status IN ('queued','retryable','leased')")
        .run(now(), now(), req.auth.organization_id, missionId);
      return mission;
    }));
    sendJson(res, 200, { ok: true, mission: result }, req.correlation_id);
  }

  async function handle(req, res, suppliedUrl) {
    const url = suppliedUrl || new URL(req.url, "http://cyvx.local");
    const correlationId = String(req.headers["x-correlation-id"] || crypto.randomUUID()).slice(0, 128);
    const causationId = String(req.headers["x-causation-id"] || "").slice(0, 128) || null;
    req.correlation_id = correlationId;
    req.causation_id = causationId;
    req.idempotency_key = String(req.headers["idempotency-key"] || "").slice(0, 200) || null;
    securityHeaders(res, production);
    res.setHeader("x-correlation-id", correlationId);

    try {
      const origin = String(req.headers.origin || "");
      if (origin) {
        if (!corsAllowlist.has(origin)) throw new RuntimeError("CORS_REJECTED", "Origin is not allowed", 403);
        res.setHeader("access-control-allow-origin", origin);
        res.setHeader("vary", "origin");
        res.setHeader("access-control-allow-headers", "authorization,content-type,idempotency-key,x-correlation-id,x-causation-id");
        res.setHeader("access-control-allow-methods", "GET,POST,PATCH,DELETE,OPTIONS");
      }
      if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
      if (req.method === "GET" && url.pathname === "/missions") {
        if (!fs.existsSync(uiFile)) throw new RuntimeError("UI_NOT_FOUND", "Mission operator UI is unavailable", 404);
        const body = fs.readFileSync(uiFile);
        res.statusCode = 200;
        res.setHeader("content-type", "text/html; charset=utf-8");
        res.setHeader("content-length", body.length);
        return res.end(body);
      }
      if (req.method === "GET" && (url.pathname === "/healthz" || url.pathname === "/api/v1/runtime/health")) {
        const status = readiness();
        return sendJson(res, status.dependencies.database.ready ? 200 : 503, { ...status, ok: status.dependencies.database.ready }, correlationId);
      }
      if (req.method === "GET" && (url.pathname === "/readyz" || url.pathname === "/api/v1/runtime/readiness")) {
        const status = readiness();
        return sendJson(res, status.ready ? 200 : 503, status, correlationId);
      }
      if (req.method === "POST" && url.pathname === "/api/v1/auth/token") {
        rateLimit(db, `auth:${clientIp(req)}`, authLimit);
        if (!allowLocalAuth) throw new RuntimeError("LOCAL_AUTH_DISABLED", "Local token issuance is disabled", 404);
        const input = await readJson(req, bodyLimit);
        const organizationId = String(input.organization_id || "default");
        const userId = String(input.user_id || "");
        const user = db.prepare("SELECT id,organization_id,role,active FROM users WHERE organization_id=? AND id=?")
          .get(organizationId, userId);
        if (!user || !user.active) throw new RuntimeError("AUTH_REJECTED", "Authentication principal is not active", 401);
        const ttl = Math.min(3600, Number(input.ttl_seconds) || 3600);
        const token = issueToken({ sub: user.id, organization_id: user.organization_id, role: user.role }, authSecret, ttl);
        return sendJson(res, 200, { ok: true, token, expires_in: ttl, principal: user }, correlationId);
      }

      req.auth = authenticate(req);
      const isMutation = !["GET", "HEAD", "OPTIONS"].includes(req.method);
      if (isMutation) rateLimit(db, `mutation:${req.auth.organization_id}:${req.auth.user_id}`, mutationLimit);
      const input = isMutation ? await readJson(req, bodyLimit) : {};
      let params;

      if (req.method === "GET" && url.pathname === "/api/v1/missions") {
        authorize(req.auth, "read");
        return sendJson(res, 200, { ok: true, missions: listMissions(req.auth) }, correlationId);
      }
      if (req.method === "POST" && url.pathname === "/api/v1/missions") {
        authorize(req.auth, "create");
        return api.createMission(req, res, input);
      }
      if ((params = match(url.pathname, "/api/v1/missions/:id")) && req.method === "GET") {
        authorize(req.auth, "read");
        requireMission(db, req.auth, params.id);
        return api.getMission(req, res, params.id);
      }
      if ((params = match(url.pathname, "/api/v1/missions/:id/validate")) && req.method === "POST") {
        authorize(req.auth, "validate"); requireMission(db, req.auth, params.id);
        return api.validateMission(req, res, params.id, input);
      }
      if ((params = match(url.pathname, "/api/v1/missions/:id/plan")) && req.method === "POST") {
        authorize(req.auth, "plan"); requireMission(db, req.auth, params.id);
        return api.planMission(req, res, params.id, input);
      }
      if ((params = match(url.pathname, "/api/v1/missions/:id/approval-request")) && req.method === "POST") {
        authorize(req.auth, "requestApproval"); requireMission(db, req.auth, params.id);
        return api.requestApproval(req, res, params.id, input);
      }
      if ((params = match(url.pathname, "/api/v1/approvals/:id/decide")) && req.method === "POST") {
        authorize(req.auth, "approve"); requireApproval(db, req.auth, params.id);
        return api.decideApproval(req, res, params.id, input);
      }
      if ((params = match(url.pathname, "/api/v1/missions/:id/assign-agent")) && req.method === "POST") {
        authorize(req.auth, "assign"); requireMission(db, req.auth, params.id);
        return api.assignAgent(req, res, params.id, input);
      }
      if ((params = match(url.pathname, "/api/v1/missions/:id/execute")) && req.method === "POST") {
        authorize(req.auth, "execute");
        const mission = requireMission(db, req.auth, params.id);
        requireAssignedAgent(req.auth, mission);
        return api.executeMission(req, res, params.id, input);
      }
      if ((params = match(url.pathname, "/api/v1/missions/:id/cancel")) && req.method === "POST") {
        authorize(req.auth, "create"); requireMission(db, req.auth, params.id);
        return cancelMission(req, res, params.id, input);
      }
      if ((params = match(url.pathname, "/api/v1/missions/:id/evaluate")) && req.method === "POST") {
        authorize(req.auth, "evaluate"); requireMission(db, req.auth, params.id);
        return api.evaluateMission(req, res, params.id, input);
      }
      if ((params = match(url.pathname, "/api/v1/missions/:id/learn-capability")) && req.method === "POST") {
        authorize(req.auth, "learn"); requireMission(db, req.auth, params.id);
        return api.learnCapability(req, res, params.id, input);
      }
      if ((params = match(url.pathname, "/api/v1/missions/:id/evidence")) && req.method === "POST") {
        authorize(req.auth, "execute"); requireMission(db, req.auth, params.id);
        return api.recordEvidence(req, res, params.id, input);
      }
      if ((params = match(url.pathname, "/api/v1/evidence/:id")) && req.method === "GET") {
        authorize(req.auth, "read");
        return sendJson(res, 200, { ok: true, evidence: evidence.get(req.auth, params.id) }, correlationId);
      }
      if ((params = match(url.pathname, "/api/v1/missions/:id/evidence")) && req.method === "GET") {
        authorize(req.auth, "read");
        return sendJson(res, 200, { ok: true, evidence: evidence.list(req.auth, params.id) }, correlationId);
      }
      if (req.method === "POST" && url.pathname === "/api/v1/evidence/verify") {
        authorize(req.auth, "evidenceVerify");
        return sendJson(res, 200, { ok: true, report: evidence.verify(req.auth, input) }, correlationId);
      }
      if ((params = match(url.pathname, "/api/v1/missions/:id/proof")) && req.method === "GET") {
        authorize(req.auth, "read");
        return sendJson(res, 200, { ok: true, proof: evidence.proof(req.auth, params.id) }, correlationId);
      }
      if ((params = match(url.pathname, "/api/v1/missions/:id/export")) && req.method === "GET") {
        authorize(req.auth, "read"); requireMission(db, req.auth, params.id);
        const graph = store.withContext({ organization_id: req.auth.organization_id, actor: req.auth.user_id, correlation_id: correlationId }, () => engine.getMissionGraph(params.id));
        return sendJson(res, 200, { ok: true, export: { graph, proof: evidence.proof(req.auth, params.id), exported_at: now() } }, correlationId);
      }
      if ((params = match(url.pathname, "/api/v1/missions/:id/job")) && req.method === "GET") {
        authorize(req.auth, "jobsInspect"); requireMission(db, req.auth, params.id);
        const job = db.prepare("SELECT * FROM jobs WHERE organization_id=? AND mission_id=? ORDER BY created_at DESC LIMIT 1")
          .get(req.auth.organization_id, params.id);
        return sendJson(res, 200, { ok: true, job: rowPayload(job) }, correlationId);
      }
      if (req.method === "GET" && url.pathname === "/api/v1/jobs/failed") {
        authorize(req.auth, "jobsInspect");
        return sendJson(res, 200, { ok: true, jobs: queue.listFailed(req.auth) }, correlationId);
      }
      if ((params = match(url.pathname, "/api/v1/jobs/:id")) && req.method === "GET") {
        authorize(req.auth, "jobsInspect");
        return sendJson(res, 200, { ok: true, job: queue.get(req.auth, params.id) }, correlationId);
      }
      if ((params = match(url.pathname, "/api/v1/jobs/:id/requeue")) && req.method === "POST") {
        authorize(req.auth, "jobsRequeue");
        return sendJson(res, 200, { ok: true, job: queue.requeue(req.auth, params.id) }, correlationId);
      }
      if ((params = match(url.pathname, "/api/v1/missions/:id/events")) && req.method === "GET") {
        authorize(req.auth, "read"); requireMission(db, req.auth, params.id);
        const events = db.prepare("SELECT * FROM events WHERE organization_id=? AND json_extract(data,'$.mission_id')=? ORDER BY timestamp")
          .all(req.auth.organization_id, params.id).map(rowPayload);
        return sendJson(res, 200, { ok: true, events }, correlationId);
      }
      if ((params = match(url.pathname, "/api/v1/missions/:id/audits")) && req.method === "GET") {
        authorize(req.auth, "read"); requireMission(db, req.auth, params.id);
        const audits = db.prepare(`SELECT * FROM audit_log WHERE organization_id=? AND (
          resource_id=? OR json_extract(changes,'$.mission_id')=? OR (
            resource_type='job' AND resource_id IN (
              SELECT id FROM jobs WHERE organization_id=? AND mission_id=?
            )
          )
        ) ORDER BY timestamp`).all(req.auth.organization_id, params.id, params.id, req.auth.organization_id, params.id);
        return sendJson(res, 200, { ok: true, audits }, correlationId);
      }
      if ((params = match(url.pathname, "/api/v1/missions/:id/outcome")) && req.method === "GET") {
        authorize(req.auth, "read"); requireMission(db, req.auth, params.id);
        const outcome = db.prepare("SELECT * FROM outcomes WHERE organization_id=? AND mission_id=? ORDER BY completed_at DESC LIMIT 1")
          .get(req.auth.organization_id, params.id);
        return sendJson(res, 200, { ok: true, outcome: rowPayload(outcome) }, correlationId);
      }
      if (req.method === "POST" && url.pathname === "/api/v1/organization/users") {
        authorize(req.auth, "organizationManage");
        const userId = String(input.user_id || "").trim();
        const role = String(input.role || "").trim();
        if (!userId || !["admin", "approver", "agent", "viewer"].includes(role)) throw new RuntimeError("VALIDATION_ERROR", "Valid user_id and role are required", 422);
        const timestamp = now();
        db.prepare(`INSERT INTO users(id,organization_id,role,active,created_at,updated_at) VALUES(?,?,?,?,?,?)
          ON CONFLICT(organization_id,id) DO UPDATE SET role=excluded.role,active=excluded.active,updated_at=excluded.updated_at`)
          .run(userId, req.auth.organization_id, role, input.active === false ? 0 : 1, timestamp, timestamp);
        return sendJson(res, 201, { ok: true, user: { id: userId, organization_id: req.auth.organization_id, role, active: input.active !== false } }, correlationId);
      }

      throw new RuntimeError("NOT_FOUND", "Route not found", 404);
    } catch (error) {
      logger.write(error.status >= 500 || !error.status ? "error" : "warn", "http.request_failed", {
        method: req.method, path: url.pathname, correlation_id: correlationId, error: error.message, code: error.code,
      });
      return handleError(res, error, correlationId);
    }
  }

  function createWorker(workerOptions = {}) {
    return new MissionWorker({ db, store, evidence, queue, logger, ...workerOptions });
  }

  function close() {
    try { db.exec("PRAGMA wal_checkpoint(TRUNCATE)"); } catch { /* best effort */ }
    db.close();
  }

  return {
    repoRoot, dataRoot, dbPath, artifactRoot, db, store, engine, evidence, queue, api,
    authSecret, allowLocalAuth, handle, readiness, createWorker, issueToken: (claims, ttl) => issueToken(claims, authSecret, ttl), close,
  };
}

function createMissionHttpServer(runtime) {
  const server = http.createServer((req, res) => runtime.handle(req, res, new URL(req.url, "http://cyvx.local")));
  return {
    server,
    listen(port = 0, host = "127.0.0.1") {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => resolve(server.address()));
      });
    },
    close() { return new Promise((resolve) => server.close(resolve)); },
  };
}

module.exports = { createMissionRuntime, createMissionHttpServer, readJson, sendJson, match };
