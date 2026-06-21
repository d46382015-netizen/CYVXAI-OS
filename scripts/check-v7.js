"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const NODE_FILES = [
  "api/runtime-v7.js",
  "core/production/autonomy_supervisor.js",
  "core/ops/readiness.js",
  "core/ops/next_actions.js",
  "core/ops/runtime_snapshot.js",
  "core/ops/overview.js",
  "core/ops/metrics.js",
  "core/ops/http_server.js",
];
const BROWSER_FILES = [
  "spark/ui/spark-client.js",
  "spark/ui/spark-render.js",
  "spark/ui/spark-sync.js",
  "spark/ui/spark-create-actions.js",
  "spark/ui/spark-control-actions.js",
];

for (const file of NODE_FILES) check(file, path.join(ROOT, file));

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "cyvx-v7-"));
try {
  for (const file of BROWSER_FILES) {
    const moduleFile = path.join(temporary, `${path.basename(file, ".js")}.mjs`);
    fs.copyFileSync(path.join(ROOT, file), moduleFile);
    check(file, moduleFile);
  }
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

console.log("CYVX v7 source validation passed");

function check(label, file) {
  const result = spawnSync(process.execPath, ["--check", file], { cwd: ROOT, encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(`Validation failed: ${label}\n`);
    process.stderr.write(result.stderr || result.stdout || "unknown syntax error\n");
    process.exit(result.status || 1);
  }
}
