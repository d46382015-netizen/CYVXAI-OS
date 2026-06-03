#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

function read(p){ try { return fs.readFileSync(p,"utf8"); } catch { return ""; } }
function write(p,v){ fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,v); }

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>CYVXAI OS</title>
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="logo">CY</div>
        <div>
          <h1>CYVX</h1>
          <p>Autonomous Intelligence OS</p>
        </div>
      </div>

      <nav class="side-nav">
        <button class="active">Command Center</button>
        <button>Reality Intake</button>
        <button>Mission Control</button>
        <button>Execution Board</button>
        <button>Intelligence Hub</button>
        <button>Reality Graph</button>
        <button>Opportunities</button>
        <button>Simulations</button>
        <button>Decision Center</button>
        <button>Performance</button>
        <button>Governance</button>
        <button>Agent OS</button>
      </nav>

      <div class="status-card">
        <span>System Status</span>
        <p>Agents Online <b>24/24</b></p>
        <p>Missions Active <b>7</b></p>
        <p>Success Rate <b>98.7%</b></p>
        <p>Trust Score <b>92</b></p>
      </div>

      <div class="orb-mini">
        <div class="orb"></div>
        <strong>CYVX is awake.</strong>
        <small>Model. Decide. Execute. Improve.</small>
      </div>
    </aside>

    <main class="main">
      <header class="topbar">
        <div class="search">Ask CYVX anything...</div>
        <div class="top-metric"><span>System Health</span><b>Excellent</b></div>
        <div class="top-metric"><span>Autonomy</span><b>92%</b></div>
        <div class="avatar">CY</div>
      </header>

      <section class="hero">
        <div>
          <p class="kicker">Welcome back, Operator.</p>
          <h2>Turn reality into <span>the next best action.</span></h2>
          <p>Upload reality. CYVX finds the constraint, creates the mission, captures outcomes, and improves trust.</p>
          <div class="actions">
            <button class="primary">Upload Reality</button>
            <button>Model My Company</button>
            <button>Run Mission</button>
          </div>
        </div>
        <div class="big-orb"></div>
      </section>

      <section class="metrics">
        <div><span>Trust Score</span><b>92</b><small>↑ 2.3</small></div>
        <div><span>Missions Active</span><b>7</b><small>↑ 3</small></div>
        <div><span>Outcomes Today</span><b>23</b><small>↑ 15</small></div>
        <div><span>Agents Online</span><b>24</b><small>/ 24</small></div>
        <div><span>Autonomy Level</span><b>92%</b><small>↑ 4%</small></div>
      </section>

      <section class="proof-pack">
        <div>
          <p class="kicker">CYVX Proof Pack</p>
          <h3>10 / 10</h3>
          <p>Reality loops completed · Average trust after: <b>92</b></p>
          <button>View Full Proof Pack</button>
        </div>
        <div class="proof-icons">
          ${["Repo","Agent","Workflow","SBOM","Business","UI","Deploy","Revenue","Users","Self"].map(x=>`<div><span>✦</span><small>${x}</small></div>`).join("")}
        </div>
      </section>

      <section class="grid">
        <article class="panel mission">
          <p class="kicker">Mission Control</p>
          <div class="ring">7<span>active</span></div>
          <button>Go to Mission Control</button>
        </article>

        <article class="panel nba">
          <p class="kicker">Next Best Action</p>
          <h3>Add verification gates to all high-risk missions</h3>
          <p>Reduces rework by 34% and increases outcome reliability.</p>
          <b>9.4 / 10</b>
          <button class="primary">Execute Now</button>
        </article>

        <article class="panel graph">
          <p class="kicker">Reality Graph</p>
          <div class="network">
            ${Array.from({length:22}).map((_,i)=>`<i style="--x:${Math.random()*90+5}%;--y:${Math.random()*80+10}%"></i>`).join("")}
          </div>
        </article>

        <article class="panel">
          <p class="kicker">Intelligence Summary</p>
          <ul>
            <li><b>3</b> Risks Detected</li>
            <li><b>5</b> Opportunities</li>
            <li><b>7</b> Recommendations</li>
            <li><b>2</b> Patterns Found</li>
          </ul>
        </article>

        <article class="panel">
          <p class="kicker">Execution Velocity</p>
          <h3>87%</h3>
          <div class="chart"></div>
        </article>

        <article class="panel">
          <p class="kicker">Outcomes / Impact</p>
          <h3>$128K</h3>
          <p>Value generated · ↑ 23% vs last 7 days</p>
          <div class="bars">${[20,55,38,70,45,62,84].map(h=>`<i style="height:${h}%"></i>`).join("")}</div>
        </article>
      </section>

      <section class="bottom-grid">
        <article class="panel">
          <p class="kicker">Quick Launch</p>
          <div class="quick">
            <button>Self Scan</button><button>Simulation</button><button>Agent Registry</button><button>Create Mission</button>
          </div>
        </article>
        <article class="panel">
          <p class="kicker">Recent Activity</p>
          <p>Mission “Automate Onboarding” completed</p>
          <p>Reality uploaded: Q2 Results</p>
          <p>Outcome recorded: $45K saved</p>
        </article>
        <article class="panel glow">
          <p class="kicker">CYVX Autonomy Engine</p>
          <h3>Active</h3>
          <p>Watching. Learning. Coordinating. Improving.</p>
        </article>
      </section>
    </main>
  </div>
</body>
</html>`;

const css = `
*{box-sizing:border-box} body{margin:0;background:#050813;color:#f5f7ff;font-family:Inter,system-ui,Segoe UI,sans-serif;overflow-x:hidden}
body:before{content:"";position:fixed;inset:0;background:radial-gradient(circle at 75% 15%,rgba(119,73,255,.28),transparent 28%),radial-gradient(circle at 85% 80%,rgba(31,255,202,.18),transparent 30%);pointer-events:none}
.app-shell{display:grid;grid-template-columns:240px 1fr;min-height:100vh}
.sidebar{position:sticky;top:0;height:100vh;padding:24px 18px;background:linear-gradient(180deg,#071225,#020712);border-right:1px solid rgba(255,255,255,.08)}
.brand{display:flex;gap:14px;align-items:center;margin-bottom:28px}.logo,.avatar{display:grid;place-items:center;border-radius:18px;background:linear-gradient(135deg,#5fffd2,#8d5cff);color:#04101b;font-weight:900}.logo{width:52px;height:52px}.avatar{width:48px;height:48px}.brand h1{margin:0;font-size:28px}.brand p{margin:3px 0 0;color:#9aa8c5;font-size:13px}
.side-nav{display:grid;gap:8px}.side-nav button,.actions button,.panel button,.proof-pack button,.quick button{border:1px solid rgba(255,255,255,.11);background:rgba(255,255,255,.045);color:#f5f7ff;border-radius:14px;padding:12px 14px;text-align:left}.side-nav .active,.primary{background:linear-gradient(135deg,#39dfff,#a441ff)!important;box-shadow:0 0 30px rgba(122,87,255,.45)}
.status-card,.orb-mini,.panel,.proof-pack,.top-metric,.search,.metrics div{border:1px solid rgba(255,255,255,.1);background:linear-gradient(180deg,rgba(14,25,49,.78),rgba(5,10,24,.82));border-radius:22px;box-shadow:0 20px 60px rgba(0,0,0,.28)}
.status-card{margin-top:28px;padding:18px}.status-card span,.kicker{color:#62ffd4;text-transform:uppercase;letter-spacing:.14em;font-size:12px}.status-card p{display:flex;justify-content:space-between;color:#aab6cf}.status-card b{color:#5fffd2}
.orb-mini{margin-top:16px;padding:18px}.orb,.big-orb{border-radius:50%;background:radial-gradient(circle at 35% 30%,#71ffe4,#805cff 42%,#091327 70%);box-shadow:0 0 70px #45ffe055}.orb{width:90px;height:90px;margin:18px auto}.big-orb{width:min(340px,70vw);height:min(340px,70vw);animation:pulse 5s infinite ease-in-out}
.main{padding:24px;position:relative}.topbar{display:grid;grid-template-columns:1fr 170px 140px 54px;gap:14px;align-items:center;margin-bottom:28px}.search,.top-metric{padding:16px 18px}.top-metric span{display:block;color:#9aa8c5;font-size:12px}.top-metric b{color:#5fffd2;text-transform:uppercase}
.hero{display:grid;grid-template-columns:1.2fr .8fr;gap:28px;align-items:center;margin-bottom:20px}.hero h2{font-size:clamp(42px,7vw,86px);line-height:.95;margin:10px 0;letter-spacing:-.06em}.hero h2 span{background:linear-gradient(90deg,#4fffe0,#5288ff,#b845ff);-webkit-background-clip:text;color:transparent}.hero p{color:#b4bfd8;max-width:640px;font-size:18px}.actions{display:flex;gap:14px;flex-wrap:wrap;margin-top:24px}.actions button{text-align:center;font-weight:800}
.metrics{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin:22px 0}.metrics div{padding:20px}.metrics span{display:block;color:#a8b4cd;font-size:12px;text-transform:uppercase}.metrics b{font-size:38px}.metrics small{color:#5fffd2}
.proof-pack{display:grid;grid-template-columns:260px 1fr;gap:24px;padding:24px;margin-bottom:18px;border-color:rgba(117,80,255,.5)}.proof-pack h3{font-size:48px;margin:6px 0}.proof-icons{display:grid;grid-template-columns:repeat(10,1fr);gap:12px}.proof-icons div{display:grid;place-items:center;gap:8px}.proof-icons span{display:grid;place-items:center;width:48px;height:48px;border-radius:14px;background:linear-gradient(135deg,rgba(58,224,255,.3),rgba(168,68,255,.35));border:1px solid rgba(255,255,255,.13)}
.grid{display:grid;grid-template-columns:1fr 1fr 1.35fr;gap:16px}.panel{padding:22px;min-height:220px}.panel h3{font-size:28px;margin:10px 0}.ring{width:150px;height:150px;border-radius:50%;display:grid;place-items:center;margin:15px auto;background:radial-gradient(circle,#10182d 45%,transparent 46%),conic-gradient(#31ffe0,#8b5cff,#31ffe0);font-size:44px}.ring span{display:block;font-size:12px;text-transform:uppercase;color:#aab6cf}.network{position:relative;height:230px}.network i{position:absolute;left:var(--x);top:var(--y);width:12px;height:12px;border-radius:50%;background:#53ffe4;box-shadow:0 0 18px #53ffe4}.chart{height:110px;background:linear-gradient(135deg,transparent 48%,rgba(67,255,220,.35) 49%,transparent 51%),radial-gradient(circle at 70% 40%,rgba(64,255,209,.3),transparent 40%);border-radius:16px}.bars{display:flex;align-items:end;gap:9px;height:120px}.bars i{flex:1;border-radius:8px;background:linear-gradient(180deg,#54ffe1,#7b55ff)}.bottom-grid{display:grid;grid-template-columns:1fr 1.1fr 1fr;gap:16px;margin-top:16px}.quick{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.glow{box-shadow:0 0 60px rgba(129,79,255,.28)}
@keyframes pulse{50%{transform:scale(1.04);filter:hue-rotate(30deg)}}
@media(max-width:900px){.app-shell{grid-template-columns:1fr}.sidebar{position:relative;height:auto}.topbar,.hero,.proof-pack,.grid,.bottom-grid,.metrics{grid-template-columns:1fr}.proof-icons{grid-template-columns:repeat(5,1fr)}.main{padding:16px}.side-nav{grid-template-columns:repeat(2,1fr)}}
`;

write("ui/index.html", html);
write("ui/styles.css", css);
console.log("CYVX WOW UI installed.");
