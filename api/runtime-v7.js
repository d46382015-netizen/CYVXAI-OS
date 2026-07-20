"use strict";

const path = require("node:path");
const os = require("node:os");
const { createPublicRuntime } = require("./public-company");
const { buildReadiness } = require("./production");
const { Telemetry } = require("../core/observability/telemetry");
const { BackupScheduler } = require("../core/production/backup_scheduler");
const { AutonomySupervisor } = require("../core/production/autonomy_supervisor");
const { assertProductionSecurity } = require("../core/security/production_guard");
const { ManagedDataPlane } = require("../core/storage/managed_data_plane");
const { buildOverview } = require("../core/ops/overview");
const { close, createServer, listen } = require("../core/ops/http_server");
const { createFieldManualServer } = require("../services/content-growth/server");
const { mountFieldManual, resolveFieldManualPublicBaseUrl } = require("../services/content-growth/gateway");

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
    const operationsPort = Number(options.operationsPort || env.CYVX_CONTROL_PORT || publicRuntime.ports.publicPort + 4);
    const fieldManualPort = Number(options.fieldManualPort || env.CYVX_FIELD_INTERNAL_PORT || publicRuntime.ports.publicPort + 5);
    assertAvailablePort(fieldManualPort, [...Object.values(publicRuntime.ports), operationsPort]);
    const fieldManual = createFieldManualServer({
      host: "127.0.0.1",
      port: fieldManualPort,
      publicBaseUrl: resolveFieldManualPublicBaseUrl(env, options.fieldManualPublicBaseUrl),
      dataDirectory: options.fieldManualDataDirectory || env.CYVX_FIELD_DATA_DIR || path.join(dataRoot, "field-manual"),
      manychatSecret: env.CYVX_MANYCHAT_WEBHOOK_SECRET || "",
      adminToken: env.CYVX_FIELD_ADMIN_TOKEN || "",
      lemonSecret: env.LEMONSQUEEZY_WEBHOOK_SECRET || "",
      checkoutUrl: env.LEMONSQUEEZY_CHECKOUT_URL || "",
      kitApiKey: env.KIT_API_KEY || "",
      kitTagIds: {
        GENERAL_OPERATOR: env.KIT_TAG_GENERAL_OPERATOR,
        SECURITY: env.KIT_TAG_SECURITY,
        MOBILE_BUILD: env.KIT_TAG_MOBILE_BUILD,
      },
      fetchImpl: options.fetch,
      logger: options.fieldManualLogger || console,
    });
    mountFieldManual(publicRuntime.publicServer, fieldManualPort);

    const missionWorker = options.missionWorker || publicRuntime.missions.createWorker({
      workerId: options.missionWorkerId || env.CYVX_WORKER_ID || "worker-main",
      pollMs: Number(options.missionWorkerPollMs || env.CYVX_WORKER_POLL_MS || 100),
    });
    let missionWorkerPromise = null;
    let missionWorkerError = null;
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
    const operations = createServer(overview);

    function startMissionWorker() {
      if (missionWorkerPromise) return missionWorkerPromise;
      missionWorkerPromise = missionWorker.start().catch((error) => {
        missionWorkerError = error;
        telemetry.captureError(error, { operation: "mission_worker.run", worker_id: missionWorker.workerId });
        telemetry.log("error", "cyvx.mission_worker.failed", {
          worker_id: missionWorker.workerId,
          code: error.code || null,
          error: error.message,
        });
      });
      return missionWorkerPromise;
    }

    async function stopMissionWorker() {
      missionWorker.stop();
      if (missionWorkerPromise) await missionWorkerPromise;
    }

    startupSpan.end("ok");
    return {
      publicRuntime,
      fieldManual,
      fieldManualPort,
      integrations,
      autonomy,
      backup,
      managedData,
      telemetry,
      security,
      operations,
      operationsPort,
      missionWorker,
      get missionWorkerError() { return missionWorkerError; },
      overview,
      async listen() {
        const span = telemetry.startSpan("runtime.listen", {
          public_port: publicRuntime.ports.publicPort,
          control_port: operationsPort,
          field_manual_port: fieldManualPort,
        });
        startMissionWorker();
        let fieldManualStarted = false;
        try {
          await fieldManual.start();
          fieldManualStarted = true;
          await publicRuntime.listen();
          await listen(operations, operationsPort);
        } catch (error) {
          await stopMissionWorker();
          await publicRuntime.close().catch(() => undefined);
          if (fieldManualStarted) await fieldManual.close().catch(() => undefined);
          span.end("error", { error: error.message });
          throw error;
        }
        autonomy.start();
        backup.start();
        managedData.start(overview);
        telemetry.log("info", "cyvx.runtime.v8.ready", {
          public_port: publicRuntime.ports.publicPort,
          control_port: operationsPort,
          field_manual: { internal_port: fieldManualPort, public_path: "/field-manual" },
          company_runtime: {
            public_site: "/",
            control_room: "/control-room",
            scheduler: publicRuntime.companyScheduler?.enabled || false,
          },
          mission_worker: { worker_id: missionWorker.workerId, ready: !missionWorkerError },
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
        await stopMissionWorker();
        await Promise.all([close(operations), publicRuntime.close(), fieldManual.close()]);
        telemetry.log("info", "cyvx.runtime.v8.closed");
      },
    };
  } catch (error) {
    startupSpan.end("error", { error: error.code || error.message });
    telemetry.captureError(error, { operation: "runtime.create" });
    throw error;
  }
}

function assertAvailablePort(port, reservedPorts) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Field Manual internal port must be a valid TCP port");
  const reserved = new Set(reservedPorts.map(Number).filter(Number.isInteger));
  if (reserved.has(port)) throw new Error("Field Manual internal port must be distinct from public, control, CYVX, and Spark ports");
}

async function main() {
  const runtime = await createRuntimeV7();
  await runtime.listen();
  runtime.telemetry.log("info", "cyvx.runtime.v8.started", {
    public: runtime.publicRuntime.ports.publicPort,
    control: runtime.operationsPort,
    public_site: "/",
    company_control_room: "/control-room",
    field_manual: { internal_port: runtime.fieldManualPort, public_path: "/field-manual" },
    mission_worker: { worker_id: runtime.missionWorker.workerId, ready: !runtime.missionWorkerError },
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

module.exports = { createRuntimeV7, assertAvailablePort };
