'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  ContentOsError,
  buildContentPlan,
  createContentStore,
  createLogger,
  validateMetricInput,
} = require('../services/content-os');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'content-os-test-'));
  const dataDir = path.join(root, 'data');
  const logger = createLogger({ service: 'content-os-test' });
  const store = createContentStore({ dbPath: path.join(dataDir, 'content-os.db'), dataDir, logger });
  return {
    root,
    store,
    close() {
      store.close();
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

test('buildContentPlan creates a complete six-scene package', () => {
  const plan = buildContentPlan({
    topic: 'production content systems',
    audience: 'business operators',
    objective: 'generate qualified leads',
    cta: 'Book a CYVX operating audit.',
    durationSeconds: 42,
  });
  assert.equal(plan.scenes.length, 6);
  assert.equal(plan.hooks.length, 3);
  assert.equal(plan.scenes.reduce((sum, scene) => sum + scene.durationMs, 0), 42000);
  assert.match(plan.script, /REALITY:/);
  assert.match(plan.script, /OUTCOME:/);
});

test('validation rejects invalid content and metrics', () => {
  assert.throws(() => buildContentPlan({ topic: 'x' }), (error) => {
    assert.ok(error instanceof ContentOsError);
    assert.equal(error.code, 'VALIDATION_ERROR');
    return true;
  });
  assert.throws(() => validateMetricInput({ platform: 'x', views: -1 }), /platform must be between/);
  assert.throws(() => validateMetricInput({ platform: 'web', views: -1 }), /views must be a non-negative integer/);
});

test('store persists content, is idempotent, leases jobs, and records evidence', () => {
  const env = fixture();
  try {
    const input = {
      topic: 'turn one idea into a measurable content asset',
      audience: 'founders',
      objective: 'build trust and authority',
      cta: 'Save this operating loop.',
      durationSeconds: 30,
    };
    const first = env.store.createContent(input, { idempotencyKey: 'test-idempotency-key-0001' });
    const replay = env.store.createContent({ topic: 'different topic' }, { idempotencyKey: 'test-idempotency-key-0001' });
    assert.equal(first.id, replay.id);
    assert.equal(env.store.listContent().length, 1);
    assert.equal(first.status, 'queued');
    assert.equal(first.scenes.length, 6);

    const claimed = env.store.claimRenderJob('test-worker');
    assert.ok(claimed.leaseToken);
    assert.equal(claimed.status, 'processing');
    assert.equal(env.store.getContent(first.id).status, 'rendering');
    assert.equal(env.store.claimRenderJob('second-worker'), null);

    const outputDir = path.join(env.root, 'renders');
    fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, 'video.mp4');
    fs.writeFileSync(outputPath, Buffer.alloc(2048, 1));
    env.store.completeRenderJob(claimed.id, claimed.leaseToken, {
      outputPath,
      thumbnailPath: null,
      sha256: 'a'.repeat(64),
      durationSeconds: 30,
    });
    assert.equal(env.store.getContent(first.id).status, 'rendered');

    const metric = env.store.recordMetrics(first.id, {
      platform: 'youtube',
      impressions: 100,
      views: 50,
      watchSeconds: 750,
      completions: 20,
      clicks: 10,
      leads: 4,
      conversions: 2,
      revenue: 99,
    });
    assert.equal(metric.rates.viewRate, 0.5);
    assert.equal(metric.rates.clickThroughRate, 0.2);
    assert.equal(metric.revenue, 99);

    const dashboard = env.store.dashboard();
    assert.equal(dashboard.content.total, 1);
    assert.equal(dashboard.content.measured, 1);
    assert.equal(dashboard.performance.revenue, 99);
    assert.deepEqual(env.store.getEvents(first.id).map((event) => event.type), [
      'content.created',
      'render.queued',
      'render.started',
      'render.completed',
      'metrics.recorded',
    ]);
  } finally {
    env.close();
  }
});

test('failed render jobs retry and then fail closed after the maximum attempts', () => {
  const env = fixture();
  try {
    const content = env.store.createContent({ topic: 'render retry discipline' });
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const job = env.store.claimRenderJob(`worker-${attempt}`);
      const failed = env.store.failRenderJob(job.id, job.leaseToken, new Error(`failure-${attempt}`));
      assert.equal(failed.status, attempt < 3 ? 'queued' : 'failed');
    }
    assert.equal(env.store.getContent(content.id).status, 'failed');
    assert.equal(env.store.claimRenderJob('worker-4'), null);
  } finally {
    env.close();
  }
});
