"use strict";

const { createPublicRuntime } = require("./public");
const { buildReadiness } = require("./production");
const { AutonomySupervisor } = require("../core/production/autonomy_supervisor");
const { buildOverview } = require("../core/ops/overview");
const { close, createServer, listen } = require("../core/ops/http_server");

async function createRuntimeV7(options = {}) {
  const startedAt = Date.now();
  const publicRuntime = await createPublicRuntime(options.public || {});
  const autonomy = new AutonomySupervisor({ runtime: publicRuntime.spark.runtime, ...options.autonomy });
  const overview = () => buildOverview({
    sparkRuntime: publicRuntime.spark.runtime,
    autonomy,
    cyvx: publicRuntime.cyvx,
    github: buildReadiness(publicRuntime.cyvx),
    startedAt,
  });
  const operationsPort = Number(options.operationsPort || process.env.CYVX_CONTROL_PORT || publicRuntime.ports.publicPort + 4);
  const operations = createServer(overview);

  return {
    publicRuntime,
    autonomy,
    operations,
    operationsPort,
    overview,
    async listen() {
      await publicRuntime.listen();
      try { await listen(operations, operationsPort); }
      catch (error) { await publicRuntime.close(); throw error; }
      autonomy.start();
      return this;
    },
    async close() {
      autonomy.stop();
      await Promise.all([close(operations), publicRuntime.close()]);
    },
  };
}

async function main() {
  const runtime = await createRuntimeV7();
  await runtime.listen();
  console.log(JSON.stringify({
    event: "cyvx.runtime.v7.started",
    public: runtime.publicRuntime.ports.publicPort,
    control: runtime.operationsPort,
    autonomy: runtime.autonomy.snapshot(),
  }));
  let closing = false;
  const shutdown = async (signal) => {
    if (closing) return;
    closing = true;
    console.log(JSON.stringify({ event: "cyvx.runtime.v7.shutdown", signal }));
    await runtime.close();
    process.exit(0);
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

if (require.main === module) main().catch((error) => {
  console.error(JSON.stringify({ event: "cyvx.runtime.v7.failed", error: error.message }));
  process.exit(1);
});

module.exports = { createRuntimeV7 };
