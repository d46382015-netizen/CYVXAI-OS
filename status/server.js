#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { checkTarget, resolveTargets } = require("../scripts/uptime-check-v7");

const PORT = Number(process.env.PORT || process.env.CYVX_STATUS_PORT || 3400);
const HOST = process.env.CYVX_STATUS_HOST || "0.0.0.0";
const CACHE_MS = Number(process.env.CYVX_STATUS_CACHE_MS || 30_000);
const incidentsPath = path.join(__dirname, "incidents.json");
let cache = { expiresAt: 0, report: null, pending: null };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://status.local");
  setHeaders(res);
  if (req.method !== "GET") return json(res, 405, { ok: false, error: "method_not_allowed" });
  if (url.pathname === "/healthz" || url.pathname === "/livez") return json(res, 200, { ok: true, service: "CYVX Status", timestamp: new Date().toISOString() });
  if (url.pathname === "/api/status") {
    const report = await statusReport();
    return json(res, report.ok ? 200 : 503, report);
  }
  if (url.pathname === "/api/incidents") return json(res, 200, { ok: true, incidents: readIncidents() });
  if (url.pathname === "/" || url.pathname === "/index.html") return html(res, page());
  return json(res, 404, { ok: false, error: "not_found" });
});

async function statusReport() {
  if (cache.report && cache.expiresAt > Date.now()) return cache.report;
  if (cache.pending) return cache.pending;
  cache.pending = (async () => {
    let targets;
    try { targets = resolveTargets(process.env); }
    catch (error) {
      return { ok: false, status: "configuration_error", checked_at: new Date().toISOString(), error: error.message, services: [], incidents: readIncidents() };
    }
    const services = [];
    for (const target of targets) services.push(await checkTarget(target, process.env));
    const ok = services.length > 0 && services.every((item) => item.ok);
    const report = {
      ok,
      status: ok ? "operational" : services.some((item) => item.ok) ? "degraded" : "outage",
      checked_at: new Date().toISOString(),
      refresh_seconds: Math.floor(CACHE_MS / 1000),
      slo: {
        availability_target: "99.9% monthly",
        ready_latency_target: "95% under 2 seconds",
        recovery_target: "RTO 60 minutes / RPO 6 hours",
      },
      services,
      incidents: readIncidents(),
    };
    cache = { expiresAt: Date.now() + CACHE_MS, report, pending: null };
    return report;
  })();
  try { return await cache.pending; }
  finally { cache.pending = null; }
}

function readIncidents() {
  try {
    const parsed = JSON.parse(fs.readFileSync(incidentsPath, "utf8"));
    return Array.isArray(parsed) ? parsed.slice(0, 25) : [];
  } catch { return []; }
}

function setHeaders(res) {
  res.setHeader("cache-control", "no-store");
  res.setHeader("content-security-policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  res.setHeader("referrer-policy", "no-referrer");
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("x-frame-options", "DENY");
}

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(`${JSON.stringify(payload)}\n`);
}

function html(res, content) {
  res.statusCode = 200;
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end(content);
}

function page() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>CYVXAI OS Status</title>
<meta name="description" content="Live operational status for CYVXAI OS production and staging services.">
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color-scheme:dark;background:#071018;color:#eef7ff}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 10% 0,#18384c 0,#071018 42%);min-height:100vh}.wrap{width:min(920px,calc(100% - 32px));margin:0 auto;padding:48px 0 72px}.eyebrow{letter-spacing:.18em;text-transform:uppercase;font-size:12px;color:#8fb8ca}.hero{display:flex;justify-content:space-between;gap:24px;align-items:flex-end;margin:10px 0 32px}h1{font-size:clamp(36px,8vw,68px);line-height:.95;margin:0;letter-spacing:-.055em}.pill{border:1px solid #335268;border-radius:999px;padding:10px 14px;background:#0d1d28;font-weight:700}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:0 0 18px}.card{border:1px solid #284455;border-radius:20px;padding:20px;background:rgba(10,25,35,.86);box-shadow:0 20px 70px rgba(0,0,0,.24)}.metric{font-size:28px;font-weight:800;margin-top:8px}.services{display:grid;gap:12px}.service{display:grid;grid-template-columns:1fr auto;gap:14px;align-items:center}.name{font-size:19px;font-weight:750;text-transform:capitalize}.detail{color:#a9c0cc;font-size:14px;margin-top:5px}.state{font-weight:800}.ok{color:#77e3af}.bad{color:#ff8f8f}.warn{color:#ffd17a}.muted{color:#8fa5b0}.incidents{margin-top:18px}.incident{border-top:1px solid #243d4d;padding:14px 0}.incident:first-child{border-top:0}.footer{margin-top:24px;color:#91a8b5;font-size:13px;display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}@media(max-width:680px){.hero{display:block}.pill{display:inline-block;margin-top:20px}.summary{grid-template-columns:1fr}.service{grid-template-columns:1fr}}</style>
</head>
<body><main class="wrap"><div class="eyebrow">CYVX operational evidence</div><section class="hero"><h1>System<br>Status</h1><div id="overall" class="pill muted">Checking services…</div></section><section class="summary"><article class="card"><div class="eyebrow">Availability SLO</div><div class="metric">99.9%</div></article><article class="card"><div class="eyebrow">Recovery objective</div><div class="metric">RTO 60m</div></article><article class="card"><div class="eyebrow">Backup objective</div><div class="metric">RPO 6h</div></article></section><section class="card"><div class="eyebrow">Live services</div><div id="services" class="services"><p class="muted">Loading health evidence…</p></div></section><section class="card incidents"><div class="eyebrow">Incident history</div><div id="incidents"><p class="muted">Loading incidents…</p></div></section><footer class="footer"><span>CYVXAI OS production observability</span><span id="checked">Not checked yet</span></footer></main>
<script>
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function refresh(){try{const r=await fetch('/api/status',{cache:'no-store'});const x=await r.json();const overall=document.getElementById('overall');overall.textContent=x.status==='operational'?'All systems operational':x.status==='degraded'?'Service degradation':'Service outage';overall.className='pill '+(x.ok?'ok':x.status==='degraded'?'warn':'bad');document.getElementById('services').innerHTML=(x.services||[]).map(s=>'<article class="service"><div><div class="name">'+esc(s.name)+'</div><div class="detail">'+esc(s.url)+' · '+s.checks.map(c=>esc(c.endpoint)+' '+esc(c.status)+' ('+esc(c.latency_ms)+'ms)').join(' · ')+'</div></div><div class="state '+(s.ok?'ok':'bad')+'">'+(s.ok?'Operational':'Unavailable')+'</div></article>').join('')||'<p class="bad">No monitored services configured.</p>';document.getElementById('incidents').innerHTML=(x.incidents||[]).map(i=>'<article class="incident"><strong>'+esc(i.title)+'</strong><div class="detail">'+esc(i.status)+' · '+esc(i.started_at)+(i.resolved_at?' → '+esc(i.resolved_at):'')+'</div></article>').join('')||'<p class="ok">No reported incidents.</p>';document.getElementById('checked').textContent='Checked '+new Date(x.checked_at).toLocaleString();}catch(e){document.getElementById('overall').textContent='Status monitor unavailable';document.getElementById('overall').className='pill bad';}}refresh();setInterval(refresh,30000);
</script></body></html>`;
}

server.listen(PORT, HOST, () => process.stdout.write(`${JSON.stringify({ event: "cyvx.status.started", host: HOST, port: PORT })}\n`));

for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => server.close(() => process.exit(0)));
