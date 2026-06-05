"use strict";

async function getJSON(url){
  try{ const r=await fetch(url+"?ts="+Date.now()); return r.ok ? await r.json() : {}; }
  catch{ return {}; }
}
function esc(x){return String(x??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}

async function renderRealityOS(){
  const main=document.querySelector(".main")||document.querySelector("main")||document.body;
  document.querySelectorAll("#homepageV10,#enterprisePage,#agencyCenter,#cyvxV10,#cyvxNexus,#realityOS,.hero,.value-card,.runtime-strip,.proof-pack,.grid,.bottom-grid,.metrics,.quick,.recent,.panel").forEach(x=>x.remove());
  document.querySelector(".side-nav")?.classList.add("ro-hidden");

  const pr=await getJSON("/api/v1/partner/brief");
  const ar=await getJSON("/api/v1/agent-os");
  const partner=pr.partner||pr.data?.partner||{};
  const agent=ar.agentOS||ar.data?.agentOS||{};
  const mission=partner.mission||agent.active_mission||{};
  const agents=agent.agents||[];

  const currentReality=partner.top_constraint||"Distribution is limiting growth.";
  const opportunity=partner.opportunity||"Build a creator distribution engine.";
  const action=mission.next_best_action||agent.system_next_action||"Launch the next measurable distribution sprint.";
  const missionTitle=mission.title||"Launch Distribution Sprint";

  const root=document.createElement("section");
  root.id="realityOS";
  main.prepend(root);

  root.innerHTML=`
    <section class="ro-first-screen">
      <div class="ro-core">
        <div class="omega">Ω</div>
        <p>DIGITAL TWIN</p>
      </div>

      <div class="ro-brief">
        <p class="eyebrow">CURRENT REALITY</p>
        <h1>${esc(currentReality)}</h1>

        <div class="ro-brief-grid">
          <article>
            <span>Best Opportunity</span>
            <b>${esc(opportunity)}</b>
          </article>
          <article>
            <span>Recommended Mission</span>
            <b>${esc(missionTitle)}</b>
          </article>
          <article>
            <span>Predicted Outcome</span>
            <b>+22% Growth Velocity</b>
          </article>
          <article>
            <span>Confidence</span>
            <b>91%</b>
          </article>
        </div>

        <button id="roExecute">Execute Mission</button>
      </div>
    </section>

    <section class="ro-world">
      <div class="ro-field">
        <p class="eyebrow">REALITY FIELD</p>
        <h2>Living Reality Graph</h2>

        <div class="graph">
          <svg viewBox="0 0 1000 520" preserveAspectRatio="none">
            <line x1="500" y1="260" x2="175" y2="120"/>
            <line x1="500" y1="260" x2="360" y2="95"/>
            <line x1="500" y1="260" x2="630" y2="98"/>
            <line x1="500" y1="260" x2="820" y2="130"/>
            <line x1="500" y1="260" x2="185" y2="410"/>
            <line x1="500" y1="260" x2="500" y2="430"/>
            <line x1="500" y1="260" x2="815" y2="405"/>
          </svg>

          <div class="node you">YOU</div>
          <div class="node goal">Goal</div>
          <div class="node project">Projects</div>
          <div class="node revenue">Revenue</div>
          <div class="node mission">Mission</div>
          <div class="node constraint">Constraint</div>
          <div class="node agents">Agents</div>
          <div class="node assets">Assets</div>
          <div class="node opportunity">Opportunity</div>
        </div>
      </div>

      <aside class="ro-thoughts">
        <p class="eyebrow">TWIN THOUGHTS</p>
        <h2>What matters now</h2>
        <p>Distribution remains the dominant constraint.</p>
        <p>The highest leverage intervention is a repeatable distribution mission connected to measurable outcomes.</p>
        <p>Expected impact: +31 Distribution · +17 Agency · +4 Revenue Velocity.</p>
        <button>Generate Next Move</button>
      </aside>
    </section>

    <section class="ro-stream">
      <article>
        <p class="eyebrow">REALITY STREAM</p>
        ${["Constraint identified","Opportunity surfaced","Mission generated","Agent activated","Prediction updated","Learning stored"].map((x,i)=>`<div><span>08:${String(2+i*3).padStart(2,"0")}</span>${x}</div>`).join("")}
      </article>

      <article>
        <p class="eyebrow">EXECUTION ENGINE</p>
        ${(agents.length?agents:[
          {name:"Commander",next_action:"Analyzing bottleneck",confidence:94},
          {name:"Architect",next_action:"Structuring mission path",confidence:88},
          {name:"Executor",next_action:"Preparing action loop",confidence:92}
        ]).slice(0,4).map(a=>`
          <div>
            <b>${esc(a.name)}</b>
            <span>${esc(a.next_action||"Working")}</span>
            <small>${esc(a.confidence||88)}% confidence</small>
          </div>
        `).join("")}
      </article>
    </section>

    <div class="ro-command">
      <span>&gt;</span>
      <input placeholder="find revenue · simulate future · identify bottleneck · generate mission" />
    </div>
  `;

  document.getElementById("roExecute")?.addEventListener("click",()=>{
    document.querySelector(".ro-command input")?.focus();
  });
}

window.addEventListener("DOMContentLoaded",renderRealityOS);
