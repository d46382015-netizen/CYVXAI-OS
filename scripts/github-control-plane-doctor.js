"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const REQUIRED = [
  "APP_BASE_URL",
  "CYVX_API_KEY",
  "CYVX_OWNER_ID",
  "CYVX_OPERATOR_SESSION_SECRET",
  "GITHUB_APP_ID",
  "GITHUB_APP_SLUG",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "GITHUB_PRIVATE_KEY_PEM",
  "GITHUB_WEBHOOK_SECRET",
  "GITHUB_OAUTH_STATE_SECRET",
  "GITHUB_TOKEN_ENCRYPTION_KEY",
  "CYVX_PLATFORM_STATE",
  "CYVX_GITHUB_WEBHOOK_STORE",
  "CYVX_GITHUB_AUTH_STORE",
];

const SECRET_LENGTHS = {
  CYVX_API_KEY: 24,
  CYVX_OPERATOR_SESSION_SECRET: 32,
  GITHUB_CLIENT_SECRET: 16,
  GITHUB_WEBHOOK_SECRET: 24,
  GITHUB_OAUTH_STATE_SECRET: 32,
  GITHUB_TOKEN_ENCRYPTION_KEY: 32,
};

function inspectEnvironment(env = process.env) {
  const checks = [];
  for (const name of REQUIRED) {
    const value = String(env[name] || "").trim();
    checks.push({ name, ok: Boolean(value), status: value ? "configured" : "missing" });
  }

  for (const [name, minimum] of Object.entries(SECRET_LENGTHS)) {
    const value = String(env[name] || "");
    checks.push({
      name: `${name}_STRENGTH`,
      ok: value.length >= minimum && !/replace|example|changeme|secret/i.test(value),
      status: value.length >= minimum ? "length-ok" : `minimum-${minimum}-characters`,
    });
  }

  checks.push(checkUrl("APP_BASE_URL", env.APP_BASE_URL));
  checks.push(checkPositiveInteger("GITHUB_APP_ID", env.GITHUB_APP_ID));
  checks.push(checkPrivateKey(env.GITHUB_PRIVATE_KEY_PEM));

  for (const name of ["CYVX_PLATFORM_STATE", "CYVX_GITHUB_WEBHOOK_STORE", "CYVX_GITHUB_AUTH_STORE"]) {
    checks.push(checkWritableParent(name, env[name]));
  }

  const failed = checks.filter((item) => !item.ok);
  return {
    ok: failed.length === 0,
    required_github_app: String(env.CYVX_REQUIRE_GITHUB_APP || "").toLowerCase() === "true",
    checks,
    failed: failed.map((item) => item.name),
    timestamp: new Date().toISOString(),
  };
}

function checkUrl(name, value) {
  try {
    const url = new URL(String(value || ""));
    return { name: `${name}_VALID`, ok: url.protocol === "https:", status: url.protocol === "https:" ? "https" : "https-required" };
  } catch {
    return { name: `${name}_VALID`, ok: false, status: "invalid-url" };
  }
}

function checkPositiveInteger(name, value) {
  const number = Number(value);
  return { name: `${name}_VALID`, ok: Number.isInteger(number) && number > 0, status: Number.isInteger(number) && number > 0 ? "valid" : "positive-integer-required" };
}

function checkPrivateKey(value) {
  const normalized = String(value || "").trim().replace(/\\n/g, "\n");
  if (!normalized) return { name: "GITHUB_PRIVATE_KEY_PEM_VALID", ok: false, status: "missing" };
  try {
    const key = crypto.createPrivateKey(normalized);
    return { name: "GITHUB_PRIVATE_KEY_PEM_VALID", ok: key.asymmetricKeyType === "rsa", status: key.asymmetricKeyType || "unknown" };
  } catch {
    return { name: "GITHUB_PRIVATE_KEY_PEM_VALID", ok: false, status: "invalid-private-key" };
  }
}

function checkWritableParent(name, value) {
  const target = String(value || "").trim();
  if (!target) return { name: `${name}_WRITABLE`, ok: false, status: "missing" };
  const parent = path.dirname(target);
  try {
    fs.accessSync(parent, fs.constants.W_OK);
    return { name: `${name}_WRITABLE`, ok: true, status: "writable" };
  } catch {
    return { name: `${name}_WRITABLE`, ok: false, status: `parent-not-writable:${parent}` };
  }
}

if (require.main === module) {
  const result = inspectEnvironment();
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  if (!result.ok) process.exitCode = 1;
}

module.exports = { inspectEnvironment };
