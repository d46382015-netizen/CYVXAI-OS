"use strict";

const fs = require("node:fs");
const { RuntimeControl } = require("../core/runtime/runtime_control");
const { createOperationsServer, listen } = require("../core/runtime/ops_server");

async function main() {
  const publicPort = Number(process.env.CYVX_PORT || process.env.PORT || 3000);
  const port = Number(process.env.CYVX_OPS_PORT || publicPort + 2);
  const readyFile = process.env.CYVX_READY_FILE || `/tmp/cyvx-ready-${publicPort}`;
  const control = new RuntimeControl();
  const server = createOperationsServer(control);
  await listen(server, port, "127.0.0.1");
  const refresh = () => control.markReady(fs.existsSync(readyFile));
  refresh();
  const timer = setInterval(refresh, 2000);
  timer.unref();
  console.log(JSON.stringify({ event: "cyvx_operations_started", port }));
  const stop = () => {
    control.beginShutdown();
    clearInterval(timer);
    server.close(() => process.exit(0));
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

if (require.main === module) main().catch((error) => {
  console.error(JSON.stringify({ event: "cyvx_operations_failed", message: error.message }));
  process.exit(1);
});
