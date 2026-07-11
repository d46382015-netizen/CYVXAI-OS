#!/usr/bin/env node
"use strict";

const { createProductionGateway } = require("./integrated-production");
const { Telemetry } = require("../core/observability/telemetry");
const { assertProductionSecurity } = require("../core/security/production_guard");

async function main() {
  const security = assertProductionSecurity(process.env);
  const telemetry = new Telemetry({ environment: process.env.CYVX_ENV || process.env.NODE_ENV });
  const runtime = await createProductionGateway({ telemetry });
  await runtime.listen();
  telemetry.log("info", "cyvx.production.gateway.started", {
    host: runtime.host,
    port: runtime.port,
    internal_port: runtime.internalPort,
    legacy_gateway_port: runtime.legacyGatewayPort,
    integrations: runtime.integrations.snapshot(),
    security,
  });
  let closing = false;
  const shutdown = async (signal) => {
    if (closing) return;
    closing = true;
    telemetry.log("info", "cyvx.production.gateway.shutdown", { signal });
    await runtime.close();
    process.exit(0);
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

if (require.main === module) main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ timestamp: new Date().toISOString(), level: "error", event: "cyvx.production.gateway.failed", code: error.code || null, error: error.message })}\n`);
  process.exit(1);
});

module.exports = { main };
