"use strict";

const crypto = require("node:crypto");
const http = require("node:http");
const { CyvxController } = require("../core/controller");

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function sendText(res, status, text) {
  res.statusCode = status;
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.end(text);
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function wrap(source, data, meta = {}) {
  return { source, data, meta };
}

function authorize(req, token) {
  if (!token) return false;
  const headerToken = String(req.headers["x-cyvx-raft-token"] || "").trim();
  const auth = String(req.headers.authorization || "").trim();
  return headerToken === token || auth === `Bearer ${token}`;
}

function buildControllerOptions() {
  return {
    nodeId: process.env.CYVX_NODE_ID || "cyvx-node-1",
    port: Number(process.env.CYVX_PORT || 3000),
    dbFile: process.env.CYVX_DB_FILE || "",
    raftPeers: process.env.RAFT_PEERS || "",
    raftToken: process.env.CYVX_RAFT_TOKEN || "",
    raftFailurePlan: process.env.CYVX_RAFT_FAILURE_PLAN || "",
    chaosConfig: process.env.CYVX_CHAOS_CONFIG || "",
    raftClusterSize: Number(process.env.RAFT_CLUSTER_SIZE || 3),
    raftPort: Number(process.env.RAFT_PORT || process.env.CYVX_PORT || 3000),
    raftElectionTimeoutMs: Number(process.env.CYVX_RAFT_ELECTION_TIMEOUT_MS || 1200),
    raftHeartbeatIntervalMs: Number(process.env.CYVX_RAFT_HEARTBEAT_INTERVAL_MS || 250),
    raftTimeoutMs: Number(process.env.CYVX_RAFT_TIMEOUT_MS || 2500),
    raftMaxRetries: Number(process.env.CYVX_RAFT_MAX_RETRIES || 3),
    raftBackoffMs: Number(process.env.CYVX_RAFT_BACKOFF_MS || 100),
    raftTickMs: Number(process.env.CYVX_RAFT_TICK_MS || 200),
  };
}

async function main() {
  const options = buildControllerOptions();
  const apiKey = process.env.CYVX_API_KEY || "";
  const raftToken = options.raftToken || "";
  const controller = new CyvxController(options);
  await controller.boot();

  const server = http.createServer(async (req, res) => {
    const requestId = crypto.randomUUID();
    res.setHeader("x-request-id", requestId);
    res.setHeader("content-type", "application/json; charset=utf-8");

    try {
      const url = new URL(req.url || "/", "http://localhost");

      if (req.method === "OPTIONS") {
        return sendText(res, 204, "");
      }

      if (url.pathname === "/healthz") {
        return sendJson(res, 200, wrap("raft-node", { status: "ok", requestId }));
      }

      if (url.pathname === "/raft/health") {
        const raft = controller.modules.raft.health();
        return sendJson(res, 200, raft);
      }

      if (url.pathname === "/raft/state") {
        if (apiKey && !authorize(req, apiKey)) {
          return sendJson(res, 401, wrap("raft-node", { error: "unauthorized", requestId }));
        }
        return sendJson(res, 200, controller.modules.raft.state());
      }

      if (url.pathname === "/raft/request-vote" && req.method === "POST") {
        if (!authorize(req, raftToken)) {
          return sendJson(res, 401, wrap("raft-node", { error: "unauthorized", requestId }));
        }
        const body = await readJson(req);
        return sendJson(res, 200, controller.modules.raft.requestVote(body));
      }

      if (url.pathname === "/raft/append-entries" && req.method === "POST") {
        if (!authorize(req, raftToken)) {
          return sendJson(res, 401, wrap("raft-node", { error: "unauthorized", requestId }));
        }
        const body = await readJson(req);
        return sendJson(res, 200, controller.modules.raft.appendEntries(body));
      }

      if (url.pathname === "/api/v1/state") {
        if (apiKey && !authorize(req, apiKey)) {
          return sendJson(res, 401, wrap("raft-node", { error: "unauthorized", requestId }));
        }
        return sendJson(res, 200, wrap("raft-node", controller.snapshot(), { requestId }));
      }

      if (url.pathname === "/api/v1/workloads" && req.method === "POST") {
        if (apiKey && !authorize(req, apiKey)) {
          return sendJson(res, 401, wrap("raft-node", { error: "unauthorized", requestId }));
        }
        const body = await readJson(req);
        const result = await controller.submitWorkload(body);
        return sendJson(res, 200, wrap("raft-node", result, { requestId }));
      }

      if (url.pathname === "/raft/propose" && req.method === "POST") {
        if (apiKey && !authorize(req, apiKey)) {
          return sendJson(res, 401, wrap("raft-node", { error: "unauthorized", requestId }));
        }
        const body = await readJson(req);
        const command = body.command || body;
        const options = body.options || {};
        const result = await controller.modules.raft.proposeDistributed(command, options);
        return sendJson(res, 200, result);
      }

      if (url.pathname === "/readyz") {
        const raft = controller.modules.raft.health();
        return sendJson(res, raft.data?.ready ? 200 : 503, wrap("raft-node", raft.data || raft, { requestId }));
      }

      return sendJson(res, 404, wrap("raft-node", { error: "not found", requestId }));
    } catch (error) {
      return sendJson(res, 500, wrap("raft-node", { error: error.message, requestId }));
    }
  });

  const port = Number(options.port || process.env.CYVX_PORT || 3000);
  server.listen(port, "127.0.0.1", () => {
    process.stdout.write(`raft node ${options.nodeId} listening on ${port}\n`);
  });

  const shutdown = async () => {
    await new Promise((resolve) => server.close(resolve));
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
