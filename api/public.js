"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { createProductionGateway, buildReadiness } = require("./integrated-production");
const { createSparkServer } = require("../spark/server");

async function createPublicRuntime(options = {}) {
  const publicPort = positivePort(options.port || process.env.PORT || process.env.CYVX_PUBLIC_PORT || 3000, "public port");
  const host = String(options.host || process.env.CYVX_PUBLIC_HOST || "0.0.0.0");
  const cyvxGatewayPort = positivePort(options.cyvxGatewayPort || process.env.CYVX_GATEWAY_INTERNAL_PORT || publicPort + 1, "CYVX gateway port");
  const cyvxApiPort = positivePort(options.cyvxApiPort || process.env.CYVX_INTERNAL_PORT || publicPort + 2, "CYVX API port");
  const sparkPort = positivePort(options.sparkPort || process.env.CYVX_SPARK_INTERNAL_PORT || publicPort + 3, "Spark port");
  assertDistinctPorts({ publicPort, cyvxGatewayPort, cyvxApiPort, sparkPort });

  const dataRoot = path.resolve(options.dataRoot || process.env.CYVX_DATA_ROOT || path.join(os.homedir(), ".cyvx"));
  fs.mkdirSync(dataRoot, { recursive: true });

  const cyvx = await createProductionGateway({
    port: cyvxGatewayPort,
    internalPort: cyvxApiPort,
    legacyGatewayPort: options.cyvxLegacyGatewayPort || process.env.CYVX_LEGACY_GATEWAY_INTERNAL_PORT,
    host: "127.0.0.1",
    telemetry: options.telemetry,
    env: options.env,
    fetch: options.fetch,
  });

  const sparkInternalKey = String(options.sparkInternalKey || process.env.SPARK_INTERNAL_API_KEY || crypto.randomBytes(32).toString("base64url"));
  const spark = createSparkServer({
    apiKey: sparkInternalKey,
    allowedOrigin: process.env.APP_BASE_URL || "",
    trustProxy: true,
    requestLimit: Number(process.env.SPARK_RATE_LIMIT || 90),
    publicLeadLimit: Number(process.env.SPARK_LEAD_RATE_LIMIT || 20),
    bodyLimit: Number(process.env.SPARK_BODY_LIMIT || 256 * 1024),
    logPath: process.env.SPARK_LOG || path.join(dataRoot, "logs", "spark-runtime.log"),
    runtimeOptions: {
      filePath: process.env.SPARK_STATE_FILE || path.join(dataRoot, "spark-state.json"),
      artifactRoot: process.env.SPARK_ARTIFACT_ROOT || path.join(dataRoot, "worlds"),
    },
  });

  const publicServer = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://cyvx.public");
    setPublicHeaders(res);

    try {
      cyvx.integrations.edge.require(req, url);
      if (req.method === "GET" && (url.pathname === "/healthz" || url.pathname === "/health")) {
        return sendJson(res, 200, publicHealth(cyvx, spark.runtime));
      }

      if (req.method === "GET" && url.pathname === "/readyz") {
        const health = publicHealth(cyvx, spark.runtime);
        return sendJson(res, health.ready ? 200 : 503, health);
      }

      if (req.method === "GET" && url.pathname === "/api/public/status") {
        return sendJson(res, 200, publicStatus(cyvx, spark.runtime));
      }

      if (req.method === "GET" && url.pathname === "/api/public/worlds") {
        const snapshot = spark.runtime.snapshot();
        const worlds = snapshot.worlds
          .filter((world) => world.status === "operational")
          .slice(0, 24)
          .map(publicWorld);
        return sendJson(res, 200, {
          ok: true,
          worlds,
          total: worlds.length,
          timestamp: new Date().toISOString(),
        });
      }

      const publicGraphMatch = url.pathname.match(/^\/api\/public\/sparks\/([^/]+)$/);
      if (req.method === "GET" && publicGraphMatch) {
        const ownerId = String(req.headers["x-spark-owner"] || "").trim();
        if (!ownerId) return sendJson(res, 401, { ok: false, error: "OWNER_KEY_REQUIRED", message: "The Spark owner key is required." });
        const graph = spark.runtime.graph(decodeURIComponent(publicGraphMatch[1]));
        if (!safeEqual(ownerId, graph.spark.owner_id)) {
          return sendJson(res, 403, { ok: false, error: "OWNER_KEY_REJECTED", message: "This device does not control that Spark." });
        }
        return sendJson(res, 200, { ok: true, data: graph, timestamp: new Date().toISOString() });
      }

      if (isSparkStaticRoute(url.pathname)) {
        return proxyHttp(req, res, sparkPort, rewriteSparkPath(url));
      }

      const sparkPath = canonicalSparkApiPath(url);
      if (sparkPath) {
        if (!isAllowedPublicSparkApi(req.method, sparkPath)) {
          return sendJson(res, 404, { ok: false, error: "NOT_FOUND", message: "Public Spark route not found." });
        }
        return proxyHttp(req, res, sparkPort, sparkPath + url.search, { "x-api-key": sparkInternalKey });
      }

      if (url.pathname === "/os" || url.pathname.startsWith("/os/")) {
        return proxyHttp(req, res, cyvxGatewayPort, rewriteOsPath(url));
      }

      return proxyHttp(req, res, cyvxGatewayPort, req.url);
    } catch (error) {
      return sendJson(res, error.statusCode || error.status || 500, {
        ok: false,
        error: error.code || "PUBLIC_GATEWAY_ERROR",
        message: error.message,
      });
    }
  });

  publicServer.on("upgrade", (req, socket, head) => {
    try {
      cyvx.integrations.edge.require(req, new URL(req.url, "http://cyvx.public"));
      proxyUpgrade(req, socket, head, cyvxGatewayPort, req.url);
    } catch {
      socket.destroy();
    }
  });

  return {
    publicServer,
    cyvx,
    spark,
    sparkInternalKey,
    integrations: cyvx.integrations,
    ports: { publicPort, cyvxGatewayPort, cyvxApiPort, sparkPort, legacyGatewayPort: cyvx.legacyGatewayPort },
    host,
    async listen() {
      await cyvx.listen();
      await listen(spark.server, sparkPort, "127.0.0.1");
      await listen(publicServer, publicPort, host);
      return this;
    },
    async close() {
      await Promise.all([
        closeServer(publicServer),
        closeServer(spark.server),
        cyvx.close(),
      ]);
    },
  };
}

function isSparkStaticRoute(pathname) {
  return pathname === "/" ||
    pathname === "/spark" ||
    pathname.startsWith("/spark/assets/") ||
    pathname.startsWith("/spark/w/") ||
    pathname === "/spark/metrics" ||
    pathname.startsWith("/assets/") ||
    pathname.startsWith("/w/");
}

function canonicalSparkApiPath(url) {
  let pathname = url.pathname;
  if (pathname.startsWith("/spark/api/")) pathname = pathname.slice("/spark".length);
  if (pathname === "/api/v1/sparks" ||
      pathname.startsWith("/api/v1/sparks/") ||
      pathname.startsWith("/api/v1/worlds/")) {
    return pathname;
  }
  return null;
}

function isAllowedPublicSparkApi(method, pathname) {
  if (method === "POST" && pathname === "/api/v1/sparks") return true;
  if (method === "POST" && /^\/api\/v1\/sparks\/[^/]+\/(approval|execute|control|outcomes)$/.test(pathname)) return true;
  if (method === "PATCH" && /^\/api\/v1\/worlds\/[^/]+$/.test(pathname)) return true;
  if (method === "POST" && /^\/api\/v1\/worlds\/[^/]+\/leads$/.test(pathname)) return true;
  return false;
}

function rewriteSparkPath(url) {
  let pathname = url.pathname;
  if (pathname === "/spark" || pathname === "/spark/") pathname = "/";
  else if (pathname === "/spark/metrics") pathname = "/metrics";
  else if (pathname.startsWith("/spark/")) pathname = pathname.slice("/spark".length) || "/";
  return pathname + url.search;
}

function rewriteOsPath(url) {
  let pathname = url.pathname.slice("/os".length) || "/";
  if (!pathname.startsWith("/")) pathname = `/${pathname}`;
  return pathname + url.search;
}

function publicHealth(cyvx, sparkRuntime) {
  let sparkHealth;
  try {
    const health = sparkRuntime.health();
    sparkHealth = { status: health.status, version: health.version, metrics: health.metrics };
  } catch (error) {
    sparkHealth = { status: "error", message: error.message };
  }

  const github = buildReadiness(cyvx);
  const integrations = cyvx.integrations ? cyvx.integrations.snapshot() : { ready: true, required: false, checks: [] };
  let cyvxHealthy = true;
  try {
    const status = typeof cyvx.controller.status === "function" ? cyvx.controller.status() : { status: "ok" };
    cyvxHealthy = status && status.status !== "error";
  } catch {
    cyvxHealthy = false;
  }
  const sparkHealthy = sparkHealth.status === "ok";
  const integrationsHealthy = !integrations.required || integrations.ready;

  return {
    ok: cyvxHealthy && sparkHealthy && integrationsHealthy,
    ready: cyvxHealthy && sparkHealthy && integrationsHealthy,
    status: cyvxHealthy && sparkHealthy && integrationsHealthy ? "ok" : "degraded",
    service: "Spark + CYVX",
    version: "8.0.0-integration-baseline",
    services: {
      spark: sparkHealth,
      cyvx: { status: cyvxHealthy ? "ok" : "degraded" },
      github: { configured: github.ready },
      integrations: { configured: integrations.ready, required: integrations.required, failed: integrations.checks.filter((item) => item.required && !item.ok).map((item) => item.key) },
    },
    timestamp: new Date().toISOString(),
  };
}

function publicStatus(cyvx, sparkRuntime) {
  const snapshot = sparkRuntime.snapshot();
  const github = buildReadiness(cyvx);
  const integrations = cyvx.integrations ? cyvx.integrations.snapshot() : { ready: true, required: false, providers: {} };
  return {
    ok: true,
    powered_by: "Spark + CYVX",
    version: "8.0.0-integration-baseline",
    metrics: snapshot.metrics,
    capabilities: snapshot.capabilities.map((capability) => ({
      key: capability.key,
      description: capability.description,
      risk: capability.risk,
      requires_approval: capability.requires_approval,
    })),
    github: {
      configured: github.ready,
      webhook_ready: github.webhook_ready,
      app_auth_ready: github.app_auth_ready,
      oauth_ready: github.oauth_ready,
    },
    integrations: {
      ready: integrations.ready,
      required: integrations.required,
      identity: Boolean(integrations.providers.identity && integrations.providers.identity.configured),
      edge: Boolean(integrations.providers.edge && integrations.providers.edge.configured),
      queue: Boolean(integrations.providers.queue && integrations.providers.queue.configured),
      feature_flags: Boolean(integrations.providers.feature_flags && integrations.providers.feature_flags.configured),
      ai_observability: Boolean(integrations.providers.ai_observability && integrations.providers.ai_observability.configured),
      error_tracking: Boolean(integrations.providers.error_tracking && integrations.providers.error_tracking.configured),
    },
    links: {
      spark: "/",
      cyvx_os: "/os",
      health: "/healthz",
      worlds: "/api/public/worlds",
    },
    timestamp: new Date().toISOString(),
  };
}

function publicWorld(world) {
  return {
    id: world.id,
    name: world.name,
    slug: world.slug,
    status: world.status,
    public_path: world.public_path,
    offer_name: world.config && world.config.offer_name || null,
    location: world.config && world.config.location || null,
    created_at: world.created_at,
    updated_at: world.updated_at,
  };
}

function setPublicHeaders(res) {
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("x-frame-options", "SAMEORIGIN");
  res.setHeader("referrer-policy", "strict-origin-when-cross-origin");
  res.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=()");
}

function sendJson(res, status, payload) {
  const body = Buffer.from(`${JSON.stringify(payload)}\n`);
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("content-length", body.length);
  res.end(body);
}

function proxyHttp(req, res, port, targetPath, headers = {}) {
  const upstream = http.request({
    host: "127.0.0.1",
    port,
    method: req.method,
    path: targetPath,
    headers: { ...req.headers, ...headers, host: `127.0.0.1:${port}` },
  }, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
    upstreamRes.pipe(res);
  });
  upstream.on("error", (error) => {
    if (!res.headersSent) sendJson(res, 502, { ok: false, error: "UPSTREAM_UNAVAILABLE", message: error.message });
    else res.destroy(error);
  });
  req.pipe(upstream);
}

function proxyUpgrade(req, clientSocket, head, port, targetPath) {
  const upstream = net.connect(port, "127.0.0.1", () => {
    const headers = Object.entries({ ...req.headers, host: `127.0.0.1:${port}` }).map(([key, value]) => `${key}: ${value}`).join("\r\n");
    upstream.write(`${req.method} ${targetPath} HTTP/${req.httpVersion}\r\n${headers}\r\n\r\n`);
    if (head && head.length) upstream.write(head);
    clientSocket.pipe(upstream).pipe(clientSocket);
  });
  upstream.on("error", () => clientSocket.destroy());
  clientSocket.on("error", () => upstream.destroy());
}

function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    const onError = (error) => { server.off("listening", onListening); reject(error); };
    const onListening = () => { server.off("error", onError); resolve(); };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

function closeServer(server) {
  if (!server || !server.listening) return Promise.resolve();
  return new Promise((resolve) => server.close(resolve));
}

function positivePort(value, label) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`${label} must be a valid TCP port`);
  return port;
}

function assertDistinctPorts(values) {
  const entries = Object.entries(values);
  if (new Set(entries.map(([, value]) => value)).size !== entries.length) throw new Error("Public, CYVX, and Spark ports must be distinct");
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

if (require.main === module) {
  createPublicRuntime().then((runtime) => runtime.listen()).then((runtime) => {
    process.stdout.write(`${JSON.stringify({ event: "cyvx.public.ready", ports: runtime.ports, powered_by: "Spark + CYVX" })}\n`);
  }).catch((error) => {
    process.stderr.write(`${JSON.stringify({ event: "cyvx.public.failed", error: error.message })}\n`);
    process.exit(1);
  });
}

module.exports = {
  assertDistinctPorts,
  canonicalSparkApiPath,
  createPublicRuntime,
  isAllowedPublicSparkApi,
  publicHealth,
  publicStatus,
  rewriteOsPath,
  rewriteSparkPath,
};
