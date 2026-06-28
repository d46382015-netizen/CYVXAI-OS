import http from 'node:http';
import { readFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { resolve, join, extname, normalize } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import { URL } from 'node:url';

const ZERO_HASH = '0'.repeat(64);
const JSON_LIMIT = 1_000_000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 180;

function now() { return new Date().toISOString(); }
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
function cleanText(value, max = 240) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max);
}
function asCents(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}
function json(res, status, payload, extra = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    ...extra,
  });
  res.end(body);
}
function error(res, status, code, message, details) {
  json(res, status, { error: { code, message, ...(details ? { details } : {}) } });
}
async function readBody(req, raw = false) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > JSON_LIMIT) throw Object.assign(new Error('Body too large'), { statusCode: 413 });
    chunks.push(chunk);
  }
  const buf = Buffer.concat(chunks);
  if (raw) return buf;
  if (!buf.length) return {};
  try { return JSON.parse(buf.toString('utf8')); }
  catch { throw Object.assign(new Error('Invalid JSON body'), { statusCode: 400 }); }
}
function passwordRecord(password) {
  const salt = randomBytes(16).toString('hex');
  const digest = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${digest}`;
}
function passwordValid(password, record) {
  const [salt, digest] = String(record || '').split(':');
  if (!salt || !digest) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(digest, 'hex');
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}
function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 1) continue;
    out[trimmed.slice(0, idx)] = trimmed.slice(idx + 1).replace(/^['"]|['"]$/g, '');
  }
  return out;
}

export function createDatabase(dbPath) {
  mkdirSync(resolve(dbPath, '..'), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;
    PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('USER','ADMIN')),
      wallet_cents INTEGER NOT NULL DEFAULT 0 CHECK(wallet_cents >= 0),
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      sku TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      grade TEXT,
      cert_no TEXT,
      acquisition_cost_cents INTEGER NOT NULL CHECK(acquisition_cost_cents >= 0),
      market_value_cents INTEGER NOT NULL CHECK(market_value_cents >= 0),
      image_url TEXT,
      status TEXT NOT NULL CHECK(status IN ('IN_STOCK','OWNED','SHIP_REQUESTED','SHIPPED')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS packs (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      price_cents INTEGER NOT NULL CHECK(price_cents >= 0),
      status TEXT NOT NULL CHECK(status IN ('DRAFT','PUBLISHED','CLOSED')),
      commitment_hash TEXT,
      commitment_payload TEXT,
      server_seed TEXT,
      server_seed_hash TEXT,
      seed_revealed TEXT,
      draw_nonce INTEGER NOT NULL DEFAULT 0,
      total_slots INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      published_at TEXT,
      closed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS pack_items (
      pack_id TEXT NOT NULL REFERENCES packs(id) ON DELETE CASCADE,
      item_id TEXT NOT NULL REFERENCES items(id),
      drawn_at TEXT,
      draw_receipt_json TEXT,
      PRIMARY KEY(pack_id, item_id)
    );
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      pack_id TEXT NOT NULL REFERENCES packs(id),
      idempotency_key TEXT NOT NULL,
      client_seed TEXT NOT NULL,
      stripe_session_id TEXT UNIQUE,
      amount_cents INTEGER NOT NULL CHECK(amount_cents >= 0),
      payment_method TEXT NOT NULL CHECK(payment_method IN ('FREE','WALLET','STRIPE')),
      status TEXT NOT NULL CHECK(status IN ('PENDING','PAID','FULFILLED','CANCELED','REFUNDED')),
      created_at TEXT NOT NULL,
      paid_at TEXT,
      fulfilled_at TEXT,
      UNIQUE(user_id, idempotency_key)
    );
    CREATE TABLE IF NOT EXISTS ownerships (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      item_id TEXT NOT NULL REFERENCES items(id),
      order_id TEXT NOT NULL UNIQUE REFERENCES orders(id),
      status TEXT NOT NULL CHECK(status IN ('VAULTED','SHIP_REQUESTED','SHIPPED','SOLD_BACK')),
      acquired_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS buyback_offers (
      id TEXT PRIMARY KEY,
      ownership_id TEXT NOT NULL REFERENCES ownerships(id),
      offer_cents INTEGER NOT NULL CHECK(offer_cents >= 0),
      status TEXT NOT NULL CHECK(status IN ('OPEN','ACCEPTED','EXPIRED','CANCELED')),
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      accepted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS shipment_requests (
      id TEXT PRIMARY KEY,
      ownership_id TEXT NOT NULL UNIQUE REFERENCES ownerships(id),
      address_json TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('REQUESTED','PACKED','SHIPPED','CANCELED')),
      tracking_code TEXT,
      created_at TEXT NOT NULL,
      shipped_at TEXT
    );
    CREATE TABLE IF NOT EXISTS audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      actor_id TEXT,
      payload_json TEXT NOT NULL,
      prev_hash TEXT NOT NULL,
      event_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_items_status_category ON items(status, category);
    CREATE INDEX IF NOT EXISTS idx_pack_items_available ON pack_items(pack_id, drawn_at);
    CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ownerships_user ON ownerships(user_id, acquired_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_events(entity_type, entity_id, id);
  `);
  return db;
}

function appendAudit(db, eventType, entityType, entityId, actorId, payload = {}) {
  const previous = db.prepare('SELECT event_hash FROM audit_events ORDER BY id DESC LIMIT 1').get();
  const createdAt = now();
  const payloadJson = stable(payload);
  const prevHash = previous?.event_hash || ZERO_HASH;
  const eventHash = sha256(stable({ prevHash, eventType, entityType, entityId, actorId: actorId || null, payload: JSON.parse(payloadJson), createdAt }));
  db.prepare(`INSERT INTO audit_events
    (event_type, entity_type, entity_id, actor_id, payload_json, prev_hash, event_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(eventType, entityType, entityId, actorId || null, payloadJson, prevHash, eventHash, createdAt);
  return eventHash;
}
function verifyAudit(db) {
  const rows = db.prepare('SELECT * FROM audit_events ORDER BY id').all();
  let prev = ZERO_HASH;
  for (const row of rows) {
    if (row.prev_hash !== prev) return { valid: false, broken_at: row.id, reason: 'prev_hash_mismatch' };
    const computed = sha256(stable({
      prevHash: row.prev_hash,
      eventType: row.event_type,
      entityType: row.entity_type,
      entityId: row.entity_id,
      actorId: row.actor_id || null,
      payload: JSON.parse(row.payload_json),
      createdAt: row.created_at,
    }));
    if (computed !== row.event_hash) return { valid: false, broken_at: row.id, reason: 'event_hash_mismatch' };
    prev = row.event_hash;
  }
  return { valid: true, events: rows.length, head_hash: prev };
}
function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = fn(); db.exec('COMMIT'); return result; }
  catch (err) { try { db.exec('ROLLBACK'); } catch {} throw err; }
}
function createSession(db, userId) {
  const token = randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)')
    .run(sha256(token), userId, new Date(Date.now() + SESSION_TTL_MS).toISOString(), now());
  return token;
}
function publicUser(row) {
  return { id: row.id, email: row.email, role: row.role, wallet_cents: row.wallet_cents, created_at: row.created_at };
}
function authenticate(db, req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7);
  const row = db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at>?`).get(sha256(token), now());
  return row || null;
}
function requireUser(db, req, res) {
  const user = authenticate(db, req);
  if (!user) { error(res, 401, 'UNAUTHORIZED', 'Sign in required.'); return null; }
  return user;
}
function requireAdmin(db, req, res) {
  const user = requireUser(db, req, res);
  if (!user) return null;
  if (user.role !== 'ADMIN') { error(res, 403, 'FORBIDDEN', 'Administrator access required.'); return null; }
  return user;
}
function itemPublic(row) {
  return {
    id: row.id, sku: row.sku, category: row.category, title: row.title,
    grade: row.grade, cert_no: row.cert_no, market_value_cents: row.market_value_cents,
    image_url: row.image_url, status: row.status,
  };
}
function packView(db, row, includePool = false) {
  const remaining = db.prepare(`SELECT COUNT(*) count FROM pack_items pi JOIN items i ON i.id=pi.item_id
    WHERE pi.pack_id=? AND pi.drawn_at IS NULL AND i.status='IN_STOCK'`).get(row.id).count;
  const values = db.prepare(`SELECT MIN(i.market_value_cents) min_value, MAX(i.market_value_cents) max_value
    FROM pack_items pi JOIN items i ON i.id=pi.item_id WHERE pi.pack_id=?`).get(row.id);
  const out = {
    id: row.id, slug: row.slug, name: row.name, description: row.description,
    category: row.category, price_cents: row.price_cents, status: row.status,
    commitment_hash: row.commitment_hash, server_seed_hash: row.server_seed_hash,
    seed_revealed: row.seed_revealed, total_slots: row.total_slots,
    remaining_slots: Number(remaining), min_value_cents: values.min_value || 0,
    max_value_cents: values.max_value || 0, published_at: row.published_at,
  };
  if (includePool) {
    out.pool = db.prepare(`SELECT i.id,i.sku,i.category,i.title,i.grade,i.cert_no,i.market_value_cents,i.image_url,
      CASE WHEN pi.drawn_at IS NULL THEN 1 ELSE 0 END available
      FROM pack_items pi JOIN items i ON i.id=pi.item_id WHERE pi.pack_id=? ORDER BY i.market_value_cents DESC, i.id`).all(row.id);
  }
  return out;
}
function publishPack(db, packId, actorId) {
  return transaction(db, () => {
    const pack = db.prepare('SELECT * FROM packs WHERE id=?').get(packId);
    if (!pack) throw Object.assign(new Error('Pack not found'), { statusCode: 404 });
    if (pack.status !== 'DRAFT') throw Object.assign(new Error('Only draft packs can be published'), { statusCode: 409 });
    const items = db.prepare(`SELECT i.id,i.sku,i.title,i.category,i.grade,i.cert_no,i.market_value_cents
      FROM pack_items pi JOIN items i ON i.id=pi.item_id
      WHERE pi.pack_id=? AND i.status='IN_STOCK' ORDER BY i.id`).all(packId);
    if (items.length < 2) throw Object.assign(new Error('A pack requires at least two in-stock items'), { statusCode: 409 });
    const serverSeed = randomBytes(32).toString('hex');
    const serverSeedHash = sha256(serverSeed);
    const payload = {
      version: 1,
      pack_id: pack.id,
      slug: pack.slug,
      price_cents: pack.price_cents,
      server_seed_hash: serverSeedHash,
      items: items.map((i) => ({ id: i.id, sku: i.sku, title: i.title, grade: i.grade, cert_no: i.cert_no, market_value_cents: i.market_value_cents })),
    };
    const commitmentHash = sha256(stable(payload));
    const publishedAt = now();
    db.prepare(`UPDATE packs SET status='PUBLISHED', commitment_hash=?, commitment_payload=?, server_seed=?,
      server_seed_hash=?, total_slots=?, published_at=? WHERE id=?`)
      .run(commitmentHash, stable(payload), serverSeed, serverSeedHash, items.length, publishedAt, pack.id);
    appendAudit(db, 'PACK_PUBLISHED', 'PACK', pack.id, actorId, { commitment_hash: commitmentHash, server_seed_hash: serverSeedHash, slots: items.length });
    return packView(db, db.prepare('SELECT * FROM packs WHERE id=?').get(pack.id), true);
  });
}
function allocateOrder(db, orderId, actorId = null) {
  return transaction(db, () => {
    const order = db.prepare('SELECT * FROM orders WHERE id=?').get(orderId);
    if (!order) throw Object.assign(new Error('Order not found'), { statusCode: 404 });
    if (order.status === 'FULFILLED') {
      const owned = db.prepare(`SELECT o.*,i.sku,i.title,i.category,i.grade,i.cert_no,i.market_value_cents,i.image_url,
        pi.draw_receipt_json FROM ownerships o JOIN items i ON i.id=o.item_id
        JOIN pack_items pi ON pi.item_id=i.id AND pi.pack_id=? WHERE o.order_id=?`).get(order.pack_id, order.id);
      return { order, ownership: owned, receipt: JSON.parse(owned.draw_receipt_json) };
    }
    if (order.status !== 'PAID') throw Object.assign(new Error('Order is not paid'), { statusCode: 409 });
    const pack = db.prepare('SELECT * FROM packs WHERE id=?').get(order.pack_id);
    if (!pack || pack.status !== 'PUBLISHED') throw Object.assign(new Error('Pack is not open'), { statusCode: 409 });
    const available = db.prepare(`SELECT i.* FROM pack_items pi JOIN items i ON i.id=pi.item_id
      WHERE pi.pack_id=? AND pi.drawn_at IS NULL AND i.status='IN_STOCK' ORDER BY i.id`).all(pack.id);
    if (!available.length) throw Object.assign(new Error('Pack is sold out'), { statusCode: 409 });
    const poolBeforeHash = sha256(stable(available.map((i) => i.id)));
    const nonce = pack.draw_nonce;
    const digest = createHmac('sha256', pack.server_seed)
      .update(`${pack.id}|${order.id}|${nonce}|${order.client_seed}|${poolBeforeHash}`)
      .digest('hex');
    const index = Number(BigInt(`0x${digest.slice(0, 16)}`) % BigInt(available.length));
    const selected = available[index];
    const acquiredAt = now();
    const ownershipId = randomUUID();
    const receipt = {
      version: 1,
      order_id: order.id,
      pack_id: pack.id,
      commitment_hash: pack.commitment_hash,
      server_seed_hash: pack.server_seed_hash,
      client_seed: order.client_seed,
      nonce,
      pool_before_hash: poolBeforeHash,
      remaining_before: available.length,
      draw_digest: digest,
      selected_item_id: selected.id,
      selected_sku: selected.sku,
      created_at: acquiredAt,
    };
    db.prepare('UPDATE pack_items SET drawn_at=?,draw_receipt_json=? WHERE pack_id=? AND item_id=? AND drawn_at IS NULL')
      .run(acquiredAt, stable(receipt), pack.id, selected.id);
    db.prepare("UPDATE items SET status='OWNED',updated_at=? WHERE id=? AND status='IN_STOCK'").run(acquiredAt, selected.id);
    db.prepare(`INSERT INTO ownerships(id,user_id,item_id,order_id,status,acquired_at,updated_at)
      VALUES(?,?,?,?,?,?,?)`).run(ownershipId, order.user_id, selected.id, order.id, 'VAULTED', acquiredAt, acquiredAt);
    db.prepare("UPDATE orders SET status='FULFILLED',fulfilled_at=? WHERE id=?").run(acquiredAt, order.id);
    db.prepare('UPDATE packs SET draw_nonce=draw_nonce+1 WHERE id=?').run(pack.id);
    const remaining = db.prepare(`SELECT COUNT(*) count FROM pack_items pi JOIN items i ON i.id=pi.item_id
      WHERE pi.pack_id=? AND pi.drawn_at IS NULL AND i.status='IN_STOCK'`).get(pack.id).count;
    if (!remaining) {
      db.prepare("UPDATE packs SET status='CLOSED',closed_at=?,seed_revealed=? WHERE id=?")
        .run(acquiredAt, pack.server_seed, pack.id);
      appendAudit(db, 'PACK_CLOSED', 'PACK', pack.id, actorId || order.user_id, { seed_revealed: pack.server_seed });
    }
    appendAudit(db, 'ITEM_ALLOCATED', 'ORDER', order.id, actorId || order.user_id, receipt);
    const ownership = db.prepare(`SELECT o.*,i.sku,i.title,i.category,i.grade,i.cert_no,i.market_value_cents,i.image_url
      FROM ownerships o JOIN items i ON i.id=o.item_id WHERE o.id=?`).get(ownershipId);
    return { order: db.prepare('SELECT * FROM orders WHERE id=?').get(order.id), ownership, receipt };
  });
}

function originFor(req, env) {
  if (env.PUBLIC_ORIGIN) return env.PUBLIC_ORIGIN.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}
async function stripeRequest(env, method, path, body) {
  if (!env.STRIPE_SECRET_KEY) throw Object.assign(new Error('Stripe is not configured'), { statusCode: 503 });
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      ...(body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: body ? new URLSearchParams(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data?.error?.message || 'Stripe request failed'), { statusCode: 502 });
  return data;
}
function verifyStripeSignature(raw, signatureHeader, secret, toleranceSeconds = 300) {
  if (!signatureHeader || !secret) return false;
  const parts = Object.fromEntries(signatureHeader.split(',').map((part) => part.split('=', 2)));
  const timestamp = Number(parts.t);
  const signature = parts.v1;
  if (!timestamp || !signature || Math.abs(Date.now() / 1000 - timestamp) > toleranceSeconds) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.${raw.toString('utf8')}`).digest('hex');
  const a = Buffer.from(signature, 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createApp(options = {}) {
  const fileEnv = parseEnvFile(options.envFile || resolve('.env'));
  const env = { ...fileEnv, ...process.env, ...(options.env || {}) };
  const dataDir = resolve(options.dataDir || env.DATA_DIR || './data');
  const publicDir = resolve(options.publicDir || './public');
  mkdirSync(dataDir, { recursive: true });
  const db = createDatabase(join(dataDir, 'cyvx-vault.sqlite'));
  const buybackBps = Math.max(0, Math.min(10_000, Number(env.BUYBACK_BPS || 8500)));
  const rate = new Map();

  if (env.ADMIN_EMAIL && env.ADMIN_PASSWORD) {
    const email = env.ADMIN_EMAIL.trim().toLowerCase();
    if (!db.prepare('SELECT id FROM users WHERE email=?').get(email)) {
      const id = randomUUID();
      db.prepare('INSERT INTO users(id,email,password_hash,role,wallet_cents,created_at) VALUES(?,?,?,?,0,?)')
        .run(id, email, passwordRecord(env.ADMIN_PASSWORD), 'ADMIN', now());
      appendAudit(db, 'ADMIN_BOOTSTRAPPED', 'USER', id, id, { email });
    }
  }

  async function handler(req, res) {
    const requestId = randomUUID();
    const started = Date.now();
    res.setHeader('x-request-id', requestId);
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('x-frame-options', 'DENY');
    res.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
    res.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('content-security-policy', "default-src 'self'; img-src 'self' https: data:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'local').split(',')[0].trim();
    const bucket = rate.get(ip) || { start: Date.now(), count: 0 };
    if (Date.now() - bucket.start > RATE_WINDOW_MS) { bucket.start = Date.now(); bucket.count = 0; }
    bucket.count += 1; rate.set(ip, bucket);
    if (bucket.count > RATE_MAX) return error(res, 429, 'RATE_LIMITED', 'Too many requests.');

    const url = new URL(req.url, 'http://local');
    const path = url.pathname;
    const method = req.method || 'GET';
    const done = (status) => console.log(JSON.stringify({ level: 'info', time: now(), request_id: requestId, method, path, status, duration_ms: Date.now() - started }));
    res.on('finish', () => done(res.statusCode));

    try {
      if (method === 'GET' && path === '/api/health') {
        return json(res, 200, { ok: true, service: 'cyvx-vault', version: '0.1.0', time: now(), audit: verifyAudit(db) });
      }
      if (method === 'POST' && path === '/api/auth/register') {
        const body = await readBody(req);
        const email = cleanText(body.email, 254).toLowerCase();
        const password = typeof body.password === 'string' ? body.password : '';
        if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 10) return error(res, 400, 'INVALID_INPUT', 'Use a valid email and a password of at least 10 characters.');
        if (db.prepare('SELECT id FROM users WHERE email=?').get(email)) return error(res, 409, 'EMAIL_EXISTS', 'An account already exists for this email.');
        const id = randomUUID();
        db.prepare('INSERT INTO users(id,email,password_hash,role,wallet_cents,created_at) VALUES(?,?,?,?,0,?)')
          .run(id, email, passwordRecord(password), 'USER', now());
        appendAudit(db, 'USER_REGISTERED', 'USER', id, id, { email });
        const token = createSession(db, id);
        return json(res, 201, { token, user: publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(id)) });
      }
      if (method === 'POST' && path === '/api/auth/login') {
        const body = await readBody(req);
        const email = cleanText(body.email, 254).toLowerCase();
        const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
        if (!user || !passwordValid(String(body.password || ''), user.password_hash)) return error(res, 401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
        const token = createSession(db, user.id);
        appendAudit(db, 'USER_LOGGED_IN', 'USER', user.id, user.id, {});
        return json(res, 200, { token, user: publicUser(user) });
      }
      if (method === 'POST' && path === '/api/auth/logout') {
        const user = requireUser(db, req, res); if (!user) return;
        db.prepare('DELETE FROM sessions WHERE token_hash=?').run(sha256((req.headers.authorization || '').slice(7)));
        return json(res, 200, { ok: true });
      }
      if (method === 'GET' && path === '/api/me') {
        const user = requireUser(db, req, res); if (!user) return;
        return json(res, 200, { user: publicUser(user) });
      }
      if (method === 'GET' && path === '/api/packs') {
        const rows = db.prepare("SELECT * FROM packs WHERE status IN ('PUBLISHED','CLOSED') ORDER BY published_at DESC").all();
        return json(res, 200, { packs: rows.map((p) => packView(db, p, false)) });
      }
      const packMatch = path.match(/^\/api\/packs\/([^/]+)$/);
      if (method === 'GET' && packMatch) {
        const row = db.prepare('SELECT * FROM packs WHERE slug=? OR id=?').get(decodeURIComponent(packMatch[1]), decodeURIComponent(packMatch[1]));
        if (!row || row.status === 'DRAFT') return error(res, 404, 'NOT_FOUND', 'Pack not found.');
        return json(res, 200, { pack: packView(db, row, true) });
      }
      if (method === 'GET' && path === '/api/vault') {
        const user = requireUser(db, req, res); if (!user) return;
        const rows = db.prepare(`SELECT o.*,i.sku,i.title,i.category,i.grade,i.cert_no,i.market_value_cents,i.image_url,
          p.name pack_name,pi.draw_receipt_json
          FROM ownerships o JOIN items i ON i.id=o.item_id JOIN orders ord ON ord.id=o.order_id
          JOIN packs p ON p.id=ord.pack_id JOIN pack_items pi ON pi.pack_id=p.id AND pi.item_id=i.id
          WHERE o.user_id=? ORDER BY o.acquired_at DESC`).all(user.id);
        return json(res, 200, { ownerships: rows.map((r) => ({ ...r, receipt: JSON.parse(r.draw_receipt_json), draw_receipt_json: undefined })) });
      }
      if (method === 'POST' && path === '/api/checkout') {
        const user = requireUser(db, req, res); if (!user) return;
        const body = await readBody(req);
        const pack = db.prepare("SELECT * FROM packs WHERE id=? AND status='PUBLISHED'").get(cleanText(body.pack_id, 80));
        if (!pack) return error(res, 404, 'PACK_UNAVAILABLE', 'Pack is unavailable.');
        const key = cleanText(req.headers['idempotency-key'] || body.idempotency_key, 120);
        if (key.length < 8) return error(res, 400, 'IDEMPOTENCY_REQUIRED', 'Provide an Idempotency-Key of at least 8 characters.');
        const existing = db.prepare('SELECT * FROM orders WHERE user_id=? AND idempotency_key=?').get(user.id, key);
        if (existing) {
          const owned = db.prepare(`SELECT o.*,i.* FROM ownerships o JOIN items i ON i.id=o.item_id WHERE o.order_id=?`).get(existing.id);
          return json(res, 200, { order: existing, ownership: owned || null, idempotent_replay: true });
        }
        const remaining = db.prepare(`SELECT COUNT(*) count FROM pack_items pi JOIN items i ON i.id=pi.item_id
          WHERE pi.pack_id=? AND pi.drawn_at IS NULL AND i.status='IN_STOCK'`).get(pack.id).count;
        if (!remaining) return error(res, 409, 'SOLD_OUT', 'This pack is sold out.');
        const clientSeed = cleanText(body.client_seed, 120) || randomBytes(16).toString('hex');
        const orderId = randomUUID();
        let methodName = 'STRIPE';
        if (pack.price_cents === 0) {
          const priorFree = db.prepare(`SELECT id FROM orders WHERE user_id=? AND pack_id=? AND amount_cents=0 AND status IN ('PAID','FULFILLED')`).get(user.id, pack.id);
          if (priorFree) return error(res, 409, 'FREE_CLAIM_USED', 'This free pack has already been claimed by this account.');
          methodName = 'FREE';
        } else if (user.wallet_cents >= pack.price_cents && body.payment_method === 'WALLET') {
          methodName = 'WALLET';
        } else if (String(env.PAID_PACKS_ENABLED).toLowerCase() !== 'true') {
          return error(res, 503, 'PAID_PACKS_DISABLED', 'Paid packs remain disabled until legal and payment-provider approval is complete.');
        }
        const createdAt = now();
        if (methodName === 'FREE' || methodName === 'WALLET') {
          transaction(db, () => {
            if (methodName === 'WALLET') {
              const result = db.prepare('UPDATE users SET wallet_cents=wallet_cents-? WHERE id=? AND wallet_cents>=?')
                .run(pack.price_cents, user.id, pack.price_cents);
              if (result.changes !== 1) throw Object.assign(new Error('Insufficient wallet balance'), { statusCode: 409 });
            }
            db.prepare(`INSERT INTO orders(id,user_id,pack_id,idempotency_key,client_seed,amount_cents,payment_method,status,created_at,paid_at)
              VALUES(?,?,?,?,?,?,?,?,?,?)`).run(orderId, user.id, pack.id, key, clientSeed, pack.price_cents, methodName, 'PAID', createdAt, createdAt);
            appendAudit(db, 'ORDER_PAID', 'ORDER', orderId, user.id, { amount_cents: pack.price_cents, payment_method: methodName });
          });
          const fulfilled = allocateOrder(db, orderId, user.id);
          return json(res, 201, fulfilled);
        }
        db.prepare(`INSERT INTO orders(id,user_id,pack_id,idempotency_key,client_seed,amount_cents,payment_method,status,created_at)
          VALUES(?,?,?,?,?,?,?,?,?)`).run(orderId, user.id, pack.id, key, clientSeed, pack.price_cents, 'STRIPE', 'PENDING', createdAt);
        const origin = originFor(req, env);
        const session = await stripeRequest(env, 'POST', '/checkout/sessions', {
          mode: 'payment',
          success_url: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${origin}/?checkout=cancel`,
          client_reference_id: orderId,
          customer_email: user.email,
          'line_items[0][price_data][currency]': 'usd',
          'line_items[0][price_data][product_data][name]': pack.name,
          'line_items[0][price_data][unit_amount]': String(pack.price_cents),
          'line_items[0][quantity]': '1',
          'metadata[order_id]': orderId,
        });
        db.prepare('UPDATE orders SET stripe_session_id=? WHERE id=?').run(session.id, orderId);
        appendAudit(db, 'CHECKOUT_CREATED', 'ORDER', orderId, user.id, { stripe_session_id: session.id, amount_cents: pack.price_cents });
        return json(res, 201, { order_id: orderId, checkout_url: session.url });
      }
      if (method === 'GET' && path === '/api/checkout/complete') {
        const user = requireUser(db, req, res); if (!user) return;
        const sessionId = cleanText(url.searchParams.get('session_id'), 120);
        const order = db.prepare('SELECT * FROM orders WHERE stripe_session_id=? AND user_id=?').get(sessionId, user.id);
        if (!order) return error(res, 404, 'ORDER_NOT_FOUND', 'Checkout order not found.');
        if (order.status === 'FULFILLED') return json(res, 200, allocateOrder(db, order.id, user.id));
        const session = await stripeRequest(env, 'GET', `/checkout/sessions/${encodeURIComponent(sessionId)}`);
        if (session.payment_status !== 'paid' || session.client_reference_id !== order.id) return error(res, 409, 'PAYMENT_NOT_CONFIRMED', 'Payment is not confirmed.');
        transaction(db, () => {
          db.prepare("UPDATE orders SET status='PAID',paid_at=? WHERE id=? AND status='PENDING'").run(now(), order.id);
          appendAudit(db, 'ORDER_PAID', 'ORDER', order.id, user.id, { amount_cents: order.amount_cents, payment_method: 'STRIPE', stripe_session_id: sessionId });
        });
        return json(res, 200, allocateOrder(db, order.id, user.id));
      }
      if (method === 'POST' && path === '/webhooks/stripe') {
        const raw = await readBody(req, true);
        if (!verifyStripeSignature(raw, req.headers['stripe-signature'], env.STRIPE_WEBHOOK_SECRET)) return error(res, 400, 'INVALID_SIGNATURE', 'Invalid Stripe signature.');
        const event = JSON.parse(raw.toString('utf8'));
        if (event.type === 'checkout.session.completed') {
          const session = event.data.object;
          const order = db.prepare('SELECT * FROM orders WHERE stripe_session_id=?').get(session.id);
          if (order && session.payment_status === 'paid' && order.status === 'PENDING') {
            transaction(db, () => {
              db.prepare("UPDATE orders SET status='PAID',paid_at=? WHERE id=? AND status='PENDING'").run(now(), order.id);
              appendAudit(db, 'ORDER_PAID', 'ORDER', order.id, order.user_id, { amount_cents: order.amount_cents, payment_method: 'STRIPE', stripe_session_id: session.id });
            });
            allocateOrder(db, order.id, order.user_id);
          }
        }
        return json(res, 200, { received: true });
      }
      const buybackMatch = path.match(/^\/api\/ownerships\/([^/]+)\/buyback$/);
      if (method === 'POST' && buybackMatch) {
        const user = requireUser(db, req, res); if (!user) return;
        const owned = db.prepare(`SELECT o.*,i.market_value_cents FROM ownerships o JOIN items i ON i.id=o.item_id
          WHERE o.id=? AND o.user_id=? AND o.status='VAULTED'`).get(buybackMatch[1], user.id);
        if (!owned) return error(res, 404, 'OWNERSHIP_NOT_FOUND', 'Vaulted item not found.');
        db.prepare("UPDATE buyback_offers SET status='EXPIRED' WHERE ownership_id=? AND status='OPEN'").run(owned.id);
        const offer = {
          id: randomUUID(), ownership_id: owned.id,
          offer_cents: Math.floor(owned.market_value_cents * buybackBps / 10_000),
          status: 'OPEN', expires_at: new Date(Date.now() + 15 * 60_000).toISOString(), created_at: now(),
        };
        db.prepare(`INSERT INTO buyback_offers(id,ownership_id,offer_cents,status,expires_at,created_at)
          VALUES(?,?,?,?,?,?)`).run(offer.id, offer.ownership_id, offer.offer_cents, offer.status, offer.expires_at, offer.created_at);
        appendAudit(db, 'BUYBACK_OFFERED', 'OWNERSHIP', owned.id, user.id, { offer_id: offer.id, offer_cents: offer.offer_cents, expires_at: offer.expires_at });
        return json(res, 201, { offer });
      }
      const acceptMatch = path.match(/^\/api\/buybacks\/([^/]+)\/accept$/);
      if (method === 'POST' && acceptMatch) {
        const user = requireUser(db, req, res); if (!user) return;
        const result = transaction(db, () => {
          const offer = db.prepare(`SELECT b.*,o.user_id,o.item_id,o.status ownership_status FROM buyback_offers b
            JOIN ownerships o ON o.id=b.ownership_id WHERE b.id=? AND o.user_id=?`).get(acceptMatch[1], user.id);
          if (!offer || offer.status !== 'OPEN' || offer.ownership_status !== 'VAULTED') throw Object.assign(new Error('Buyback offer unavailable'), { statusCode: 409 });
          if (Date.parse(offer.expires_at) <= Date.now()) {
            db.prepare("UPDATE buyback_offers SET status='EXPIRED' WHERE id=?").run(offer.id);
            throw Object.assign(new Error('Buyback offer expired'), { statusCode: 409 });
          }
          const acceptedAt = now();
          db.prepare("UPDATE buyback_offers SET status='ACCEPTED',accepted_at=? WHERE id=?").run(acceptedAt, offer.id);
          db.prepare("UPDATE ownerships SET status='SOLD_BACK',updated_at=? WHERE id=?").run(acceptedAt, offer.ownership_id);
          db.prepare("UPDATE items SET status='IN_STOCK',updated_at=? WHERE id=?").run(acceptedAt, offer.item_id);
          db.prepare('UPDATE users SET wallet_cents=wallet_cents+? WHERE id=?').run(offer.offer_cents, user.id);
          appendAudit(db, 'BUYBACK_ACCEPTED', 'OWNERSHIP', offer.ownership_id, user.id, { offer_id: offer.id, wallet_credit_cents: offer.offer_cents });
          return { wallet_cents: db.prepare('SELECT wallet_cents FROM users WHERE id=?').get(user.id).wallet_cents };
        });
        return json(res, 200, result);
      }
      const shipMatch = path.match(/^\/api\/ownerships\/([^/]+)\/ship$/);
      if (method === 'POST' && shipMatch) {
        const user = requireUser(db, req, res); if (!user) return;
        const body = await readBody(req);
        const address = {
          name: cleanText(body.name, 120), line1: cleanText(body.line1, 160), line2: cleanText(body.line2, 160),
          city: cleanText(body.city, 100), state: cleanText(body.state, 80), postal_code: cleanText(body.postal_code, 24),
          country: cleanText(body.country || 'US', 2).toUpperCase(),
        };
        if (!address.name || !address.line1 || !address.city || !address.state || !address.postal_code || !/^[A-Z]{2}$/.test(address.country)) {
          return error(res, 400, 'INVALID_ADDRESS', 'Complete all required shipping address fields.');
        }
        const owned = db.prepare("SELECT * FROM ownerships WHERE id=? AND user_id=? AND status='VAULTED'").get(shipMatch[1], user.id);
        if (!owned) return error(res, 404, 'OWNERSHIP_NOT_FOUND', 'Vaulted item not found.');
        const shipmentId = randomUUID(); const createdAt = now();
        transaction(db, () => {
          db.prepare(`INSERT INTO shipment_requests(id,ownership_id,address_json,status,created_at) VALUES(?,?,?,?,?)`)
            .run(shipmentId, owned.id, stable(address), 'REQUESTED', createdAt);
          db.prepare("UPDATE ownerships SET status='SHIP_REQUESTED',updated_at=? WHERE id=?").run(createdAt, owned.id);
          db.prepare("UPDATE items SET status='SHIP_REQUESTED',updated_at=? WHERE id=?").run(createdAt, owned.item_id);
          appendAudit(db, 'SHIPMENT_REQUESTED', 'OWNERSHIP', owned.id, user.id, { shipment_id: shipmentId, country: address.country, postal_code: address.postal_code });
        });
        return json(res, 201, { shipment: { id: shipmentId, status: 'REQUESTED', created_at: createdAt } });
      }

      if (method === 'GET' && path === '/api/admin/items') {
        const admin = requireAdmin(db, req, res); if (!admin) return;
        return json(res, 200, { items: db.prepare('SELECT * FROM items ORDER BY created_at DESC').all() });
      }
      if (method === 'POST' && path === '/api/admin/items') {
        const admin = requireAdmin(db, req, res); if (!admin) return;
        const body = await readBody(req);
        const item = {
          id: randomUUID(), sku: cleanText(body.sku, 80).toUpperCase(), category: cleanText(body.category, 80).toUpperCase(),
          title: cleanText(body.title, 180), grade: cleanText(body.grade, 80) || null, cert_no: cleanText(body.cert_no, 100) || null,
          acquisition_cost_cents: asCents(body.acquisition_cost_cents), market_value_cents: asCents(body.market_value_cents),
          image_url: cleanText(body.image_url, 1000) || null,
        };
        if (!item.sku || !item.category || !item.title || item.acquisition_cost_cents === null || item.market_value_cents === null) {
          return error(res, 400, 'INVALID_INPUT', 'SKU, category, title, acquisition cost, and market value are required.');
        }
        const createdAt = now();
        try {
          db.prepare(`INSERT INTO items(id,sku,category,title,grade,cert_no,acquisition_cost_cents,market_value_cents,image_url,status,created_at,updated_at)
            VALUES(?,?,?,?,?,?,?,?,?,'IN_STOCK',?,?)`).run(item.id, item.sku, item.category, item.title, item.grade, item.cert_no,
              item.acquisition_cost_cents, item.market_value_cents, item.image_url, createdAt, createdAt);
        } catch (e) {
          if (String(e.message).includes('UNIQUE')) return error(res, 409, 'SKU_EXISTS', 'SKU already exists.');
          throw e;
        }
        appendAudit(db, 'ITEM_INTAKE', 'ITEM', item.id, admin.id, { sku: item.sku, category: item.category, market_value_cents: item.market_value_cents });
        return json(res, 201, { item: itemPublic(db.prepare('SELECT * FROM items WHERE id=?').get(item.id)) });
      }
      if (method === 'GET' && path === '/api/admin/packs') {
        const admin = requireAdmin(db, req, res); if (!admin) return;
        return json(res, 200, { packs: db.prepare('SELECT * FROM packs ORDER BY created_at DESC').all().map((p) => packView(db, p, true)) });
      }
      if (method === 'POST' && path === '/api/admin/packs') {
        const admin = requireAdmin(db, req, res); if (!admin) return;
        const body = await readBody(req);
        const category = cleanText(body.category, 80).toUpperCase();
        const name = cleanText(body.name, 120);
        const slug = cleanText(body.slug, 80).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        const description = cleanText(body.description, 500);
        const price = asCents(body.price_cents);
        if (!category || !name || !slug || price === null) return error(res, 400, 'INVALID_INPUT', 'Name, slug, category, and price are required.');
        const available = db.prepare(`SELECT i.id FROM items i WHERE i.status='IN_STOCK' AND i.category=?
          AND NOT EXISTS (SELECT 1 FROM pack_items pi JOIN packs p ON p.id=pi.pack_id
            WHERE pi.item_id=i.id AND p.status IN ('DRAFT','PUBLISHED')) ORDER BY i.created_at`).all(category);
        if (available.length < 2) return error(res, 409, 'INSUFFICIENT_INVENTORY', 'At least two unassigned in-stock items are required in this category.');
        const id = randomUUID(); const createdAt = now();
        transaction(db, () => {
          db.prepare(`INSERT INTO packs(id,slug,name,description,category,price_cents,status,created_at)
            VALUES(?,?,?,?,?,?,'DRAFT',?)`).run(id, slug, name, description, category, price, createdAt);
          const insert = db.prepare('INSERT INTO pack_items(pack_id,item_id) VALUES(?,?)');
          for (const item of available) insert.run(id, item.id);
          appendAudit(db, 'PACK_CREATED', 'PACK', id, admin.id, { slug, category, price_cents: price, slots: available.length });
        });
        return json(res, 201, { pack: packView(db, db.prepare('SELECT * FROM packs WHERE id=?').get(id), true) });
      }
      const publishMatch = path.match(/^\/api\/admin\/packs\/([^/]+)\/publish$/);
      if (method === 'POST' && publishMatch) {
        const admin = requireAdmin(db, req, res); if (!admin) return;
        return json(res, 200, { pack: publishPack(db, publishMatch[1], admin.id) });
      }
      if (method === 'GET' && path === '/api/admin/audit/verify') {
        const admin = requireAdmin(db, req, res); if (!admin) return;
        return json(res, 200, verifyAudit(db));
      }
      if (method === 'GET' && path === '/api/admin/shipments') {
        const admin = requireAdmin(db, req, res); if (!admin) return;
        const rows = db.prepare(`SELECT s.*,o.user_id,i.sku,i.title,u.email FROM shipment_requests s
          JOIN ownerships o ON o.id=s.ownership_id JOIN items i ON i.id=o.item_id JOIN users u ON u.id=o.user_id
          ORDER BY s.created_at DESC`).all();
        return json(res, 200, { shipments: rows.map((r) => ({ ...r, address: JSON.parse(r.address_json), address_json: undefined })) });
      }
      const dispatchMatch = path.match(/^\/api\/admin\/shipments\/([^/]+)\/dispatch$/);
      if (method === 'POST' && dispatchMatch) {
        const admin = requireAdmin(db, req, res); if (!admin) return;
        const body = await readBody(req); const tracking = cleanText(body.tracking_code, 120);
        if (!tracking) return error(res, 400, 'TRACKING_REQUIRED', 'Tracking code is required.');
        const shipment = db.prepare(`SELECT s.*,o.item_id FROM shipment_requests s JOIN ownerships o ON o.id=s.ownership_id
          WHERE s.id=? AND s.status IN ('REQUESTED','PACKED')`).get(dispatchMatch[1]);
        if (!shipment) return error(res, 404, 'SHIPMENT_NOT_FOUND', 'Open shipment not found.');
        const shippedAt = now();
        transaction(db, () => {
          db.prepare("UPDATE shipment_requests SET status='SHIPPED',tracking_code=?,shipped_at=? WHERE id=?").run(tracking, shippedAt, shipment.id);
          db.prepare("UPDATE ownerships SET status='SHIPPED',updated_at=? WHERE id=?").run(shippedAt, shipment.ownership_id);
          db.prepare("UPDATE items SET status='SHIPPED',updated_at=? WHERE id=?").run(shippedAt, shipment.item_id);
          appendAudit(db, 'SHIPMENT_DISPATCHED', 'SHIPMENT', shipment.id, admin.id, { tracking_code: tracking });
        });
        return json(res, 200, { ok: true, tracking_code: tracking });
      }

      if (method === 'GET' || method === 'HEAD') {
        let requested = path === '/' ? 'index.html' : decodeURIComponent(path.slice(1));
        requested = normalize(requested).replace(/^(\.\.(\/|\\|$))+/, '');
        const filePath = resolve(publicDir, requested);
        if (!filePath.startsWith(publicDir) || !existsSync(filePath) || !statSync(filePath).isFile()) {
          if (!path.startsWith('/api/')) {
            const fallback = join(publicDir, 'index.html');
            if (existsSync(fallback)) return serveFile(res, fallback, method === 'HEAD');
          }
          return error(res, 404, 'NOT_FOUND', 'Route not found.');
        }
        return serveFile(res, filePath, method === 'HEAD');
      }
      return error(res, 404, 'NOT_FOUND', 'Route not found.');
    } catch (err) {
      console.error(JSON.stringify({ level: 'error', time: now(), request_id: requestId, message: err.message, stack: err.stack }));
      return error(res, err.statusCode || 500, err.statusCode ? 'REQUEST_FAILED' : 'INTERNAL_ERROR', err.statusCode ? err.message : 'An internal error occurred.');
    }
  }

  const server = http.createServer(handler);
  server.keepAliveTimeout = 65_000;
  server.requestTimeout = 30_000;
  return { server, db, env, close: () => new Promise((resolveClose) => server.close(() => { db.close(); resolveClose(); })) };
}

function serveFile(res, path, head = false) {
  const types = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
  };
  const body = readFileSync(path);
  res.writeHead(200, {
    'content-type': types[extname(path)] || 'application/octet-stream',
    'content-length': body.length,
    'cache-control': path.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600',
  });
  res.end(head ? undefined : body);
}

export const internals = { appendAudit, verifyAudit, publishPack, allocateOrder, stable, sha256 };
