"use strict";

const publicModulePath = require.resolve("./public");
const cinematicPublic = require("./public-experience");
require.cache[publicModulePath].exports = cinematicPublic;

const { createRuntimeV7 } = require("./runtime-v7");

async function main() {
  const runtime = await createRuntimeV7();
  await runtime.listen();
  runtime.telemetry.log("info", "cyvx.runtime.cinematic.started", {
    public: runtime.publicRuntime.ports.publicPort,
    control: runtime.operationsPort,
    public_experience: "/",
    control_room: "/control",
  });

  let closing = false;
  const shutdown = async (signal) => {
    if (closing) return;
    closing = true;
    runtime.telemetry.log("info", "cyvx.runtime.cinematic.shutdown", { signal });
    await runtime.close();
    process.exit(0);
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

if (require.main === module) main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ timestamp: new Date().toISOString(), level: "error", event: "cyvx.runtime.cinematic.failed", code: error.code || null, error: error.message })}\n`);
  process.exit(1);
});

module.exports = { main };
