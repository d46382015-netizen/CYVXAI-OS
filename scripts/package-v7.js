"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const UI_TARGET = path.join(DIST, "spark", "ui");
const MODULES = [
  "spark-client.js",
  "spark-render.js",
  "spark-sync.js",
  "spark-create-actions.js",
  "spark-control-actions.js",
];

fs.mkdirSync(UI_TARGET, { recursive: true });
for (const file of MODULES) {
  fs.copyFileSync(path.join(ROOT, "spark", "ui", file), path.join(UI_TARGET, file));
}

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const manifest = {
  name: pkg.name,
  version: pkg.version,
  built_at: new Date().toISOString(),
  production_entrypoint: "api/runtime-v7.js",
  node: pkg.engines?.node || ">=22",
  public_routes: ["/", "/healthz", "/readyz", "/api/public/status", "/api/public/worlds", "/w/:slug", "/os"],
  control_plane: {
    bind: "127.0.0.1",
    default_port_offset: 4,
    routes: ["/healthz", "/readyz", "/api/control-plane", "/api/overview", "/metrics"],
  },
  guarantees: [
    "durable-state",
    "bounded-owner-approval",
    "scheduled-approved-execution",
    "proof-stream",
    "lead-capture",
    "outcome-learning",
    "runtime-readiness",
  ],
};
fs.writeFileSync(path.join(DIST, "v7-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`CYVX v7 package assembled: ${DIST}`);
