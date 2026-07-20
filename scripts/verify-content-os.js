'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  commandExists,
  createContentStore,
  createLogger,
  renderClaimedJob,
} = require('../services/content-os');
const { startContentServer } = require('../services/content-os/server');

async function request(url, pathname, options = {}) {
  const response = await fetch(`${url}${pathname}`, {
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(payload)}`);
  return payload;
}

async function main() {
  assert.equal(commandExists(process.env.FFMPEG_BIN || 'ffmpeg'), true, 'ffmpeg must be installed');
  assert.equal(commandExists(process.env.FFPROBE_BIN || 'ffprobe'), true, 'ffprobe must be installed');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyvx-content-os-verify-'));
  const dataDir = path.join(root, 'data');
  const dbPath = path.join(dataDir, 'content-os.db');
  const logger = createLogger({ service: 'content-os-verifier', logPath: path.join(dataDir, 'logs', 'verify.jsonl') });
  let server;
  let workerStore;
  try {
    server = await startContentServer({
      host: '127.0.0.1',
      port: 0,
      dataDir,
      dbPath,
      allowInsecureLocal: true,
      logger,
    });
    const health = await request(server.url, '/health');
    assert.equal(health.ok, true);
    assert.equal(health.ffmpeg, true);

    const created = await request(server.url, '/api/content', {
      method: 'POST',
      headers: { 'idempotency-key': 'verify-content-os-0001' },
      body: JSON.stringify({
        topic: 'Build a measurable content production loop',
        audience: 'CYVX operators and product builders',
        objective: 'teach a useful operating method',
        cta: 'Run the loop, measure the outcome, and improve the next release.',
        durationSeconds: 18,
      }),
    });
    assert.equal(created.status, 'queued');
    assert.equal(created.scenes.length, 6);

    const replay = await request(server.url, '/api/content', {
      method: 'POST',
      headers: { 'idempotency-key': 'verify-content-os-0001' },
      body: JSON.stringify({ topic: 'This must not create a duplicate' }),
    });
    assert.equal(replay.id, created.id);

    workerStore = createContentStore({ dbPath, dataDir, logger });
    const job = workerStore.claimRenderJob('verification-worker', { leaseMs: 180000 });
    assert.ok(job);
    assert.equal(job.contentId, created.id);
    const completed = renderClaimedJob({ store: workerStore, job, logger });
    assert.equal(completed.status, 'completed');
    assert.ok(fs.existsSync(completed.outputPath));
    assert.ok(fs.statSync(completed.outputPath).size > 1024);
    assert.match(completed.sha256, /^[a-f0-9]{64}$/);

    const rendered = await request(server.url, `/api/content/${encodeURIComponent(created.id)}`);
    assert.equal(rendered.status, 'rendered');
    assert.ok(rendered.renderJob.mediaUrl);
    const mediaResponse = await fetch(`${server.url}${rendered.renderJob.mediaUrl}`);
    assert.equal(mediaResponse.status, 200);
    assert.equal(mediaResponse.headers.get('content-type'), 'video/mp4');
    const mediaBytes = Buffer.from(await mediaResponse.arrayBuffer());
    assert.ok(mediaBytes.length > 1024);

    const metricResponse = await request(server.url, `/api/content/${encodeURIComponent(created.id)}/metrics`, {
      method: 'POST',
      body: JSON.stringify({
        platform: 'verification',
        impressions: 1000,
        views: 500,
        watchSeconds: 4500,
        completions: 180,
        clicks: 45,
        leads: 12,
        conversions: 3,
        revenue: 297,
      }),
    });
    assert.equal(metricResponse.metric.revenue, 297);
    assert.equal(metricResponse.metric.rates.clickThroughRate, 45 / 500);

    const dashboard = await request(server.url, '/api/dashboard');
    assert.equal(dashboard.content.total, 1);
    assert.equal(dashboard.content.measured, 1);
    assert.equal(dashboard.performance.views, 500);
    assert.equal(dashboard.performance.revenue, 297);

    const events = await request(server.url, `/api/content/${encodeURIComponent(created.id)}/events`);
    assert.deepEqual(events.events.map((event) => event.type), [
      'content.created',
      'render.queued',
      'render.started',
      'render.completed',
      'metrics.recorded',
    ]);

    const proof = {
      ok: true,
      contentId: created.id,
      renderJobId: completed.id,
      outputPath: completed.outputPath,
      outputBytes: fs.statSync(completed.outputPath).size,
      sha256: completed.sha256,
      durationSeconds: completed.durationSeconds,
      views: dashboard.performance.views,
      revenue: dashboard.performance.revenue,
      eventCount: events.events.length,
      verifiedAt: new Date().toISOString(),
    };
    process.stdout.write(`${JSON.stringify(proof, null, 2)}\n`);
  } finally {
    if (workerStore) workerStore.close();
    if (server) await server.close();
    if (process.env.CONTENT_OS_KEEP_VERIFY !== '1') fs.rmSync(root, { recursive: true, force: true });
    else process.stdout.write(`Verification workspace retained: ${root}\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ ok: false, error: error.message, stack: error.stack }, null, 2)}\n`);
  process.exit(1);
});
