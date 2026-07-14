#!/usr/bin/env node
"use strict";

const { createMissionRuntime, createMissionHttpServer } = require("../runtime/missions");
const { createUniversalOperatorRuntime, createUniversalOperatorHttpServer } = require("../services/operator/universal-server");

async function main() {
  const host = process.env.CYVX_OPERATOR_HOST || "127.0.0.1";
  const operatorPort = Number(process.env.CYVX_OPERATOR_PORT || 3020);
  const missionHost = process.env.CYVX_MISSION_HOST || "127.0.0.1";
  const missionPort = Number(process.env.CYVX_MISSION_PORT || 3000);
  const tickIntervalMs = Math.max(1000, Number(process.env.CYVX_OPERATOR_TICK_INTERVAL_MS || 15000));
  const autoTick = String(process.env.CYVX_OPERATOR_AUTO_TICK || "true").toLowerCase() !== "false";

  const runtime = createMissionRuntime();
  const missionHttp = createMissionHttpServer(runtime);
  const operatorRuntime = createUniversalOperatorRuntime({ runtime });
  const operatorHttp = createUniversalOperatorHttpServer(operatorRuntime);
  const worker = runtime.createWorker({ pollMs: Number(process.env.CYVX_WORKER_POLL_MS || 250) });
  let timer = null;
  let closing = false;

  const close = async (signal) => {
    if (closing) return;
    closing = true;
    if (timer) clearInterval(timer);
    worker.stop();
    await Promise.allSettled([operatorHttp.close(), missionHttp.close()]);
    runtime.close();
    process.stdout.write(`${JSON.stringify({ ok: true, event: "universal_operator.stopped", signal })}\n`);
  };

  process.once("SIGINT", () => close("SIGINT").finally(() => process.exit(0)));
  process.once("SIGTERM", () => close("SIGTERM").finally(() => process.exit(0)));

  try {
    const [missionAddress, operatorAddress] = await Promise.all([
      missionHttp.listen(missionPort, missionHost),
      operatorHttp.listen(operatorPort, host),
    ]);
    worker.start().catch((error) => {
      process.stderr.write(`${JSON.stringify({ ok: false, event: "universal_operator.worker_failed", error: error.message })}\n`);
      process.exitCode = 1;
    });
    if (autoTick) {
      timer = setInterval(() => {
        try {
          const ticks = operatorRuntime.operator.runAllOnce();
          if (ticks.length) process.stdout.write(`${JSON.stringify({ ok: true, event: "universal_operator.tick", ticks })}\n`);
        } catch (error) {
          process.stderr.write(`${JSON.stringify({ ok: false, event: "universal_operator.tick_failed", error: error.message })}\n`);
        }
      }, tickIntervalMs);
    }
    process.stdout.write(`${JSON.stringify({
      ok: true,
      event: "universal_operator.started",
      operator: `http://${host}:${operatorAddress.port}/operator`,
      mission_runtime: `http://${missionHost}:${missionAddress.port}/missions`,
      health: `http://${host}:${operatorAddress.port}/healthz`,
      entity_api: `http://${host}:${operatorAddress.port}/api/v2/operator/entities`,
      legacy_company_api: `http://${host}:${operatorAddress.port}/api/v1/operator/companies`,
      auto_tick: autoTick,
      tick_interval_ms: tickIntervalMs,
      data_root: runtime.dataRoot,
      platform_state: operatorRuntime.operator.platformStatePath,
    }, null, 2)}\n`);
  } catch (error) {
    await close("startup_failure");
    throw error;
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, event: "universal_operator.start_failed", code: error.code || null, error: error.message })}\n`);
    process.exit(1);
  });
}

module.exports = { main };