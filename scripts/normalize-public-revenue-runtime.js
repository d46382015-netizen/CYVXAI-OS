#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const file = path.resolve(__dirname, "../api/public.js");
let source = fs.readFileSync(file, "utf8");

function keepOneLine(line) {
  let seen = false;
  source = source.split("\n").filter((entry) => {
    if (entry !== line) return true;
    if (seen) return false;
    seen = true;
    return true;
  }).join("\n");
}

function keepOneBlock(block) {
  const pieces = source.split(block);
  const count = pieces.length - 1;
  if (count < 1) throw new Error(`Required block is missing: ${block.slice(0, 80)}`);
  if (count === 1) return;
  source = pieces[0] + block + pieces.slice(1).join("");
}

keepOneLine('const { createUniversalOperatorRuntime } = require("../services/operator/universal-server");');
keepOneLine('      if (isOperatorRoute(url.pathname)) return operatorRuntime.handle(req, res, url);');
keepOneLine('    operatorRuntime,');

keepOneBlock(`  const operatorRuntime = createUniversalOperatorRuntime({
    runtime: missions,
    nodeEnv: options.nodeEnv || process.env.NODE_ENV,
    corsAllowlist: options.operatorCorsAllowlist || process.env.CYVX_OPERATOR_CORS_ALLOWLIST || process.env.APP_BASE_URL || "",
    publicBaseUrl: options.publicBaseUrl || process.env.CYVX_PUBLIC_BASE_URL || process.env.APP_BASE_URL || "",
  });`);

keepOneBlock(`function isOperatorRoute(pathname) {
  return pathname === "/operator" || pathname === "/universal" || pathname === "/revenue" || pathname === "/operator/revenue" ||
    pathname.startsWith("/e/") || pathname.startsWith("/c/") || pathname.startsWith("/v/") ||
    pathname.startsWith("/api/v1/operator") || pathname.startsWith("/api/v2/operator") || pathname.startsWith("/api/v3/revenue");
}`);

const expectations = new Map([
  ['const { createUniversalOperatorRuntime }', 1],
  ['const operatorRuntime = createUniversalOperatorRuntime({', 1],
  ['if (isOperatorRoute(url.pathname))', 1],
  ['function isOperatorRoute(pathname)', 1],
  ['function publicHealth(cyvx, sparkRuntime, missionRuntime, operatorRuntime)', 1],
  ['function publicStatus(cyvx, sparkRuntime, missionRuntime, operatorRuntime)', 1],
  ['publicHealth(cyvx, spark.runtime, missions, operatorRuntime)', 2],
  ['publicStatus(cyvx, spark.runtime, missions, operatorRuntime)', 1],
]);
for (const [needle, expected] of expectations) {
  const count = source.split(needle).length - 1;
  if (count !== expected) throw new Error(`${needle}: expected ${expected}, found ${count}`);
}

if (!source.endsWith("\n")) source += "\n";
fs.writeFileSync(file, source);
process.stdout.write(`${JSON.stringify({ ok: true, file, bytes: Buffer.byteLength(source) })}\n`);