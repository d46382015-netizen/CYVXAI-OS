#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");

const commands = [
  [process.execPath, ["--check", "services/operator/company-control-plane.js"]],
  [process.execPath, ["--check", "services/operator/company-control-server.js"]],
  [process.execPath, ["--check", "services/operator/company-control-http.js"]],
  [process.execPath, ["--check", "scripts/start-company-operator.js"]],
  [process.execPath, ["--test", "test/company-control-plane.test.js"]],
];

for (const [command, args] of commands) {
  const result = spawnSync(command, args, { cwd: process.cwd(), stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

process.stdout.write(`${JSON.stringify({ ok: true, event: "company_control.verified", checks: commands.length, verified_at: new Date().toISOString() })}\n`);
