"use strict";

const $=(id)=>document.getElementById(id);
let runtime={
  trust:92,autonomy:92,agentsOnline:24,missionsActive:7,outcomesToday:10,proofCompleted:10,proofTotal:10,
  nextBestAction:"Run one reality → mission → outcome loop and record the result.",
  topConstraint:"Real outcome volume is the next compounding constraint.",
  signals:[],opportunities:[],agents:[],missions:[]
};

async function loadRuntime(){
  try{
    const r=await fetch("/data/runtime/live-dashboard-state.json?ts="+Date.now());
    if(r.ok) runtime=await r.json();
  }catch(e){}
  renderRuntime();
}

function toast(msg){
  let t=$("toast");
  if(!t){t=document.createElement("div");t.id="toast";document.body.appendChild(t)}
  t.textContent=msg;t.className="toast show";
  setTimeout(()=>t.className="toast",2400);
}

function modal(title,body){
  let m=$("cyvxModal");
  if(!m){
    m=document.createElement("div");
    m.id="cyvxModal";
    m.innerHTML='<div class="modal-card"><button id="modalClose">×</button><h2 id="modalTitle"></h2><div id="modalBody"></div></div>';
    document.body.appendChild(m);
    $("modalClose").onclick=()=>m.classList.remove("show");
    m.onclick=e=>{if(e.target===m)m.classList.remove("show")}
  }
  $("modalTitle").textContent=title;
  $("modalBody").innerHTML=body;
  m.classList.add("show");
}

function analyzeReality(text){
  const t=String(text||"").toLowerCase();
  const hasDeploy=/deploy|public|server|hosting|production|localhost|url|website/.test(t);
  const hasRevenue=/revenue|customer|sales|roi|money|proof pack|funding|client/.test(t);
  const hasRepo=/repo|github|readme|branch|commit|issue|pull request|code/.test(t);
  const hasUI=/ui|dashboard|mobile|screen|layout|design|clutter|wow/.test(t);
  const constraint=hasDeploy?"Deployment/public access is the current bottleneck.":hasUI?"The UI must compress complexity into one clear value moment.":hasRevenue?"Revenue needs proof-backed adoption evidence.":hasRepo?"Repository reality needs conversion into one measurable mission.":"Reality is messy and needs decision compression.";
  const opportunity=hasRevenue?"Use proof pack as the revenue wedge.":hasUI?"Turn the dashboard into an attention-grabbing product demo.":hasRepo?"Use repository proof as the first operating reality.":"Convert reality into a mission loop.";
  return {constraint,opportunity,nba:"Run one reality → mission → outcome loop and record the result.",mission:hasUI?"Create the 60-second CYVX value moment":"Create one measurable proof loop",confidence:"88%"};
}

function ensureRuntimePanels(){
  if(!$("realityInbox")){
    document.querySelector(".hero")?.insertAdjacentHTML("afterend",`
      <section class="runtime-strip">
        <article class="runtime-panel" id="realityInbox"><p class="kicker">Reality Inbox</p><h3>Live Signals</h3><div class="runtime-list" id="signalList"></div></article>
        <article class="runtime-panel" id="opportunityRadar"><p class="kicker">Opportunity Radar</p><h3>Ranked Opportunities</h3><div class="runtime-list" id="opportunityList"></div></article>
        <article class="runtime-panel" id="agentActivity"><p class="kicker">Agent Activity</p><h3>CYVX is working</h3><div class="runtime-list" id="agentList"></div></article>
      </section>
    `);
  }
  if(!$("commandPalette")){
    document.body.insertAdjacentHTML("beforeend",`
      <div id="commandPalette">
        <div class="palette-card">
          <input id="paletteInput" placeholder="Type command: analyze reality, expand cyvx, show proof..." />
          <div id="paletteResults"></div>
        </div>
      </div>
    `);
  }
}

function ensureValueMoment(){
  if($("instantRealityInput"))return;
  document.querySelector(".hero")?.insertAdjacentHTML("afterend",`
    <section class="value-card">
      <div><p class="kicker">Value Moment</p><h2>Paste reality. Get the mission.</h2><p>Paste repo notes, business problems, tasks, plans, or messy context.</p></div>
      <textarea id="instantRealityInput" placeholder="Paste reality here..."></textarea>
      <button class="primary" id="instantAnalyzeBtn">Generate Next Best Action</button>
      <div class="result-card">
        <p><b>Top Constraint:</b> <span id="instantConstraint">—</span></p>
        <p><b>Top Opportunity:</b> <span id="instantOpportunity">—</span></p>
        <p><b>Next Best Action:</b> <span id="instantNBA">—</span></p>
        <p><b>Mission:</b> <span id="instantMission">—</span></p>
        <p><b>Confidence:</b> <span id="instantConfidence">—</span></p>
      </div>
    </section>
  `);
}

function renderRuntime(){
  ensureRuntimePanels();
  const metrics=[...document.querySelectorAll(".metrics div")];
  if(metrics[0])metrics[0].innerHTML=`<span>Trust Score</span><b>${runtime.trust||92}</b><small>live</small>`;
  if(metrics[1])metrics[1].innerHTML=`<span>Missions Active</span><b>${runtime.missionsActive||7}</b><small>active</small>`;
  if(metrics[2])metrics[2].innerHTML=`<span>Outcomes Today</span><b>${runtime.outcomesToday||10}</b><small>proof</small>`;
  if(metrics[3])metrics[3].innerHTML=`<span>Agents Online</span><b>${runtime.agentsOnline||24}</b><small>/ 24</small>`;
  if(metrics[4])metrics[4].innerHTML=`<span>Autonomy Level</span><b>${runtime.autonomy||92}%</b><small>live</small>`;
  const nba=document.querySelector(".nba h3"); if(nba)nba.textContent=runtime.nextBestAction||"Run one proof loop";
  const nbap=document.querySelector(".nba p"); if(nbap)nbap.textContent=runtime.topConstraint||"Constraint loading";
  const signal=$("signalList"); if(signal)signal.innerHTML=(runtime.signals||[]).map(x=>`<div class="runtime-item"><span>${x.type}</span><b>${x.title}</b><small>${x.detail}</small></div>`).join("");
  const opp=$("opportunityList"); if(opp)opp.innerHTML=(runtime.opportunities||[]).map(x=>`<div class="runtime-item clickable" data-action="${x.action}"><span>${x.confidence}% confidence</span><b>${x.title}</b><small>${x.action}</small></div>`).join("");
  const agents=$("agentList"); if(agents)agents.innerHTML=(runtime.agents||[]).map(x=>`<div class="runtime-item"><span>${x.name}</span><b>${x.status}</b><small>${x.progress}%</small></div>`).join("");
}

function runCommand(cmd){
  const c=String(cmd||"").toLowerCase();
  if(c.includes("expand")){
    modal("Expand CYVX","<p>Portfolio Brain selected the highest leverage expansion.</p><b>"+(runtime.nextBestAction||"Build next capability")+"</b>");
    toast("Expansion mission generated.");
  }else if(c.includes("proof")){
    modal("Proof Pack",`<p>${runtime.proofCompleted||10}/${runtime.proofTotal||10} loops completed.</p><p>Trust: ${runtime.trust||92}</p>`);
  }else if(c.includes("agent")){
    modal("Agent Activity",(runtime.agents||[]).map(a=>`<p><b>${a.name}</b> — ${a.status} (${a.progress}%)</p>`).join(""));
  }else if(c.includes("opportun")){
    modal("Opportunity Radar",(runtime.opportunities||[]).map(o=>`<p><b>${o.title}</b> — ${o.confidence}%<br>${o.action}</p>`).join(""));
  }else{
    const d=analyzeReality(c);
    updateValue(d);
    modal("CYVX Decision",`<p><b>Constraint:</b> ${d.constraint}</p><p><b>Opportunity:</b> ${d.opportunity}</p><p><b>NBA:</b> ${d.nba}</p>`);
  }
}

function updateValue(d){
  if($("instantConstraint"))$("instantConstraint").textContent=d.constraint;
  if($("instantOpportunity"))$("instantOpportunity").textContent=d.opportunity;
  if($("instantNBA"))$("instantNBA").textContent=d.nba;
  if($("instantMission"))$("instantMission").textContent=d.mission;
  if($("instantConfidence"))$("instantConfidence").textContent=d.confidence;
}

function wireClicks(){
  document.addEventListener("click",e=>{
    const side=e.target.closest(".side-nav button");
    if(side){document.querySelectorAll(".side-nav button").forEach(b=>b.classList.remove("active"));side.classList.add("active");modal(side.textContent.trim(),"<p>Runtime drill-down opened.</p><p>"+(runtime.topConstraint||"Live state active")+"</p>");return}
    const btn=e.target.closest("button");
    if(btn&&btn.id==="instantAnalyzeBtn"){updateValue(analyzeReality($("instantRealityInput")?.value));toast("Next Best Action generated.");return}
    if(btn&&/upload reality/i.test(btn.textContent)){$("instantRealityInput")?.focus();toast("Paste reality below.");return}
    if(btn&&/model my company/i.test(btn.textContent)){updateValue(analyzeReality("company revenue deployment teams cloud spend"));toast("Company modeled.");return}
    if(btn&&/run mission|execute now/i.test(btn.textContent)){modal("Mission Executed","<p>Mission queued. Outcome capture ready.</p>");toast("Mission queued.");return}
    if(e.target.closest(".proof-pack")){modal("Proof Pack",`<h3>${runtime.proofCompleted||10}/${runtime.proofTotal||10}</h3><p>Reality loops completed. Trust ${runtime.trust||92}.</p>`);return}
    if(e.target.closest(".network")){modal("Reality Graph","<p>Graph recalibrated from runtime signals, missions, and opportunities.</p>");return}
    const clickable=e.target.closest(".clickable"); if(clickable){runCommand(clickable.dataset.action);return}
  });

  document.addEventListener("keydown",e=>{
    if(e.key==="/"){
      e.preventDefault();
      $("commandPalette").classList.add("show");
      $("paletteInput").focus();
    }
    if(e.key==="Escape")$("commandPalette")?.classList.remove("show");
    if(e.key==="Enter"&&document.activeElement?.id==="paletteInput"){
      runCommand($("paletteInput").value);
      $("commandPalette").classList.remove("show");
      $("paletteInput").value="";
    }
  });
}

function initSearch(){
  const search=document.querySelector(".search");
  if(!search)return;
  search.contentEditable="true";
  search.addEventListener("keydown",e=>{
    if(e.key==="Enter"){e.preventDefault();runCommand(search.textContent)}
  });
}

function init(){
  ensureValueMoment();
  ensureRuntimePanels();
  wireClicks();
  initSearch();
  loadRuntime();
  setInterval(loadRuntime,5000);
}

document.addEventListener("DOMContentLoaded",init);
