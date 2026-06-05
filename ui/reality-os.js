"use strict";

async function roJson(url){
  try{ const r=await fetch(url+"?ts="+Date.now()); return r.ok ? await r.json() : {}; }
  catch{ return {}; }
}
function roEsc(x){return String(x??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}

async function renderRealityOS(){
  const main=document.querySelector(".main")||document.querySelector("main")||document.body;

  document.querySelectorAll(
    "#homepageV10,#enterprisePage,#agencyCenter,#cyvxV10,#cyvxNexus,.hero,.value-card,.runtime-strip,.proof-pack,.grid,.bottom-grid,.metrics,.quick,.recent,.panel"
  ).forEach(x=>x.remove());

  document.querySelector(".side-nav")?.classList.add("ro-hide");

  const pr=await roJson("/api/v1/partner/brief");
  const ar=await roJson("/api/v1/agent-os");

  const partner=pr.partner||pr.data?.partner||{};
  const agent=ar.agentOS||ar.data?.agentOS||{};
  const mission=partner.mission||agent.active_mission||{};
  const agents=agent.agents||[];

  const agency=partner.agency_score||agent.agency_score||87;
  const confidence=mission.confidence||agent.proof_level||"91%";
  const constraint=partner.top_constraint||"Distribution";
  const opportunity=partner.opportunity||"Launch a high-leverage growth mission";
  const action=mission.next_best_action||agent.system_next_action||"Deploy Distribution Mission";

  let root=document.getElementById("realityOS");
  if(!root){
    root=document.createElement("section");
    root.id="realityOS";
    main.prepend(root);
  }

  root.innerHTML=`
    <section class="ro-twin">
      <div class="ro-core"></div>
      <div>
        <p>Digital Twin Ω</p>
        <h1>Current Reality</h1>
        <h2>${roEsc(constraint)}</h2>
      </div>
      <div class="ro-state">
        <article><span>Agency</span><b>${roEsc(agency)}</b></article>
        <article><span>Confidence</span><b>${roEsc(confidence)}</b></article>
        <article><span>Trajectory</span><b>↗</b></article>
        <article><span>Mission Health</span><b>84</b></article>
      </div>
    </section>

    <main class="ro-layout">
      <nav class="ro-rail">
        ${["Reality","Constraint","Opportunity","Mission","Execution","Learning","Evolution"].map((x,i)=>`
          <button class="${i===1?"active":""}">
            <i></i>
            <span>${x}</span>
          </button>
        `).join("")}
      </nav>

      <section class="ro-field">
        <div class="ro-field-head">
          <p>Reality Field</p>
          <h2>Living Reality Graph</h2>
          <span>The graph is the product. Everything else supports it.</span>
        </div>

        <div class="ro-graph">
          <div class="ro-node you">YOU</div>
          <div class="ro-node cyvx">CYVX</div>
          <div class="ro-node people">People</div>
          <div class="ro-node projects">Projects</div>
          <div class="ro-node revenue">Revenue</div>
          <div class="ro-node missions">Missions</div>
          <div class="ro-node opportunities">Opportunities</div>
          <div class="ro-node constraints">Constraints</div>
          <div class="ro-node agents">Agents</div>
          <div class="ro-node assets">Assets</div>

          <svg viewBox="0 0 1000 520" preserveAspectRatio="none">
            <line x1="500" y1="250" x2="210" y2="120"/>
            <line x1="500" y1="250" x2="380" y2="95"/>
            <line x1="500" y1="250" x2="610" y2="105"/>
            <line x1="500" y1="250" x2="810" y2="130"/>
            <line x1="500" y1="250" x2="235" y2="410"/>
            <line x1="500" y1="250" x2="500" y2="430"/>
            <line x1="500" y1="250" x2="785" y2="405"/>
            <line x1="500" y1="250" x2="500" y2="60"/>
          </svg>
        </div>
      </section>

      <aside class="ro-thoughts">
        <p>Twin Thoughts</p>
        <h2>I have identified</h2>
        <div><b>1</b><span>Critical Constraint</span></div>
        <div><b>3</b><span>Active Missions</span></div>
        <div><b>7</b><span>Opportunities</span></div>
        <h3>Recommended Action</h3>
        <strong>${roEsc(action)}</strong>
        <small>Expected Impact: +22 Agency</small>
        <button>Execute</button>
      </aside>
    </main>

    <section class="ro-bottom">
      <article class="ro-stream">
        <p>Reality Stream</p>
        ${[
          "Opportunity detected",
          "Constraint identified",
          "Mission generated",
          "Agent activated",
          "Prediction updated",
          "Learning stored"
        ].map((x,i)=>`<div><span>08:${String(2+i*3).padStart(2,"0")}</span>${x}</div>`).join("")}
      </article>

      <article class="ro-agents">
        <p>Agents Alive</p>
        ${(agents.length?agents:[
          {name:"Commander",next_action:"Analyzing distribution bottlenecks",confidence:94},
          {name:"Architect",next_action:"Building mission structure",confidence:88},
          {name:"Executor",next_action:"Preparing execution path",confidence:92}
        ]).slice(0,4).map(a=>`
          <div>
            <b>${roEsc(a.name)}</b>
            <span>${roEsc(a.next_action||"Working")}</span>
            <small>${roEsc(a.confidence||88)}% confidence</small>
          </div>
        `).join("")}
      </article>
    </section>
  `;
}

window.addEventListener("DOMContentLoaded",renderRealityOS);

async function enhanceRealityOSV2(){
  const root=document.getElementById("realityOS");
  if(!root)return;
  const raw=await roJson("/api/v1/reality-os");
  const os=raw.realityOS||raw.data?.realityOS||{};
  if(!os.digital_twin)return;

  const drift=os.reality_drift||{};
  const a=os.agency_decomposition||{};
  const lm=os.leverage_multiplier||{};
  const dna=os.mission_dna||{};
  const ns=os.nervous_system||{};
  const decay=os.opportunity_decay||{};
  const unknown=os.unknown_detector||{};

  const panel=document.createElement("section");
  panel.className="ro-v2";
  panel.innerHTML=`
    <article class="ro-v2-card drift">
      <p>Reality Drift</p>
      <h2>${drift.drift_percent}%</h2>
      <span>Desired ${drift.desired_reality} → Current ${drift.current_reality}</span>
      <b>${drift.closing_action}</b>
    </article>

    <article class="ro-v2-card agency">
      <p>Agency Decomposition</p>
      ${Object.entries(a).map(([k,v])=>`
        <label><span>${k}</span><b>${v}</b><i><em style="width:${v}%"></em></i></label>
      `).join("")}
    </article>

    <article class="ro-v2-card leverage">
      <p>Leverage Multiplier</p>
      <h2>${lm.input}</h2>
      <div><span>Revenue ×${lm.revenue}</span><span>Agency ×${lm.agency}</span><span>Trust ×${lm.trust}</span><span>Learning ×${lm.learning}</span></div>
    </article>

    <article class="ro-v2-card dna">
      <p>Mission DNA</p>
      <h2>${dna.id}</h2>
      <span>Revenue ${dna.revenue_potential}</span>
      <span>Difficulty ${dna.difficulty}</span>
      <span>Risk ${dna.risk}</span>
      <span>Strategic ${dna.strategic_value}</span>
    </article>

    <article class="ro-v2-card nervous">
      <p>Organizational Nervous System</p>
      <h2>Stress ${ns.stress}</h2>
      <span>Execution latency ${ns.execution_latency}</span>
      <span>Attention fragmentation ${ns.attention_fragmentation}</span>
      <span>Trust ${ns.trust}</span>
    </article>

    <article class="ro-v2-card decay">
      <p>Opportunity Decay</p>
      <h2>$${Number(decay.value||0).toLocaleString()}</h2>
      <span>Decay ${decay.decay_per_day} per day</span>
      <b>${decay.time_remaining_days} days remaining</b>
    </article>

    <article class="ro-v2-card unknowns">
      <p>Unknown Detector</p>
      <h2>${unknown.unknown_unknown}%</h2>
      <span>Unknown unknowns</span>
      <small>Known known ${unknown.known_known}% · Known unknown ${unknown.known_unknown}%</small>
    </article>
  `;
  root.appendChild(panel);

  const thoughts=document.querySelector(".ro-thoughts");
  if(thoughts){
    thoughts.insertAdjacentHTML("beforeend",`
      <div class="ro-evolution">
        <h3>Self-Modification Queue</h3>
        ${(os.self_modification_queue||[]).map(u=>`<span>${u.upgrade} · ${u.expected_impact} · ${u.confidence}%</span>`).join("")}
      </div>
    `);
  }
}
window.addEventListener("DOMContentLoaded",()=>setTimeout(enhanceRealityOSV2,500));
