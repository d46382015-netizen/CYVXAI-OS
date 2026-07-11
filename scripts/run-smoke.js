#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cyvx-run-smoke-"));

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function uniquePorts(count) {
  const ports = new Set();
  while (ports.size < count) ports.add(await freePort());
  return [...ports];
}

async function waitForReady(baseUrl, child, output, timeoutMs = 20_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (child.exitCode !== null) throw new Error(`run.sh exited before readiness (${child.exitCode})\n${output()}`);
    try {
      const response = await fetch(`${baseUrl}/readyz`);
      if (response.status === 200) return response.json();
    } catch { /* service is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`run.sh did not become ready within ${timeoutMs}ms\n${output()}`);
}

async function stop(child, output) {
  if (child.exitCode !== null) return child.exitCode;
  child.kill("SIGTERM");
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`run.sh did not stop gracefully\n${output()}`));
    }, 8_000);
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      if (signal === "SIGKILL") reject(new Error(`run.sh required SIGKILL\n${output()}`));
      else resolve(code);
    });
  });
}

async function main() {
  const [publicPort, gatewayPort, apiPort, sparkPort, legacyPort] = await uniquePorts(5);
  const secret = "run-smoke-secret-longer-than-thirty-two-characters";
  let logs = "";
  const child = spawn("bash", ["run.sh"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      NODE_ENV: "test",
      CYVX_ENV: "test",
      CYVX_ALLOW_INSECURE_LOCAL: "true",
      CYVX_AUTH_SECRET: secret,
      CYVX_DATA_ROOT: dataRoot,
      CYVX_PUBLIC_HOST: "127.0.0.1",
      CYVX_PUBLIC_PORT: String(publicPort),
      CYVX_GATEWAY_INTERNAL_PORT: String(gatewayPort),
      CYVX_INTERNAL_PORT: String(apiPort),
      CYVX_SPARK_INTERNAL_PORT: String(sparkPort),
      CYVX_LEGACY_GATEWAY_INTERNAL_PORT: String(legacyPort),
      CYVX_WORKER_ID: "worker-run-smoke",
      CYVX_WORKER_POLL_MS: "25",
      CYVX_WORKER_FRESH_MS: "2000",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => { logs += chunk; });
  child.stderr.on("data", (chunk) => { logs += chunk; });
  const output = () => logs;

  try {
    const baseUrl = `http://127.0.0.1:${publicPort}`;
    const readiness = await waitForReady(baseUrl, child, output);
    assert.equal(readiness.ready, true);
    assert.equal(readiness.services.missions.dependencies.database.ready, true);
    assert.equal(readiness.services.missions.dependencies.worker.ready, true);

    const tokenResponse = await fetch(`${baseUrl}/api/v1/auth/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ organization_id: "default", user_id: "admin-local" }),
    });
    assert.equal(tokenResponse.status, 200, await tokenResponse.text());
    const tokenPayload = await tokenResponse.json();
    assert.ok(tokenPayload.token);

    const missions = await fetch(`${baseUrl}/api/v1/missions`, {
      headers: { authorization: `Bearer ${tokenPayload.token}` },
    });
    assert.equal(missions.status, 200, await missions.text());
    const missionPayload = await missions.json();
    assert.deepEqual(missionPayload.missions, []);

    const exitCode = await stop(child, output);
    assert.ok([0, 143].includes(exitCode), `unexpected run.sh exit code ${exitCode}\n${logs}`);
    process.stdout.write(`${JSON.stringify({
      event: "cyvx.run_smoke.verified",
      public_port: publicPort,
      database_ready: true,
      worker_ready: true,
      graceful_shutdown: true,
    })}\n`);
  } finally {
    if (child.exitCode === null) {
      try { await stop(child, output); } catch { /* primary error is more useful */ }
    }
    fs.rmSync(dataRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ event: "cyvx.run_smoke.failed", error: error.message })}\n`);
  process.exit(1);
});
