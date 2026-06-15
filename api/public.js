"use strict";

const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");
const { createProductionGateway, buildReadiness } = require("./production");
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
    host: "127.0.0.1",
  });

  const sparkPublicMode = String(process.env.SPARK_PUBLIC_MODE || "1") !== "0";
  const spark = createSparkServer({
    apiKey: sparkPublicMode ? "" : String(process.env.SPARK_API_KEY || ""),
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

      if (isSparkRoute(url.pathname)) {
        return proxyHttp(req, res, sparkPort, rewriteSparkPath(url));
      }

      if (url.pathname === "/os" || url.pathname.startsWith("/os/")) {
        return proxyHttp(req, res, cyvxGatewayPort, rewriteOsPath(url));
      }

      return proxyHttp(req, res, cyvxGatewayPort, req.url);
    } catch (error) {
      return sendJson(res, error.statusCode || 500, {
        ok: false,
        error: error.code || "PUBLIC_GATEWAY_ERROR",
        message: error.message,
      });
    }
  });

  publicServer.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url, "http://cyvx.public");
    const targetPort = isSparkRoute(url.pathname) ? sparkPort : cyvxGatewayPort;
    const targetPath = isSparkRoute(url.pathname) ? rewriteSparkPath(url) : req.url;
    proxyUpgrade(req, socket, head, targetPort, targetPath);
  });

  return {
    publicServer,
    cyvx,
    spark,
    ports: { publicPort, cyvxGatewayPort, cyvxApiPort, sparkPort },
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

function isSparkRoute(pathname) {
  return pathname === "/" ||
    pathname === "/spark" ||
    pathname.startsWith("/spark/") ||
    pathname.startsWith("/assets/") ||
    pathname.startsWith("/w/") ||
    pathname === "/api/v1/spark" ||
    pathname === "/api/v1/sparks" ||
    pathname.startsWith("/api/v1/sparks/") ||
    pathname.startsWith("/api/v1/worlds/");
}

function rewriteSparkPath(url) {
  let pathname = url.pathname;
  if (pathname === "/spark" || pathname === "/spark/") pathname = "/";
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
  const cyvxStatus = typeof cyvx.controller.status === "function" ? cyvx.controller.status() : { status: "ok" };
  const cyvxHealthy = cyvxStatus && cyvxStatus.status !== "error";
  const sparkHealthy = sparkHealth.status === "ok";

  return {
    ok: cyvxHealthy && sparkHealthy,
    ready: cyvxHealthy && sparkHealthy,
    status: cyvxHealthy && sparkHealthy ? "ok" : "degraded",
    service: "Spark + CYVX",
    version: "6.1.0-public",
    services: {
      spark: sparkHealth,
      cyvx: { status: cyvxHealthy ? "ok" : "degraded" },
      github: { configured: github.ready },
    },
    timestamp: new Date().toISOString(),
  };
}

function publicStatus(cyvx, sparkRuntime) {
  const snapshot = sparkRuntime.snapshot();
  const github = buildReadiness(cyvx);
  return {
    ok: true,
    powered_by: "Spark + CYVX",
    version: "6.1.0-public",
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

function proxyHttp(req, res, port, requestPath) {
  const headers = Object.assign({}, req.headers, {
    host: `127.0.0.1:${port}`,
    "x-forwarded-proto": String(req.headers["x-forwarded-proto"] || (req.socket.encrypted ? "https" : "http")),
    "x-forwarded-host": String(req.headers["x-forwarded-host"] || req.headers.host || ""),
  });

  const upstream = http.request({
    host: "127.0.0.1",
    port,
    method: req.method,
    path: requestPath || req.url,
    headers,
  }, (upstreamRes) => {
    const responseHeaders = Object.assign({}, upstreamRes.headers);
    responseHeaders["x-cyvx-edge"] = "public-gateway";
    res.writeHead(upstreamRes.statusCode || 502, responseHeaders);
    upstreamRes.pipe(res);
  });

  upstream.on("error", (error) => {
    if (!res.headersSent) {
      sendJson(res, 502, { ok: false, error: "UPSTREAM_UNAVAILABLE", message: error.message });
    } else {
      res.destroy(error);
    }
  });

  req.pipe(upstream);
}

function proxyUpgrade(req, clientSocket, head, port, requestPath) {
  const upstream = net.connect(port, "127.0.0.1", () => {
    const headers = Object.entries(req.headers).map(([key, value]) => `${key}: ${value}`).join("\r\n");
    upstream.write(`${req.method} ${requestPath || req.url} HTTP/${req.httpVersion}\r\n${headers}\r\n\r\n`);
    if (head && head.length) upstream.write(head);
    clientSocket.pipe(upstream).pipe(clientSocket);
  });
  upstream.on("error", () => clientSocket.destroy());
  clientSocket.on("error", () => upstream.destroy());
}

function setPublicHeaders(res) {
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("referrer-policy", "strict-origin-when-cross-origin");
  res.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("cross-origin-opener-policy", "same-origin");
}

function sendJson(res, status, payload) {
  const body = Buffer.from(`${JSON.stringify(payload)}\n`);
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.setHeader("content-length", body.length);
  res.end(body);
}

function positivePort(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 65535) {
    throw new Error(`${label} must be an integer between 1 and 65535`);
  }
  return number;
}

function assertDistinctPorts(ports) {
  const values = Object.values(ports);
  if (new Set(values).size !== values.length) {
    throw new Error(`public runtime ports must be distinct: ${JSON.stringify(ports)}`);
  }
}

function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

function closeServer(server) {
  if (!server || !server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function main() {
  const runtime = await createPublicRuntime();
  await runtime.listen();
  console.log(JSON.stringify({
    event: "cyvx.public.started",
    host: runtime.host,
    ports: runtime.ports,
    public_url: process.env.APP_BASE_URL || `http://${runtime.host}:${runtime.ports.publicPort}`,
    routes: { spark: "/", cyvx_os: "/os", health: "/healthz" },
  }));

  let closing = false;
  const shutdown = async (signal) => {
    if (closing) return;
    closing = true;
    console.log(JSON.stringify({ event: "cyvx.public.shutdown", signal }));
    await runtime.close();
    process.exit(0);
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(JSON.stringify({ event: "cyvx.public.failed", error: error.message, stack: error.stack }));
    process.exit(1);
  });
}

module.exports = {
  createPublicRuntime,
  isSparkRoute,
  publicHealth,
  publicStatus,
  rewriteOsPath,
  rewriteSparkPath,
};
