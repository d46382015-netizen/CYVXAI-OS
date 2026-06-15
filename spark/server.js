"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { SparkError, SparkRuntime } = require("./runtime");

const UI_ROOT = path.join(__dirname, "ui");
const DEFAULT_BODY_LIMIT = 256 * 1024;

function createSparkServer(options = {}) {
  const runtime = options.runtime || new SparkRuntime(options.runtimeOptions || {});
  const apiKey = options.apiKey ?? process.env.SPARK_API_KEY ?? "";
  const allowedOrigin = options.allowedOrigin ?? process.env.SPARK_ALLOWED_ORIGIN ?? "";
  const bodyLimit = Number(options.bodyLimit || process.env.SPARK_BODY_LIMIT || DEFAULT_BODY_LIMIT);
  const requestLimit = Number(options.requestLimit || process.env.SPARK_RATE_LIMIT || 120);
  const publicLeadLimit = Number(options.publicLeadLimit || process.env.SPARK_LEAD_RATE_LIMIT || 20);
  const trustProxy = options.trustProxy ?? process.env.SPARK_TRUST_PROXY === "1";
  const buckets = new Map();
  const logPath = path.resolve(options.logPath || process.env.SPARK_LOG || path.join(process.cwd(), ".cyvx", "logs", "spark-runtime.log"));
  fs.mkdirSync(path.dirname(logPath), { recursive: true });

  const server = http.createServer(async (req, res) => {
    const started = process.hrtime.bigint();
    const requestId = String(req.headers["x-request-id"] || crypto.randomUUID());
    res.setHeader("x-request-id", requestId);
    setSecurityHeaders(res);
    setCorsHeaders(req, res, allowedOrigin);

    try {
      if (req.method === "OPTIONS") return sendEmpty(res, 204);
      const url = new URL(req.url, "http://spark.local");
      const pathname = decodeURIComponent(url.pathname);
      const isLeadRoute = req.method === "POST" && /^\/api\/v1\/worlds\/[^/]+\/leads$/.test(pathname);
      const rate = isLeadRoute ? publicLeadLimit : requestLimit;
      if (!takeRateLimit(req, buckets, rate, isLeadRoute ? "lead" : "api", trustProxy)) {
        throw new SparkError("RATE_LIMITED", "Too many requests", 429);
      }

      if (req.method === "GET" && pathname === "/healthz") return sendJson(res, 200, envelope(requestId, runtime.health()));
      if (req.method === "GET" && pathname === "/readyz") return sendJson(res, 200, envelope(requestId, { ready: writable(runtime.store.filePath), health: runtime.health() }));
      if (req.method === "GET" && pathname === "/metrics") return sendText(res, 200, runtime.prometheus(), "text/plain; version=0.0.4; charset=utf-8");
      if (req.method === "GET" && pathname === "/") return serveUiFile(res, "index.html");
      if (req.method === "GET" && pathname.startsWith("/assets/")) return serveUiFile(res, pathname.slice("/assets/".length));

      const publicWorldMatch = pathname.match(/^\/w\/([a-z0-9-]+)$/i);
      if (req.method === "GET" && publicWorldMatch) {
        const world = runtime.worldBySlug(publicWorldMatch[1]);
        return sendBuffer(res, 200, runtime.worldSite(world.id), "text/html; charset=utf-8");
      }

      const leadMatch = pathname.match(/^\/api\/v1\/worlds\/([^/]+)\/leads$/);
      if (req.method === "POST" && leadMatch) {
        const body = await readJson(req, bodyLimit);
        const result = runtime.captureLead(leadMatch[1], body, { idempotencyKey: req.headers["idempotency-key"] });
        return sendJson(res, 201, envelope(requestId, result));
      }

      requireApiKey(req, apiKey);

      if (req.method === "GET" && pathname === "/api/v1/spark") return sendJson(res, 200, envelope(requestId, runtime.snapshot()));
      if (req.method === "GET" && pathname === "/api/v1/sparks") return sendJson(res, 200, envelope(requestId, { sparks: runtime.listSparks() }));
      if (req.method === "POST" && pathname === "/api/v1/sparks") {
        const body = await readJson(req, bodyLimit);
        const graph = runtime.ignite(body, { idempotencyKey: req.headers["idempotency-key"] });
        return sendJson(res, 201, envelope(requestId, graph));
      }
      if (req.method === "GET" && pathname === "/api/v1/events") return sendJson(res, 200, envelope(requestId, { events: runtime.events(url.searchParams.get("limit")) }));

      const sparkMatch = pathname.match(/^\/api\/v1\/sparks\/([^/]+)$/);
      if (req.method === "GET" && sparkMatch) return sendJson(res, 200, envelope(requestId, runtime.graph(sparkMatch[1])));

      const approvalMatch = pathname.match(/^\/api\/v1\/sparks\/([^/]+)\/approval$/);
      if (req.method === "POST" && approvalMatch) return sendJson(res, 200, envelope(requestId, runtime.approve(approvalMatch[1], await readJson(req, bodyLimit))));

      const executeMatch = pathname.match(/^\/api\/v1\/sparks\/([^/]+)\/execute$/);
      if (req.method === "POST" && executeMatch) return sendJson(res, 200, envelope(requestId, runtime.execute(executeMatch[1], await readJson(req, bodyLimit))));

      const controlMatch = pathname.match(/^\/api\/v1\/sparks\/([^/]+)\/control$/);
      if (req.method === "POST" && controlMatch) return sendJson(res, 200, envelope(requestId, runtime.control(controlMatch[1], await readJson(req, bodyLimit))));

      const outcomeMatch = pathname.match(/^\/api\/v1\/sparks\/([^/]+)\/outcomes$/);
      if (req.method === "POST" && outcomeMatch) return sendJson(res, 201, envelope(requestId, runtime.recordOutcome(outcomeMatch[1], await readJson(req, bodyLimit))));

      const worldMatch = pathname.match(/^\/api\/v1\/worlds\/([^/]+)$/);
      if (req.method === "PATCH" && worldMatch) return sendJson(res, 200, envelope(requestId, runtime.configureWorld(worldMatch[1], await readJson(req, bodyLimit))));

      const exportMatch = pathname.match(/^\/api\/v1\/worlds\/([^/]+)\/export$/);
      if (req.method === "GET" && exportMatch) {
        const ownerId = requiredQuery(url, "owner_id");
        res.setHeader("content-disposition", `attachment; filename=world-${safeFilename(exportMatch[1])}.json`);
        return sendJson(res, 200, runtime.exportWorld(exportMatch[1], ownerId));
      }

      throw new SparkError("NOT_FOUND", "Route not found", 404);
    } catch (error) {
      const normalized = normalizeError(error);
      sendJson(res, normalized.status, envelope(requestId, null, normalized));
    } finally {
      const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
      appendLog(logPath, {
        timestamp: new Date().toISOString(),
        request_id: requestId,
        method: req.method,
        path: req.url,
        status: res.statusCode,
        duration_ms: Math.round(durationMs * 100) / 100,
        remote: clientKey(req, trustProxy),
      });
    }
  });

  server.keepAliveTimeout = Number(options.keepAliveTimeout || 65_000);
  server.headersTimeout = Number(options.headersTimeout || 66_000);
  server.requestTimeout = Number(options.requestTimeout || 30_000);
  server.on("clientError", (error, socket) => {
    appendLog(logPath, { timestamp: new Date().toISOString(), level: "warn", event: "client_error", error: error.message });
    if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
  });

  return { server, runtime, logPath };
}

function main() {
  const host = process.env.SPARK_HOST || "127.0.0.1";
  const port = Number(process.env.SPARK_PORT || 3100);
  const apiKey = process.env.SPARK_API_KEY || "";
  if (!isLoopback(host) && !apiKey && process.env.SPARK_ALLOW_UNAUTHENTICATED !== "1") {
    throw new Error("Refusing non-loopback startup without SPARK_API_KEY. Set a key or SPARK_ALLOW_UNAUTHENTICATED=1 explicitly.");
  }
  const { server, runtime } = createSparkServer({ apiKey });
  server.listen(port, host, () => {
    console.log(JSON.stringify({ event: "spark.started", host, port, url: `http://${host}:${port}`, authenticated: Boolean(apiKey), health: runtime.health() }));
  });

  let closing = false;
  const shutdown = (signal) => {
    if (closing) return;
    closing = true;
    console.log(JSON.stringify({ event: "spark.shutdown", signal }));
    server.close((error) => process.exit(error ? 1 : 0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

function requireApiKey(req, apiKey) {
  if (!apiKey) return;
  const supplied = String(req.headers["x-api-key"] || req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const expected = Buffer.from(apiKey);
  const actual = Buffer.from(supplied);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) throw new SparkError("UNAUTHORIZED", "A valid API key is required", 401);
}

function takeRateLimit(req, buckets, maxPerMinute, namespace, trustProxy = false) {
  if (!Number.isFinite(maxPerMinute) || maxPerMinute <= 0) return true;
  const now = Date.now();
  const key = `${namespace}:${clientKey(req, trustProxy)}`;
  const bucket = buckets.get(key) || { start: now, count: 0 };
  if (now - bucket.start >= 60_000) { bucket.start = now; bucket.count = 0; }
  bucket.count += 1;
  buckets.set(key, bucket);
  if (buckets.size > 10_000) for (const [bucketKey, value] of buckets) if (now - value.start >= 120_000) buckets.delete(bucketKey);
  return bucket.count <= maxPerMinute;
}

function clientKey(req, trustProxy = false) {
  if (trustProxy) {
    const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    if (forwarded) return forwarded;
  }
  return req.socket.remoteAddress || "unknown";
}

function setSecurityHeaders(res) {
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("x-frame-options", "DENY");
  res.setHeader("referrer-policy", "no-referrer");
  res.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("content-security-policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  res.setHeader("cache-control", "no-store");
}

function setCorsHeaders(req, res, allowedOrigin) {
  const origin = String(req.headers.origin || "");
  if (allowedOrigin && origin === allowedOrigin) { res.setHeader("access-control-allow-origin", origin); res.setHeader("vary", "origin"); }
  res.setHeader("access-control-allow-headers", "content-type, authorization, x-api-key, x-request-id, idempotency-key");
  res.setHeader("access-control-allow-methods", "GET,POST,PATCH,OPTIONS");
}

function readJson(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) { reject(new SparkError("PAYLOAD_TOO_LARGE", `JSON body exceeds ${limit} bytes`, 413)); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("body must be a JSON object");
        resolve(value);
      } catch (error) { reject(new SparkError("INVALID_JSON", error.message, 400)); }
    });
    req.on("error", reject);
  });
}

function serveUiFile(res, relativePath) {
  const safe = path.posix.normalize(`/${relativePath}`).replace(/^\/+/, "");
  const file = path.resolve(UI_ROOT, safe);
  if (file !== UI_ROOT && !file.startsWith(`${UI_ROOT}${path.sep}`)) throw new SparkError("NOT_FOUND", "Asset not found", 404);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new SparkError("NOT_FOUND", "Asset not found", 404);
  const type = file.endsWith(".html") ? "text/html; charset=utf-8" : file.endsWith(".js") ? "application/javascript; charset=utf-8" : file.endsWith(".css") ? "text/css; charset=utf-8" : "application/octet-stream";
  return sendBuffer(res, 200, fs.readFileSync(file), type);
}

function sendJson(res, status, payload) { if (res.writableEnded) return; const body = Buffer.from(`${JSON.stringify(payload)}\n`); res.statusCode = status; res.setHeader("content-type", "application/json; charset=utf-8"); res.setHeader("content-length", body.length); res.end(body); }
function sendText(res, status, payload, type = "text/plain; charset=utf-8") { return sendBuffer(res, status, Buffer.from(payload), type); }
function sendBuffer(res, status, body, type) { if (res.writableEnded) return; res.statusCode = status; res.setHeader("content-type", type); res.setHeader("content-length", body.length); res.end(body); }
function sendEmpty(res, status) { res.statusCode = status; res.end(); }
function envelope(requestId, data, error = null) { return { powered_by: "Spark + CYVX", version: "1.0.0", request_id: requestId, timestamp: new Date().toISOString(), ok: !error, ...(error ? { error: { code: error.code, message: error.message, details: error.details } } : { data }) }; }
function normalizeError(error) { if (error instanceof SparkError) return error; return new SparkError("INTERNAL_ERROR", "The Spark runtime could not complete the request", 500, process.env.NODE_ENV === "production" ? undefined : { cause: error.message }); }
function requiredQuery(url, key) { const value = url.searchParams.get(key); if (!value) throw new SparkError("VALIDATION_ERROR", `${key} is required`, 422, { field: key }); return value; }
function writable(filePath) { try { fs.accessSync(path.dirname(filePath), fs.constants.W_OK); return true; } catch (_) { return false; } }
function appendLog(logPath, event) { try { fs.appendFileSync(logPath, `${JSON.stringify(event)}\n`, { mode: 0o600 }); } catch (error) { console.error(JSON.stringify({ event: "spark.log_failed", error: error.message })); } }
function safeFilename(value) { return String(value).replace(/[^a-z0-9_-]/gi, "_"); }
function isLoopback(host) { return new Set(["127.0.0.1", "localhost", "::1"]).has(host); }

if (require.main === module) {
  try { main(); } catch (error) { console.error(JSON.stringify({ event: "spark.start_failed", error: error.message })); process.exit(1); }
}

module.exports = { createSparkServer, envelope, normalizeError, readJson };
