"use strict";

const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { createApiServer, wrap } = require("./index");
const { captureOutcome } = require("./outcome");
const { CyvxController } = require("../core/controller");
const { PlatformKernel } = require("../core/platform");
const { GitHubWebhookStore } = require("../core/integrations/github_control_plane/store");
const { createGitHubWebhookService, sendJson } = require("../core/integrations/github_control_plane/service");

async function createProductionGateway(options = {}) {
  const publicPort = Number(options.port || process.env.CYVX_PORT || 3000);
  const host = options.host || process.env.CYVX_HOST || "0.0.0.0";
  const internalPort = Number(options.internalPort || process.env.CYVX_INTERNAL_PORT || publicPort + 1);
  if (publicPort === internalPort) throw new Error("CYVX_INTERNAL_PORT must differ from CYVX_PORT");

  const controller = options.controller || new CyvxController({
    port: publicPort,
    dbFile: process.env.CYVX_DB || undefined,
  });
  if (!options.controller) await controller.boot();

  const platform = options.platform || new PlatformKernel({
    filePath: process.env.CYVX_PLATFORM_STATE,
  });
  const store = options.webhookStore || new GitHubWebhookStore({
    filePath: process.env.CYVX_GITHUB_WEBHOOK_STORE || path.join(os.homedir(), ".cyvx", "github-webhooks.json"),
  });
  const webhook = options.webhookService || createGitHubWebhookService({
    secret: process.env.GITHUB_WEBHOOK_SECRET || "",
    store,
    platform,
    maxBodyBytes: Number(process.env.CYVX_GITHUB_WEBHOOK_MAX_BYTES || 1_000_000),
  });

  const { server: internalServer } = createApiServer(controller, { platform });
  const gateway = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    try {
      if (url.pathname === "/api/github/webhook") return webhook.handle(req, res);
      if (url.pathname === "/api/github/control-plane/health") {
        if (req.method !== "GET") return sendJson(res, 405, { ok: false, error: "method_not_allowed" }, { allow: "GET" });
        return sendJson(res, 200, wrap({ github_control_plane: webhook.health() }));
      }

      if (url.pathname === "/api/v1/workloads") {
        if (!authorize(req)) return sendJson(res, 401, wrap({ error: "unauthorized" }));
        if (req.method === "GET") return sendJson(res, 200, wrap({ workloads: controller.snapshot().cluster.workloads }));
        if (req.method === "POST") {
          const body = await readJsonLimited(req);
          assertObject(body, "workload");
          return sendJson(res, 200, wrap(controller.submitWorkload(body)));
        }
        return sendJson(res, 405, wrap({ error: "method_not_allowed" }), { allow: "GET, POST" });
      }

      if (url.pathname === "/api/v1/actions") {
        if (!authorize(req)) return sendJson(res, 401, wrap({ error: "unauthorized" }));
        if (req.method === "GET") return sendJson(res, 200, wrap({ actions: controller.actions }));
        if (req.method === "POST") {
          const body = await readJsonLimited(req);
          assertObject(body, "action");
          return sendJson(res, 200, wrap(controller.executeAction(body)));
        }
        return sendJson(res, 405, wrap({ error: "method_not_allowed" }), { allow: "GET, POST" });
      }

      if (url.pathname === "/api/outcome") {
        if (!authorize(req)) return sendJson(res, 401, wrap({ error: "unauthorized" }));
        if (req.method !== "POST") return sendJson(res, 405, wrap({ error: "method_not_allowed" }), { allow: "POST" });
        const body = await readJsonLimited(req);
        assertObject(body, "outcome");
        return sendJson(res, 200, { ok: true, outcome: captureOutcome(body) });
      }

      return proxyHttp(req, res, internalPort);
    } catch (error) {
      return sendJson(res, error.statusCode || 400, wrap({
        error: error.code || "invalid_request",
        message: error.message,
      }));
    }
  });

  gateway.on("upgrade", (req, socket, head) => proxyUpgrade(req, socket, head, internalPort));

  return {
    controller,
    gateway,
    host,
    internalPort,
    internalServer,
    platform,
    port: publicPort,
    store,
    webhook,
    async listen() {
      await listen(internalServer, internalPort, "127.0.0.1");
      await listen(gateway, publicPort, host);
      return this;
    },
    async close() {
      await Promise.all([closeServer(gateway), closeServer(internalServer)]);
      if (typeof controller.stop === "function") controller.stop();
    },
  };
}

function proxyHttp(req, res, internalPort) {
  const upstream = http.request({
    host: "127.0.0.1",
    port: internalPort,
    method: req.method,
    path: req.url,
    headers: Object.assign({}, req.headers, { host: `127.0.0.1:${internalPort}` }),
  }, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
    upstreamRes.pipe(res);
  });
  upstream.on("error", (error) => {
    if (!res.headersSent) sendJson(res, 502, wrap({ error: "upstream_unavailable", message: error.message }));
    else res.destroy(error);
  });
  req.pipe(upstream);
}

function proxyUpgrade(req, clientSocket, head, internalPort) {
  const upstream = net.connect(internalPort, "127.0.0.1", () => {
    const headers = Object.entries(req.headers).map(([key, value]) => `${key}: ${value}`).join("\r\n");
    upstream.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n${headers}\r\n\r\n`);
    if (head && head.length) upstream.write(head);
    clientSocket.pipe(upstream).pipe(clientSocket);
  });
  upstream.on("error", () => clientSocket.destroy());
  clientSocket.on("error", () => upstream.destroy());
}

async function readJsonLimited(req, limitBytes = 1_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > limitBytes) {
      const error = new Error(`payload exceeds ${limitBytes} bytes`);
      error.code = "PAYLOAD_TOO_LARGE";
      error.statusCode = 413;
      throw error;
    }
    chunks.push(buffer);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks, size).toString("utf8"));
  } catch (cause) {
    const error = new Error("request body must be valid JSON");
    error.code = "INVALID_JSON";
    error.statusCode = 400;
    error.cause = cause;
    throw error;
  }
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    const error = new Error(`${label} payload must be a JSON object`);
    error.code = "INVALID_PAYLOAD";
    error.statusCode = 422;
    throw error;
  }
}

function authorize(req) {
  const apiKey = process.env.CYVX_API_KEY || "";
  if (!apiKey) return true;
  const header = req.headers["x-api-key"] || req.headers.authorization || "";
  return String(header).replace(/^Bearer\s+/i, "") === apiKey;
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
  const runtime = await createProductionGateway();
  await runtime.listen();
  console.log(`CYVX production gateway listening on http://${runtime.host}:${runtime.port}`);
  console.log(`CYVX internal API listening on http://127.0.0.1:${runtime.internalPort}`);
  console.log(JSON.stringify(wrap({ github_control_plane: runtime.webhook.health() }), null, 2));

  const shutdown = async (signal) => {
    console.log(`Received ${signal}; shutting down CYVX.`);
    await runtime.close();
    process.exit(0);
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  authorize,
  createProductionGateway,
  readJsonLimited,
};
