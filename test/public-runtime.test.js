"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createPublicRuntime, isAllowedPublicSparkApi, rewriteOsPath, rewriteSparkPath } = require("../api/public");

test("public route policy exposes bounded Spark actions only", () => {
  assert.equal(isAllowedPublicSparkApi("POST", "/api/v1/sparks"), true);
  assert.equal(isAllowedPublicSparkApi("POST", "/api/v1/sparks/spark_1/approval"), true);
  assert.equal(isAllowedPublicSparkApi("POST", "/api/v1/sparks/spark_1/execute"), true);
  assert.equal(isAllowedPublicSparkApi("POST", "/api/v1/worlds/world_1/leads"), true);
  assert.equal(isAllowedPublicSparkApi("GET", "/api/v1/sparks"), false);
  assert.equal(isAllowedPublicSparkApi("GET", "/api/v1/spark"), false);
  assert.equal(rewriteSparkPath(new URL("http://local/spark/assets/app.js?v=1")), "/assets/app.js?v=1");
  assert.equal(rewriteOsPath(new URL("http://local/os/api/v1/dashboard")), "/api/v1/dashboard");
});

test("unified public runtime creates and publishes an operational World", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cyvx-public-runtime-"));
  const ports = await freePorts(4);
  const previous = captureEnv([
    "CYVX_REQUIRE_GITHUB_APP",
    "CYVX_DB",
    "CYVX_PLATFORM_STATE",
    "CYVX_GITHUB_WEBHOOK_STORE",
    "CYVX_GITHUB_AUTH_STORE",
    "SPARK_STATE_FILE",
    "SPARK_ARTIFACT_ROOT",
    "SPARK_LOG",
  ]);

  Object.assign(process.env, {
    CYVX_REQUIRE_GITHUB_APP: "false",
    CYVX_DB: path.join(root, "controller.json"),
    CYVX_PLATFORM_STATE: path.join(root, "platform.json"),
    CYVX_GITHUB_WEBHOOK_STORE: path.join(root, "webhooks.json"),
    CYVX_GITHUB_AUTH_STORE: path.join(root, "auth.json"),
    SPARK_STATE_FILE: path.join(root, "spark-state.json"),
    SPARK_ARTIFACT_ROOT: path.join(root, "worlds"),
    SPARK_LOG: path.join(root, "logs", "spark.log"),
  });

  const runtime = await createPublicRuntime({
    host: "127.0.0.1",
    port: ports[0],
    cyvxGatewayPort: ports[1],
    cyvxApiPort: ports[2],
    sparkPort: ports[3],
    dataRoot: root,
    sparkInternalKey: "internal-test-key-0123456789",
  });

  try {
    await runtime.listen();
    const base = `http://127.0.0.1:${ports[0]}`;

    const home = await fetch(`${base}/`);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /What do you want to make real\?/);

    const health = await json(`${base}/healthz`);
    assert.equal(health.response.status, 200);
    assert.equal(health.body.ok, true);
    assert.equal(health.body.services.spark.status, "ok");

    const blocked = await json(`${base}/api/v1/sparks`);
    assert.equal(blocked.response.status, 404);

    const ownerId = "test-owner-device-key";
    const created = await json(`${base}/api/v1/sparks`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "public-runtime-test" },
      body: JSON.stringify({
        owner_id: ownerId,
        intention: "Launch a public proof-backed service World",
        world: { name: "Proof World", offer_name: "Proof Package", price_cents: 12500 },
      }),
    });
    assert.equal(created.response.status, 201);
    const graph = created.body.data;

    const deniedGraph = await json(`${base}/api/public/sparks/${graph.spark.id}`, {
      headers: { "x-spark-owner": "wrong-owner" },
    });
    assert.equal(deniedGraph.response.status, 403);

    const restoredGraph = await json(`${base}/api/public/sparks/${graph.spark.id}`, {
      headers: { "x-spark-owner": ownerId },
    });
    assert.equal(restoredGraph.response.status, 200);
    assert.equal(restoredGraph.body.data.spark.id, graph.spark.id);

    const approved = await json(`${base}/api/v1/sparks/${graph.spark.id}/approval`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ owner_id: ownerId, decision: "approved" }),
    });
    assert.equal(approved.body.data.spark.status, "active");

    const executed = await json(`${base}/api/v1/sparks/${graph.spark.id}/execute`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ owner_id: ownerId, max_steps: 20 }),
    });
    assert.equal(executed.body.data.world.status, "operational");

    const world = await fetch(`${base}${executed.body.data.world.public_path}`);
    assert.equal(world.status, 200);
    assert.match(await world.text(), /Proof World/);

    const lead = await json(`${base}/api/v1/worlds/${graph.world.id}/leads`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "public-lead-test" },
      body: JSON.stringify({ name: "Customer", email: "customer@example.com", message: "Ready to buy" }),
    });
    assert.equal(lead.response.status, 201);
    assert.equal(lead.body.data.lead.status, "new");

    const worlds = await json(`${base}/api/public/worlds`);
    assert.equal(worlds.body.worlds.some((item) => item.id === graph.world.id), true);
  } finally {
    await runtime.close();
    restoreEnv(previous);
  }
});

async function json(url, options = {}) {
  const response = await fetch(url, options);
  return { response, body: await response.json() };
}

async function freePorts(count) {
  const ports = [];
  while (ports.length < count) {
    const port = await new Promise((resolve, reject) => {
      const server = net.createServer();
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const value = server.address().port;
        server.close((error) => error ? reject(error) : resolve(value));
      });
    });
    if (!ports.includes(port)) ports.push(port);
  }
  return ports;
}

function captureEnv(names) {
  return Object.fromEntries(names.map((name) => [name, process.env[name]]));
}

function restoreEnv(snapshot) {
  for (const [name, value] of Object.entries(snapshot)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}
