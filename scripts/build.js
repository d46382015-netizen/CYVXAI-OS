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
  "core/protocols/protobuf.js",
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
      "/status",
      "/api/v1/overview",
      "/api/v1/insights",
      "/api/v1/workloads",
      "/api/v1/actions",
      "/api/v1/command",
      "/ask",
      "/metrics",
    ],
  };
  fs.writeFileSync(path.join(DIST, "build-manifest.json"), JSON.stringify(manifest, null, 2));
}

main();
