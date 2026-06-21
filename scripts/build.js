"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const SERVER_FILES = [
  "api/index.js",
  "api/production.js",
  "api/public.js",
  "api/runtime-v7.js",
  "core/controller.js",
  "core/platform/models.js",
  "core/platform/file_store.js",
  "core/platform/kernel.js",
  "core/platform/thesis_v1.js",
  "core/platform/decision_intelligence_v1.js",
  "core/platform/reality_engine_v1.js",
  "core/protocols/protobuf.js",
  "core/production/autonomy_supervisor.js",
  "core/ops/readiness.js",
  "core/ops/next_actions.js",
  "core/ops/runtime_snapshot.js",
  "core/ops/overview.js",
  "core/ops/metrics.js",
  "core/ops/http_server.js",
  "spark/runtime.js",
  "spark/server.js",
  "test/platform.test.js",
  "test/public-runtime.test.js",
  "test/runtime-supervisor.test.js",
  "test/ops-overview.test.js",
  "test/ui-contract.test.js",
];

function main() {
  validateServerFiles();
  prepareDist();
  writeManifest();
  console.log(`Build complete: ${DIST}`);
}

function validateServerFiles() {
  for (const file of SERVER_FILES) {
    const result = spawnSync(process.execPath, ["--check", path.join(ROOT, file)], { cwd: ROOT, encoding: "utf8" });
    if (result.status !== 0) {
      process.stderr.write(`Syntax check failed: ${file}\n`);
      process.stderr.write(result.stderr || result.stdout || "unknown syntax error\n");
      process.exit(result.status || 1);
    }
  }
}

function prepareDist() {
  fs.rmSync(DIST, { recursive: true, force: true });
  copyDirectoryFiles("ui", path.join(DIST, "ui"), /\.(html|js|css|md)$/);
  copyDirectoryFiles(path.join("spark", "ui"), path.join(DIST, "spark", "ui"), /\.(html|js|css)$/);
}

function copyDirectoryFiles(relativeSource, target, pattern) {
  const source = path.join(ROOT, relativeSource);
  fs.mkdirSync(target, { recursive: true });
  for (const file of fs.readdirSync(source)) {
    const sourceFile = path.join(source, file);
    if (fs.statSync(sourceFile).isFile() && pattern.test(file)) fs.copyFileSync(sourceFile, path.join(target, file));
  }
}

function writeManifest() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const manifest = {
    name: pkg.name,
    version: pkg.version,
    built_at: new Date().toISOString(),
    node: pkg.engines?.node || ">=22",
    entrypoints: {
      production: "api/runtime-v7.js",
      public_core: "api/public.js",
      production_gateway: "api/production.js",
      legacy_api: "api/index.js",
      spark: "spark/server.js",
      spark_ui: "spark/ui/index.html",
      operator_ui: "ui/index.html"
    },
    control_plane: {
      bind: "127.0.0.1",
      default_port_offset: 4,
      routes: ["/healthz", "/readyz", "/api/control-plane", "/api/overview", "/metrics"]
    },
    public_routes: ["/", "/healthz", "/readyz", "/api/public/status", "/api/public/worlds", "/api/public/sparks/:id", "/api/v1/sparks", "/api/v1/sparks/:id/approval", "/api/v1/sparks/:id/execute", "/api/v1/worlds/:id/leads", "/w/:slug", "/os"]
  };
  fs.writeFileSync(path.join(DIST, "build-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

main();
