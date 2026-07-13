"use strict";

const crypto = require("node:crypto");
const http = require("node:http");
const { URL } = require("node:url");
const {
  DEFAULT_INTERVAL_MS,
  MAX_BODY_BYTES,
  createMinnesotaIntelligence,
} = require("./index");

function createMinnesotaIntelligenceServer(options = {}) {
  const env = options.env || process.env;
  const intelligence = options.intelligence || createMinnesotaIntelligence({
    dataRoot: options.dataRoot,
    fetch: options.fetch,
    sources: options.sources,
    profile: options.profile,
  });
  const token = String(options.token || env.CYVX_MN_INTELLIGENCE_TOKEN || "").trim();
  const allowInsecureLocal = booleanValue(options.allowInsecureLocal ?? env.CYVX_ALLOW_INSECURE_LOCAL, false);
  const bodyLimit = positiveInteger(options.bodyLimit || env.CYVX_MN_BODY_LIMIT || MAX_BODY_BYTES, "bodyLimit");
  const intervalMs = positiveInteger(options.intervalMs || env.CYVX_MN_REFRESH_INTERVAL_MS || DEFAULT_INTERVAL_MS, "intervalMs");
  const autoRefresh = booleanValue(options.autoRefresh ?? env.CYVX_MN_AUTO_REFRESH, true);
  let timer = null;

  if (!token && !allowInsecureLocal) {
    const error = new Error("CYVX_MN_INTELLIGENCE_TOKEN is required unless CYVX_ALLOW_INSECURE_LOCAL=true");
    error.code = "MN_INTELLIGENCE_TOKEN_REQUIRED";
    throw error;
  }

  const server = http.createServer(async (req, res) => {
    const startedAt = Date.now();
    const requestId = String(req.headers["x-request-id"] || crypto.randomUUID());
    setHeaders(res, requestId);
    let url;
    try {
      url = new URL(req.url, "http://cyvx.mn-intelligence");
      if (req.method === "OPTIONS") return sendEmpty(res, 204);

      if (req.method === "GET" && (url.pathname === "/health" || url.pathname === "/healthz")) {
        return sendJson(res, 200, { ok: true, service: "cyvx-minnesota-intelligence", ...intelligence.readiness(), request_id: requestId });
      }
      if (req.method === "GET" && url.pathname === "/readyz") {
        const readiness = intelligence.readiness();
        return sendJson(res, readiness.ready ? 200 : 503, { ...readiness, request_id: requestId });
      }
      if (req.method === "GET" && url.pathname === "/api/v1/intelligence/minnesota") {
        return sendJson(res, 200, { ...intelligence.snapshot(), request_id: requestId });
      }
      if (req.method === "GET" && url.pathname === "/api/v1/intelligence/minnesota/metrics") {
        const snapshot = intelligence.snapshot();
        return sendJson(res, 200, { ok: true, metrics: snapshot.metrics, last_refresh: snapshot.last_refresh, request_id: requestId });
      }
      if (req.method === "GET" && url.pathname === "/api/v1/intelligence/minnesota/sources") {
        return sendJson(res, 200, { ok: true, sources: intelligence.listSources(), request_id: requestId });
      }
      if (req.method === "GET" && url.pathname === "/api/v1/intelligence/minnesota/opportunities") {
        const opportunities = intelligence.listOpportunities(Object.fromEntries(url.searchParams));
        return sendJson(res, 200, { ok: true, opportunities, total: opportunities.length, request_id: requestId });
      }
      if (req.method === "GET" && url.pathname === "/api/v1/intelligence/minnesota/businesses") {
        const businesses = intelligence.searchBusinesses(Object.fromEntries(url.searchParams));
        return sendJson(res, 200, {
          ok: true,
          businesses,
          total: businesses.length,
          official_search_url: "https://mblsportal.sos.mn.gov/Business/Search",
          request_id: requestId,
        });
      }
      if (req.method === "POST" && url.pathname === "/api/v1/intelligence/minnesota/refresh") {
        requireMutationAuth(req, token, allowInsecureLocal);
        const body = await readBody(req, bodyLimit, { optional: true });
        const result = await intelligence.refresh({ sourceIds: Array.isArray(body && body.source_ids) ? body.source_ids : [] });
        return sendJson(res, result.ok ? 200 : 502, { ...result, request_id: requestId });
      }
      if (req.method === "POST" && url.pathname === "/api/v1/intelligence/minnesota/opportunities/import") {
        requireMutationAuth(req, token, allowInsecureLocal);
        const raw = await readRawBody(req, bodyLimit);
        const contentType = String(req.headers["content-type"] || "");
        const body = contentType.includes("application/json") ? JSON.parse(raw || "{}") : raw;
        const records = body && typeof body === "object" && !Array.isArray(body) && body.records ? body.records : body;
        const metadata = body && typeof body === "object" && !Array.isArray(body) ? body.metadata || {} : {};
        const result = await intelligence.importOpportunities(records, metadata);
        return sendJson(res, 201, { ...result, request_id: requestId });
      }
      if (req.method === "POST" && url.pathname === "/api/v1/intelligence/minnesota/businesses/import") {
        requireMutationAuth(req, token, allowInsecureLocal);
        const raw = await readRawBody(req, bodyLimit);
        const contentType = String(req.headers["content-type"] || "");
        const body = contentType.includes("application/json") ? JSON.parse(raw || "{}") : raw;
        const records = body && typeof body === "object" && !Array.isArray(body) && body.records ? body.records : body;
        const metadata = body && typeof body === "object" && !Array.isArray(body) ? body.metadata || {} : {};
        const result = await intelligence.importBusinesses(records, metadata);
        return sendJson(res, 201, { ...result, request_id: requestId });
      }
      const missionMatch = url.pathname.match(/^\/api\/v1\/intelligence\/minnesota\/opportunities\/([^/]+)\/mission$/);
      if (req.method === "POST" && missionMatch) {
        requireMutationAuth(req, token, allowInsecureLocal);
        const body = await readBody(req, bodyLimit, { optional: true });
        const result = await intelligence.createMission(decodeURIComponent(missionMatch[1]), body || {});
        return sendJson(res, 201, { ...result, request_id: requestId });
      }
      if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/intelligence/minnesota")) {
        return sendHtml(res, 200, renderDashboard());
      }
      return sendJson(res, 404, { ok: false, error: "NOT_FOUND", message: "Route not found", request_id: requestId });
    } catch (error) {
      const status = Number(error.statusCode || error.status || 500);
      intelligence.logger.write(status >= 500 ? "error" : "warn", "mn_intelligence.http.failed", {
        request_id: requestId,
        method: req.method,
        path: url ? url.pathname : req.url,
        status,
        code: error.code || "MN_INTELLIGENCE_ERROR",
        error: error.message,
        elapsed_ms: Date.now() - startedAt,
      });
      return sendJson(res, status, {
        ok: false,
        error: status >= 500 ? "MN_INTELLIGENCE_INTERNAL_ERROR" : error.code || "MN_INTELLIGENCE_ERROR",
        message: status >= 500 ? "Minnesota intelligence request failed" : error.message,
        request_id: requestId,
      });
    } finally {
      intelligence.logger.write("info", "mn_intelligence.http.completed", {
        request_id: requestId,
        method: req.method,
        path: url ? url.pathname : req.url,
        status: res.statusCode,
        elapsed_ms: Date.now() - startedAt,
      });
    }
  });

  function startScheduler() {
    if (!autoRefresh || timer) return;
    const run = () => intelligence.refresh().catch((error) => {
      intelligence.logger.write("error", "mn_intelligence.scheduler.failed", { code: error.code || null, error: error.message });
    });
    timer = setInterval(run, intervalMs);
    timer.unref?.();
    if (booleanValue(env.CYVX_MN_REFRESH_ON_START, true)) setImmediate(run);
  }

  function stopScheduler() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return {
    server,
    intelligence,
    intervalMs,
    autoRefresh,
    startScheduler,
    stopScheduler,
    async listen(port = options.port || env.CYVX_MN_INTELLIGENCE_PORT || 3010, host = options.host || env.CYVX_MN_INTELLIGENCE_HOST || "0.0.0.0") {
      await listen(server, positivePort(port), host);
      startScheduler();
      intelligence.logger.write("info", "mn_intelligence.server.ready", { host, port: Number(port), auto_refresh: autoRefresh, interval_ms: intervalMs });
      return this;
    },
    async close() {
      stopScheduler();
      await closeServer(server);
      intelligence.logger.write("info", "mn_intelligence.server.closed");
    },
  };
}

function requireMutationAuth(req, token, allowInsecureLocal) {
  if (allowInsecureLocal && !token) return;
  const supplied = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim() || String(req.headers["x-cyvx-token"] || "").trim();
  if (!safeEqual(supplied, token)) {
    const error = new Error("A valid CYVX Minnesota intelligence token is required");
    error.code = "UNAUTHORIZED";
    error.statusCode = 401;
    throw error;
  }
}

function renderDashboard() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#07111f">
<title>CYVX Minnesota Intelligence</title>
<style>
:root{color-scheme:dark;--bg:#07111f;--panel:#0d1c2d;--panel2:#10253a;--text:#edf7ff;--muted:#91a7ba;--line:#203a50;--good:#42d392;--warn:#ffcb66;--bad:#ff6b6b;--accent:#6dd6ff}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at top right,#123450 0,#07111f 45%);color:var(--text);font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}header{padding:24px 18px 12px;max-width:1180px;margin:auto}h1{margin:0;font-size:clamp(24px,5vw,44px);letter-spacing:-.04em}header p{color:var(--muted);max-width:760px}.bar{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}button,input,select{border:1px solid var(--line);background:#091827;color:var(--text);padding:11px 13px;border-radius:10px;font:inherit}button{cursor:pointer;background:linear-gradient(135deg,#12698a,#185171);font-weight:700}button.secondary{background:#0b2033}main{max-width:1180px;margin:auto;padding:10px 18px 60px}.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.metric,.panel{background:rgba(13,28,45,.93);border:1px solid var(--line);border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.2)}.metric{padding:15px}.metric strong{display:block;font-size:26px}.metric span{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.08em}.panel{margin-top:14px;padding:15px}.filters{display:grid;grid-template-columns:minmax(160px,1fr) 150px 140px;gap:8px;margin-bottom:12px}.list{display:grid;gap:10px}.card{border:1px solid var(--line);background:var(--panel2);border-radius:12px;padding:14px}.top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.score{min-width:58px;text-align:center;border:1px solid var(--line);border-radius:10px;padding:7px;font-size:20px;font-weight:800}.priority{color:var(--good)}.qualified{color:var(--accent)}.watch{color:var(--warn)}.low{color:var(--muted)}h2,h3{margin:0 0 8px}.meta{display:flex;gap:8px;flex-wrap:wrap;color:var(--muted);font-size:13px}.pill{border:1px solid var(--line);border-radius:999px;padding:3px 8px}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.actions a{color:var(--accent)}.empty{color:var(--muted);padding:28px;text-align:center}.error{color:var(--bad)}@media(max-width:680px){.filters{grid-template-columns:1fr}.top{flex-direction:column}.score{align-self:flex-start}}
</style>
</head>
<body>
<header><div class="pill">CYVX Intelligence Fabric · US-MN</div><h1>Minnesota Revenue Intelligence</h1><p>Evidence-backed procurement and business signals converted into scored opportunities and mission drafts.</p><div class="bar"><button id="refresh">Refresh sources</button><button class="secondary" id="reload">Reload data</button><input id="token" type="password" autocomplete="off" placeholder="Mutation token"></div><p id="status" aria-live="polite"></p></header>
<main><section id="metrics" class="metrics"></section><section class="panel"><div class="filters"><input id="query" placeholder="Search opportunities"><select id="band"><option value="0">All scores</option><option value="75">Priority 75+</option><option value="50">Qualified 50+</option><option value="35">Watch 35+</option></select><select id="category"><option value="">All categories</option></select></div><div id="list" class="list"><div class="empty">Loading intelligence…</div></div></section></main>
<script>
const $=id=>document.getElementById(id);let state={opportunities:[],metrics:{}};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>v?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(v):'Value unlisted';
const date=v=>v?new Date(v).toLocaleDateString():'Deadline unverified';
async function load(){try{const r=await fetch('/api/v1/intelligence/minnesota');const j=await r.json();if(!r.ok)throw Error(j.message||'Load failed');state=j;render()}catch(e){$('list').innerHTML='<div class="empty error">'+esc(e.message)+'</div>'}}
function render(){const m=state.metrics||{};$('metrics').innerHTML=[['Active',m.opportunities_active],['Priority',m.priority_opportunities],['Due 14 days',m.due_within_14_days],['Pipeline',money(m.estimated_pipeline_usd)],['Businesses',m.business_records],['Missions',m.mission_drafts]].map(([k,v])=>'<div class="metric"><strong>'+esc(v??0)+'</strong><span>'+esc(k)+'</span></div>').join('');const cats=[...new Set(state.opportunities.map(o=>o.category))].sort();$('category').innerHTML='<option value="">All categories</option>'+cats.map(c=>'<option>'+esc(c)+'</option>').join('');filter()}
function filter(){const q=$('query').value.toLowerCase();const min=Number($('band').value);const cat=$('category').value;const rows=state.opportunities.filter(o=>o.score>=min&&(!cat||o.category===cat)&&(!q||JSON.stringify(o).toLowerCase().includes(q)));$('list').innerHTML=rows.length?rows.map(card).join(''):'<div class="empty">No matching opportunities.</div>'}
function card(o){return '<article class="card"><div class="top"><div><h3>'+esc(o.title)+'</h3><div class="meta"><span class="pill">'+esc(o.category)+'</span><span class="pill">'+esc(o.buyer)+'</span><span>'+esc(date(o.due_at))+'</span><span>'+esc(money(o.estimated_value_usd))+'</span></div></div><div class="score '+esc(o.score_band)+'">'+esc(o.score)+'</div></div><p>'+esc(o.description||'No description extracted.')+'</p><div class="actions"><a href="'+esc(o.source_url)+'" target="_blank" rel="noreferrer">Official source</a><button onclick="mission(\''+esc(o.id)+'\')">Create mission</button></div></article>'}
async function mutate(path,body){const token=$('token').value;const r=await fetch(path,{method:'POST',headers:{'content-type':'application/json',authorization:token?'Bearer '+token:''},body:JSON.stringify(body||{})});const j=await r.json();if(!r.ok)throw Error(j.message||'Request failed');return j}
async function mission(id){try{$('status').textContent='Creating mission…';const j=await mutate('/api/v1/intelligence/minnesota/opportunities/'+encodeURIComponent(id)+'/mission',{});$('status').textContent='Mission drafted: '+j.mission.title;await load()}catch(e){$('status').textContent=e.message}}
$('refresh').onclick=async()=>{try{$('status').textContent='Refreshing approved public sources…';const j=await mutate('/api/v1/intelligence/minnesota/refresh',{});$('status').textContent='Refresh complete: '+j.sources_ok+'/'+j.sources_total+' sources healthy';await load()}catch(e){$('status').textContent=e.message}};$('reload').onclick=load;$('query').oninput=filter;$('band').onchange=filter;$('category').onchange=filter;load();
</script>
</body></html>`;
}

function setHeaders(res, requestId) {
  res.setHeader("x-request-id", requestId);
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("x-frame-options", "SAMEORIGIN");
  res.setHeader("referrer-policy", "strict-origin-when-cross-origin");
  res.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("content-security-policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'self'");
  res.setHeader("cache-control", "no-store");
}

function sendJson(res, status, payload) {
  const body = Buffer.from(`${JSON.stringify(payload)}\n`);
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("content-length", body.length);
  res.end(body);
}

function sendHtml(res, status, html) {
  const body = Buffer.from(html);
  res.statusCode = status;
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.setHeader("content-length", body.length);
  res.end(body);
}

function sendEmpty(res, status) {
  res.statusCode = status;
  res.end();
}

async function readBody(req, limit, options = {}) {
  const raw = await readRawBody(req, limit);
  if (!raw && options.optional) return null;
  if (!raw) return {};
  try { return JSON.parse(raw); }
  catch {
    const error = new Error("Request body must contain valid JSON");
    error.code = "INVALID_JSON";
    error.statusCode = 400;
    throw error;
  }
}

function readRawBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        const error = new Error(`Request body exceeds ${limit} bytes`);
        error.code = "BODY_TOO_LARGE";
        error.statusCode = 413;
        reject(error);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function booleanValue(value, fallback) {
  if (value == null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return /^(1|true|yes|on)$/i.test(String(value));
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new TypeError(`${label} must be a positive integer`);
  return number;
}

function positivePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new TypeError("Port must be an integer between 1 and 65535");
  return port;
}

function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    const onError = (error) => { server.off("listening", onListening); reject(error); };
    const onListening = () => { server.off("error", onError); resolve(); };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

function closeServer(server) {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function main() {
  const runtime = createMinnesotaIntelligenceServer();
  await runtime.listen();
  const address = runtime.server.address();
  process.stdout.write(`${JSON.stringify({ event: "cyvx.mn_intelligence.ready", address })}\n`);
  let closing = false;
  const shutdown = async (signal) => {
    if (closing) return;
    closing = true;
    process.stdout.write(`${JSON.stringify({ event: "cyvx.mn_intelligence.shutdown", signal })}\n`);
    await runtime.close();
    process.exit(0);
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

if (require.main === module) main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ event: "cyvx.mn_intelligence.failed", code: error.code || null, error: error.message })}\n`);
  process.exit(1);
});

module.exports = {
  createMinnesotaIntelligenceServer,
  readBody,
  readRawBody,
  renderDashboard,
  requireMutationAuth,
};
