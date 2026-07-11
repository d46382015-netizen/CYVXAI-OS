#!/usr/bin/env node
"use strict";

const { createMissionRuntime } = require("./index");

async function main() {
  const runtime = createMissionRuntime();
  const worker = runtime.createWorker({
    workerId: process.env.CYVX_WORKER_ID,
    pollMs: Number(process.env.CYVX_WORKER_POLL_MS || 250),
    crashAfterClaim: process.env.CYVX_WORKER_CRASH_AFTER_CLAIM === "1",
  });

  if (process.env.CYVX_WORKER_CRASH_AFTER_CLAIM === "1") {
    const result = await worker.runOnce();
    process.stdout.write(`${JSON.stringify({ event: "cyvx.worker.interrupted", worker_id: worker.workerId, result })}\n`);
    runtime.db.close();
    process.exit(result && result.interrupted ? 99 : 0);
  }

  if (process.env.CYVX_WORKER_ONCE === "1") {
    const result = await worker.runOnce();
    process.stdout.write(`${JSON.stringify({ event: "cyvx.worker.once", worker_id: worker.workerId, result })}\n`);
    runtime.close();
    return;
  }

  process.stdout.write(`${JSON.stringify({ event: "cyvx.worker.ready", worker_id: worker.workerId })}\n`);
  let stopping = false;
  const shutdown = (signal) => {
    if (stopping) return;
    stopping = true;
    process.stdout.write(`${JSON.stringify({ event: "cyvx.worker.shutdown", worker_id: worker.workerId, signal })}\n`);
    worker.stop();
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  await worker.start();
  runtime.close();
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ event: "cyvx.worker.failed", error: error.message, code: error.code || "WORKER_ERROR" })}\n`);
  process.exit(1);
});
