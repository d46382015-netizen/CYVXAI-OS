"use strict";

function mountFinalUserLayer(){
  const userLayer=document.getElementById("cyvxUserLayer");
  if(!userLayer) return;

  document.getElementById("cyvxFinalLayer")?.remove();

  const section=document.createElement("section");
  section.id="cyvxFinalLayer";
  section.innerHTML=`
    <section class="final-layer">

      <div class="user-card chat-card">
        <div class="section-head">
          <h2>Tell CYVX Anything</h2>
          <span>Your Digital Twin turns reality into action</span>
        </div>

        <div class="chat-box">
          <input id="cyvxChatInput" placeholder="I want to make an extra $2,000/month..." />
          <button id="cyvxChatBtn">Generate Plan</button>
        </div>

        <div id="cyvxChatResult" class="chat-result">
          <strong>Example</strong>
          <p>CYVX will identify your current reality, constraint, opportunity, plan, assets, and next action.</p>
        </div>
      </div>

      <div class="user-card">
        <div class="section-head">
          <h2>Assets</h2>
          <span>Things CYVX can create for you</span>
        </div>

        <div class="asset-grid">
          <article><strong>Website</strong><small>Offer + landing page</small></article>
          <article><strong>Lead List</strong><small>Qualified prospects</small></article>
          <article><strong>Content Kit</strong><small>Posts, scripts, hooks</small></article>
          <article><strong>Automation</strong><small>Workflow + actions</small></article>
          <article><strong>Business Plan</strong><small>Path + milestones</small></article>
          <article><strong>Proposal</strong><small>Client-ready asset</small></article>
        </div>
      </div>

      <div class="user-card advanced-card">
        <div class="section-head">
          <h2>Advanced Intelligence</h2>
          <span>Hidden engine for power users</span>
        </div>

        <div class="advanced-grid">
          <article>Digital Twin Ω</article>
          <article>Reality Graph</article>
          <article>Cognitive Council</article>
          <article>Future Simulator</article>
          <article>Learning Engine</article>
          <article>Evolution Queue</article>
        </div>
      </div>

    </section>
  `;

  userLayer.insertAdjacentElement("afterend",section);

  document.getElementById("cyvxChatBtn")?.addEventListener("click",async()=>{
    const input=document.getElementById("cyvxChatInput");
    const result=document.getElementById("cyvxChatResult");
    const goal=input?.value?.trim() || "Improve my situation";

    result.innerHTML="<strong>CYVX is thinking...</strong><p>Modeling reality, constraint, opportunity, plan, assets, and next action.</p>";

    try{
      const r=await fetch("/api/v1/agency-runtime/run",{
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({goal})
      });
      const data=await r.json();
      const loop=data.agencyRuntime || data.data?.agencyRuntime || {};
      const mission=loop.mission || {};

      result.innerHTML=`
        <strong>${mission.title || "Recommended Plan"}</strong>
        <p><b>Reality:</b> ${goal}</p>
        <p><b>Constraint:</b> ${mission.constraint || "Primary bottleneck detected"}</p>
        <p><b>Opportunity:</b> ${mission.opportunity || "Create a measurable outcome loop"}</p>
        <p><b>Next Action:</b> ${mission.next_action || "Execute the smallest measurable mission"}</p>
      `;
    }catch(e){
      result.innerHTML="<strong>Plan ready</strong><p>Run the API server, then generate again.</p>";
    }
  });
}

document.addEventListener("click",e=>{
  const btn=e.target.closest(".side-nav button");
  if(!btn) return;

  const page=btn.textContent.trim();

  setTimeout(()=>{
    if(page==="Home") window.scrollTo({top:0,behavior:"smooth"});
    if(page==="Chat") document.getElementById("cyvxChatInput")?.focus();
    if(page==="Goals") document.querySelector("#cyvxUserLayer")?.scrollIntoView({behavior:"smooth"});
    if(page==="Assets") document.querySelector(".asset-grid")?.scrollIntoView({behavior:"smooth"});
    if(page==="Progress") document.querySelector(".progress-grid")?.scrollIntoView({behavior:"smooth"});
    if(page==="Advanced") document.querySelector(".advanced-card")?.scrollIntoView({behavior:"smooth"});
  },80);
},true);

window.addEventListener("DOMContentLoaded",()=>setTimeout(mountFinalUserLayer,800));
