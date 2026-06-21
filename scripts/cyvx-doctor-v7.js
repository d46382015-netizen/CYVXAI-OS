"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const REQUIRED_FILES = [
  "api/runtime-v7.js",
  "api/public.js",
  "api/production.js",
  "spark/runtime.js",
  "spark/server.js",
  "core/production/autonomy_supervisor.js",
  "core/ops/overview.js",
  "core/ops/http_server.js",
  "spark/ui/app.js",
  "spark/ui/spark-client.js",
  "spark/ui/spark-render.js",
];

function inspect(env = process.env) {
  const dataRoot = path.resolve(env.CYVX_DATA_ROOT || path.join(os.homedir(), ".cyvx"));
  const checks = [];
  const major = Number(process.versions.node.split(".")[0]);
  checks.push(check("node_version", major >= 22, process.version, ">=22 required"));
  for (const file of REQUIRED_FILES) checks.push(check(`file:${file}`, fs.existsSync(path.join(ROOT, file)), "present", "missing"));
  checks.push(writable("data_root", dataRoot));
  checks.push(writable("world_artifacts", env.SPARK_ARTIFACT_ROOT || path.join(dataRoot, "worlds")));
  checks.push(check("public_port", validPort(env.PORT || env.CYVX_PUBLIC_PORT || 3000), env.PORT || env.CYVX_PUBLIC_PORT || 3000, "invalid port"));
  checks.push(check("autonomy", String(env.CYVX_AUTONOMY || "1") !== "0", env.CYVX_AUTONOMY || "1", "disabled"));
  checks.push(check("production_api_key", Boolean(env.CYVX_API_KEY), env.CYVX_API_KEY ? "configured" : "optional-local", "recommended outside local development"));
  checks.push(check("github_app", githubConfigured(env), githubConfigured(env) ? "configured" : "optional", "configure for repository operations"));
  const failed = checks.filter((item) => !item.ok && item.required);
  return {
    ok: failed.length === 0,
    version: "7.0.0",
    timestamp: new Date().toISOString(),
    data_root: dataRoot,
    checks,
    failed: failed.map((item) => item.key),
  };
}

function writable(key, target) {
  try {
    fs.mkdirSync(target, { recursive: true });
    fs.accessSync(target, fs.constants.W_OK);
    return check(key, true, target, "not writable");
  } catch (error) {
    return check(key, false, target, error.message);
  }
}

function validPort(value) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65535;
}

function githubConfigured(env) {
  return Boolean(env.GITHUB_APP_ID && env.GITHUB_PRIVATE_KEY_PEM && env.GITHUB_WEBHOOK_SECRET);
}

function check(key, ok, value, guidance, required = !["production_api_key", "github_app", "autonomy"].includes(key)) {
  return { key, ok: Boolean(ok), required, value, guidance };
}

if (require.main === module) {
  const result = inspect();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}

module.exports = { inspect };
