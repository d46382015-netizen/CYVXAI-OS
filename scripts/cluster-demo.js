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

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const BASE_PORT = Number(process.env.CYVX_CLUSTER_BASE_PORT || 3101);
const NODE_COUNT = Number(process.env.CYVX_CLUSTER_NODES || 3);
const BOOT_TIMEOUT_MS = 30_000;

async function main() {
  const nodes = await startCluster();
  try {
    await waitForCluster(nodes);
    const baseline = await collectStatus(nodes);
    const leader = nodes[0];
    const failure = unwrap(await postJson(`http://127.0.0.1:${leader.port}/api/v1/simulate/failure`, {
      kind: "leader",
    }));
    await terminateProcess(leader.proc, 5000);
    const restarted = await restartNode(leader);
    nodes[0] = restarted;
    await waitForNode(restarted);
    const recovery = unwrap(await getJson(`http://127.0.0.1:${restarted.port}/api/v1/replay?limit=25`));
    printReport(baseline, failure, recovery, nodes);
  } finally {
    await stopCluster(nodes);
  }
}

async function startCluster() {
  const nodes = [];
  for (let i = 0; i < NODE_COUNT; i += 1) {
    const port = BASE_PORT + i;
    const dbFile = path.join(ROOT, ".cyvx", `cluster-${port}.db`);
    fs.mkdirSync(path.dirname(dbFile), { recursive: true });
    const proc = spawn(process.execPath, [path.join(ROOT, "api", "index.js")], {
      cwd: ROOT,
      env: {
        ...process.env,
        CYVX_PORT: String(port),
        CYVX_DB: dbFile,
        CYVX_NODE_ID: `cyvx-node-${i + 1}`,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    pipe(proc, `[node-${i + 1}]`);
    nodes.push({ id: `cyvx-node-${i + 1}`, port, dbFile, proc });
  }
  return nodes;
}

async function restartNode(node) {
  const proc = spawn(process.execPath, [path.join(ROOT, "api", "index.js")], {
    cwd: ROOT,
    env: {
      ...process.env,
      CYVX_PORT: String(node.port),
      CYVX_DB: node.dbFile,
      CYVX_NODE_ID: node.id,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  pipe(proc, `[restart:${node.id}]`);
  const restarted = { ...node, proc };
  return restarted;
}

async function waitForCluster(nodes) {
  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      await Promise.all(nodes.map((node) => getJson(`http://127.0.0.1:${node.port}/status`)));
      return;
    } catch {
      await wait(500);
    }
  }
  throw new Error("cluster boot timed out");
}

async function waitForNode(node) {
  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      await getJson(`http://127.0.0.1:${node.port}/status`);
      return;
    } catch {
      await wait(500);
    }
  }
  throw new Error(`node ${node.id} boot timed out`);
}

async function collectStatus(nodes) {
  const statuses = [];
  for (const node of nodes) {
    const json = await getJson(`http://127.0.0.1:${node.port}/status`);
    statuses.push({ node: node.id, port: node.port, status: unwrap(json) });
  }
  return statuses;
}

async function stopCluster(nodes) {
  for (const node of nodes) {
    await terminateProcess(node.proc, 3000);
  }
  await wait(500);
}

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`request failed: ${url} -> ${res.status}`);
  return res.json();
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`request failed: ${url} -> ${res.status}`);
  return res.json();
}

function pipe(proc, prefix) {
  proc.stdout.on("data", (chunk) => process.stdout.write(`${prefix} ${chunk}`));
  proc.stderr.on("data", (chunk) => process.stderr.write(`${prefix} ${chunk}`));
}

function printReport(baseline, failure, recovery, nodes) {
  const lines = [];
  lines.push("CYVX local cluster demo");
  lines.push(`nodes: ${nodes.length}`);
  lines.push(`booted: ${baseline.length}`);
  lines.push(`failure strategy: ${failure.strategy || failure.kind || "unknown"}`);
  lines.push(`replay events: ${recovery.replayed ?? recovery.events ?? 0}`);
  lines.push(`state hash: ${recovery.stateHash || recovery.hash || "unknown"}`);
  lines.push("node status:");
  for (const item of baseline) {
    const status = item.status?.status || item.status?.state || item.status?.raft?.state || "unknown";
    const leader = item.status?.raft?.leaderId || "none";
    lines.push(`- ${item.node} @ ${item.port}: ${status} (leader=${leader})`);
  }
  console.log(lines.join("\n"));
}

function unwrap(payload) {
  return payload && typeof payload === "object" && "data" in payload ? payload.data : payload;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function terminateProcess(proc, timeoutMs) {
  return new Promise((resolve) => {
    if (proc.exitCode !== null || proc.signalCode !== null) {
      resolve();
      return;
    }

    const timer = setTimeout(() => {
      if (proc.exitCode === null && proc.signalCode === null) {
        proc.kill("SIGKILL");
      }
    }, timeoutMs);

    proc.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });

    proc.once("close", () => {
      clearTimeout(timer);
      resolve();
    });

    proc.kill("SIGTERM");
  });
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
