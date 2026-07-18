"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { URL } = require("node:url");
const { loadCatalog, validateCatalog, findPost } = require("./lib/catalog");
const { createStore } = require("./lib/store");
const { buildAll } = require("./lib/pipeline");

const PUBLIC_DIR = path.join(__dirname, "public");
const DIST_DIR = path.resolve(process.env.CYVX_FIELD_MANUAL_DIST || path.join(process.cwd(), "dist", "field-manual"));
const MAX_BODY = 64 * 1024;

function json(res, status, payload, headers = {}) {
  const body = `${JSON.stringify(payload)}\n`;
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...headers
  });
  res.end(body);
}

function text(res, status, body, contentType = "text/plain; charset=utf-8", headers = {}) {
  res.writeHead(status, {
    "content-type": contentType,
    "content-length": Buffer.byteLength(body),
    "x-content-type-options": "nosniff",
    ...headers
  });
  res.end(body);
}

function mime(file) {
  return {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".md": "text/markdown; charset=utf-8"
  }[path.extname(file).toLowerCase()] || "application/octet-stream";
}

function safeJoin(base, requested) {
  const normalized = path.normalize(requested).replace(/^(\.\.(\/|\\|$))+/, "");
  const target = path.resolve(base, `.${path.sep}${normalized}`);
  if (!target.startsWith(path.resolve(base) + path.sep) && target !== path.resolve(base)) return null;
  return target;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        const error = new Error("Request body is too large.");
        error.code = "BODY_TOO_LARGE";
        reject(error);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        const error = new Error("Request body must be valid JSON.");
        error.code = "INVALID_JSON";
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function isAuthorized(req) {
  const configured = process.env.CYVX_FIELD_MANUAL_ADMIN_TOKEN;
  if (!configured) return false;
  const provided = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(configured);
  const b = Buffer.from(provided);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function clientIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
}

async function ensureBuild() {
  const manifest = path.join(DIST_DIR, "manifest.json");
  if (!fs.existsSync(manifest)) await buildAll({ outDir: DIST_DIR });
}

function createFieldManualServer(options = {}) {
  const store = options.store || createStore(options.storeOptions);
  const catalog = loadCatalog();
  const validation = validateCatalog(catalog);
  if (!validation.ok) throw new Error(validation.errors.join("\n"));

  const server = http.createServer(async (req, res) => {
    const correlationId = req.headers["x-correlation-id"] || crypto.randomUUID();
    const started = Date.now();
    res.setHeader("x-correlation-id", correlationId);
    res.setHeader("referrer-policy", "strict-origin-when-cross-origin");
    res.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=()");
    res.setHeader("content-security-policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; form-action 'self'; base-uri 'self'; frame-ancestors 'none'");

    try {
      const url = new URL(req.url, "http://localhost");
      const pathname = decodeURIComponent(url.pathname);

      if (req.method === "GET" && pathname === "/api/health") {
        return json(res, 200, {
          ok: true,
          service: "cyvx-field-manual",
          post_count: catalog.posts.length,
          catalog_valid: validation.ok,
          storage: store.baseDir,
          uptime_seconds: Math.floor(process.uptime())
        });
      }

      if (req.method === "GET" && pathname === "/api/brand") {
        return json(res, 200, catalog.brand, { "cache-control": "public, max-age=300" });
      }

      if (req.method === "GET" && pathname === "/api/posts") {
        const pillar = String(url.searchParams.get("pillar") || "").trim().toLowerCase();
        const status = String(url.searchParams.get("status") || "approved").trim().toLowerCase();
        const posts = catalog.posts.filter((post) => (!pillar || post.pillar === pillar) && (!status || post.status === status));
        return json(res, 200, { count: posts.length, posts }, { "cache-control": "public, max-age=60" });
      }

      const postMatch = pathname.match(/^\/api\/posts\/([a-z0-9-]+)$/);
      if (req.method === "GET" && postMatch) {
        const post = findPost(catalog.posts, postMatch[1]);
        if (!post) return json(res, 404, { ok: false, error: "Post not found." });
        return json(res, 200, post, { "cache-control": "public, max-age=60" });
      }

      if (req.method === "POST" && pathname === "/api/leads") {
        const body = await readBody(req);
        const lead = store.captureLead(body, { ip: clientIp(req), userAgent: req.headers["user-agent"] });
        return json(res, lead.existing ? 200 : 201, {
          ok: true,
          lead,
          download_url: "/downloads/operator-starter-manual.html"
        });
      }

      if (req.method === "POST" && pathname === "/api/events") {
        const body = await readBody(req);
        const event = store.captureEvent(body);
        return json(res, 202, { ok: true, event_id: event.id });
      }

      if (req.method === "GET" && pathname === "/api/metrics") {
        if (!isAuthorized(req)) return json(res, 401, { ok: false, error: "Admin authorization required." });
        return json(res, 200, { ok: true, ...store.summary() });
      }

      if (req.method === "POST" && pathname === "/api/pipeline/build") {
        if (!isAuthorized(req)) return json(res, 401, { ok: false, error: "Admin authorization required." });
        const body = await readBody(req);
        const result = await buildAll({
          outDir: DIST_DIR,
          slug: body.slug || undefined,
          useAi: body.use_ai === true
        });
        store.captureEvent({ type: "pipeline.build", source: "api", post_slug: body.slug || "", metadata: { files: result.manifest.files.length } });
        return json(res, 200, { ok: true, out_dir: result.outDir, manifest: result.manifest });
      }

      if (pathname.startsWith("/downloads/") || pathname.startsWith("/posts/")) {
        await ensureBuild();
        const file = safeJoin(DIST_DIR, pathname);
        if (file && fs.existsSync(file) && fs.statSync(file).isFile()) {
          return text(res, 200, fs.readFileSync(file), mime(file), {
            "cache-control": pathname.endsWith(".html") ? "public, max-age=300" : "public, max-age=31536000, immutable",
            "content-disposition": "inline"
          });
        }
      }

      const aliases = {
        "/": "index.html",
        "/studio": "studio.html",
        "/studio/": "studio.html",
        "/privacy": "privacy.html"
      };
      const requested = aliases[pathname] || pathname.replace(/^\/+/, "");
      const file = safeJoin(PUBLIC_DIR, requested);
      if (file && fs.existsSync(file) && fs.statSync(file).isFile()) {
        return text(res, 200, fs.readFileSync(file), mime(file), {
          "cache-control": requested.endsWith(".html") ? "no-cache" : "public, max-age=3600"
        });
      }

      return json(res, 404, { ok: false, error: "Not found." });
    } catch (error) {
      const status = {
        INVALID_EMAIL: 400,
        CONSENT_REQUIRED: 400,
        INVALID_EVENT: 400,
        INVALID_JSON: 400,
        BODY_TOO_LARGE: 413
      }[error.code] || 500;
      store.log("error", "request.failed", {
        correlation_id: correlationId,
        method: req.method,
        url: req.url,
        error: error.message,
        code: error.code || null
      });
      return json(res, status, { ok: false, error: status === 500 ? "Internal server error." : error.message, correlation_id: correlationId });
    } finally {
      store.log("info", "request.completed", {
        correlation_id: correlationId,
        method: req.method,
        url: req.url,
        status_code: res.statusCode,
        duration_ms: Date.now() - started
      });
    }
  });

  return server;
}

async function start() {
  await ensureBuild();
  const host = process.env.CYVX_FIELD_MANUAL_HOST || "127.0.0.1";
  const port = Number(process.env.PORT || process.env.CYVX_FIELD_MANUAL_PORT || 3040);
  const server = createFieldManualServer();
  server.listen(port, host, () => {
    process.stdout.write(`${JSON.stringify({
      ok: true,
      event: "field_manual.started",
      url: `http://${host}:${port}`,
      studio: `http://${host}:${port}/studio`,
      data_dir: process.env.CYVX_FIELD_MANUAL_DATA_DIR || "~/.cyvx/field-manual",
      dist_dir: DIST_DIR
    })}\n`);
  });
  const shutdown = (signal) => server.close(() => {
    process.stdout.write(`${JSON.stringify({ ok: true, event: "field_manual.stopped", signal })}\n`);
    process.exit(0);
  });
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

if (require.main === module) {
  start().catch((error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
    process.exit(1);
  });
}

module.exports = { createFieldManualServer, start, ensureBuild };
