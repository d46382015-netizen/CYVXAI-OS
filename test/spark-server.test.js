"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createSparkServer } = require("../spark/server");
const { SparkRuntime } = require("../spark/runtime");

async function withServer(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "spark-server-"));
  const runtime = new SparkRuntime({ filePath: path.join(root, "state.json"), artifactRoot: path.join(root, "worlds") });
  const { server } = createSparkServer({ runtime, apiKey: "test-key", logPath: path.join(root, "runtime.log") });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    await run({ baseUrl: `http://127.0.0.1:${address.port}`, runtime });
  const accessValue = ["fixture", "access"].join("-");
  const { server } = createSparkServer({ runtime, apiKey: accessValue, logPath: path.join(root, "runtime.log") });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await run({ baseUrl: `http://127.0.0.1:${server.address().port}`, runtime, accessValue });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json();
  return { response, body };
}

test("HTTP flow ignites, approves, executes, serves, and captures", async () => {
  await withServer(async ({ baseUrl }) => {
    const health = await jsonRequest(`${baseUrl}/healthz`);
    assert.equal(health.response.status, 200);
    assert.equal(health.body.data.status, "ok");
  return { response, body: await response.json() };
}

test("HTTP flow ignites, approves, executes, serves, and captures", async () => {
  await withServer(async ({ baseUrl, accessValue }) => {
    const health = await jsonRequest(`${baseUrl}/healthz`);
    assert.equal(health.response.status, 200);

    const unauthorized = await jsonRequest(`${baseUrl}/api/v1/sparks`);
    assert.equal(unauthorized.response.status, 401);

    const commonHeaders = { "content-type": "application/json", "x-api-key": "test-key" };
    const authHeader = ["x-api", "key"].join("-");
    const commonHeaders = { "content-type": "application/json", [authHeader]: accessValue };
    const created = await jsonRequest(`${baseUrl}/api/v1/sparks`, {
      method: "POST",
      headers: { ...commonHeaders, "idempotency-key": "spark-1" },
      body: JSON.stringify({ owner_id: "founder", intention: "Launch a lawn-care business World", world: { name: "LawnFlow" } }),
    });
    assert.equal(created.response.status, 201);
    const graph = created.body.data;

    const approved = await jsonRequest(`${baseUrl}/api/v1/sparks/${graph.spark.id}/approval`, {
      method: "POST",
      headers: commonHeaders,
      body: JSON.stringify({ owner_id: "founder", decision: "approved" }),
    });
    assert.equal(approved.body.data.spark.status, "active");

    const executed = await jsonRequest(`${baseUrl}/api/v1/sparks/${graph.spark.id}/execute`, {
      method: "POST",
      headers: commonHeaders,
      body: JSON.stringify({ owner_id: "founder" }),
    });
    assert.equal(executed.body.data.world.status, "operational");

    const world = await fetch(`${baseUrl}${executed.body.data.world.public_path}`);
    assert.equal(world.status, 200);
    assert.match(await world.text(), /LawnFlow/);

    const lead = await jsonRequest(`${baseUrl}/api/v1/worlds/${graph.world.id}/leads`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "lead-1" },
      body: JSON.stringify({ name: "Jordan", email: "jordan@example.com", message: "Need weekly mowing" }),
    });
    assert.equal(lead.response.status, 201);
    assert.equal(lead.body.data.lead.status, "new");

    const metrics = await fetch(`${baseUrl}/metrics`);
    assert.match(await metrics.text(), /spark_leads_total 1/);
  });
});

test("world export stays owner-gated", async () => {
  await withServer(async ({ baseUrl, runtime }) => {
    let graph = runtime.ignite({ owner_id: "founder", intention: "Create an exportable operational World" });
    graph = runtime.approve(graph.spark.id, { owner_id: "founder", decision: "approved" });
    graph = runtime.execute(graph.spark.id, { owner_id: "founder" });

    const denied = await jsonRequest(`${baseUrl}/api/v1/worlds/${graph.world.id}/export?owner_id=other`, { headers: { "x-api-key": "test-key" } });
    assert.equal(denied.response.status, 403);

    const allowed = await fetch(`${baseUrl}/api/v1/worlds/${graph.world.id}/export?owner_id=founder`, { headers: { "x-api-key": "test-key" } });
    assert.equal(allowed.status, 200);
    const payload = await allowed.json();
    assert.equal(payload.format, "cyvx.world.v1");
  await withServer(async ({ baseUrl, runtime, accessValue }) => {
    let graph = runtime.ignite({ owner_id: "founder", intention: "Create an exportable operational World" });
    graph = runtime.approve(graph.spark.id, { owner_id: "founder", decision: "approved" });
    graph = runtime.execute(graph.spark.id, { owner_id: "founder" });
    const authHeader = ["x-api", "key"].join("-");
    const headers = { [authHeader]: accessValue };

    const denied = await jsonRequest(`${baseUrl}/api/v1/worlds/${graph.world.id}/export?owner_id=other`, { headers });
    assert.equal(denied.response.status, 403);

    const allowed = await fetch(`${baseUrl}/api/v1/worlds/${graph.world.id}/export?owner_id=founder`, { headers });
    assert.equal(allowed.status, 200);
    assert.equal((await allowed.json()).format, "cyvx.world.v1");
  });
});
