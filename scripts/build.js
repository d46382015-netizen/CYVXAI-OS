"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");

function main() {
  fs.rmSync(DIST, { recursive: true, force: true });
  copyDirectoryFiles("ui", path.join(DIST, "ui"), /\.(html|js|css|md)$/);
  copyDirectoryFiles(path.join("spark", "ui"), path.join(DIST, "spark", "ui"), /\.(html|js|css)$/);
  writeManifest();
  console.log(`Core artifacts assembled: ${DIST}`);
}

function copyDirectoryFiles(relativeSource, target, pattern) {
  const source = path.join(ROOT, relativeSource);
  if (!fs.existsSync(source)) throw new Error(`Build source is missing: ${relativeSource}`);
  fs.mkdirSync(target, { recursive: true });
  for (const file of fs.readdirSync(source)) {
    const sourceFile = path.join(source, file);
    if (fs.statSync(sourceFile).isFile() && pattern.test(file)) {
      fs.copyFileSync(sourceFile, path.join(target, file));
    }
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
