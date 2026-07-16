#!/usr/bin/env node
"use strict";

const { createRepositoryIntelligence } = require("../services/repository-intelligence");

try {
  const snapshot = createRepositoryIntelligence().scan();
  process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
  if (process.argv.includes("--check") && snapshot.summary.critical > 0) process.exitCode = 1;
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, error: error.code || "REPOSITORY_INTELLIGENCE_SCAN_FAILED", message: error.message })}\n`);
  process.exit(1);
}
