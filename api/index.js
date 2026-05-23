"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { WebSocketServer } = require("ws");
const { CyvxController } = require("../core/controller");
const { buildMetrics } = require("../core/metrics");
const { attribution, response } = require("../core/shared/attribution");

const UI_ROOT = path.join(__dirname, "..", "ui");
const BODY_LIMIT_BYTES = 1_048_576;

function wrap(data = {}, meta = {}) {
  return response("cyvx", data, meta);
}

function authorizeRaft(req, raftToken) {
  if (!raftToken) return false;
  const headerToken = String(req.headers["x-cyvx-raft-token"] || "").trim();
  const auth = String(req.headers.authorization || "").trim();
  return headerToken === raftToken || auth === ("Bearer " + raftToken);
}

function createApiServer(controller, options = {}) {
  const rateLimits = new Map();
  const apiKey = options.apiKey || process.env.CYVX_API_KEY || '';
  const maxPerMinute = Number(options.maxPerMinute || process.env.CYVX_RATE_LIMIT || 120);
  const logger = options.logger || console;

  const server = http.createServer(async (req, res) => {
    const requestId = crypto.randomUUID();
    setCommonHeaders(res, requestId);

    try {
      if (req.method === 'OPTIONS') {
        return sendText(res, 204, '');
      }

      const url = new URL(req.url || '/', 'http://localhost');

      if (url.pathname === '/healthz') {
        return sendJson(res, 200, wrap({ status: 'ok', requestId, uptime: process.uptime() }, { requestId }));
      }
      if (url.pathname === '/raft/health') {
        const raft = controller.raftHealth();
        return sendJson(res, raft.ready ? 200 : 503, wrap(raft, { requestId }));
      }
      if (url.pathname === '/raft/request-vote' && req.method === 'POST') {
        if (!authorizeRaft(req, raftToken)) {
          return sendJson(res, 401, wrap({ error: 'unauthorized' }, { requestId }));
        }
        const body = await readJson(req);
        const raft = controller.modules?.raft;
        if (!raft) {
          return sendJson(res, 503, wrap({ error: 'raft unavailable' }, { requestId }));
        }
        return sendJson(res, 200, raft.requestVote(body));
      }
      if (url.pathname === '/raft/append-entries' && req.method === 'POST') {
        if (!authorizeRaft(req, raftToken)) {
          return sendJson(res, 401, wrap({ error: 'unauthorized' }, { requestId }));
        }
        const body = await readJson(req);
        const raft = controller.modules?.raft;
        if (!raft) {
          return sendJson(res, 503, wrap({ error: 'raft unavailable' }, { requestId }));
        }
        return sendJson(res, 200, raft.appendEntries(body));
      }
      if (url.pathname === '/readyz') {
        const raft = controller.raftHealth();
        const ready = Boolean(raft.ready);
        return sendJson(res, ready ? 200 : 503, wrap({ status: ready ? 'ready' : 'degraded', raft, controller: controller.status() }, { requestId }));
      }

      if (serveUi(req, res)) {
        return;
      }

      if (!authorize(req, apiKey)) {
        return sendJson(res, 401, wrap({ error: 'unauthorized' }, { requestId }));
      }

      if (!rateLimit(req, rateLimits, maxPerMinute)) {
        return sendJson(res, 429, wrap({ error: 'rate limit exceeded' }, { requestId }));
      }

      if (url.pathname === '/healthz') {
        return sendJson(res, 200, wrap({ status: 'ok', requestId, uptime: process.uptime() }, { requestId }));
      }
      if (url.pathname === '/readyz') {
        return sendJson(res, 200, wrap({ status: 'ready', controller: controller.status() }, { requestId }));
      }
      if (url.pathname === '/status') {
        return sendJson(res, 200, wrap(controller.status(), { requestId }));
      }
      if (url.pathname === '/api/v1/state') {
        return sendJson(res, 200, wrap(controller.snapshot(), { requestId }));
      }
      if (url.pathname === '/api/v1/overview') {
        return sendJson(res, 200, wrap(controller.overview(), { requestId }));
      }
      if (url.pathname === '/api/v1/insights') {
        const overview = controller.overview();
        return sendJson(res, 200, wrap({ insights: overview.insights || controller.insights(), health: overview.health, generatedAt: new Date().toISOString() }, { requestId }));
      }
      if (url.pathname === '/api/v1/cluster') {
        return sendJson(res, 200, wrap(controller.snapshot().cluster, { requestId }));
      }
      if (url.pathname === '/api/v1/actions') {
        return sendJson(res, 200, wrap({ actions: controller.actions || [], count: (controller.actions || []).length }, { requestId }));
      }
      if (url.pathname === '/api/v1/workloads') {
        return sendJson(res, 200, wrap({ workloads: controller.snapshot().cluster.workloads || [] }, { requestId }));
      }
      if (url.pathname === '/api/v1/metrics/history') {
        return sendJson(res, 200, wrap({ history: controller.history(), count: controller.history().length }, { requestId }));
      }
      if (url.pathname === '/api/v1/audit') {
        return sendJson(res, 200, wrap({ audit: controller.auditLog(), count: controller.auditLog().length }, { requestId }));
      }
      if (url.pathname === '/api/v1/snapshots') {
        return sendJson(res, 200, wrap({ snapshots: controller.snapshots(), count: controller.snapshots().length }, { requestId }));
      }
      if (url.pathname === '/api/v1/replay') {
        const limit = Number(url.searchParams.get('limit') || 50);
        return sendJson(res, 200, wrap(controller.replay(limit), { requestId }));
      }
      if (url.pathname === '/api/v1/simulate/failure' && req.method === 'POST') {
        const body = await readJson(req);
        return sendJson(res, 200, wrap(controller.simulateFailure(body.kind || body.type || 'leader'), { requestId }));
      }
      if (url.pathname === '/api/v1/status-model') {
        return sendJson(res, 200, wrap(controller.statusModel.snapshot().data, { requestId }));
      }
      if (url.pathname === '/v1/agents') {
        return sendJson(res, 200, wrap({ agents: controller.agentsSnapshot() }, { requestId }));
      }
      if (url.pathname === '/v1/leaderboard') {
        return sendJson(res, 200, wrap({ leaderboard: controller.leaderboard() }, { requestId }));
      }
      if (url.pathname === '/v1/roadmap') {
        return sendJson(res, 200, wrap(controller.roadmap(), { requestId }));
      }
      if (url.pathname === '/api/v1/telemetry') {
        return sendJson(res, 200, wrap({
          metrics: buildMetrics(controller),
          status: controller.status(),
          overview: controller.overview(),
        }, { requestId }));
      }
      if (url.pathname === '/metrics') {
        return sendText(res, 200, buildMetrics(controller));
      }
      if (url.pathname === '/ask' && req.method === 'POST') {
        const body = await readJson(req);
        return sendJson(res, 200, wrap(await parseAsk(body, controller), { requestId }));
      }
      if (url.pathname === '/api/v1/command' && req.method === 'POST') {
        const body = await readJson(req);
        const result = await handleCommand(body, controller);
        logEvent(logger, 'command', {
          requestId,
          mode: result.mode,
          command: result.command,
          actionType: result.action?.type || null,
        });
        return sendJson(res, 200, wrap(result, { requestId }));
      }
      if (url.pathname === '/api/v1/workloads') {
        return sendJson(res, 200, wrap(await handleWorkloads(req, controller), { requestId }));
      }
      if (url.pathname === '/api/v1/actions') {
        return sendJson(res, 200, wrap(await handleActions(req, controller), { requestId }));
      }

      return sendJson(res, 404, wrap({ error: 'not found' }, { requestId }));
    } catch (error) {
      logEvent(logger, 'error', { requestId, error: error.message, stack: error.stack });
      return sendJson(res, 500, wrap({ error: error.message, requestId }, { requestId }));
    }
  });

  server.keepAliveTimeout = 5_000;
  server.headersTimeout = 65_000;
  server.requestTimeout = 60_000;

  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url || '/', 'http://localhost');
    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }
    if (!authorize(req, apiKey)) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => controller.registerSocket(ws));
  });

  return { server, wss };
}

function setCommonHeaders(res, requestId) {
  res.setHeader('x-request-id', requestId);
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'content-type, authorization, x-api-key, x-request-id');
  res.setHeader('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'no-referrer');
  res.setHeader('x-frame-options', 'DENY');
}

function serveUi(req, res) {
  const url = new URL(req.url || '/', 'http://localhost');
  const requestPath = url.pathname === '/' ? '/index.html' : url.pathname;
  const relative = requestPath.replace(/^\/+/, '');
  const filePath = path.resolve(UI_ROOT, relative);

  if (!filePath.startsWith(UI_ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return false;
  }

  const type = filePath.endsWith('.html')
    ? 'text/html; charset=utf-8'
    : filePath.endsWith('.css')
      ? 'text/css; charset=utf-8'
      : filePath.endsWith('.js')
        ? 'application/javascript; charset=utf-8'
        : filePath.endsWith('.json')
          ? 'application/json; charset=utf-8'
          : 'application/octet-stream';

  res.statusCode = 200;
  res.setHeader('content-type', type);
  if (filePath.endsWith('.html')) {
    res.setHeader('cache-control', 'no-store');
  } else {
    res.setHeader('cache-control', 'public, max-age=3600');
  }
  fs.createReadStream(filePath).pipe(res);
  return true;
}

async function parseAsk(body, controller) {
  const prompt = body.task || body.prompt || '';
  return controller.ask(prompt, body.context || body);
}

async function handleWorkloads(req, controller) {
  if (req.method === 'GET') {
    return { workloads: controller.snapshot().cluster.workloads || [] };
  }
  if (req.method === 'POST') {
    const body = await readJson(req);
    return controller.submitWorkload(body);
  }
  return { error: 'method not allowed' };
}

async function handleActions(req, controller) {
  if (req.method === 'GET') {
    return { actions: controller.actions || [] };
  }
  if (req.method === 'POST') {
    const body = await readJson(req);
    return controller.executeAction(body);
  }
  return { error: 'method not allowed' };
}

async function handleCommand(body, controller) {
  const command = String(body.command || body.task || body.prompt || '').trim();
  const mode = String(body.mode || body.intent || '').toLowerCase();
  const inferredAction = body.action && typeof body.action === 'object'
    ? body.action
    : inferAction(command, body);

  if (mode === 'ask' || body.ask === true || (!inferredAction && body.forceAsk !== false)) {
    const response = await Promise.resolve(controller.ask(command, body.context || body));
    return {
      mode: 'ask',
      command,
      response,
    };
  }

  const effectiveAction = inferredAction || body.action || {};
  const response = await Promise.resolve(controller.executeAction(effectiveAction));
  return {
    mode: 'action',
    command,
    action: effectiveAction,
    response,
  };
}

function inferAction(command, body = {}) {
  const normalized = String(command || '').trim().toLowerCase();
  if (!normalized) return null;

  if (normalized.includes('scale')) {
    const workloadId = pickIdentifier(body.workload_id || body.workloadId || body.target || body.id, normalized, /workload[-_ ]?[\w-]+/i, 'workload-1');
    const replicas = pickInteger(body.replicas || body.count || body.target_replicas, normalized, 2);
    const type = normalized.includes('down') || normalized.includes('reduce') ? 'scale_down' : 'scale_up';
    return { type, workload_id: workloadId, replicas };
  }

  if (normalized.includes('migrate')) {
    const workloadId = pickIdentifier(body.workload_id || body.workloadId || body.target || body.id, normalized, /workload[-_ ]?[\w-]+/i, 'workload-1');
    const targetNodeId = pickIdentifier(body.target_node_id || body.node_id || body.nodeId, normalized, /node[-_ ]?[\w-]+/i, 'node-1');
    return { type: 'migrate', workload_id: workloadId, target_node_id: targetNodeId };
  }

  if (normalized.includes('rebalance')) {
    return { type: 'rebalance', scope: body.scope || 'cluster' };
  }

  if (normalized.includes('cordon')) {
    return { type: 'cordon', node_id: pickIdentifier(body.node_id || body.nodeId, normalized, /node[-_ ]?[\w-]+/i, 'node-1') };
  }

  if (normalized.includes('drain')) {
    return { type: 'drain', node_id: pickIdentifier(body.node_id || body.nodeId, normalized, /node[-_ ]?[\w-]+/i, 'node-1') };
  }

  if (normalized.includes('inspect') || normalized.includes('diagnose')) {
    return { type: 'diagnose', target: body.target || 'cluster' };
  }

  if (normalized.includes('simulate') && normalized.includes('failure')) {
    const kind = normalized.includes('network') ? 'network' : normalized.includes('disk') ? 'disk' : 'leader';
    return { type: 'simulate_failure', kind };
  }

  return null;
}

function pickIdentifier(explicitValue, source, pattern, fallback) {
  if (explicitValue) return String(explicitValue);
  const match = String(source || '').match(pattern);
  return match ? match[0].replace(/\s+/g, '-') : fallback;
}

function pickInteger(explicitValue, source, fallback) {
  const direct = Number(explicitValue);
  if (Number.isFinite(direct) && direct > 0) return Math.floor(direct);
  const match = String(source || '').match(/(\d+)/);
  if (match) return Math.max(1, Number(match[1]));
  return fallback;
}

function logEvent(logger, level, payload) {
  if (!logger || typeof logger.log !== 'function') return;
  logger.log(JSON.stringify({
    level,
    at: new Date().toISOString(),
    product: attribution.product,
    ...payload,
  }));
}

function authorize(req, apiKey) {
  if (!apiKey) return true;
  const header = req.headers.authorization || req.headers['x-api-key'];
  if (!header) return false;
  if (header.startsWith('Bearer ')) {
    return header.slice(7) === apiKey;
  }
  return header === apiKey;
}

function rateLimit(req, rateLimits, maxPerMinute) {
  if (!maxPerMinute || maxPerMinute <= 0) return true;
  const key = req.socket.remoteAddress || 'local';
  const now = Date.now();
  const windowMs = 60_000;
  const history = rateLimits.get(key) || [];
  const recent = history.filter((timestamp) => now - timestamp < windowMs);
  recent.push(now);
  rateLimits.set(key, recent);
  return recent.length <= maxPerMinute;
}

async function readJson(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > BODY_LIMIT_BYTES) {
      throw new Error('request body too large');
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('invalid json body');
  }
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function sendText(res, status, payload) {
  res.statusCode = status;
  res.setHeader('content-type', 'text/plain; charset=utf-8');
  res.end(payload);
}

async function main() {
  const controller = new CyvxController({
    port: Number(process.env.CYVX_PORT || 3000),
    dbFile: process.env.CYVX_DB || undefined,
    version: require('../package.json').version,
  });
  await controller.boot();
  const { server } = createApiServer(controller, {});
  const port = Number(process.env.CYVX_PORT || 3000);
  const host = process.env.CYVX_HOST || '0.0.0.0';
  server.listen(port, host, () => {
    console.log(JSON.stringify({
      level: 'info',
      event: 'startup',
      at: new Date().toISOString(),
      listen: `http://${host}:${port}`,
      public: `http://127.0.0.1:${port}`,
      status: controller.status(),
    }));
  });
}

if (require.main === module) {
  main().catch((error) => {
    console.error(JSON.stringify({ level: 'error', event: 'startup-failed', at: new Date().toISOString(), error: error.message }));
    process.exit(1);
  });
}

module.exports = {
  createApiServer,
  handleCommand,
  inferAction,
  readJson,
  wrap,
};
