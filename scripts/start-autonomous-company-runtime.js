#!/usr/bin/env node
"use strict";

const path = require("node:path");
const { createMissionRuntime } = require("../runtime/missions");
const { AutonomousCompanyRuntime } = require("../services/company-runtime");
const { createAutonomousCompanyHttpServer } = require("../services/company-runtime/server");

async function main() {
  const production = process.env.NODE_ENV === "production";
  const host = process.env.CYVX_COMPANY_RUNTIME_HOST || "127.0.0.1";
  const port = Number(process.env.CYVX_COMPANY_RUNTIME_PORT || 3030);
  const dataRoot = process.env.CYVX_DATA_ROOT;
  const missionRuntime = createMissionRuntime({ dataRoot, allowLocalAuth: !production });
  missionRuntime.logger = missionRuntime.logger || missionRuntime.store?.logger;
  const companyRuntime = new AutonomousCompanyRuntime(missionRuntime, {
    companyWorkspaceRoot: process.env.CYVX_COMPANY_ROOT || path.join(missionRuntime.dataRoot, "companies"),
    intelligenceStatePath: process.env.CYVX_MN_STATE_FILE,
    leaseMs: Number(process.env.CYVX_COMPANY_RUNTIME_LEASE_MS || 60000),
    model: {
      name: process.env.CYVX_COMPANY_MODEL_PROVIDER,
      model: process.env.CYVX_COMPANY_MODEL,
      command: process.env.CYVX_CLAUDE_COMMAND,
      timeoutMs: process.env.CYVX_CLAUDE_TIMEOUT_MS,
    },
  });
  const server = createAutonomousCompanyHttpServer(companyRuntime, { environment: process.env.NODE_ENV });
  const address = await server.listen(port, host);
  const auth = {
    user_id: process.env.CYVX_COMPANY_RUNTIME_USER || "company-runtime-scheduler",
    organization_id: process.env.CYVX_ORGANIZATION_ID || "default",
    role: "admin",
    correlation_id: "company-runtime-scheduler",
  };
  const intervalMs = Math.max(5000, Number(process.env.CYVX_COMPANY_RUNTIME_TICK_INTERVAL_MS || 15000));
  const autoTick = process.env.CYVX_COMPANY_RUNTIME_AUTO_TICK !== "false";
  let ticking = false;
  const tick = async () => {
    if (!autoTick || ticking) return;
    ticking = true;
    try {
      const companies = companyRuntime.listCompanies(auth).filter((company) => company.status === "active");
      for (const company of companies) await companyRuntime.runTick(company.company_id, auth);
    } catch (error) {
      process.stderr.write(`${JSON.stringify({ level: "error", event: "company_runtime.scheduler_failed", error: error.message })}\n`);
    } finally { ticking = false; }
  };
  const timer = autoTick ? setInterval(tick, intervalMs) : null;
  if (timer) timer.unref();

  process.stdout.write(`${JSON.stringify({
    ok: true,
    event: "company_runtime.started",
    control_room: `http://${host}:${address.port}/control-room`,
    health: `http://${host}:${address.port}/healthz`,
    model_provider: companyRuntime.model.name,
    scheduler: autoTick,
    tick_interval_ms: intervalMs,
    data_root: missionRuntime.dataRoot,
    local_token: production ? undefined : server.token,
  })}\n`);

  const shutdown = async (signal) => {
    if (timer) clearInterval(timer);
    try { await server.close(); } catch {}
    missionRuntime.close();
    process.stdout.write(`${JSON.stringify({ ok: true, event: "company_runtime.stopped", signal })}\n`);
    process.exit(0);
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ ok: false, event: "company_runtime.start_failed", error: error.stack || error.message })}\n`);
  process.exit(1);
});
