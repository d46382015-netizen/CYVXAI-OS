#!/usr/bin/env node
"use strict";

const { createMissionRuntime, createMissionHttpServer } = require("../runtime/missions");
const { createUniversalOperatorRuntime, createUniversalOperatorHttpServer } = require("../services/operator/universal-server");
const { createCompanyControlHttpServer } = require("../services/operator/company-control-http");

async function main() {
  const host = process.env.CYVX_OPERATOR_HOST || "127.0.0.1";
  const operatorPort = Number(process.env.CYVX_OPERATOR_PORT || 3020);
  const companyControlPort = Number(process.env.CYVX_COMPANY_CONTROL_PORT || 3021);
  const missionHost = process.env.CYVX_MISSION_HOST || "127.0.0.1";
  const missionPort = Number(process.env.CYVX_MISSION_PORT || 3000);
  const tickIntervalMs = Math.max(1000, Number(process.env.CYVX_OPERATOR_TICK_INTERVAL_MS || 15000));
  const autoTick = String(process.env.CYVX_OPERATOR_AUTO_TICK || "true").toLowerCase() !== "false";

  if (new Set([operatorPort, companyControlPort, missionPort]).size !== 3) {
    throw new Error("CYVX operator, company-control, and mission ports must be distinct");
  }

  const runtime = createMissionRuntime();
  const missionHttp = createMissionHttpServer(runtime);
  const operatorRuntime = createUniversalOperatorRuntime({ runtime });
  const operatorHttp = createUniversalOperatorHttpServer(operatorRuntime);
  const companyControlHttp = createCompanyControlHttpServer({ runtime });
  const worker = runtime.createWorker({ pollMs: Number(process.env.CYVX_WORKER_POLL_MS || 250) });
  let timer = null;
  let closing = false;

  const close = async (signal) => {
    if (closing) return;
    closing = true;
    if (timer) clearInterval(timer);
    worker.stop();
    await Promise.allSettled([companyControlHttp.close(), operatorHttp.close(), missionHttp.close()]);
    runtime.close();
    process.stdout.write(`${JSON.stringify({ ok: true, event: "universal_operator.stopped", signal })}\n`);
  };

  process.once("SIGINT", () => close("SIGINT").finally(() => process.exit(0)));
  process.once("SIGTERM", () => close("SIGTERM").finally(() => process.exit(0)));

  try {
    const [missionAddress, operatorAddress, companyControlAddress] = await Promise.all([
      missionHttp.listen(missionPort, missionHost),
      operatorHttp.listen(operatorPort, host),
      companyControlHttp.listen(companyControlPort, host),
    ]);
    worker.start().catch((error) => {
      process.stderr.write(`${JSON.stringify({ ok: false, event: "universal_operator.worker_failed", error: error.message })}\n`);
      process.exitCode = 1;
    });
    if (autoTick) {
      timer = setInterval(() => {
        try {
          const entityTicks = operatorRuntime.operator.runAllOnce();
          const bidSprintTicks = operatorRuntime.bidSprint.runAllOnce();
          if (entityTicks.length || bidSprintTicks.length) {
            process.stdout.write(`${JSON.stringify({
              ok: true, event: "universal_operator.tick",
              entity_ticks: entityTicks, bid_sprint_ticks: bidSprintTicks,
            })}\n`);
          }
        } catch (error) {
          process.stderr.write(`${JSON.stringify({ ok: false, event: "universal_operator.tick_failed", error: error.message })}\n`);
        }
      }, tickIntervalMs);
    }
    process.stdout.write(`${JSON.stringify({
      ok: true,
      event: "universal_operator.started",
      operator: `http://${host}:${operatorAddress.port}/operator`,
      revenue: `http://${host}:${operatorAddress.port}/revenue`,
      bid_revenue_sprint: `http://${host}:${operatorAddress.port}/bid-revenue-sprint`,
      company_control: `http://${host}:${companyControlAddress.port}/company-control`,
      mission_runtime: `http://${missionHost}:${missionAddress.port}/missions`,
      health: `http://${host}:${operatorAddress.port}/healthz`,
      company_control_health: `http://${host}:${companyControlAddress.port}/api/v5/company-control/health`,
      entity_api: `http://${host}:${operatorAddress.port}/api/v2/operator/entities`,
      revenue_api: `http://${host}:${operatorAddress.port}/api/v3/revenue/ventures`,
      bid_sprint_api: `http://${host}:${operatorAddress.port}/api/v4/bid-sprints`,
      company_control_api: `http://${host}:${companyControlAddress.port}/api/v5/company-control`,
      legacy_company_api: `http://${host}:${operatorAddress.port}/api/v1/operator/companies`,
      auto_tick: autoTick,
      tick_interval_ms: tickIntervalMs,
      data_root: runtime.dataRoot,
      platform_state: operatorRuntime.operator.platformStatePath,
      revenue_workspace: operatorRuntime.revenue.workspaceRoot,
      bid_sprint_workspace: operatorRuntime.bidSprint.workspaceRoot,
      providers: operatorRuntime.revenue.health().providers,
      company_control_state: companyControlHttp.health(),
    }, null, 2)}\n`);
  } catch (error) {
    await close("startup_failure");
    throw error;
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({
      ok: false, event: "universal_operator.start_failed",
      code: error.code || null, error: error.message,
    })}\n`);
    process.exit(1);
  });
}

module.exports = { main };
