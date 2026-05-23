#!/usr/bin/env node
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

const fs = require("node:fs");
const path = require("node:path");
const { createApiServer } = require("../api");
const { CyvxController } = require("../core/controller");

const COMMANDS = [
  "status", "agents", "leaderboard", "roadmap", "ask", "cluster", "workloads", "actions", "metrics", "healthz",
  "report", "genome", "simulate", "evolve", "forecast", "optimize", "intervene", "causal", "memory",
  "dream", "join", "partner", "sdk", "plugin", "test", "observability", "pricing", "revenue",
  "security", "compliance", "cloud", "web3", "token", "chain", "nft", "defi", "mine", "node", "doc",
];

async function main() {
  const [command = "help", ...args] = process.argv.slice(2);
  if (command === "help" || args.includes("--help")) {
    console.log(`CYVX commands (${COMMANDS.length}+):\n${COMMANDS.join(", ")}\n`);
    return;
  }
  if (command === "serve") {
    const controller = new CyvxController({ port: Number(process.env.CYVX_PORT || 3000) });
    await controller.boot();
    const { server } = createApiServer(controller, {});
    server.listen(Number(process.env.CYVX_PORT || 3000), "0.0.0.0");
    return;
  }
  const endpoint = routeFor(command, args);
  if (!endpoint) {
    console.error(`Unknown command: ${command}`);
    process.exitCode = 1;
    return;
  }
  const output = await call(endpoint.method, endpoint.path, endpoint.body);
  console.log(JSON.stringify(output, null, 2));
}

function routeFor(command, args) {
  const base = "http://127.0.0.1:3000";
  switch (command) {
    case "status": return { method: "GET", path: `${base}/status` };
    case "agents": return { method: "GET", path: `${base}/v1/agents` };
    case "leaderboard": return { method: "GET", path: `${base}/v1/leaderboard` };
    case "roadmap": return { method: "GET", path: `${base}/v1/roadmap` };
    case "cluster": return { method: "GET", path: `${base}/api/v1/cluster` };
    case "workloads": return { method: "GET", path: `${base}/api/v1/workloads` };
    case "actions": return { method: "GET", path: `${base}/api/v1/actions` };
    case "metrics": return { method: "GET", path: `${base}/metrics` };
    case "healthz": return { method: "GET", path: `${base}/healthz` };
    case "ask": return { method: "POST", path: `${base}/ask`, body: { task: args.join(" ") || "optimize:cluster" } };
    case "report": return { method: "POST", path: `${base}/ask`, body: { task: "generate report" } };
    case "genome": return { method: "POST", path: `${base}/ask`, body: { task: "evolve genome" } };
    case "simulate": return { method: "POST", path: `${base}/ask`, body: { task: "simulate cluster" } };
    case "evolve": return { method: "POST", path: `${base}/ask`, body: { task: "optimize:cluster" } };
    default:
      return null;
  }
}

async function call(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { status: res.status, body: text }; }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  COMMANDS,
  main,
  routeFor,
};
