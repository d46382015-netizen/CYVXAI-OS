#!/usr/bin/env node
"use strict";

const { createFieldManualServer } = require("../services/content-growth/server");

async function main() {
  const runtime = createFieldManualServer();
  const address = await runtime.start();
  process.stdout.write(`${JSON.stringify({
    ok: true,
    service: "cyvx-field-manual",
    url: `http://${address.host}:${address.port}`,
    health: `http://${address.host}:${address.port}/health`,
    manychat_webhook: `${process.env.CYVX_FIELD_PUBLIC_BASE_URL || `http://${address.host}:${address.port}`}/api/v1/webhooks/manychat`,
    lemonsqueezy_webhook: `${process.env.CYVX_FIELD_PUBLIC_BASE_URL || `http://${address.host}:${address.port}`}/api/v1/webhooks/lemonsqueezy`,
  }, null, 2)}\n`);

  const shutdown = async (signal) => {
    process.stdout.write(`${JSON.stringify({ ok: true, event: "shutdown", signal })}\n`);
    await runtime.close();
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
    process.exit(1);
  });
}

module.exports = { main };
