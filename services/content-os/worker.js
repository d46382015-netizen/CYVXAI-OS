'use strict';

const os = require('node:os');
const path = require('node:path');
const {
  createContentStore,
  createLogger,
  renderClaimedJob,
} = require('./index');

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runWorker({
  once = process.argv.includes('--once'),
  pollMs = Number(process.env.CONTENT_OS_WORKER_POLL_MS || 2000),
  dataDir = process.env.CONTENT_OS_DATA_DIR || path.join(os.homedir(), '.cyvx', 'content-os'),
  dbPath = process.env.CONTENT_OS_DB_PATH || path.join(dataDir, 'content-os.db'),
  workerId = process.env.CONTENT_OS_WORKER_ID || `${os.hostname()}-${process.pid}`,
} = {}) {
  const logger = createLogger({
    service: 'content-os-worker',
    logPath: path.join(dataDir, 'logs', 'worker.jsonl'),
  });
  const store = createContentStore({ dbPath, dataDir, logger });
  let stopping = false;
  const stop = (signal) => {
    stopping = true;
    logger.info('worker.signal', { signal, workerId });
  };
  process.on('SIGINT', () => stop('SIGINT'));
  process.on('SIGTERM', () => stop('SIGTERM'));
  logger.info('worker.started', { workerId, dbPath, once, pollMs });
  let processed = 0;
  try {
    do {
      const job = store.claimRenderJob(workerId);
      if (!job) {
        if (once) break;
        await delay(Math.max(250, pollMs));
        continue;
      }
      try {
        renderClaimedJob({ store, job, logger });
        processed += 1;
      } catch (error) {
        logger.error('worker.job_failed', {
          workerId,
          jobId: job.id,
          contentId: job.contentId,
          error: error.message,
          code: error.code,
        });
        if (once) throw error;
      }
    } while (!stopping);
  } finally {
    store.close();
    logger.info('worker.stopped', { workerId, processed });
  }
  return { processed };
}

if (require.main === module) {
  runWorker().catch((error) => {
    process.stderr.write(`${JSON.stringify({
      ts: new Date().toISOString(),
      level: 'error',
      service: 'content-os-worker',
      event: 'worker.failed',
      error: error.message,
      code: error.code,
    })}\n`);
    process.exit(1);
  });
}

module.exports = { runWorker };
