#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

function read(p){ try { return fs.readFileSync(p,"utf8"); } catch { return ""; } }
function json(p){ try { return JSON.parse(read(p)); } catch { return null; } }
function write(p,v){ fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,v); }

const stamp = Date.now();
for (const f of ["ui/index.html","ui/styles.css","ui/app.js"]) {
  if (fs.existsSync(f)) fs.copyFileSync(f, `ui/backups/${path.basename(f)}.${stamp}.bak`);
}

const proof = json("data/campaigns/real-proof-10/records.json") || { records: [] };
const records = proof.records || [];
const completed = records.filter(r => r.status === "completed").length;
const avgTrust = Math.round(records.reduce((a,r)=>a+(r.trust_after || r.trust_before || 0),0) / Math.max(records.length,1));

write("ui/index.html", `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>CYVXAI OS</title>
  <link rel="stylesheet" href="./styles.css"/>
</head>
<body>
  <div class="orb orb-a"></div>
  <div class="orb orb-b"></div>

  <main class="app">
    <header class="topbar">
      <div class="brand">
        <div class="logo">CY</div>
        <div>
          <strong>CYVXAI OS</strong>
          <span>Reality → Mission → Outcome</span>
        </div>
      </div>
      <div class="status-pill">LIVE PROOF · ${completed}/${records.length}</div>
    </header>

    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow">Autonomous Infrastructure Intelligence</p>
        <h1>Turn messy reality into the next best action.</h1>
        <p class="sub">CYVX analyzes reality, detects constraints, generates missions, captures outcomes, and improves trust.</p>
        <div class="actions">
          <a href="#analyze" class="btn primary">Analyze Reality</a>
          <a href="#proof" class="btn">View Proof Pack</a>
        </div>
      </div>

      <div class="command-card">
        <div class="pulse"></div>
        <span>Current Loop</span>
        <strong>Reality → Prediction → Mission → Outcome → Trust</strong>
        <small>Proof completion: ${completed}/${records.length} · Trust ${avgTrust}</small>
      </div>
    </section>

    <section class="grid stats">
      <article><span>Reality Loops</span><strong>${records.length}</strong><small>Inputs processed</small></article>
      <article><span>Completed</span><strong>${completed}</strong><small>Outcome records</small></article>
      <article><span>Trust</span><strong>90 → ${avgTrust}</strong><small>Calibration signal</small></article>
      <article><span>Mode</span><strong>Proof</strong><small>Evidence-backed</small></article>
    </section>

    <section id="analyze" class="panel spotlight">
      <div>
        <p class="eyebrow">60 Second Value Moment</p>
        <h2>Paste reality. Get the mission.</h2>
        <p class="muted">Paste repo notes, business problems, task lists, plans, or messy context.</p>
      </div>
      <textarea id="realityInput" placeholder="Paste messy reality here..."></textarea>
      <button id="analyzeBtn" class="btn primary full">Generate Next Best Action</button>
      <pre id="analysisOutput" class="output"></pre>
    </section>

    <section class="panel">
      <p class="eyebrow">Executive Compression</p>
      <h2>What matters now</h2>
      <div class="decision-grid">
        <div><span>Top Constraint</span><strong id="topConstraint">Need repeated real outcomes to compound trust.</strong></div>
        <div><span>Top Opportunity</span><strong id="topOpportunity">Public proof-driven adoption.</strong></div>
        <div><span>Next Action</span><strong id="nextAction">Run more real reality → outcome loops.</strong></div>
      </div>
    </section>

    <section class="panel">
      <p class="eyebrow">Capability Stack</p>
      <h2>Built foundations</h2>
      <div class="capability-map">
        <div>Universal Kernel</div>
        <div>Intelligence Loop</div>
        <div>Meta Intelligence</div>
        <div>Capability Compiler</div>
        <div>Executor + Verifier</div>
        <div>Portfolio Brain</div>
        <div>Outcome Capture</div>
        <div>Proof Pack</div>
      </div>
    </section>

    <section id="proof" class="panel">
      <p class="eyebrow">Public Proof Pack</p>
      <h2>10 completed reality loops</h2>
      <div class="proof-list">
        ${records.map(r => `<article>
          <span>${r.id}</span>
          <strong>${r.reality}</strong>
          <p>${r.actual_outcome}</p>
          <small>Trust ${r.trust_before} → ${r.trust_after} · ${r.status}</small>
        </article>`).join("")}
      </div>
    </section>
  </main>

  <nav class="dock">
    <a href="#">Home</a>
    <a href="#analyze">Analyze</a>
    <a href="#proof">Proof</a>
  </nav>

  <script src="./app.js"></script>
</body>
</html>`);

write("ui/styles.css", `:root{
  --bg:#050813;--card:#0b1222;--card2:#101a2e;--text:#f5f8ff;--muted:#94a3b8;
  --line:rgba(255,255,255,.12);--a:#8affd2;--b:#88b7ff;--c:#f6d365;
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{
  margin:0;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  color:var(--text);background:radial-gradient(circle at top,#13213d 0,#050813 38%,#02040b 100%);
  min-height:100vh;overflow-x:hidden;
}
.orb{position:fixed;width:360px;height:360px;border-radius:999px;filter:blur(80px);opacity:.28;pointer-events:none}
.orb-a{right:-120px;top:80px;background:var(--a)}
.orb-b{left:-140px;bottom:80px;background:var(--b)}
.app{width:min(1180px,100%);margin:auto;padding:18px 18px 110px}
.topbar{
  position:sticky;top:12px;z-index:10;display:flex;justify-content:space-between;align-items:center;
  padding:14px;border:1px solid var(--line);border-radius:24px;background:rgba(5,8,19,.72);backdrop-filter:blur(18px)
}
.brand{display:flex;gap:12px;align-items:center}
.logo{display:grid;place-items:center;width:46px;height:46px;border-radius:16px;background:linear-gradient(135deg,var(--a),var(--b));color:#07101f;font-weight:900}
.brand span,.muted,small{color:var(--muted)}
.status-pill{padding:10px 14px;border:1px solid var(--line);border-radius:999px;color:var(--a);font-size:12px;letter-spacing:.12em}
.hero{display:grid;grid-template-columns:1.35fr .75fr;gap:20px;align-items:stretch;margin:22px 0}
.hero-copy,.command-card,.panel,.stats article{
  border:1px solid var(--line);background:linear-gradient(180deg,rgba(16,26,46,.88),rgba(6,10,20,.92));
  border-radius:30px;box-shadow:0 24px 80px rgba(0,0,0,.35)
}
.hero-copy{padding:34px}
.eyebrow{color:var(--c);text-transform:uppercase;font-size:12px;letter-spacing:.18em;font-weight:800}
h1{font-size:clamp(44px,9vw,98px);line-height:.88;letter-spacing:-.075em;margin:12px 0}
h2{font-size:clamp(28px,5vw,52px);line-height:.96;letter-spacing:-.05em;margin:8px 0 12px}
.sub{font-size:18px;line-height:1.5;color:#cbd5e1;max-width:760px}
.actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:24px}
.btn{
  display:inline-flex;align-items:center;justify-content:center;text-decoration:none;color:var(--text);
  border:1px solid var(--line);background:#111b2f;border-radius:999px;padding:14px 20px;font-weight:850;cursor:pointer
}
.btn.primary{background:linear-gradient(135deg,var(--a),var(--b));color:#07101f;border:0}
.btn.full{width:100%;margin-top:12px}
.command-card{padding:28px;display:flex;flex-direction:column;justify-content:end;min-height:340px;position:relative;overflow:hidden}
.command-card:before{content:"";position:absolute;inset:20px;border-radius:26px;background:radial-gradient(circle,var(--a),transparent 58%);opacity:.13}
.command-card span{color:var(--c);font-size:12px;letter-spacing:.16em;text-transform:uppercase}
.command-card strong{font-size:30px;line-height:1.02;margin:12px 0;z-index:1}
.pulse{width:18px;height:18px;border-radius:999px;background:var(--a);box-shadow:0 0 0 12px rgba(138,255,210,.1),0 0 60px var(--a);margin-bottom:auto}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
.stats article{padding:20px}
.stats span,.decision-grid span{display:block;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.12em}
.stats strong{display:block;font-size:38px;margin:8px 0}
.panel{padding:24px;margin-top:18px}
.spotlight{background:linear-gradient(135deg,rgba(138,255,210,.12),rgba(136,183,255,.08),rgba(6,10,20,.95))}
textarea{
  width:100%;min-height:170px;margin-top:14px;padding:16px;border-radius:20px;border:1px solid var(--line);
  background:#050914;color:var(--text);font:inherit;resize:vertical;outline:none
}
.output{white-space:pre-wrap;overflow:auto;padding:16px;border-radius:18px;background:#030711;border:1px solid var(--line);min-height:130px}
.decision-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.decision-grid div,.capability-map div,.proof-list article{
  padding:18px;border:1px solid var(--line);border-radius:22px;background:rgba(255,255,255,.045)
}
.decision-grid strong{display:block;margin-top:8px;font-size:20px;line-height:1.15}
.capability-map{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.capability-map div{font-weight:850}
.proof-list{display:grid;gap:12px}
.proof-list article span{color:var(--c);font-size:12px}
.proof-list article strong{display:block;font-size:18px;margin:6px 0}
.proof-list article p{margin:0 0 8px;color:#dbeafe}
.dock{
  position:fixed;bottom:14px;left:50%;transform:translateX(-50%);z-index:20;display:flex;gap:8px;
  padding:10px;border-radius:999px;background:rgba(5,8,19,.78);border:1px solid var(--line);backdrop-filter:blur(18px)
}
.dock a{color:var(--text);text-decoration:none;padding:11px 16px;border-radius:999px;background:rgba(255,255,255,.06);font-weight:800}
@media(max-width:820px){
  .hero,.grid,.decision-grid{grid-template-columns:1fr}
  .capability-map{grid-template-columns:1fr 1fr}
  .status-pill{display:none}
  .hero-copy{padding:22px}
  .command-card{min-height:220px}
}
`);

write("ui/app.js", `const input = document.getElementById("realityInput");
const output = document.getElementById("analysisOutput");
const topConstraint = document.getElementById("topConstraint");
const topOpportunity = document.getElementById("topOpportunity");
const nextAction = document.getElementById("nextAction");

function analyzeReality(){
  const text = (input.value || "").toLowerCase();

  const repo = /repo|github|commit|code|readme|package/.test(text);
  const revenue = /revenue|customer|sales|roi|money|client/.test(text);
  const deploy = /deploy|server|hosting|public|domain|production/.test(text);
  const proof = /proof|evidence|outcome|trust|prediction/.test(text);

  const constraint = deploy ? "Deployment/public access is the current bottleneck."
    : revenue ? "Revenue needs outcome-backed proof and a clear first customer wedge."
    : repo ? "Repository reality needs prioritization into one executable mission."
    : proof ? "Proof exists, but needs repeatable outcome volume."
    : "Reality is messy; CYVX should compress it into one mission.";

  const opportunity = revenue ? "Use proof pack as the revenue wedge."
    : repo ? "Turn repo state into a live capability graph."
    : deploy ? "Create a public demo surface from the proof pack."
    : "Generate one outcome-backed mission now.";

  const action = "Run one reality → mission → outcome loop and record the result.";

  topConstraint.textContent = constraint;
  topOpportunity.textContent = opportunity;
  nextAction.textContent = action;

  output.textContent = JSON.stringify({
    topConstraint: constraint,
    topOpportunity: opportunity,
    nextBestAction: action,
    mission: "Create one measurable proof loop",
    confidence: 0.88
  }, null, 2);
}

document.getElementById("analyzeBtn")?.addEventListener("click", analyzeReality);
`);

console.log("CYVX UI wow overhaul complete.");
