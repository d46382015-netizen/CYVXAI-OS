#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

function read(p){ try { return fs.readFileSync(p,"utf8"); } catch { return ""; } }
function write(p,v){ fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,v); }

const records = JSON.parse(read("data/campaigns/real-proof-10/records.json") || '{"records":[]}').records || [];
const completed = records.filter(r => r.status === "completed").length;
const avgTrust = Math.round(records.reduce((a,r)=>a+(r.trust_after || r.trust_before || 0),0) / Math.max(records.length,1));

const proofHtml = `
<section class="proof-hero">
  <div>
    <p class="eyebrow">CYVX Proof Pack</p>
    <h1>Reality → Mission → Outcome → Learning</h1>
    <p class="hero-sub">CYVX converts messy reality into decisions, missions, outcomes, trust updates, and proof.</p>
    <div class="hero-actions">
      <button data-target="selfScanPanel" class="nav-jump">Analyze Reality</button>
      <button data-target="proofPanel" class="nav-jump secondary">View Proof</button>
    </div>
  </div>
  <div class="proof-score-card">
    <span>Proof Completion</span>
    <strong>${completed}/${records.length}</strong>
    <small>Average Trust After: ${avgTrust}</small>
  </div>
</section>

<section class="panel" id="proofPanel">
  <section class="panel-card">
    <p class="eyebrow">Public Demo Proof</p>
    <h2>10 Reality Loops Completed</h2>
    <p class="muted">Each record contains a reality input, prediction, mission, outcome, learning, and trust update.</p>
    <div class="metric-grid">
      <div class="metric-card"><span>Realities</span><strong>${records.length}</strong><small>Inputs analyzed</small></div>
      <div class="metric-card"><span>Completed</span><strong>${completed}</strong><small>Outcome records</small></div>
      <div class="metric-card"><span>Trust</span><strong>90 → ${avgTrust}</strong><small>Calibration signal</small></div>
      <div class="metric-card"><span>Claim</span><strong>Proven Loop</strong><small>Reality into action</small></div>
    </div>
    <div class="proof-list">
      ${records.map(r => `<article class="proof-item">
        <span>${r.id}</span>
        <strong>${r.reality}</strong>
        <p>${r.actual_outcome}</p>
        <small>Trust ${r.trust_before} → ${r.trust_after} · ${r.status}</small>
      </article>`).join("\n")}
    </div>
  </section>
</section>
`;

let html = read("ui/index.html");

if (!html.includes("proofPanel")) {
  html = html.replace("<main>", "<main>\n" + proofHtml);
}

html = html.replace(
  /<h1>Model organizations\. Run missions\. Execute decisions\.<\/h1>/,
  "<h1>Turn reality into the next best action.</h1>"
);

html = html.replace(
  /CYVX is the operating system for organizational reality\.[\s\S]*?architecture\./,
  "Upload messy reality. CYVX finds the constraint, creates a mission, captures the outcome, and improves trust."
);

write("ui/index.html", html);

let css = read("ui/styles.css");
if (!css.includes(".proof-hero")) {
  css += `
.proof-hero{
  display:grid;
  grid-template-columns:1.5fr .8fr;
  gap:24px;
  align-items:center;
  padding:32px;
  margin:20px 0;
  border:1px solid rgba(255,255,255,.12);
  border-radius:28px;
  background:radial-gradient(circle at top left,rgba(87,255,196,.18),transparent 35%),linear-gradient(135deg,rgba(14,24,48,.96),rgba(5,8,18,.98));
}
.proof-hero h1{
  font-size:clamp(34px,7vw,76px);
  line-height:.95;
  letter-spacing:-.06em;
  margin:10px 0 16px;
}
.hero-sub{
  max-width:760px;
  font-size:18px;
  opacity:.86;
}
.hero-actions{
  display:flex;
  gap:12px;
  flex-wrap:wrap;
  margin-top:22px;
}
.nav-jump{
  border:0;
  border-radius:999px;
  padding:13px 20px;
  font-weight:800;
  cursor:pointer;
}
.nav-jump.secondary{
  opacity:.78;
}
.proof-score-card{
  padding:26px;
  border-radius:24px;
  background:rgba(255,255,255,.08);
  border:1px solid rgba(255,255,255,.14);
}
.proof-score-card span,.proof-score-card small{
  display:block;
  opacity:.78;
}
.proof-score-card strong{
  display:block;
  font-size:64px;
  margin:8px 0;
}
.proof-list{
  display:grid;
  gap:12px;
  margin-top:18px;
}
.proof-item{
  padding:16px;
  border-radius:18px;
  background:rgba(255,255,255,.055);
  border:1px solid rgba(255,255,255,.1);
}
.proof-item span{
  font-size:12px;
  opacity:.65;
}
.proof-item strong{
  display:block;
  margin:4px 0;
}
.proof-item p{
  margin:0 0 6px;
  opacity:.86;
}
.proof-item small{
  opacity:.68;
}
@media(max-width:800px){
  .proof-hero{grid-template-columns:1fr;padding:22px}
}
`;
}
write("ui/styles.css", css);

let app = read("ui/app.js");
if (!app.includes("nav-jump")) {
  app += `
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".nav-jump");
  if (!btn) return;
  const target = btn.getAttribute("data-target");
  if (!target) return;
  document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
  const panel = document.getElementById(target);
  if (panel) panel.classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
});
`;
}
write("ui/app.js", app);

console.log("Public proof UI + simplified hero added.");
