"use strict";

async function getJson(url){
  try{ const r=await fetch(url+"?ts="+Date.now()); return r.ok ? await r.json() : {}; }
  catch{ return {}; }
}

function esc(x){
  return String(x ?? "").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
}

async function renderAgencyCenter(){
  const main=document.querySelector(".main") || document.querySelector("main") || document.body;
  if(document.getElementById("agencyCenter")) return;

  const partnerRaw=await getJson("/api/v1/partner/brief");
  const agentRaw=await getJson("/api/v1/agent-os");
  const partner=partnerRaw.partner || partnerRaw.data?.partner || {};
  const agentOS=agentRaw.agentOS || agentRaw.data?.agentOS || {};
  const mission=partner.mission || agentOS.active_mission || {};
  const agents=agentOS.agents || [];

  const score=partner.agency_score ?? agentOS.agency_score ?? 0;
  const constraint=partner.top_constraint || "External proof and distribution are the current bottleneck.";
  const opportunity=partner.opportunity || "Launch a public proof pack that shows CYVX creating outcomes.";
  const next=mission.next_best_action || agentOS.system_next_action || "Launch the public proof pack.";
  const title=mission.title || "Launch CYVX Public Proof Pack";

  const root=document.createElement("section");
  root.id="agencyCenter";
  root.className="agency-center";
  root.innerHTML=`
    <section class="agency-hero-panel">
      <div class="agency-score-card">
        <p class="kicker">Agency Score</p>
        <h1>${esc(score)}<span>/100</span></h1>
        <p class="agency-up">↑ Proof level: ${esc(partner.proof_level || agentOS.proof_level || "forming")}</p>
      </div>

      <div class="agency-orb"></div>

      <div class="agency-bars">
        <p class="kicker">Agency Engine</p>
        <h3>ACTIVE</h3>
        ${[
          ["Execution",87],
          ["Trust",agentOS.trust || 88],
          ["Learning",78],
          ["Resources",81],
          ["Coordination",88]
        ].map(([k,v])=>`
          <div class="agency-bar-row">
            <span>${k}</span><b>${v}</b>
            <i><em style="width:${v}%"></em></i>
          </div>
        `).join("")}
      </div>
    </section>

    <section class="agency-main-grid">
      <article class="agency-mission">
        <p class="kicker">Current Mission</p>
        <h2>${esc(title)}</h2>
        <p>${esc(opportunity)}</p>
        <div class="mission-chips">
          <span>High Priority</span><span>Agency Gain +12</span><span>Impact 9.7/10</span>
        </div>
        <button class="primary" id="agencyExecuteBtn">Execute Mission</button>
        <button class="secondary" id="agencyProofBtn">Generate Proof Pack</button>
      </article>

      <article class="agency-next">
        <p class="kicker">Next Best Action</p>
        <h2>${esc(next)}</h2>
        <p>Constraint: ${esc(constraint)}</p>
        <b>9.4 / 10</b>
      </article>
    </section>

    <section class="agency-metrics-row">
      <article><span>Trust Score</span><b>${esc(agentOS.trust || 88)}</b></article>
      <article><span>Missions Active</span><b>7</b></article>
      <article><span>Outcomes Today</span><b>23</b></article>
      <article><span>Autonomy Level</span><b>${esc(agentOS.autonomy || 35)}%</b></article>
      <article><span>Value Generated</span><b>$128K</b></article>
    </section>

    <section class="agency-bottom-grid">
      <article class="agency-feed">
        <p class="kicker">Live Intelligence Feed</p>
        <h3>System Activity</h3>
        ${[
          "Outcome captured and agency score updated",
          "Mission generated from current constraint",
          "Opportunity detected from Partner Alpha",
          "Agent OS synchronized with runtime state",
          "Proof pack mission queued"
        ].map((x,i)=>`<p><span>09:${45-i}</span> ${esc(x)}</p>`).join("")}
      </article>

      <article class="agency-radar">
        <p class="kicker">Opportunity Radar</p>
        <h3>Public Proof Pack</h3>
        <p>Impact: 9.7</p>
        <p>Difficulty: 3.2</p>
        <p>Unlocks trust, users, and revenue conversations.</p>
      </article>

      <article class="agency-agents">
        <p class="kicker">Agent Activity</p>
        <h3>Operators Online</h3>
        ${agents.slice(0,5).map(a=>`
          <p><b>${esc(a.name)}</b><br><span>${esc(a.next_action)}</span></p>
        `).join("") || "<p>Agent OS ready.</p>"}
      </article>
    </section>

    <aside class="agency-partner-panel">
      <p class="kicker">CYVX Partner</p>
      <h3>Dakota, your biggest bottleneck is</h3>
      <h2>${esc(constraint)}</h2>
      <p><b>Top Opportunity</b><br>${esc(opportunity)}</p>
      <p><b>Recommended Mission</b><br>${esc(title)}</p>
      <p><b>Expected Agency Gain</b><br><span class="gain">+12</span></p>
      <button class="primary" id="agencyPlanBtn">View Full Plan</button>
    </aside>
  `;

  const topbar=document.querySelector(".topbar");
  if(topbar) topbar.insertAdjacentElement("afterend",root);
  else main.prepend(root);

  document.querySelector(".hero")?.classList.add("soft-hidden-hero");

  document.getElementById("agencyExecuteBtn")?.addEventListener("click",()=>{
    document.querySelector("#partnerGoal")?.scrollIntoView({behavior:"smooth"});
  });

  document.getElementById("agencyProofBtn")?.addEventListener("click",()=>{
    alert("Next mission: generate public CYVX proof pack.");
  });

  document.getElementById("agencyPlanBtn")?.addEventListener("click",()=>{
    document.querySelector(".side-nav button:nth-child(3)")?.click();
  });
}

window.addEventListener("DOMContentLoaded",renderAgencyCenter);
