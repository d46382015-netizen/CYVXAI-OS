#!/usr/bin/env node
"use strict";
const { createTopologyConsolidationServer } = require("../services/topology-consolidation/server");
const runtime = createTopologyConsolidationServer();
runtime.listen().then(() => {
  const address = runtime.server.address();
  process.stdout.write(`CYVX topology consolidation ready at http://${address.address}:${address.port}/topology\n`);
}).catch((error) => { process.stderr.write(`${error.stack || error.message}\n`); process.exit(1); });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, async () => { await runtime.close().catch(() => {}); process.exit(0); });
