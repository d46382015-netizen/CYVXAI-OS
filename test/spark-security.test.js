"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createSparkServer } = require("../spark/server");
const { SparkRuntime } = require("../spark/runtime");

test("forwarded client addresses are ignored unless proxy trust is explicit", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "spark-security-"));
  const runtime = new SparkRuntime({
    filePath: path.join(root, "state.json"),
    artifactRoot: path.join(root, "worlds"),
  });
  const { server } = createSparkServer({
    runtime,
    requestLimit: 1,
    trustProxy: false,
    logPath: path.join(root, "runtime.log"),
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const first = await fetch(`${baseUrl}/healthz`, { headers: { "x-forwarded-for": "198.51.100.10" } });
    const second = await fetch(`${baseUrl}/healthz`, { headers: { "x-forwarded-for": "203.0.113.20" } });
    assert.equal(first.status, 200);
    assert.equal(second.status, 429);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
