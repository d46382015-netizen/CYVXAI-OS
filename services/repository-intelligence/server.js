"use strict";

const crypto = require("node:crypto");
const http = require("node:http");
const { URL } = require("node:url");
const { createRepositoryIntelligence } = require("./index");

function createRepositoryIntelligenceServer(options = {}) {
  const env = options.env || process.env;
  const host = String(options.host || env.CYVX_REPOSITORY_INTELLIGENCE_HOST || "127.0.0.1");
  const configuredPort = options.port ?? env.CYVX_REPOSITORY_INTELLIGENCE_PORT ?? 3014;
  const port = Number(configuredPort) === 0 ? 0 : positivePort(configuredPort);
  const token = String(options.token || env.CYVX_REPOSITORY_INTELLIGENCE_TOKEN || "").trim();
  const allowInsecureLocal = booleanValue(options.allowInsecureLocal ?? env.CYVX_ALLOW_INSECURE_LOCAL, true);
  const intelligence = options.intelligence || createRepositoryIntelligence(options);

  if (!isLoopback(host) && !token) {
    const error = new Error("CYVX_REPOSITORY_INTELLIGENCE_TOKEN is required for non-loopback binding");
    error.code = "REPOSITORY_INTELLIGENCE_TOKEN_REQUIRED";
    throw error;
  }

  const server = http.createServer(async (req, res) => {
    const startedAt = Date.now();
    const requestId = String(req.headers["x-request-id"] || crypto.randomUUID());
    let url;
    setSecurityHeaders(res, requestId);
    try {
      url = new URL(req.url, "http://cyvx.repository-intelligence");
      if (req.method === "OPTIONS") return sendEmpty(res, 204);

      if (req.method === "GET" && (url.pathname === "/health" || url.pathname === "/healthz")) {
        const snapshot = intelligence.latest();
        return sendJson(res, 200, health(snapshot, requestId));
      }
      if (req.method === "GET" && url.pathname === "/readyz") {
        const snapshot = intelligence.latest();
        const payload = health(snapshot, requestId);
        return sendJson(res, payload.ready ? 200 : 503, payload);
      }
      if (req.method === "GET" && url.pathname === "/api/v1/repository-intelligence") {
        return sendJson(res, 200, { ...intelligence.latest(), request_id: requestId });
      }
      if (req.method === "GET" && url.pathname === "/api/v1/repository-intelligence/history") {
        return sendJson(res, 200, { ok: true, history: intelligence.history(url.searchParams.get("limit") || 30), request_id: requestId });
      }
      if (req.method === "POST" && url.pathname === "/api/v1/repository-intelligence/scan") {
        requireMutationAuth(req, token, host, allowInsecureLocal);
        return sendJson(res, 201, { ...intelligence.scan(), request_id: requestId });
      }
      if (req.method === "GET" && url.pathname === "/metrics") {
        return sendText(res, 200, intelligence.prometheus(), "text/plain; version=0.0.4; charset=utf-8");
      }
      if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/repo-intelligence")) {
        return sendText(res, 200, renderDashboard(), "text/html; charset=utf-8");
      }
      return sendJson(res, 404, { ok: false, error: "NOT_FOUND", message: "Route not found", request_id: requestId });
    } catch (error) {
      const status = Number(error.statusCode || 500);
      intelligence.logger.write(status >= 500 ? "error" : "warn", "repository_intelligence.http.failed", {
        request_id: requestId,
        method: req.method,
        path: url ? url.pathname : req.url,
        status,
        code: error.code || "REPOSITORY_INTELLIGENCE_ERROR",
        message: error.message,
        elapsed_ms: Date.now() - startedAt,
      });
      return sendJson(res, status, {
        ok: false,
        error: status >= 500 ? "REPOSITORY_INTELLIGENCE_INTERNAL_ERROR" : error.code || "REPOSITORY_INTELLIGENCE_ERROR",
        message: status >= 500 ? "Repository intelligence request failed" : error.message,
        request_id: requestId,
      });
    } finally {
      intelligence.logger.write("info", "repository_intelligence.http.completed", {
        request_id: requestId,
        method: req.method,
        path: url ? url.pathname : req.url,
        status: res.statusCode,
        elapsed_ms: Date.now() - startedAt,
      });
    }
  });

  return {
    server,
    intelligence,
    host,
    port,
    async listen() {
      await listen(server, port, host);
      intelligence.scan();
      intelligence.logger.write("info", "repository_intelligence.server.ready", { host, port, loopback: isLoopback(host) });
      return this;
    },
    async close() {
      await closeServer(server);
      intelligence.logger.write("info", "repository_intelligence.server.closed", { host, port });
    },
  };
}

function health(snapshot, requestId) {
  return {
    ok: snapshot.summary.critical === 0,
    ready: snapshot.summary.critical === 0 && snapshot.readiness_score >= 70,
    service: "cyvx-repository-intelligence",
    status: snapshot.status,
    readiness_score: snapshot.readiness_score,
    generated_at: snapshot.generated_at,
    proof: snapshot.proof,
    request_id: requestId,
  };
}

function requireMutationAuth(req, token, host, allowInsecureLocal) {
  if (allowInsecureLocal && isLoopback(host) && !token) return;
  const supplied = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim() || String(req.headers["x-cyvx-token"] || "").trim();
  if (!token || !safeEqual(supplied, token)) {
    const error = new Error("A valid repository-intelligence token is required");
    error.code = "UNAUTHORIZED";
    error.statusCode = 401;
    throw error;
  }
}

function setSecurityHeaders(res, requestId) {
  res.setHeader("x-request-id", requestId);
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("x-frame-options", "DENY");
  res.setHeader("referrer-policy", "no-referrer");
  res.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=()");
  res.setHeader("content-security-policy", "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  res.setHeader("cache-control", "no-store");
}

function renderDashboard() {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#07111f"><title>CYVX Repository Evolution</title>
<style>:root{color-scheme:dark;--bg:#06101c;--panel:#0d1b2b;--panel2:#10243a;--line:#213d55;--text:#f0f8ff;--muted:#95aabd;--good:#54dda0;--warn:#ffc85a;--bad:#ff6f78;--accent:#66d9ff}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 85% 0,#113958 0,#06101c 44%);font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;color:var(--text)}header,main{max-width:1180px;margin:auto;padding:22px 16px}h1{margin:4px 0;font-size:clamp(28px,7vw,52px);letter-spacing:-.05em}.eyebrow,.muted{color:var(--muted)}.actions{display:flex;gap:9px;flex-wrap:wrap;margin:16px 0}button,input{border:1px solid var(--line);border-radius:10px;background:#081827;color:var(--text);padding:11px 13px;font:inherit}button{background:linear-gradient(135deg,#087aa7,#245a8e);font-weight:800}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.card,.panel{border:1px solid var(--line);border-radius:15px;background:rgba(13,27,43,.94);box-shadow:0 18px 45px rgba(0,0,0,.22)}.card{padding:15px}.card strong{display:block;font-size:28px}.card span{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.08em}.panel{margin-top:14px;padding:15px}.dimensions,.queue{display:grid;gap:9px}.row{display:grid;grid-template-columns:minmax(140px,1fr) minmax(110px,2fr) 56px;gap:10px;align-items:center}.track{height:9px;background:#071421;border-radius:999px;overflow:hidden}.fill{height:100%;background:linear-gradient(90deg,#4d9eff,#54dda0)}.item{padding:12px;border:1px solid var(--line);border-radius:12px;background:var(--panel2)}.top{display:flex;justify-content:space-between;gap:12px}.pill{border:1px solid var(--line);border-radius:999px;padding:3px 8px;font-size:12px}.critical,.high{color:var(--bad)}.medium{color:var(--warn)}.low{color:var(--muted)}pre{white-space:pre-wrap;word-break:break-word}@media(max-width:620px){.row{grid-template-columns:1fr 48px}.track{grid-row:2;grid-column:1/3}.top{flex-direction:column}}</style></head>
<body><header><div class="eyebrow">CYVXAI-OS · Repository Evolution Control Plane</div><h1>Turn repository reality into compounding capability.</h1><p class="muted">Inventory → Model → Measure → Prioritize → Prove → Learn. No manufactured readiness, hidden failures, or disconnected upgrades.</p><div class="actions"><button id="scan">Run governed scan</button><button id="reload">Reload proof</button><input id="token" type="password" autocomplete="off" placeholder="Mutation token (remote only)"></div><div id="message" class="muted" aria-live="polite"></div></header>
<main><section id="metrics" class="grid"></section><section class="panel"><h2>Production dimensions</h2><div id="dimensions" class="dimensions"></div></section><section class="panel"><h2>Next-best upgrade queue</h2><div id="queue" class="queue"></div></section><section class="panel"><h2>Proof</h2><pre id="proof" class="muted">Loading…</pre></section></main>
<script>const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));let state=null;async function request(path,options={}){const r=await fetch(path,options),j=await r.json();if(!r.ok)throw new Error(j.message||'Request failed');return j}function render(s){state=s;const cards=[['Readiness',s.readiness_score+'/100'],['Status',s.status],['Critical',s.summary.critical],['Failed',s.summary.failed],['Warnings',s.summary.warnings],['Top folders',s.inventory.top_level.directory_count]];$('metrics').innerHTML=cards.map(x=>'<div class="card"><strong>'+esc(x[1])+'</strong><span>'+esc(x[0])+'</span></div>').join('');$('dimensions').innerHTML=Object.entries(s.dimensions).sort((a,b)=>b[1].score-a[1].score).map(([n,v])=>'<div class="row"><b>'+esc(n)+'</b><div class="track"><div class="fill" style="width:'+Math.max(0,Math.min(100,v.score))+'%"></div></div><strong>'+v.score+'</strong></div>').join('');$('queue').innerHTML=s.recommendations.slice(0,12).map((x,i)=>'<article class="item"><div class="top"><b>'+(i+1)+'. '+esc(x.title)+'</b><span class="pill '+esc(x.severity)+'">'+esc(x.severity)+' · '+x.priority_score+'</span></div><div class="muted">'+esc(x.dimension)+' · impact '+x.expected_impact+'/10 · effort '+x.effort+'/10</div></article>').join('')||'<div class="muted">No active findings.</div>';$('proof').textContent=JSON.stringify({generated_at:s.generated_at,digest:s.proof.digest,next_best_action:s.next_best_action,mission:s.mission},null,2)}async function load(){try{$('message').textContent='Loading repository proof…';render(await request('/api/v1/repository-intelligence'));$('message').textContent='Proof loaded.'}catch(e){$('message').textContent=e.message}}$('reload').onclick=load;$('scan').onclick=async()=>{try{$('message').textContent='Scanning repository reality…';const token=$('token').value.trim();render(await request('/api/v1/repository-intelligence/scan',{method:'POST',headers:token?{authorization:'Bearer '+token}:{}}));$('message').textContent='New proof snapshot persisted.'}catch(e){$('message').textContent=e.message}};load();</script></body></html>`;
}

function sendJson(res, status, payload) { sendText(res, status, `${JSON.stringify(payload)}\n`, "application/json; charset=utf-8"); }
function sendText(res, status, body, contentType) { res.statusCode = status; res.setHeader("content-type", contentType); res.end(body); }
function sendEmpty(res, status) { res.statusCode = status; res.end(); }
function safeEqual(left, right) { const a = Buffer.from(String(left)); const b = Buffer.from(String(right)); return a.length === b.length && crypto.timingSafeEqual(a, b); }
function isLoopback(host) { return ["127.0.0.1", "::1", "localhost"].includes(String(host).toLowerCase()); }
function positivePort(value) { const port = Number(value); if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid repository-intelligence port"); return port; }
function booleanValue(value, fallback) { if (value === undefined || value === null || value === "") return fallback; return ["1", "true", "yes", "on"].includes(String(value).toLowerCase()); }
function listen(server, port, host) { return new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, host, () => { server.removeListener("error", reject); resolve(); }); }); }
function closeServer(server) { return new Promise((resolve, reject) => { if (!server.listening) return resolve(); server.close((error) => error ? reject(error) : resolve()); }); }

module.exports = { createRepositoryIntelligenceServer, renderDashboard, isLoopback };
