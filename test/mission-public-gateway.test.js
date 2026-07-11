"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createPublicRuntime } = require("../api/public");
const { AUTH_SECRET, expectStatus, request, waitFor } = require("./mission-runtime-helpers");

function freePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
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

test("public gateway serves authenticated mission HTTP routes and dependency-aware readiness", async (t) => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cyvx-public-mission-"));
  const [port, cyvxGatewayPort, cyvxApiPort, sparkPort, cyvxLegacyGatewayPort] = await uniquePorts(5);
  const runtime = await createPublicRuntime({
    port,
    host: "127.0.0.1",
    cyvxGatewayPort,
    cyvxApiPort,
    sparkPort,
    cyvxLegacyGatewayPort,
    dataRoot,
    authSecret: AUTH_SECRET,
    allowLocalAuth: true,
    leaseMs: 200,
    env: {
      ...process.env,
      NODE_ENV: "test",
      CYVX_ENV: "test",
      CYVX_ALLOW_INSECURE_LOCAL: "true",
      CYVX_DATA_ROOT: dataRoot,
    },
  });
  const worker = runtime.missions.createWorker({ workerId: "public-gateway-worker", pollMs: 20 });
  let workerPromise;
  t.after(async () => {
    worker.stop();
    if (workerPromise) await workerPromise;
    await runtime.close();
    fs.rmSync(dataRoot, { recursive: true, force: true });
  });

  await runtime.listen();
  workerPromise = worker.start();
  const harness = {
    baseUrl: `http://127.0.0.1:${port}`,
    tokens: {
      admin: runtime.missions.issueToken({ sub: "admin-local", organization_id: "default", role: "admin" }, 3600),
      viewer: runtime.missions.issueToken({ sub: "viewer-local", organization_id: "default", role: "viewer" }, 3600),
    },
  };

  await waitFor(async () => {
    const health = await fetch(`${harness.baseUrl}/readyz`);
    return health.status === 200;
  }, 5_000, 50);

  const created = await expectStatus(request(harness, "POST", "/api/v1/missions", harness.tokens.admin, {
    title: "Public gateway mission",
    objective: "Prove public routing reaches the mission API",
    organization_id: "untrusted-client-organization",
    user_id: "untrusted-client-user",
    role: "admin",
  }, { "x-correlation-id": "public-gateway-correlation" }), 201);
  assert.equal(created.payload.mission.organization_id, "default");
  assert.equal(created.payload.mission.created_by, "admin-local");

  const listed = await expectStatus(request(harness, "GET", "/api/v1/missions", harness.tokens.viewer), 200);
  assert.equal(listed.payload.missions.length, 1);
  assert.equal(listed.payload.missions[0].id, created.payload.mission.id);

  const details = await expectStatus(request(harness, "GET", `/api/v1/missions/${created.payload.mission.id}`, harness.tokens.viewer), 200);
  assert.equal(details.payload.graph.mission.title, "Public gateway mission");
  assert.equal(details.response.headers.get("x-correlation-id") !== null, true);

  const ui = await fetch(`${harness.baseUrl}/missions`);
  assert.equal(ui.status, 200);
  assert.match(await ui.text(), /CYVXAI Mission Runtime/);

  const readiness = await fetch(`${harness.baseUrl}/readyz`);
  const readinessPayload = await readiness.json();
  assert.equal(readiness.status, 200);
  assert.equal(readinessPayload.ready, true);
  assert.equal(readinessPayload.services.missions.dependencies.database.ready, true);
  assert.equal(readinessPayload.services.missions.dependencies.worker.ready, true);

  const unknown = await request(harness, "GET", "/api/v1/missions-not-real", harness.tokens.viewer);
  assert.equal(unknown.status, 404);
  assert.equal(unknown.payload.error, "NOT_FOUND");
});
