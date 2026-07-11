"use strict";

const path = require("node:path");
const os = require("node:os");
const { createPublicRuntime } = require("./public");
const { buildReadiness } = require("./production");
const { Telemetry } = require("../core/observability/telemetry");
const { BackupScheduler } = require("../core/production/backup_scheduler");
const { AutonomySupervisor } = require("../core/production/autonomy_supervisor");
const { assertProductionSecurity } = require("../core/security/production_guard");
const { ManagedDataPlane } = require("../core/storage/managed_data_plane");
const { buildOverview } = require("../core/ops/overview");
const { close, createServer, listen } = require("../core/ops/http_server");

async function createRuntimeV7(options = {}) {
  const startedAt = Date.now();
  const env = options.env || process.env;
  const security = assertProductionSecurity(env);
  const dataRoot = path.resolve(options.dataRoot || env.CYVX_DATA_ROOT || path.join(os.homedir(), ".cyvx"));
  const telemetry = options.telemetry || new Telemetry({
    environment: env.CYVX_ENV || env.NODE_ENV,
    logPath: env.CYVX_LOG_PATH || path.join(dataRoot, "logs", "cyvx-runtime.jsonl"),
  });
  const startupSpan = telemetry.startSpan("runtime.create", { production: security.production });
  try {
    const publicRuntime = await createPublicRuntime({ ...(options.public || {}), telemetry, env, fetch: options.fetch });
    const integrations = publicRuntime.integrations;
    const autonomy = new AutonomySupervisor({ runtime: publicRuntime.spark.runtime, flagProvider: integrations.flags, ...options.autonomy });
    const backup = options.backup || new BackupScheduler({ dataRoot, telemetry, ...options.backupOptions });
    const managedData = options.managedData || new ManagedDataPlane({ telemetry, ...options.managedDataOptions });
    const overview = () => buildOverview({
      sparkRuntime: publicRuntime.spark.runtime,
      autonomy,
      backup,
      managedData,
      telemetry,
      integrations,
      security,
      cyvx: publicRuntime.cyvx,
      github: buildReadiness(publicRuntime.cyvx),
      startedAt,
    });
    const operationsPort = Number(options.operationsPort || env.CYVX_CONTROL_PORT || publicRuntime.ports.publicPort + 4);
    const operations = createServer(overview);

    startupSpan.end("ok");
    return {
      publicRuntime,
      integrations,
      autonomy,
      backup,
      managedData,
      telemetry,
      security,
      operations,
      operationsPort,
      overview,
      async listen() {
        const span = telemetry.startSpan("runtime.listen", { public_port: publicRuntime.ports.publicPort, control_port: operationsPort });
        await publicRuntime.listen();
        try { await listen(operations, operationsPort); }
        catch (error) { await publicRuntime.close(); span.end("error", { error: error.message }); throw error; }
        autonomy.start();
        backup.start();
        managedData.start(overview);
        telemetry.log("info", "cyvx.runtime.v8.ready", {
          public_port: publicRuntime.ports.publicPort,
          control_port: operationsPort,
          backup: backup.snapshot(),
          managed_data: managedData.snapshot(),
          integrations: integrations.snapshot(),
          security,
        });
        span.end("ok");
        return this;
      },
      async close() {
        telemetry.log("info", "cyvx.runtime.v8.closing");
        managedData.stop();
        backup.stop();
        autonomy.stop();
        await Promise.all([close(operations), publicRuntime.close()]);
        telemetry.log("info", "cyvx.runtime.v8.closed");
      },
    };
  } catch (error) {
    startupSpan.end("error", { error: error.code || error.message });
    telemetry.captureError(error, { operation: "runtime.create" });
    throw error;
  }
}

async function main() {
  const runtime = await createRuntimeV7();
  await runtime.listen();
  runtime.telemetry.log("info", "cyvx.runtime.v8.started", {
    public: runtime.publicRuntime.ports.publicPort,
    control: runtime.operationsPort,
    autonomy: runtime.autonomy.snapshot(),
    backup: runtime.backup.snapshot(),
    managed_data: runtime.managedData.snapshot(),
    integrations: runtime.integrations.snapshot(),
  });
  let closing = false;
  const shutdown = async (signal) => {
    if (closing) return;
    closing = true;
    runtime.telemetry.log("info", "cyvx.runtime.v8.shutdown", { signal });
    await runtime.close();
    process.exit(0);
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

if (require.main === module) main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ timestamp: new Date().toISOString(), level: "error", event: "cyvx.runtime.v8.failed", code: error.code || null, error: error.message })}\n`);
  process.exit(1);
});

module.exports = { createRuntimeV7 };
