"use strict";

const crypto = require("node:crypto");
const http = require("node:http");
const { URL } = require("node:url");
const { createTopologyConsolidation } = require("./index");

function createTopologyConsolidationServer(options = {}) {
  const env = options.env || process.env;
  const topology = options.topology || createTopologyConsolidation(options);
  const token = String(options.token || env.CYVX_TOPOLOGY_TOKEN || "").trim();
  const allowInsecureLocal = booleanValue(options.allowInsecureLocal ?? env.CYVX_ALLOW_INSECURE_LOCAL, false);
  const bodyLimit = positiveInteger(options.bodyLimit || env.CYVX_TOPOLOGY_BODY_LIMIT || 64 * 1024, "bodyLimit");
  const server = http.createServer(async (req, res) => {
    const requestId = String(req.headers["x-request-id"] || crypto.randomUUID());
    setHeaders(res, requestId);
    let url;
    try {
      url = new URL(req.url, "http://cyvx.topology");
      if (req.method === "OPTIONS") return empty(res, 204);
      if (req.method === "GET" && (url.pathname === "/health" || url.pathname === "/healthz" || url.pathname === "/readyz")) {
        return json(res, 200, { ok: true, ready: true, service: "cyvx-topology-consolidation", config_version: topology.config.version, request_id: requestId });
      }
      if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/topology")) return html(res, 200, dashboard());
      if (req.method === "GET" && url.pathname === "/api/v1/topology/scan") return json(res, 200, { ...topology.scan(), request_id: requestId });
      if (req.method === "GET" && url.pathname === "/api/v1/topology/plan") {
        const stageId = String(url.searchParams.get("stage") || topology.config.stages[0].id);
        return json(res, 200, { ...topology.plan(stageId), request_id: requestId });
      }
      if (req.method === "GET" && url.pathname === "/api/v1/topology/runs") return json(res, 200, { ok: true, runs: topology.listRuns(url.searchParams.get("limit")), request_id: requestId });
      if (req.method === "POST" && url.pathname === "/api/v1/topology/plan") {
        const body = await readBody(req, bodyLimit);
        return json(res, 200, { ...topology.plan(body.stage_id), request_id: requestId });
      }
      if (req.method === "POST" && url.pathname === "/api/v1/topology/apply") {
        requireMutationAuth(req, token, allowInsecureLocal);
        const body = await readBody(req, bodyLimit);
        const result = topology.apply(body.stage_id, { approvalDigest: body.approval_digest, verifyMode: body.verify_mode || "quick", allowDirty: body.allow_dirty === true });
        return json(res, 201, { ok: true, run: result, request_id: requestId });
      }
      if (req.method === "POST" && url.pathname === "/api/v1/topology/rollback") {
        requireMutationAuth(req, token, allowInsecureLocal);
        const body = await readBody(req, bodyLimit);
        return json(res, 200, { ok: true, run: topology.rollback(body.run_id), request_id: requestId });
      }
      if (req.method === "POST" && url.pathname === "/api/v1/topology/verify") {
        requireMutationAuth(req, token, allowInsecureLocal);
        const body = await readBody(req, bodyLimit);
        const result = topology.verifyRun(body.run_id);
        return json(res, result.ok ? 200 : 409, { ...result, request_id: requestId });
      }
      return json(res, 404, { ok: false, error: "NOT_FOUND", message: "Route not found", request_id: requestId });
    } catch (error) {
      const status = Number(error.statusCode || (error.code === "UNAUTHORIZED" ? 401 : error.code === "BODY_TOO_LARGE" ? 413 : error.code && /REQUIRED|INVALID|BLOCKED|DRIFT|DIRTY|NOT_FOUND/.test(error.code) ? 409 : 500));
      topology.logger.write(status >= 500 ? "error" : "warn", "topology.http.failed", { request_id: requestId, method: req.method, path: url ? url.pathname : req.url, code: error.code || "TOPOLOGY_HTTP_ERROR", error: error.message });
      return json(res, status, { ok: false, error: status >= 500 ? "TOPOLOGY_INTERNAL_ERROR" : error.code || "TOPOLOGY_ERROR", message: status >= 500 ? "Topology request failed" : error.message, details: status >= 500 ? undefined : safeDetails(error), request_id: requestId });
    }
  });

  return {
    server,
    topology,
    async listen(port = options.port || env.CYVX_TOPOLOGY_PORT || 3015, host = options.host || env.CYVX_TOPOLOGY_HOST || "127.0.0.1") {
      const normalizedHost = String(host);
      if (!isLoopback(normalizedHost) && !token) throw new Error("CYVX_TOPOLOGY_TOKEN is required for non-loopback binding");
      await listen(server, positivePort(port), normalizedHost);
      topology.logger.write("info", "topology.server.ready", { host: normalizedHost, port: Number(port) });
      return this;
    },
    async close() { await close(server); topology.logger.write("info", "topology.server.closed"); },
  };
}

function requireMutationAuth(req, token, allowInsecureLocal) {
  if (allowInsecureLocal && !token) return;
  if (!token) { const error = new Error("CYVX_TOPOLOGY_TOKEN is required"); error.code = "UNAUTHORIZED"; throw error; }
  const supplied = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim() || String(req.headers["x-cyvx-token"] || "").trim();
  const a = Buffer.from(supplied); const b = Buffer.from(token);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) { const error = new Error("A valid topology mutation token is required"); error.code = "UNAUTHORIZED"; throw error; }
}

function dashboard() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#08111d"><title>CYVX Topology Consolidation</title><style>
:root{color-scheme:dark;--bg:#08111d;--panel:#0d1b2a;--panel2:#10243a;--text:#eff8ff;--muted:#93a8ba;--line:#243d52;--accent:#69d4ff;--good:#50d890;--warn:#ffcc66;--bad:#ff7070}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at top right,#123652,#08111d 48%);color:var(--text);font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}header,main{max-width:1180px;margin:auto;padding:20px}h1{font-size:clamp(28px,6vw,48px);letter-spacing:-.04em;margin:6px 0}.muted{color:var(--muted)}.pill{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:4px 9px;color:var(--accent)}.controls{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0}button,select,input{border:1px solid var(--line);background:#091827;color:var(--text);border-radius:10px;padding:11px 13px;font:inherit}button{cursor:pointer;background:linear-gradient(135deg,#12698a,#194e6c);font-weight:750}.secondary{background:#0a2134}.danger{background:#6a2730}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px}.card,.panel{border:1px solid var(--line);background:rgba(13,27,42,.94);border-radius:15px;padding:15px;box-shadow:0 20px 55px rgba(0,0,0,.2)}.card strong{display:block;font-size:28px}.panel{margin-top:14px}.stage{background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:13px;margin-top:9px}.row{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.risk-low{color:var(--good)}.risk-medium{color:var(--warn)}.risk-high{color:var(--bad)}pre{white-space:pre-wrap;word-break:break-word;background:#07131f;border:1px solid var(--line);border-radius:10px;padding:12px;max-height:360px;overflow:auto}.status{min-height:24px}.digest{font:12px ui-monospace,SFMono-Regular,monospace;word-break:break-all;color:var(--accent)}@media(max-width:640px){header,main{padding:15px}.row{flex-direction:column}}
</style></head><body><header><span class="pill">CYVX · Governed Migration</span><h1>Topology Consolidation</h1><p class="muted">Dependency graph → approved stage → compatibility aliases → reference rewrite → full verification → rollback proof.</p><div class="controls"><select id="stage"></select><button id="scan">Scan graph</button><button id="plan">Generate plan</button><input id="token" type="password" placeholder="Mutation token"><select id="mode"><option value="quick">Quick verification</option><option value="full">Full production verification</option></select><button id="apply">Apply approved digest</button></div><div class="status" id="status"></div></header><main><section id="metrics" class="grid"></section><section class="panel"><h2>Stages</h2><div id="stages"></div></section><section class="panel"><h2>Approval plan</h2><div id="digest" class="digest">Generate a plan to produce an exact approval digest.</div><pre id="output">Loading…</pre></section></main><script>
const $=id=>document.getElementById(id);let scanState=null,planState=null;const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function request(url,options={}){const r=await fetch(url,options);const x=await r.json();if(!r.ok)throw new Error(x.message||x.error||'Request failed');return x}function setStatus(v,bad=false){$('status').textContent=v;$('status').style.color=bad?'var(--bad)':'var(--good)'}
function renderScan(x){scanState=x;$('metrics').innerHTML=[['Text files',x.files.text],['Module nodes',x.files.modules],['Edges',x.graph.edges.length],['Unresolved',x.graph.unresolved.length]].map(([a,b])=>'<div class="card"><span class="muted">'+esc(a)+'</span><strong>'+esc(b)+'</strong></div>').join('');$('stage').innerHTML=x.stages.map(s=>'<option value="'+esc(s.id)+'">'+esc(s.title)+'</option>').join('');$('stages').innerHTML=x.stages.map(s=>'<div class="stage"><div class="row"><div><strong>'+esc(s.title)+'</strong><div class="muted">'+esc(s.active_moves)+' active moves · '+esc(s.files_to_move)+' files · '+esc(s.references_affected)+' references</div></div><span class="risk-'+esc(s.risk)+'">'+esc(s.risk)+'</span></div></div>').join('');$('output').textContent=JSON.stringify(x.graph,null,2)}
async function load(){try{renderScan(await request('/api/v1/topology/scan'));setStatus('Topology graph loaded.')}catch(e){setStatus(e.message,true)}}$('scan').onclick=load;$('plan').onclick=async()=>{try{planState=await request('/api/v1/topology/plan?stage='+encodeURIComponent($('stage').value));$('digest').textContent=planState.approval.digest;$('output').textContent=JSON.stringify(planState,null,2);setStatus(planState.ok?'Plan ready for explicit approval.':'Plan is blocked.',!planState.ok)}catch(e){setStatus(e.message,true)}};$('apply').onclick=async()=>{if(!planState)return setStatus('Generate a plan first.',true);if(!confirm('Apply stage '+planState.stage.id+' using digest '+planState.approval.digest+'? Automatic rollback runs on verification failure.'))return;try{const x=await request('/api/v1/topology/apply',{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+$('token').value},body:JSON.stringify({stage_id:planState.stage.id,approval_digest:planState.approval.digest,verify_mode:$('mode').value})});$('output').textContent=JSON.stringify(x,null,2);setStatus('Stage applied and verified.')}catch(e){setStatus(e.message,true)}};load();
</script></body></html>`;
}

async function readBody(req, limit) { const chunks=[]; let size=0; for await (const chunk of req) { size+=chunk.length; if(size>limit){const e=new Error("Request body exceeds limit");e.code="BODY_TOO_LARGE";throw e;} chunks.push(chunk); } if(!chunks.length)return {}; try{return JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{const e=new Error("Request body must be valid JSON");e.code="BODY_INVALID";throw e;} }
function setHeaders(res,id){res.setHeader("x-request-id",id);res.setHeader("x-content-type-options","nosniff");res.setHeader("x-frame-options","DENY");res.setHeader("referrer-policy","no-referrer");res.setHeader("cache-control","no-store");}
function json(res,status,value){res.statusCode=status;res.setHeader("content-type","application/json; charset=utf-8");res.end(JSON.stringify(value));}
function html(res,status,value){res.statusCode=status;res.setHeader("content-type","text/html; charset=utf-8");res.end(value);}
function empty(res,status){res.statusCode=status;res.end();}
function positiveInteger(v,label){const n=Number(v);if(!Number.isInteger(n)||n<=0)throw new Error(`${label} must be a positive integer`);return n;}
function positivePort(v){const n=Number(v);if(!Number.isInteger(n)||n<0||n>65535)throw new Error("port must be an integer from 0 to 65535");return n;}
function booleanValue(v,fallback){if(v===undefined||v===null||v==="")return fallback;return [true,"true","1","yes","on"].includes(typeof v==="string"?v.toLowerCase():v);}
function isLoopback(host){return ["127.0.0.1","localhost","::1"].includes(host);}
function safeDetails(error){return error.expected_digest?{expected_digest:error.expected_digest}:error.files?{files:error.files}:error.verification?{verification:error.verification}:undefined;}
function listen(server,port,host){return new Promise((resolve,reject)=>{const onError=e=>{server.off("listening",onListening);reject(e)};const onListening=()=>{server.off("error",onError);resolve()};server.once("error",onError);server.once("listening",onListening);server.listen(port,host);});}
function close(server){return new Promise((resolve,reject)=>{if(!server.listening)return resolve();server.close(e=>e?reject(e):resolve());});}

module.exports={createTopologyConsolidationServer};
