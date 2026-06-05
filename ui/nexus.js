"use strict";

async function nxGet(url){
  try{ const r=await fetch(url+"?ts="+Date.now()); return r.ok ? await r.json() : {}; }
  catch{ return {}; }
}
function nxEsc(x){return String(x??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}

async function renderNexus(){
  const main=document.querySelector(".main")||document.querySelector("main")||document.body;
  document.querySelectorAll("#homepageV10,#enterprisePage,#agencyCenter,.hero,.value-card,.runtime-strip,.proof-pack,.grid,.bottom-grid,.metrics,.quick,.recent,.panel").forEach(x=>x.style.display="none");
  document.querySelector(".side-nav")?.classList.add("nexus-hide-nav");

  const pr=await nxGet("/api/v1/partner/brief");
  const ar=await nxGet("/api/v1/agent-os");
  const partner=pr.partner||pr.data?.partner||{};
  const agent=ar.agentOS||ar.data?.agentOS||{};
  const mission=partner.mission||agent.active_mission||{};
  const agents=agent.agents||[];

  let root=document.getElementById("cyvxNexus");
  if(!root){root=document.createElement("section");root.id="cyvxNexus";main.prepend(root)}

  const agency=partner.agency_score||agent.agency_score||85;
  const constraint=partner.top_constraint||"Distribution";
  const opportunity=partner.opportunity||"Launch a user-facing operating loop";
  const next=mission.next_best_action||agent.system_next_action||"Turn current reality into the next measurable mission.";

  root.innerHTML=`
    <aside class="nx-rail">
      ${["Reality Detected","Constraint Identified","Mission Generated","Agents Active","Opportunity Found","Learning Updated"].map((x,i)=>`
        <button class="${i===1?"hot":""}">
          <i></i><span>${x}</span>
        </button>
      `).join("")}
    </aside>

    <main class="nx-core">
      <section class="nx-reality">
        <p>CYVX Ω · CURRENT REALITY</p>
        <h1>What matters right now?</h1>
        <div class="nx-awareness">
          <article><span>Agency</span><b>${nxEsc(agency)}</b><small>Trajectory ↑</small></article>
          <article><span>Critical Constraint</span><b>${nxEsc(constraint)}</b><small>Highest pressure point</small></article>
          <article><span>Opportunity</span><b>${nxEsc(opportunity)}</b><small>Highest leverage path</small></article>
          <article><span>Predicted Outcome</span><b>+$52K</b><small>Confidence ${nxEsc(agent.proof_level||partner.proof_level||"92%")}</small></article>
        </div>
      </section>

      <section class="nx-map">
        <div class="nx-universe">
          ${["YOU","CYVX","CUSTOMERS","CAPITAL","CONTENT","AGENTS","REVENUE","CONSTRAINTS","MISSIONS","OUTCOMES"].map((x,i)=>`
            <div class="nx-node n${i}">${x}</div>
          `).join("")}
          <div class="nx-orbit o1"></div><div class="nx-orbit o2"></div><div class="nx-orbit o3"></div>
        </div>

        <aside class="nx-twin">
          <p>DIGITAL TWIN</p>
          <h2>Operator State</h2>
          ${[
            ["Momentum","+8.2"],
            ["Execution","87"],
            ["Learning","78"],
            ["Trust",agent.trust||88],
            ["Distribution","43"],
            ["Trajectory","UPWARD"]
          ].map(([k,v])=>`<label><span>${k}</span><b>${v}</b></label>`).join("")}
          <div class="nx-action">
            <span>Highest Leverage Action</span>
            <b>${nxEsc(mission.title||"Launch Distribution Engine")}</b>
            <small>Expected Impact: +17 Agency · +31 Distribution</small>
          </div>
        </aside>
      </section>

      <section class="nx-lower">
        <article class="nx-stream">
          <p>REALITY STREAM</p>
          ${[
            "New opportunity detected",
            "Distribution bottleneck increased",
            "Commander proposed mission",
            "Execution started",
            "Prediction confidence increased",
            "Learning updated"
          ].map((x,i)=>`<div><span>06:${14+i*3}</span>${x}</div>`).join("")}
        </article>

        <article class="nx-agents">
          <p>AGENTS ALIVE</p>
          ${agents.slice(0,5).map(a=>`
            <div>
              <b>${nxEsc(a.name)}</b>
              <span>Thinking: ${nxEsc(a.next_action||"Analyzing current reality")}</span>
              <small>Confidence ${nxEsc(a.confidence||88)}%</small>
            </div>
          `).join("") || "<div><b>Commander</b><span>Thinking: Analyzing distribution bottlenecks</span><small>Confidence 94%</small></div>"}
        </article>

        <article class="nx-opps">
          <p>OPPORTUNITIES IN MOTION</p>
          <div class="nx-solar">
            <i class="green"></i><i class="purple"></i><i class="orange"></i><i class="red"></i>
            <b>${nxEsc(opportunity)}</b>
          </div>
        </article>
      </section>
    </main>
  `;
}
window.addEventListener("DOMContentLoaded",renderNexus);
