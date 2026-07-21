"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { renderPublicSite, renderControlRoom } = require("../services/company-runtime/ui");

const root = path.join(__dirname, "..");
const edgePath = path.join(root, "netlify", "edge-functions", "company-runtime.js");
const edge = fs.readFileSync(edgePath, "utf8");
const netlify = fs.readFileSync(path.join(root, "netlify.toml"), "utf8");
const build = fs.readFileSync(path.join(root, "scripts", "build.js"), "utf8");

test("Netlify edge source is valid ESM and exposes the governed company API", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "cyvx-netlify-edge-"));
  try {
    const modulePath = path.join(temporary, "company-runtime.mjs");
    fs.copyFileSync(edgePath, modulePath);
    const result = spawnSync(process.execPath, ["--check", modulePath], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
  for (const route of [
    "/healthz",
    "/api/v1/company-runtime/public/status",
    "/api/v1/company-runtime/public/leads",
    "/api/v1/company-runtime/companies",
    "approve|tick|run|outcomes|tasks|integrations",
  ]) assert.ok(edge.includes(route), `${route} must be implemented by the edge runtime`);
});

test("Netlify edge bootstraps the first company with durable proof and a strict truth boundary", () => {
  assert.match(edge, /CYVX Bid & Revenue Sprint/);
  assert.match(edge, /price_cents:\s*150000/);
  assert.match(edge, /target_value:\s*9/);
  assert.match(edge, /const AGENTS = \[/);
  assert.equal((edge.match(/^\s*\["[a-z]+",\s*"/gm) || []).length, 9);
  assert.match(edge, /await runToIdle\(graph, 100\)/);
  assert.match(edge, /recordOutcome\(graph/);
  assert.match(edge, /governed_revenue_assets_completed/);
  assert.match(edge, /revenue_cents:\s*0/);
  assert.match(edge, /growth\.improve\./);
  assert.match(edge, /artifact_sha256/);
  assert.match(edge, /getStore\(\{ name: STORE_NAME, consistency: "strong" \}\)/);
  assert.match(edge, /OWNER_TOKEN_SHA256 = "[a-f0-9]{64}"/);
  assert.doesNotMatch(edge, /Savagesquad74|pbgkota93|Savage squad/i);
});

test("Netlify maps the public API to the edge and publishes the cinematic root and control room", () => {
  assert.match(netlify, /publish = "dist"/);
  assert.match(netlify, /edge_functions = "netlify\/edge-functions"/);
  assert.match(netlify, /path = "\/healthz"/);
  assert.match(netlify, /path = "\/api\/v1\/company-runtime\/\*"/);
  assert.match(build, /writePublicExperience\(\)/);
  assert.match(build, /renderPublicSite\(\)/);
  assert.match(build, /renderControlRoom\(\{ localToken: "" \}\)/);
  assert.match(build, /"control-room", "control"/);
  assert.match(renderPublicSite(), /Reality becomes/);
  assert.match(renderPublicSite(), /Start a production pilot/);
  assert.match(renderControlRoom({ localToken: "" }), /Autonomous Company Control Room/);
  assert.match(renderControlRoom({ localToken: "" }), /Run to idle/);
});

test("control authentication accepts only an environment secret or the hashed owner token", () => {
  assert.match(edge, /Netlify\.env\.get\("CYVX_COMPANY_RUNTIME_TOKEN"\)/);
  assert.match(edge, /await sha256\(token\)/);
  assert.match(edge, /constantEqual\(digest, OWNER_TOKEN_SHA256\)/);
  assert.doesNotMatch(edge, /localToken/);
  assert.match(edge, /Bearer token is required/);
  assert.match(edge, /Bearer token is invalid/);
});
