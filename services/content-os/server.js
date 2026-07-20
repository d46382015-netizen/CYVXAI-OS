'use strict';

const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { URL } = require('node:url');
const {
  ContentOsError,
  commandExists,
  createContentStore,
  createLogger,
} = require('./index');

const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_BODY_BYTES = 128 * 1024;

function isLoopback(host) {
  return ['127.0.0.1', 'localhost', '::1'].includes(String(host).toLowerCase());
}

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.mp4': 'video/mp4',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
  }[extension] || 'application/octet-stream';
}

function sendJson(res, status, payload, requestId) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'x-request-id': requestId,
  });
  res.end(body);
}

function sendError(res, error, requestId, logger) {
  const status = Number(error.status || 500);
  const safeStatus = status >= 400 && status <= 599 ? status : 500;
  const isOperational = error instanceof ContentOsError;
  logger.error('http.error', {
    requestId,
    status: safeStatus,
    code: error.code || 'INTERNAL_ERROR',
    message: error.message,
    stack: isOperational ? undefined : error.stack,
  });
  sendJson(res, safeStatus, {
    error: {
      code: error.code || 'INTERNAL_ERROR',
      message: isOperational ? error.message : 'Internal server error',
      details: isOperational ? error.details : null,
      requestId,
    },
  }, requestId);
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw new ContentOsError('Request body is too large', {
        code: 'PAYLOAD_TOO_LARGE',
        status: 413,
      });
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ContentOsError('Request body must contain valid JSON', {
      code: 'INVALID_JSON',
      status: 400,
    });
  }
}

function safeResolvedPath(root, relativePath) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(root, relativePath);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new ContentOsError('Invalid file path', {
      code: 'INVALID_PATH',
      status: 400,
    });
  }
  return resolved;
}

function streamFile(res, filePath, requestId) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new ContentOsError('File not found', { code: 'NOT_FOUND', status: 404 });
  }
  const stat = fs.statSync(filePath);
  res.writeHead(200, {
    'content-type': contentType(filePath),
    'content-length': stat.size,
    'cache-control': filePath.endsWith('.html') ? 'no-store' : 'private, max-age=300',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'same-origin',
    'x-request-id': requestId,
  });
  fs.createReadStream(filePath).pipe(res);
}

function createAuth({ host, apiToken, allowInsecureLocal }) {
  const localBypass = allowInsecureLocal && isLoopback(host);
  if (!localBypass && (!apiToken || apiToken.length < 32)) {
    throw new ContentOsError(
      'CONTENT_OS_API_TOKEN must contain at least 32 characters when the server is not explicitly local-only',
      { code: 'CONFIGURATION_ERROR', status: 500 },
    );
  }
  function authorize(req, url) {
    if (localBypass) return true;
    const authorization = req.headers.authorization || '';
    const bearer = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    const headerToken = req.headers['x-api-key'] || '';
    const queryToken = url.searchParams.get('access_token') || '';
    const candidate = bearer || headerToken || queryToken;
    const candidateBuffer = Buffer.from(candidate);
    const tokenBuffer = Buffer.from(apiToken);
    if (!candidate || candidateBuffer.length !== tokenBuffer.length) return false;
    return require('node:crypto').timingSafeEqual(candidateBuffer, tokenBuffer);
  }
  return { authorize, localBypass };
}

function enrichContentForHttp(content, requestUrl, tokenRequired) {
  if (!content) return content;
  const clone = JSON.parse(JSON.stringify(content));
  if (clone.renderJob?.outputPath) {
    const filename = path.basename(clone.renderJob.outputPath);
    clone.renderJob.mediaUrl = `/media/${encodeURIComponent(clone.id)}/${encodeURIComponent(filename)}`;
    if (tokenRequired) clone.renderJob.mediaUrl += '?access_token=__SESSION_TOKEN__';
  }
  if (clone.renderJob?.thumbnailPath) {
    const filename = path.basename(clone.renderJob.thumbnailPath);
    clone.renderJob.thumbnailUrl = `/media/${encodeURIComponent(clone.id)}/${encodeURIComponent(filename)}`;
    if (tokenRequired) clone.renderJob.thumbnailUrl += '?access_token=__SESSION_TOKEN__';
  }
  return clone;
}

async function startContentServer({
  host = process.env.CONTENT_OS_HOST || '127.0.0.1',
  port = Number(process.env.CONTENT_OS_PORT || 3050),
  dataDir = process.env.CONTENT_OS_DATA_DIR || path.join(os.homedir(), '.cyvx', 'content-os'),
  dbPath = process.env.CONTENT_OS_DB_PATH || path.join(dataDir, 'content-os.db'),
  apiToken = process.env.CONTENT_OS_API_TOKEN || '',
  allowInsecureLocal = process.env.CONTENT_OS_ALLOW_INSECURE_LOCAL === 'true',
  logger = null,
  store = null,
} = {}) {
  const runtimeLogger = logger || createLogger({
    service: 'content-os-api',
    logPath: path.join(dataDir, 'logs', 'api.jsonl'),
  });
  const runtimeStore = store || createContentStore({ dbPath, dataDir, logger: runtimeLogger });
  const ownsStore = !store;
  const auth = createAuth({ host, apiToken, allowInsecureLocal });

  const server = http.createServer(async (req, res) => {
    const requestId = req.headers['x-request-id'] || `req_${require('node:crypto').randomUUID()}`;
    const startedAt = Date.now();
    let url;
    try {
      url = new URL(req.url, `http://${req.headers.host || `${host}:${port}`}`);
      res.setHeader('content-security-policy', "default-src 'self'; img-src 'self' data:; media-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'");
      res.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()');

      if (req.method === 'GET' && url.pathname === '/health') {
        sendJson(res, 200, {
          ok: true,
          service: 'cyvx-content-os',
          database: path.basename(dbPath),
          ffmpeg: commandExists(process.env.FFMPEG_BIN || 'ffmpeg'),
          authMode: auth.localBypass ? 'local-bypass' : 'token',
          time: new Date().toISOString(),
        }, requestId);
        return;
      }

      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
        streamFile(res, path.join(PUBLIC_DIR, 'index.html'), requestId);
        return;
      }

      if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/media/')) {
        if (!auth.authorize(req, url)) {
          throw new ContentOsError('Authentication required', {
            code: 'UNAUTHORIZED',
            status: 401,
          });
        }
      }

      if (req.method === 'GET' && url.pathname === '/api/config') {
        sendJson(res, 200, {
          tokenRequired: !auth.localBypass,
          workerCommand: 'npm run content:worker',
          verifyCommand: 'npm run content:verify',
        }, requestId);
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/dashboard') {
        sendJson(res, 200, runtimeStore.dashboard(), requestId);
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/content') {
        const limit = Number(url.searchParams.get('limit') || 50);
        const items = runtimeStore.listContent(limit).map((item) => enrichContentForHttp(item, url, !auth.localBypass));
        sendJson(res, 200, { items }, requestId);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/content') {
        const body = await readJson(req);
        const item = runtimeStore.createContent(body, {
          idempotencyKey: req.headers['idempotency-key'] || null,
        });
        sendJson(res, 201, enrichContentForHttp(item, url, !auth.localBypass), requestId);
        return;
      }

      const contentMatch = url.pathname.match(/^\/api\/content\/([^/]+)$/);
      if (req.method === 'GET' && contentMatch) {
        const item = runtimeStore.getContent(decodeURIComponent(contentMatch[1]));
        sendJson(res, 200, enrichContentForHttp(item, url, !auth.localBypass), requestId);
        return;
      }

      const renderMatch = url.pathname.match(/^\/api\/content\/([^/]+)\/render$/);
      if (req.method === 'POST' && renderMatch) {
        const job = runtimeStore.queueRender(decodeURIComponent(renderMatch[1]));
        sendJson(res, 202, { job }, requestId);
        return;
      }

      const metricsMatch = url.pathname.match(/^\/api\/content\/([^/]+)\/metrics$/);
      if (req.method === 'POST' && metricsMatch) {
        const body = await readJson(req);
        const metric = runtimeStore.recordMetrics(decodeURIComponent(metricsMatch[1]), body);
        sendJson(res, 201, { metric }, requestId);
        return;
      }

      const eventsMatch = url.pathname.match(/^\/api\/content\/([^/]+)\/events$/);
      if (req.method === 'GET' && eventsMatch) {
        const events = runtimeStore.getEvents(decodeURIComponent(eventsMatch[1]));
        sendJson(res, 200, { events }, requestId);
        return;
      }

      const mediaMatch = url.pathname.match(/^\/media\/([^/]+)\/([^/]+)$/);
      if (req.method === 'GET' && mediaMatch) {
        const contentId = decodeURIComponent(mediaMatch[1]);
        const filename = path.basename(decodeURIComponent(mediaMatch[2]));
        const content = runtimeStore.getContent(contentId);
        const allowed = [
          content.renderJob?.outputPath,
          content.renderJob?.thumbnailPath,
        ].filter(Boolean).map((filePath) => path.resolve(filePath));
        const candidate = safeResolvedPath(path.join(dataDir, 'renders'), path.join(contentId, content.renderJob?.id || '', filename));
        if (!allowed.includes(candidate)) {
          throw new ContentOsError('Media file not found', { code: 'NOT_FOUND', status: 404 });
        }
        streamFile(res, candidate, requestId);
        return;
      }

      throw new ContentOsError('Route not found', { code: 'NOT_FOUND', status: 404 });
    } catch (error) {
      sendError(res, error, requestId, runtimeLogger);
    } finally {
      runtimeLogger.info('http.request', {
        requestId,
        method: req.method,
        path: url?.pathname || req.url,
        status: res.statusCode,
        durationMs: Date.now() - startedAt,
      });
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  const url = `http://${host.includes(':') ? `[${host}]` : host}:${actualPort}`;
  runtimeLogger.info('server.started', {
    host,
    port: actualPort,
    url,
    authMode: auth.localBypass ? 'local-bypass' : 'token',
    dbPath,
  });

  async function close() {
    await new Promise((resolve) => server.close(resolve));
    if (ownsStore) runtimeStore.close();
    runtimeLogger.info('server.stopped', { url });
  }

  return {
    server,
    store: runtimeStore,
    logger: runtimeLogger,
    url,
    close,
    authMode: auth.localBypass ? 'local-bypass' : 'token',
  };
}

async function main() {
  const instance = await startContentServer();
  const shutdown = async (signal) => {
    instance.logger.info('server.signal', { signal });
    await instance.close();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({
      ts: new Date().toISOString(),
      level: 'error',
      service: 'content-os-api',
      event: 'server.start_failed',
      error: error.message,
      code: error.code,
    })}\n`);
    process.exit(1);
  });
}

module.exports = {
  isLoopback,
  startContentServer,
};
