/**
 * CYVX — Autonomous Infrastructure Intelligence
 * © 2026 Dakota Lee Jonsgaard. All rights reserved.
 * Creator & Architect: Dakota Lee Jonsgaard
 * https://cyvx.ai | dakota@cyvx.ai
 *
 * This software is the exclusive intellectual property
 * of Dakota Lee Jonsgaard. Unauthorized use prohibited.
 */
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { WebSocketServer } = require("ws");
const { CyvxController } = require("../core/controller");
const { buildMetrics } = require("../core/metrics");
const { attribution } = require("../core/shared/attribution");
const UI_ROOT = path.join(__dirname, "..", "ui");

function createApiServer(controller, options = {}) {
  const rateLimits = new Map();
  const apiKey = options.apiKey || process.env.CYVX_API_KEY || "";
  const maxPerMinute = Number(options.maxPerMinute || process.env.CYVX_RATE_LIMIT || 120);
  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === "OPTIONS") {
        return text(res, 204, "");
      }
      if (serveUi(req, res)) {
        return;
      }
      if (!authorize(req, apiKey)) {
        return json(res, 401, wrap({ error: "unauthorized" }));
      }
      if (!rateLimit(req, rateLimits, maxPerMinute)) {
        return json(res, 429, wrap({ error: "rate limit exceeded" }));
      }
      const url = new URL(req.url, "http://localhost");
      if (url.pathname === "/healthz") return json(res, 200, wrap({ status: "ok" }));
      if (url.pathname === "/status") return json(res, 200, wrap(controller.status()));
      if (url.pathname === "/v1/agents") return json(res, 200, wrap({ agents: controller.agentsSnapshot() }));
      if (url.pathname === "/v1/leaderboard") return json(res, 200, wrap({ leaderboard: controller.leaderboard() }));
      if (url.pathname === "/v1/roadmap") return json(res, 200, wrap(controller.roadmap()));
      if (url.pathname === "/api/v1/cluster") return json(res, 200, wrap(controller.snapshot().cluster));
      if (url.pathname === "/api/v1/metrics/history") return json(res, 200, wrap({ history: controller.history() }));
      if (url.pathname === "/api/v1/status-model") return json(res, 200, wrap(controller.statusModel.snapshot().data));
      if (url.pathname === "/metrics") return text(res, 200, promMetrics(controller));
      if (url.pathname === "/ask" && req.method === "POST") return json(res, 200, wrap(await parseAsk(req, controller)));
      if (url.pathname === "/api/v1/workloads") return json(res, 200, wrap(await handleWorkloads(req, controller)));
      if (url.pathname === "/api/v1/actions") return json(res, 200, wrap(await handleActions(req, controller)));
      if (url.pathname === "/api/v1/state") return json(res, 200, wrap(controller.snapshot()));
      return json(res, 404, wrap({ error: "not found" }));
    } catch (error) {
      return json(res, 500, wrap({ error: error.message }));
    }
  });

  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname !== "/ws") {
      socket.destroy();
      return;
    }
    if (!authorize(req, apiKey)) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => controller.registerSocket(ws));
  });

  return { server, wss };
}

function serveUi(req, res) {
  const url = new URL(req.url, "http://localhost");
  const requestPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const relative = requestPath.replace(/^\/+/, "");
  const filePath = path.join(UI_ROOT, relative);
  if (!filePath.startsWith(UI_ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return false;
  }
  const type = filePath.endsWith(".html")
    ? "text/html; charset=utf-8"
    : filePath.endsWith(".css")
      ? "text/css; charset=utf-8"
      : filePath.endsWith(".js")
        ? "application/javascript; charset=utf-8"
        : "application/octet-stream";
  res.statusCode = 200;
  res.setHeader("content-type", type);
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "content-type, authorization, x-api-key");
  res.setHeader("access-control-allow-methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  fs.createReadStream(filePath).pipe(res);
  return true;
}

async function parseAsk(req, controller) {
  const body = await readJson(req);
  return controller.ask(body.task || body.prompt || "", body.context || body);
}

async function handleWorkloads(req, controller) {
  if (req.method === "GET") return { workloads: controller.snapshot().cluster.workloads };
  if (req.method === "POST") {
    const body = await readJson(req);
    return controller.submitWorkload(body);
  }
  return { error: "method not allowed" };
}

async function handleActions(req, controller) {
  if (req.method === "GET") return { actions: controller.actions };
  if (req.method === "POST") {
    const body = await readJson(req);
    return controller.executeAction(body);
  }
  return { error: "method not allowed" };
}

function promMetrics(controller) {
  const metrics = buildMetrics(controller).data;
  return [
    "# HELP cyvx_agents_total Number of active agents",
    "# TYPE cyvx_agents_total gauge",
    `cyvx_agents_total ${metrics.agents}`,
    "# HELP cyvx_events_total Number of CYVX events",
    "# TYPE cyvx_events_total counter",
    `cyvx_events_total ${metrics.events}`,
    "# HELP cyvx_evolution_cycles_total Number of evolution cycles",
    "# TYPE cyvx_evolution_cycles_total counter",
    `cyvx_evolution_cycles_total ${metrics.evolutionCycles}`,
  ].join("\n") + "\n";
}

function wrap(payload) {
  return {
    powered_by: "CYVX",
    creator: attribution.creator,
    version: "6.0.0",
    timestamp: new Date().toISOString(),
    ...payload,
  };
}

function authorize(req, apiKey) {
  if (!apiKey) return true;
  const header = req.headers["x-api-key"] || req.headers.authorization || "";
  const token = String(header).replace(/^Bearer\s+/i, "");
  return token === apiKey;
}

function rateLimit(req, buckets, maxPerMinute) {
  const key = req.headers["x-api-key"] || req.socket.remoteAddress || "local";
  const now = Date.now();
  const bucket = buckets.get(key) || { start: now, count: 0 };
  if (now - bucket.start > 60_000) {
    bucket.start = now;
    bucket.count = 0;
  }
  bucket.count += 1;
  buckets.set(key, bucket);
  return bucket.count <= maxPerMinute;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) reject(new Error("payload too large"));
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "content-type, authorization, x-api-key");
  res.setHeader("access-control-allow-methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.end(JSON.stringify(payload));
}

function text(res, status, payload) {
  res.statusCode = status;
  res.setHeader("content-type", "text/plain; version=0.0.4");
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "content-type, authorization, x-api-key");
  res.setHeader("access-control-allow-methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.end(payload);
}

async function main() {
  const controller = new CyvxController({
    port: Number(process.env.CYVX_PORT || 3000),
    dbFile: process.env.CYVX_DB || undefined,
  });
  await controller.boot();
  const { server } = createApiServer(controller, {});
  const port = Number(process.env.CYVX_PORT || 3000);
  const host = process.env.CYVX_HOST || "0.0.0.0";
  server.listen(port, host, () => {
    console.log(`CYVX listening on http://${host}:${port}`);
    console.log(JSON.stringify(wrap(controller.status()), null, 2));
  });
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  createApiServer,
  wrap,
};
