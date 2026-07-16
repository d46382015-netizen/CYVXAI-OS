#!/usr/bin/env node
"use strict";

const { createRepositoryIntelligenceServer } = require("../services/repository-intelligence/server");

async function main() {
  const runtime = createRepositoryIntelligenceServer();
  const shutdown = async (signal) => {
    runtime.intelligence.logger.write("info", "repository_intelligence.shutdown.requested", { signal });
    await runtime.close();
    process.exit(0);
  };
  process.once("SIGINT", () => shutdown("SIGINT").catch(fail));
  process.once("SIGTERM", () => shutdown("SIGTERM").catch(fail));
  await runtime.listen();
  process.stdout.write(`CYVX Repository Intelligence: http://${runtime.host}:${runtime.port}/repo-intelligence\n`);
}

function fail(error) {
  process.stderr.write(`${JSON.stringify({ ok: false, error: error.code || "REPOSITORY_INTELLIGENCE_START_FAILED", message: error.message })}\n`);
  process.exit(1);
}

main().catch(fail);
