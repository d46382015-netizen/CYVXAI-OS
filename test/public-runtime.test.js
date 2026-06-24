"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  canonicalSparkApiPath,
  createPublicRuntime,
  isAllowedPublicSparkApi,
  isSparkStaticRoute,
  publicHealth,
  publicStatus,
  rewriteOsPath,
  rewriteSparkPath,
} = require("../api/public");

function url(value) {
  return new URL(value, "http://cyvx.test");
}

function fakeCyvx() {
  const configured = () => ({ configured: true });
  return {
    webhook: { health: configured },
    appClient: { health: configured },
    oauth: { health: configured },
    operatorSession: { health: configured },
    security: { apiKey: "configured", allowInsecureLocalhost: false, host: "127.0.0.1" },
    platform: { store: { metadata: () => ({ backend: "sqlite", journal_mode: "wal" }) } },
    controller: { status: () => ({ status: "ok" }) },
  };
}

function fakeSparkRuntime() {
  return {
    health: () => ({ status: "ok", version: "test", metrics: { sparks: 1 } }),
    snapshot: () => ({
      metrics: { sparks: 1, worlds: 1 },
      capabilities: [
        { key: "publish", description: "Publish a World", risk: "medium", requires_approval: true },
      ],
    }),
  };
}

test("public runtime classifies static and API routes without exposing arbitrary internals", () => {
  assert.equal(isSparkStaticRoute("/"), true);
  assert.equal(isSparkStaticRoute("/assets/app.js"), true);
  assert.equal(isSparkStaticRoute("/w/demo"), true);
  assert.equal(isSparkStaticRoute("/api/private"), false);

  assert.equal(canonicalSparkApiPath(url("/api/v1/sparks")), "/api/v1/sparks");
  assert.equal(canonicalSparkApiPath(url("/spark/api/v1/sparks/s-1/execute")), "/api/v1/sparks/s-1/execute");
  assert.equal(canonicalSparkApiPath(url("/api/v1/private")), null);

  assert.equal(isAllowedPublicSparkApi("POST", "/api/v1/sparks"), true);
  assert.equal(isAllowedPublicSparkApi("POST", "/api/v1/sparks/s-1/approval"), true);
  assert.equal(isAllowedPublicSparkApi("GET", "/api/v1/sparks"), false);
  assert.equal(isAllowedPublicSparkApi("DELETE", "/api/v1/worlds/w-1"), false);
});

test("public path rewriting preserves query strings and canonical destinations", () => {
  assert.equal(rewriteSparkPath(url("/spark?view=all")), "/?view=all");
  assert.equal(rewriteSparkPath(url("/spark/assets/app.js?v=1")), "/assets/app.js?v=1");
  assert.equal(rewriteOsPath(url("/os/api/v1/overview?compact=1")), "/api/v1/overview?compact=1");
  assert.equal(rewriteOsPath(url("/os")), "/");
});

test("public health and status expose bounded operational summaries", () => {
  const cyvx = fakeCyvx();
  const spark = fakeSparkRuntime();
  const health = publicHealth(cyvx, spark);
  const status = publicStatus(cyvx, spark);

  assert.equal(health.ok, true);
  assert.equal(health.ready, true);
  assert.equal(health.services.spark.status, "ok");
  assert.equal(health.services.cyvx.status, "ok");
  assert.equal(status.ok, true);
  assert.deepEqual(status.metrics, { sparks: 1, worlds: 1 });
  assert.deepEqual(status.capabilities, [
    { key: "publish", description: "Publish a World", risk: "medium", requires_approval: true },
  ]);
  assert.equal(status.links.cyvx_os, "/os");
});

test("public runtime rejects overlapping listener ports before starting services", async () => {
  await assert.rejects(
    createPublicRuntime({
      port: 3200,
      cyvxGatewayPort: 3200,
      cyvxApiPort: 3201,
      sparkPort: 3202,
    }),
    /ports must be distinct/,
  );
});
