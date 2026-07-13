"use strict";

const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const children = new Map();
let closing = false;

function start(name, script, env = {}) {
  const child = spawn(process.execPath, [path.join(root, script)], {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ["inherit", "pipe", "pipe"],
  });
  children.set(name, child);
  child.stdout.on("data", (chunk) => process.stdout.write(`[${name}] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[${name}] ${chunk}`));
  child.once("exit", (code, signal) => {
    children.delete(name);
    process.stderr.write(`${JSON.stringify({ event: "cyvx.vertical.child_exit", name, code, signal })}\n`);
    if (!closing) shutdown(code === 0 ? 1 : code || 1, `${name}_exit`);
  });
  return child;
}

async function shutdown(exitCode = 0, reason = "shutdown") {
  if (closing) return;
  closing = true;
  process.stdout.write(`${JSON.stringify({ event: "cyvx.vertical.shutdown", reason })}\n`);
  for (const child of children.values()) child.kill("SIGTERM");
  const timeout = setTimeout(() => {
    for (const child of children.values()) child.kill("SIGKILL");
  }, 10_000);
  timeout.unref?.();
  await Promise.all([...children.values()].map((child) => new Promise((resolve) => child.once("exit", resolve))));
  clearTimeout(timeout);
  process.exit(exitCode);
}

start("os", "api/runtime-v7.js");
start("mn-intelligence", "services/intelligence/minnesota/server.js");
process.stdout.write(`${JSON.stringify({
  event: "cyvx.vertical.started",
  capabilities: ["cyvx-os", "minnesota-procurement-intelligence", "business-intelligence", "mission-drafting"],
  public_port: Number(process.env.PORT || process.env.CYVX_PUBLIC_PORT || 3000),
  intelligence_port: Number(process.env.CYVX_MN_INTELLIGENCE_PORT || 3010),
})}\n`);
process.once("SIGINT", () => shutdown(0, "SIGINT"));
process.once("SIGTERM", () => shutdown(0, "SIGTERM"));
