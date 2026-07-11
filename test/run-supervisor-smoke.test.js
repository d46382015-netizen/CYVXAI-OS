"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

test("run.sh starts the public gateway and separate worker then shuts both down gracefully", () => {
  const script = path.resolve(__dirname, "../scripts/run-smoke.js");
  const result = spawnSync(process.execPath, [script], {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, NODE_ENV: "test", CYVX_ENV: "test" },
    encoding: "utf8",
    timeout: 30_000,
  });
  assert.equal(result.status, 0, `${result.stdout || ""}\n${result.stderr || ""}`);
  assert.match(result.stdout, /cyvx\.run_smoke\.verified/);
});
