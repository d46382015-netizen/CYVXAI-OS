'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');

const CONTENT_STATUSES = new Set(['queued', 'rendering', 'rendered', 'measured', 'failed']);
const JOB_STATUSES = new Set(['queued', 'processing', 'completed', 'failed']);

class ContentOsError extends Error {
  constructor(message, { code = 'CONTENT_OS_ERROR', status = 400, details = null } = {}) {
    super(message);
    this.name = 'ContentOsError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function ensureDir(directory) {
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

function clampNumber(value, minimum, maximum, fallback = minimum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, number));
}

function normalizeText(value, { field, min = 1, max = 500, fallback = null } = {}) {
  if ((value === undefined || value === null || value === '') && fallback !== null) return fallback;
  if (typeof value !== 'string') {
    throw new ContentOsError(`${field} must be a string`, {
      code: 'VALIDATION_ERROR',
      status: 422,
      details: { field },
    });
  }
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length < min || normalized.length > max) {
    throw new ContentOsError(`${field} must be between ${min} and ${max} characters`, {
      code: 'VALIDATION_ERROR',
      status: 422,
      details: { field, min, max, actual: normalized.length },
    });
  }
  return normalized;
}

function validateCreateInput(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ContentOsError('Request body must be an object', {
      code: 'VALIDATION_ERROR',
      status: 422,
    });
  }
  const objective = normalizeText(input.objective, {
    field: 'objective',
    min: 2,
    max: 80,
    fallback: 'teach a useful operating method',
  });
  return {
    topic: normalizeText(input.topic, { field: 'topic', min: 3, max: 180 }),
    audience: normalizeText(input.audience, {
      field: 'audience',
      min: 2,
      max: 160,
      fallback: 'ambitious operators and builders',
    }),
    objective,
    cta: normalizeText(input.cta, {
      field: 'cta',
      min: 2,
      max: 220,
      fallback: 'Save this, apply the loop, and follow CYVX for the next system.',
    }),
    durationSeconds: Math.round(clampNumber(input.durationSeconds, 18, 90, 42)),
  };
}

function validateMetricInput(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ContentOsError('Metric body must be an object', {
      code: 'VALIDATION_ERROR',
      status: 422,
    });
  }
  const nonNegativeInteger = (field, fallback = 0) => {
    const value = input[field] ?? fallback;
    if (!Number.isInteger(Number(value)) || Number(value) < 0) {
      throw new ContentOsError(`${field} must be a non-negative integer`, {
        code: 'VALIDATION_ERROR',
        status: 422,
        details: { field },
      });
    }
    return Number(value);
  };
  const watchSeconds = Number(input.watchSeconds ?? 0);
  if (!Number.isFinite(watchSeconds) || watchSeconds < 0) {
    throw new ContentOsError('watchSeconds must be a non-negative number', {
      code: 'VALIDATION_ERROR',
      status: 422,
      details: { field: 'watchSeconds' },
    });
  }
  const revenue = Number(input.revenue ?? 0);
  if (!Number.isFinite(revenue) || revenue < 0 || revenue > 100000000) {
    throw new ContentOsError('revenue must be between 0 and 100000000', {
      code: 'VALIDATION_ERROR',
      status: 422,
      details: { field: 'revenue' },
    });
  }
  return {
    platform: normalizeText(input.platform, {
      field: 'platform',
      min: 2,
      max: 40,
      fallback: 'direct',
    }).toLowerCase(),
    impressions: nonNegativeInteger('impressions'),
    views: nonNegativeInteger('views'),
    watchSeconds,
    completions: nonNegativeInteger('completions'),
    clicks: nonNegativeInteger('clicks'),
    leads: nonNegativeInteger('leads'),
    conversions: nonNegativeInteger('conversions'),
    revenueCents: Math.round(revenue * 100),
    observedAt: input.observedAt ? new Date(input.observedAt).toISOString() : nowIso(),
  };
}

function sentenceCase(text) {
  if (!text) return text;
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function wrapText(text, width = 28) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (!line) {
      line = word;
      continue;
    }
    if (`${line} ${word}`.length <= width) {
      line += ` ${word}`;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.join('\n');
}

function buildContentPlan(rawInput) {
  const input = validateCreateInput(rawInput);
  const topic = sentenceCase(input.topic.replace(/[.!?]+$/, ''));
  const hooks = [
    `Most people overcomplicate ${topic}. Here is the operating system.`,
    `Before you spend another dollar on ${topic}, build this loop.`,
    `The fastest way to make ${topic} useful is to turn it into a measurable system.`,
  ];
  const rawScenes = [
    {
      title: 'THE HOOK',
      body: hooks[0],
    },
    {
      title: 'REALITY',
      body: `${input.audience} do not need more scattered information. They need a repeatable result around ${topic}.`,
    },
    {
      title: 'CONSTRAINT',
      body: `The usual failure is disconnected tools, unclear ownership, and no measurement after publishing.`,
    },
    {
      title: 'OPPORTUNITY',
      body: `Turn one topic into a governed pipeline: brief, script, scenes, render, distribution, evidence, and learning.`,
    },
    {
      title: 'ACTION',
      body: `Start with one audience, one objective, one call to action, and one measurable outcome. Ship the smallest complete loop.`,
    },
    {
      title: 'OUTCOME',
      body: `${input.cta}`,
    },
  ];
  const baseDuration = Math.floor((input.durationSeconds * 1000) / rawScenes.length);
  const remainder = input.durationSeconds * 1000 - baseDuration * rawScenes.length;
  const scenes = rawScenes.map((scene, index) => ({
    position: index + 1,
    title: scene.title,
    body: scene.body,
    displayText: `${scene.title}\n\n${wrapText(scene.body, 30)}`,
    durationMs: baseDuration + (index === rawScenes.length - 1 ? remainder : 0),
  }));
  const script = scenes.map((scene) => `${scene.title}: ${scene.body}`).join('\n\n');
  return {
    ...input,
    topic,
    hook: hooks[0],
    hooks,
    script,
    scenes,
  };
}

function redact(value, key = '') {
  const sensitive = /token|secret|authorization|api[_-]?key|password/i.test(key);
  if (sensitive) return '[REDACTED]';
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, redact(childValue, childKey)]));
  }
  return value;
}

function createLogger({ logPath = null, service = 'content-os' } = {}) {
  if (logPath) ensureDir(path.dirname(logPath));
  function write(level, event, fields = {}) {
    const record = redact({
      ts: nowIso(),
      level,
      service,
      event,
      ...fields,
    });
    const line = `${JSON.stringify(record)}\n`;
    if (logPath) fs.appendFileSync(logPath, line, 'utf8');
    const stream = level === 'error' ? process.stderr : process.stdout;
    stream.write(line);
    return record;
  }
  return {
    debug: (event, fields) => write('debug', event, fields),
    info: (event, fields) => write('info', event, fields),
    warn: (event, fields) => write('warn', event, fields),
    error: (event, fields) => write('error', event, fields),
  };
}

function parseJson(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function createContentStore({
  dbPath = path.join(os.homedir(), '.cyvx', 'content-os', 'content-os.db'),
  dataDir = path.dirname(dbPath),
  logger = createLogger(),
} = {}) {
  ensureDir(dataDir);
  ensureDir(path.dirname(dbPath));
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS content_items (
      id TEXT PRIMARY KEY,
      topic TEXT NOT NULL,
      audience TEXT NOT NULL,
      objective TEXT NOT NULL,
      cta TEXT NOT NULL,
      hook TEXT NOT NULL,
      hooks_json TEXT NOT NULL,
      script TEXT NOT NULL,
      duration_seconds INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('queued','rendering','rendered','measured','failed')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS scenes (
      id TEXT PRIMARY KEY,
      content_id TEXT NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      display_text TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      UNIQUE(content_id, position)
    );
    CREATE TABLE IF NOT EXISTS render_jobs (
      id TEXT PRIMARY KEY,
      content_id TEXT NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('queued','processing','completed','failed')),
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      lease_token TEXT,
      lease_expires_at TEXT,
      worker_id TEXT,
      error TEXT,
      output_path TEXT,
      thumbnail_path TEXT,
      sha256 TEXT,
      duration_seconds REAL,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_render_jobs_status_created
      ON render_jobs(status, created_at);
    CREATE TABLE IF NOT EXISTS metrics (
      id TEXT PRIMARY KEY,
      content_id TEXT NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
      platform TEXT NOT NULL,
      impressions INTEGER NOT NULL,
      views INTEGER NOT NULL,
      watch_seconds REAL NOT NULL,
      completions INTEGER NOT NULL,
      clicks INTEGER NOT NULL,
      leads INTEGER NOT NULL,
      conversions INTEGER NOT NULL,
      revenue_cents INTEGER NOT NULL,
      observed_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_metrics_content_observed
      ON metrics(content_id, observed_at);
    CREATE TABLE IF NOT EXISTS events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      content_id TEXT,
      type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_events_content_sequence
      ON events(content_id, sequence);
    CREATE TABLE IF NOT EXISTS idempotency_keys (
      key TEXT PRIMARY KEY,
      response_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  const statements = {
    insertContent: db.prepare(`
      INSERT INTO content_items
      (id, topic, audience, objective, cta, hook, hooks_json, script, duration_seconds, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    insertScene: db.prepare(`
      INSERT INTO scenes
      (id, content_id, position, title, body, display_text, duration_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    insertJob: db.prepare(`
      INSERT INTO render_jobs
      (id, content_id, status, attempts, max_attempts, created_at, updated_at)
      VALUES (?, ?, 'queued', 0, 3, ?, ?)
    `),
    insertEvent: db.prepare(`
      INSERT INTO events (id, content_id, type, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `),
    getIdempotency: db.prepare('SELECT response_json FROM idempotency_keys WHERE key = ?'),
    insertIdempotency: db.prepare('INSERT INTO idempotency_keys (key, response_json, created_at) VALUES (?, ?, ?)'),
    getContentRow: db.prepare('SELECT * FROM content_items WHERE id = ?'),
    getScenes: db.prepare('SELECT * FROM scenes WHERE content_id = ? ORDER BY position ASC'),
    getLatestJob: db.prepare('SELECT * FROM render_jobs WHERE content_id = ? ORDER BY created_at DESC LIMIT 1'),
    getMetrics: db.prepare('SELECT * FROM metrics WHERE content_id = ? ORDER BY observed_at DESC'),
    listContentRows: db.prepare('SELECT * FROM content_items ORDER BY created_at DESC LIMIT ?'),
    getEvents: db.prepare('SELECT * FROM events WHERE content_id = ? ORDER BY sequence ASC'),
    selectQueuedJob: db.prepare(`
      SELECT * FROM render_jobs
      WHERE status = 'queued'
      ORDER BY created_at ASC
      LIMIT 1
    `),
    getJob: db.prepare('SELECT * FROM render_jobs WHERE id = ?'),
    activeJob: db.prepare(`
      SELECT * FROM render_jobs
      WHERE content_id = ? AND status IN ('queued','processing')
      ORDER BY created_at DESC LIMIT 1
    `),
  };

  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE;');
    try {
      const result = fn();
      db.exec('COMMIT;');
      return result;
    } catch (error) {
      try { db.exec('ROLLBACK;'); } catch {}
      throw error;
    }
  }

  function appendEvent(contentId, type, payload = {}) {
    statements.insertEvent.run(makeId('evt'), contentId || null, type, JSON.stringify(payload), nowIso());
  }

  function mapJob(row) {
    if (!row) return null;
    return {
      id: row.id,
      contentId: row.content_id,
      status: row.status,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      workerId: row.worker_id,
      error: row.error,
      outputPath: row.output_path,
      thumbnailPath: row.thumbnail_path,
      sha256: row.sha256,
      durationSeconds: row.duration_seconds,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      leaseToken: row.lease_token,
      leaseExpiresAt: row.lease_expires_at,
    };
  }

  function mapMetric(row, contentDurationSeconds) {
    const viewSecondsAvailable = row.views * contentDurationSeconds;
    return {
      id: row.id,
      contentId: row.content_id,
      platform: row.platform,
      impressions: row.impressions,
      views: row.views,
      watchSeconds: row.watch_seconds,
      completions: row.completions,
      clicks: row.clicks,
      leads: row.leads,
      conversions: row.conversions,
      revenue: row.revenue_cents / 100,
      observedAt: row.observed_at,
      createdAt: row.created_at,
      rates: {
        viewRate: row.impressions ? row.views / row.impressions : 0,
        retentionRate: viewSecondsAvailable ? Math.min(1, row.watch_seconds / viewSecondsAvailable) : 0,
        completionRate: row.views ? row.completions / row.views : 0,
        clickThroughRate: row.views ? row.clicks / row.views : 0,
        leadRate: row.clicks ? row.leads / row.clicks : 0,
        conversionRate: row.leads ? row.conversions / row.leads : 0,
        revenuePerThousandViews: row.views ? (row.revenue_cents / 100) / row.views * 1000 : 0,
      },
    };
  }

  function getContent(contentId) {
    const row = statements.getContentRow.get(contentId);
    if (!row) {
      throw new ContentOsError('Content item not found', {
        code: 'NOT_FOUND',
        status: 404,
      });
    }
    const scenes = statements.getScenes.all(contentId).map((scene) => ({
      id: scene.id,
      position: scene.position,
      title: scene.title,
      body: scene.body,
      displayText: scene.display_text,
      durationMs: scene.duration_ms,
    }));
    const metrics = statements.getMetrics.all(contentId).map((metric) => mapMetric(metric, row.duration_seconds));
    return {
      id: row.id,
      topic: row.topic,
      audience: row.audience,
      objective: row.objective,
      cta: row.cta,
      hook: row.hook,
      hooks: parseJson(row.hooks_json, []),
      script: row.script,
      durationSeconds: row.duration_seconds,
      status: row.status,
      scenes,
      renderJob: mapJob(statements.getLatestJob.get(contentId)),
      metrics,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function createContent(rawInput, { idempotencyKey = null } = {}) {
    if (idempotencyKey !== null) {
      idempotencyKey = normalizeText(idempotencyKey, {
        field: 'Idempotency-Key',
        min: 8,
        max: 180,
      });
      const previous = statements.getIdempotency.get(idempotencyKey);
      if (previous) return parseJson(previous.response_json);
    }
    const plan = buildContentPlan(rawInput);
    const contentId = makeId('cnt');
    const jobId = makeId('rnd');
    const createdAt = nowIso();
    transaction(() => {
      statements.insertContent.run(
        contentId,
        plan.topic,
        plan.audience,
        plan.objective,
        plan.cta,
        plan.hook,
        JSON.stringify(plan.hooks),
        plan.script,
        plan.durationSeconds,
        'queued',
        createdAt,
        createdAt,
      );
      for (const scene of plan.scenes) {
        statements.insertScene.run(
          makeId('scn'),
          contentId,
          scene.position,
          scene.title,
          scene.body,
          scene.displayText,
          scene.durationMs,
        );
      }
      statements.insertJob.run(jobId, contentId, createdAt, createdAt);
      appendEvent(contentId, 'content.created', {
        topic: plan.topic,
        durationSeconds: plan.durationSeconds,
      });
      appendEvent(contentId, 'render.queued', { jobId });
      if (idempotencyKey) {
        statements.insertIdempotency.run(idempotencyKey, JSON.stringify({ contentId }), createdAt);
      }
    });
    const content = getContent(contentId);
    if (idempotencyKey) {
      db.prepare('UPDATE idempotency_keys SET response_json = ? WHERE key = ?').run(JSON.stringify(content), idempotencyKey);
    }
    logger.info('content.created', { contentId, topic: plan.topic, jobId });
    return content;
  }

  function listContent(limit = 50) {
    const boundedLimit = Math.round(clampNumber(limit, 1, 200, 50));
    return statements.listContentRows.all(boundedLimit).map((row) => ({
      id: row.id,
      topic: row.topic,
      audience: row.audience,
      objective: row.objective,
      hook: row.hook,
      durationSeconds: row.duration_seconds,
      status: row.status,
      renderJob: mapJob(statements.getLatestJob.get(row.id)),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  function queueRender(contentId) {
    const content = statements.getContentRow.get(contentId);
    if (!content) throw new ContentOsError('Content item not found', { code: 'NOT_FOUND', status: 404 });
    const active = statements.activeJob.get(contentId);
    if (active) return mapJob(active);
    const jobId = makeId('rnd');
    const timestamp = nowIso();
    transaction(() => {
      statements.insertJob.run(jobId, contentId, timestamp, timestamp);
      db.prepare('UPDATE content_items SET status = ?, updated_at = ? WHERE id = ?').run('queued', timestamp, contentId);
      appendEvent(contentId, 'render.queued', { jobId, retry: true });
    });
    logger.info('render.queued', { contentId, jobId });
    return mapJob(statements.getJob.get(jobId));
  }

  function claimRenderJob(workerId, { leaseMs = 120000 } = {}) {
    const normalizedWorkerId = normalizeText(workerId, { field: 'workerId', min: 2, max: 180 });
    const leaseDuration = Math.round(clampNumber(leaseMs, 30000, 900000, 120000));
    return transaction(() => {
      const timestamp = nowIso();
      db.prepare(`
        UPDATE render_jobs
        SET status = CASE WHEN attempts < max_attempts THEN 'queued' ELSE 'failed' END,
            lease_token = NULL,
            lease_expires_at = NULL,
            worker_id = NULL,
            error = CASE WHEN attempts < max_attempts THEN error ELSE COALESCE(error, 'Lease expired after maximum attempts') END,
            updated_at = ?
        WHERE status = 'processing' AND lease_expires_at IS NOT NULL AND lease_expires_at < ?
      `).run(timestamp, timestamp);
      const row = statements.selectQueuedJob.get();
      if (!row) return null;
      const leaseToken = crypto.randomBytes(24).toString('hex');
      const leaseExpiresAt = new Date(Date.now() + leaseDuration).toISOString();
      const result = db.prepare(`
        UPDATE render_jobs
        SET status = 'processing', attempts = attempts + 1,
            lease_token = ?, lease_expires_at = ?, worker_id = ?,
            started_at = COALESCE(started_at, ?), updated_at = ?
        WHERE id = ? AND status = 'queued'
      `).run(leaseToken, leaseExpiresAt, normalizedWorkerId, timestamp, timestamp, row.id);
      if (!result.changes) return null;
      db.prepare('UPDATE content_items SET status = ?, updated_at = ? WHERE id = ?').run('rendering', timestamp, row.content_id);
      appendEvent(row.content_id, 'render.started', { jobId: row.id, workerId: normalizedWorkerId });
      return mapJob(statements.getJob.get(row.id));
    });
  }

  function completeRenderJob(jobId, leaseToken, result) {
    if (!result || !result.outputPath || !result.sha256) {
      throw new ContentOsError('Render result is incomplete', {
        code: 'VALIDATION_ERROR',
        status: 422,
      });
    }
    const timestamp = nowIso();
    return transaction(() => {
      const job = statements.getJob.get(jobId);
      if (!job) throw new ContentOsError('Render job not found', { code: 'NOT_FOUND', status: 404 });
      if (job.status !== 'processing' || job.lease_token !== leaseToken) {
        throw new ContentOsError('Render lease is no longer valid', {
          code: 'LEASE_CONFLICT',
          status: 409,
        });
      }
      db.prepare(`
        UPDATE render_jobs
        SET status = 'completed', output_path = ?, thumbnail_path = ?, sha256 = ?,
            duration_seconds = ?, completed_at = ?, updated_at = ?,
            lease_token = NULL, lease_expires_at = NULL, error = NULL
        WHERE id = ?
      `).run(
        result.outputPath,
        result.thumbnailPath || null,
        result.sha256,
        Number(result.durationSeconds || 0),
        timestamp,
        timestamp,
        jobId,
      );
      db.prepare('UPDATE content_items SET status = ?, updated_at = ? WHERE id = ?').run('rendered', timestamp, job.content_id);
      appendEvent(job.content_id, 'render.completed', {
        jobId,
        outputPath: result.outputPath,
        sha256: result.sha256,
        durationSeconds: result.durationSeconds,
      });
      logger.info('render.completed', { jobId, contentId: job.content_id, outputPath: result.outputPath });
      return mapJob(statements.getJob.get(jobId));
    });
  }

  function failRenderJob(jobId, leaseToken, error) {
    const message = String(error?.message || error || 'Unknown render failure').slice(0, 2000);
    const timestamp = nowIso();
    return transaction(() => {
      const job = statements.getJob.get(jobId);
      if (!job) throw new ContentOsError('Render job not found', { code: 'NOT_FOUND', status: 404 });
      if (job.status !== 'processing' || job.lease_token !== leaseToken) {
        throw new ContentOsError('Render lease is no longer valid', {
          code: 'LEASE_CONFLICT',
          status: 409,
        });
      }
      const nextStatus = job.attempts < job.max_attempts ? 'queued' : 'failed';
      db.prepare(`
        UPDATE render_jobs
        SET status = ?, error = ?, lease_token = NULL, lease_expires_at = NULL,
            worker_id = NULL, updated_at = ?
        WHERE id = ?
      `).run(nextStatus, message, timestamp, jobId);
      db.prepare('UPDATE content_items SET status = ?, updated_at = ? WHERE id = ?')
        .run(nextStatus === 'failed' ? 'failed' : 'queued', timestamp, job.content_id);
      appendEvent(job.content_id, 'render.failed', {
        jobId,
        attempt: job.attempts,
        willRetry: nextStatus === 'queued',
        error: message,
      });
      logger.error('render.failed', { jobId, contentId: job.content_id, error: message, nextStatus });
      return mapJob(statements.getJob.get(jobId));
    });
  }

  function recordMetrics(contentId, rawInput) {
    const content = statements.getContentRow.get(contentId);
    if (!content) throw new ContentOsError('Content item not found', { code: 'NOT_FOUND', status: 404 });
    const metric = validateMetricInput(rawInput);
    const timestamp = nowIso();
    const metricId = makeId('met');
    transaction(() => {
      db.prepare(`
        INSERT INTO metrics
        (id, content_id, platform, impressions, views, watch_seconds, completions, clicks, leads, conversions, revenue_cents, observed_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        metricId,
        contentId,
        metric.platform,
        metric.impressions,
        metric.views,
        metric.watchSeconds,
        metric.completions,
        metric.clicks,
        metric.leads,
        metric.conversions,
        metric.revenueCents,
        metric.observedAt,
        timestamp,
      );
      db.prepare('UPDATE content_items SET status = ?, updated_at = ? WHERE id = ?').run('measured', timestamp, contentId);
      appendEvent(contentId, 'metrics.recorded', {
        metricId,
        platform: metric.platform,
        views: metric.views,
        conversions: metric.conversions,
        revenueCents: metric.revenueCents,
      });
    });
    logger.info('metrics.recorded', { contentId, metricId, platform: metric.platform });
    return getContent(contentId).metrics.find((item) => item.id === metricId);
  }

  function getEvents(contentId) {
    if (!statements.getContentRow.get(contentId)) {
      throw new ContentOsError('Content item not found', { code: 'NOT_FOUND', status: 404 });
    }
    return statements.getEvents.all(contentId).map((event) => ({
      sequence: event.sequence,
      id: event.id,
      contentId: event.content_id,
      type: event.type,
      payload: parseJson(event.payload_json, {}),
      createdAt: event.created_at,
    }));
  }

  function dashboard() {
    const counts = db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) AS queued,
        SUM(CASE WHEN status = 'rendering' THEN 1 ELSE 0 END) AS rendering,
        SUM(CASE WHEN status = 'rendered' THEN 1 ELSE 0 END) AS rendered,
        SUM(CASE WHEN status = 'measured' THEN 1 ELSE 0 END) AS measured,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
      FROM content_items
    `).get();
    const metrics = db.prepare(`
      SELECT
        COALESCE(SUM(impressions), 0) AS impressions,
        COALESCE(SUM(views), 0) AS views,
        COALESCE(SUM(watch_seconds), 0) AS watch_seconds,
        COALESCE(SUM(completions), 0) AS completions,
        COALESCE(SUM(clicks), 0) AS clicks,
        COALESCE(SUM(leads), 0) AS leads,
        COALESCE(SUM(conversions), 0) AS conversions,
        COALESCE(SUM(revenue_cents), 0) AS revenue_cents
      FROM metrics
    `).get();
    const views = Number(metrics.views || 0);
    const impressions = Number(metrics.impressions || 0);
    const clicks = Number(metrics.clicks || 0);
    const leads = Number(metrics.leads || 0);
    return {
      content: Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, Number(value || 0)])),
      performance: {
        impressions,
        views,
        watchSeconds: Number(metrics.watch_seconds || 0),
        completions: Number(metrics.completions || 0),
        clicks,
        leads,
        conversions: Number(metrics.conversions || 0),
        revenue: Number(metrics.revenue_cents || 0) / 100,
        viewRate: impressions ? views / impressions : 0,
        clickThroughRate: views ? clicks / views : 0,
        leadRate: clicks ? leads / clicks : 0,
        conversionRate: leads ? Number(metrics.conversions || 0) / leads : 0,
        revenuePerThousandViews: views ? (Number(metrics.revenue_cents || 0) / 100) / views * 1000 : 0,
      },
      recent: listContent(10),
      generatedAt: nowIso(),
    };
  }

  function close() {
    db.close();
  }

  return {
    dbPath,
    dataDir,
    createContent,
    listContent,
    getContent,
    queueRender,
    claimRenderJob,
    completeRenderJob,
    failRenderJob,
    recordMetrics,
    getEvents,
    dashboard,
    close,
  };
}

function commandExists(command) {
  const result = spawnSync(command, ['-version'], { encoding: 'utf8', timeout: 10000 });
  return result.status === 0;
}

function findFontFile() {
  const configured = process.env.CONTENT_OS_FONT_FILE;
  const candidates = [
    configured,
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf',
    '/system/fonts/Roboto-Regular.ttf',
    '/data/data/com.termux/files/usr/share/fontss/TTF/DejaVuSans-Bold.ttf',
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function escapeFilterPath(filePath) {
  return filePath.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

function runCommand(command, args, { logger, event, cwd = undefined } = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    cwd,
    timeout: 180000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const stderr = String(result.stderr || result.stdout || '').slice(-4000);
    logger?.error(event || 'command.failed', { command, status: result.status, stderr });
    throw new ContentOsError(`${command} failed`, {
      code: 'RENDER_COMMAND_FAILED',
      status: 500,
      details: { command, status: result.status, stderr },
    });
  }
  return result;
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function renderClaimedJob({
  store,
  job,
  outputDir = path.join(store.dataDir, 'renders'),
  ffmpegBin = process.env.FFMPEG_BIN || 'ffmpeg',
  ffprobeBin = process.env.FFPROBE_BIN || 'ffprobe',
  logger = createLogger(),
} = {}) {
  if (!store || !job || !job.id || !job.leaseToken) {
    throw new ContentOsError('A claimed render job with a valid lease is required', {
      code: 'VALIDATION_ERROR',
      status: 422,
    });
  }
  if (!commandExists(ffmpegBin)) {
    throw new ContentOsError('ffmpeg is required to render video', {
      code: 'FFMPEG_MISSING',
      status: 503,
    });
  }
  const content = store.getContent(job.contentId);
  const workspace = ensureDir(path.join(outputDir, content.id, job.id));
  const fontFile = findFontFile();
  const palette = ['0x111827', '0x17142b', '0x0f172a', '0x1e1b4b', '0x172033', '0x201332'];
  const segmentPaths = [];
  try {
    for (const scene of content.scenes) {
      const textPath = path.join(workspace, `scene-${scene.position}.txt`);
      const segmentPath = path.join(workspace, `scene-${scene.position}.mp4`);
      fs.writeFileSync(textPath, `${scene.displayText}\n`, 'utf8');
      const fontOption = fontFile ? `fontfile='${escapeFilterPath(fontFile)}':` : '';
      const drawText = [
        `drawtext=${fontOption}textfile='${escapeFilterPath(textPath)}'`,
        'fontcolor=white',
        'fontsize=52',
        'line_spacing=16',
        'x=(w-text_w)/2',
        'y=(h-text_h)/2',
        'box=1',
        'boxcolor=black@0.42',
        'boxborderw=42',
      ].join(':');
      const durationSeconds = Math.max(1, scene.durationMs / 1000);
      runCommand(ffmpegBin, [
        '-hide_banner', '-loglevel', 'error', '-y',
        '-f', 'lavfi',
        '-i', `color=c=${palette[(scene.position - 1) % palette.length]}:s=720x1280:r=30:d=${durationSeconds.toFixed(3)}`,
        '-vf', drawText,
        '-an',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        segmentPath,
      ], { logger, event: 'render.segment.failed' });
      segmentPaths.push(segmentPath);
    }
    const concatPath = path.join(workspace, 'concat.txt');
    fs.writeFileSync(
      concatPath,
      segmentPaths.map((segmentPath) => `file '${segmentPath.replace(/'/g, "'\\''")}'`).join('\n') + '\n',
      'utf8',
    );
    const outputPath = path.join(workspace, `${content.id}.mp4`);
    runCommand(ffmpegBin, [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'concat', '-safe', '0', '-i', concatPath,
      '-c', 'copy', '-movflags', '+faststart', outputPath,
    ], { logger, event: 'render.concat.failed' });
    const thumbnailPath = path.join(workspace, `${content.id}.jpg`);
    runCommand(ffmpegBin, [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-ss', '0.5', '-i', outputPath,
      '-frames:v', '1', '-q:v', '2', thumbnailPath,
    ], { logger, event: 'render.thumbnail.failed' });
    const probe = runCommand(ffprobeBin, [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', outputPath,
    ], { logger, event: 'render.probe.failed' });
    const durationSeconds = Number(String(probe.stdout || '').trim());
    const stat = fs.statSync(outputPath);
    if (!stat.isFile() || stat.size < 1024) {
      throw new ContentOsError('Rendered video is empty', {
        code: 'RENDER_OUTPUT_INVALID',
        status: 500,
      });
    }
    const result = {
      outputPath,
      thumbnailPath,
      sha256: sha256File(outputPath),
      durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : content.durationSeconds,
      bytes: stat.size,
    };
    return store.completeRenderJob(job.id, job.leaseToken, result);
  } catch (error) {
    store.failRenderJob(job.id, job.leaseToken, error);
    throw error;
  }
}

module.exports = {
  CONTENT_STATUSES,
  JOB_STATUSES,
  ContentOsError,
  buildContentPlan,
  commandExists,
  createContentStore,
  createLogger,
  renderClaimedJob,
  validateCreateInput,
  validateMetricInput,
  wrapText,
};
