"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const BUILD_TIME = new Date().toISOString();

const CHECK_FILES = [
  "api/index.js",
  "core/controller.js",
  "core/platform/models.js",
  "core/platform/file_store.js",
  "core/platform/kernel.js",
  "core/protocols/protobuf.js",
  "test/platform.test.js",
  "ui/app.js",
];

function main() {
  validateSources();
  prepareDist();
  writeManifest();
  console.log(`Build complete: ${DIST}`);
}

function validateSources() {
  for (const rel of CHECK_FILES) {
    const result = spawnSync(process.execPath, ["--check", path.join(ROOT, rel)], {
      cwd: ROOT,
      encoding: "utf8",
    });
    if (result.status !== 0) {
      process.stderr.write(result.stderr || result.stdout || `syntax check failed for ${rel}\n`);
      process.exit(result.status || 1);
    }
  }
}

function prepareDist() {
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(path.join(DIST, "ui"), { recursive: true });
  for (const file of ["index.html", "app.js", "styles.css", "README.md"]) {
    fs.copyFileSync(path.join(ROOT, "ui", file), path.join(DIST, "ui", file));
  }
}

function writeManifest() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const manifest = {
    name: pkg.name,
    version: pkg.version,
    builtAt: BUILD_TIME,
    entrypoints: {
      api: "api/index.js",
      ui: "ui/index.html",
    },
    endpoints: [
      "/healthz",
      "/health",
      "/status",
      "/api/v1/platform",
      "/api/v1/entities",
      "/api/v1/relationships",
      "/api/v1/graph",
      "/api/v1/agents",
      "/api/v1/objectives",
      "/api/v1/missions",
      "/api/v1/simulations",
      "/api/v1/reports",
      "/api/v1/decisions",
      "/api/v1/interventions",
      "/api/v1/outcomes",
      "/api/v1/knowledge",
      "/api/v1/capabilities",
      "/api/v1/commands",
      "/api/v1/events",
      "/api/v1/executive",
      "/api/v1/overview",
      "/api/v1/insights",
      "/api/v1/workloads",
      "/api/v1/actions",
      "/api/v1/command",
      "/api/v1/coordination",
      "/api/v1/intelligence",
      "/api/v1/patterns",
      "/api/v1/recommendations",
      "/api/v1/priorities",
      "/ask",
      "/metrics",
    ],
  };
  fs.writeFileSync(path.join(DIST, "build-manifest.json"), JSON.stringify(manifest, null, 2));
}

main();
