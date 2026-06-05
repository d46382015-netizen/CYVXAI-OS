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
  const opportunity=hasDeploy?"Public demo unlocks first users, feedback, testimonials, and revenue conversations.":hasRevenue?"Use proof pack as the revenue wedge.":hasUI?"Turn the dashboard into an attention-grabbing product demo.":hasRepo?"Use repository proof as the first operating reality.":"Convert reality into a mission loop.";
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
    
if(side){
  const name = side.textContent.trim();

  if(name.includes("Mission")){
    modal("Mission Control",
      (runtime.missions||[])
        .map(m=>`<p><b>${m.title}</b><br>Status: ${m.status}<br>Impact: ${m.impact}</p>`)
        .join("") || "<p>No missions loaded.</p>"
    );
  }

  else if(name.includes("Agent")){
    modal("Agent Activity",
      (runtime.agents||[])
        .map(a=>`<p><b>${a.name}</b><br>${a.status}<br>Progress: ${a.progress}%</p>`)
        .join("") || "<p>No agents loaded.</p>"
    );
  }

  else if(name.includes("Opportunity")){
    modal("Opportunity Radar",
      (runtime.opportunities||[])
        .map(o=>`<p><b>${o.title}</b><br>${o.action}<br>Confidence: ${o.confidence}%</p>`)
        .join("") || "<p>No opportunities loaded.</p>"
    );
  }

  else if(name.includes("Proof")){
    modal("Proof Pack",
      `<p><b>Completed:</b> ${runtime.proofCompleted}/${runtime.proofTotal}</p>
       <p><b>Trust:</b> ${runtime.trust}</p>
       <p><b>Health:</b> ${runtime.health}</p>`
    );
  }

  else if(name.includes("Reality")){
    modal("Reality Engine",
      `<p><b>Constraint:</b> ${runtime.topConstraint}</p>
       <p><b>Next Best Action:</b> ${runtime.nextBestAction}</p>
       <p><b>Signals:</b> ${(runtime.signals||[]).length}</p>`
    );
  }

  else if(name.includes("Intelligence")){
    modal("Intelligence Summary",
      `<p><b>Trust:</b> ${runtime.trust}</p>
       <p><b>Autonomy:</b> ${runtime.autonomy}%</p>
       <p><b>Opportunities:</b> ${(runtime.opportunities||[]).length}</p>`
    );
  }

  else if(name.includes("Execution")){
    modal("Execution Board",
      (runtime.missions||[])
        .map(m=>`<p><b>${m.title}</b><br>${m.status}</p>`)
        .join("")
    );
  }

  else{
    modal(name,
      `<p>Dedicated ${name} runtime panel online.</p>
       <p>Trust: ${runtime.trust}</p>
       <p>Next Action: ${runtime.nextBestAction}</p>`);
  }

  return;
}

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

/* CYVX FORCE WIRE — makes visible dashboard controls work */
(function(){
  function $(id){ return document.getElementById(id); }

  
function cyvxDeepAnalyze(text){
  const t = String(text || "").toLowerCase();

  const dimensions = [
    {
      key:"deployment",
      label:"Public Deployment",
      score:[
        /no public|local only|localhost|not deployed|need public|public access/.test(t) ? 45 : 0,
        /server|hosting|url|domain|deploy|production/.test(t) ? 25 : 0,
        /user|customer|external/.test(t) ? 15 : 0
      ].reduce((a,b)=>a+b,0),
      constraint:"No public access. External users cannot experience CYVX yet.",
      opportunity:"A public demo unlocks users, feedback, proof, testimonials, and revenue conversations.",
      nba:"Deploy a public CYVX demo URL.",
      mission:"Launch one public CYVX demo and get one external user through the Value Moment flow.",
      impact:"Unlocks first user, first feedback loop, first public proof, and first revenue path.",
      proof:"Public URL + screenshot + first user result + captured outcome."
    },
    {
      key:"adoption",
      label:"User Adoption",
      score:[
        /no users|first user|external users|adoption|try it|test user/.test(t) ? 40 : 0,
        /value moment|demo|onboarding|friction|simple/.test(t) ? 25 : 0,
        /paste|upload|mission|next best action/.test(t) ? 20 : 0
      ].reduce((a,b)=>a+b,0),
      constraint:"The product needs one external user to validate the Value Moment.",
      opportunity:"A single real user can prove whether CYVX creates understandable value in under 60 seconds.",
      nba:"Run one external user test with the Paste Reality → Get Mission flow.",
      mission:"Get one person to paste a real problem into CYVX and rate the mission quality.",
      impact:"Produces first real adoption signal, product clarity feedback, and proof record.",
      proof:"User input + CYVX output + user rating + outcome record."
    },
    {
      key:"revenue",
      label:"Revenue",
      score:[
        /revenue|money|sales|customer|client|paid|sell|funding/.test(t) ? 45 : 0,
        /proof|demo|roi|value|business/.test(t) ? 25 : 0,
        /first|wedge|offer/.test(t) ? 15 : 0
      ].reduce((a,b)=>a+b,0),
      constraint:"Revenue path needs a proof-backed offer and a clear buyer use case.",
      opportunity:"The proof pack can become the credibility wedge for first customer conversations.",
      nba:"Turn the proof pack into a simple paid pilot offer.",
      mission:"Create a one-page CYVX pilot offer for repo/project analysis.",
      impact:"Moves CYVX from internal build to customer-facing value.",
      proof:"Offer page + target user + response + next step."
    },
    {
      key:"product",
      label:"Product Clarity",
      score:[
        /ui|dashboard|clutter|confusing|too much|simple|clear|wow/.test(t) ? 45 : 0,
        /value moment|attention|landing|demo/.test(t) ? 30 : 0,
        /click|works|function|wire/.test(t) ? 15 : 0
      ].reduce((a,b)=>a+b,0),
      constraint:"The product must compress many capabilities into one obvious action.",
      opportunity:"A clean Value Moment makes CYVX understandable immediately.",
      nba:"Make Paste Reality → Get Mission the primary product experience.",
      mission:"Reduce homepage complexity and route users into the Value Moment first.",
      impact:"Improves activation, comprehension, and demo quality.",
      proof:"Before/after screenshot + first action completion."
    },
    {
      key:"execution",
      label:"Execution",
      score:[
        /mission|execute|outcome|record|proof|loop|result/.test(t) ? 35 : 0,
        /done|working|built|pushed|commit/.test(t) ? 20 : 0,
        /stuck|blocked|next/.test(t) ? 25 : 0
      ].reduce((a,b)=>a+b,0),
      constraint:"The system needs repeated mission execution and outcome capture.",
      opportunity:"Every completed loop improves trust, learning, and future recommendations.",
      nba:"Run the next mission and capture the outcome immediately.",
      mission:"Complete one measurable mission and update the proof ledger.",
      impact:"Creates compounding evidence and calibration.",
      proof:"Mission record + actual outcome + trust update."
    }
  ];

  dimensions.forEach(d => {
    if (d.score === 0) d.score = 10;
  });

  dimensions.sort((a,b)=>b.score-a.score);
  const top = dimensions[0];
  const second = dimensions[1];

  const confidence = Math.min(96, Math.max(72, top.score + 10));

  return {
    topConstraint: top.constraint,
    topOpportunity: top.key === "deployment" ? "Public demo unlocks first users, feedback, testimonials, and revenue conversations." : top.opportunity,
    nextBestAction: top.key === "deployment" ? "Publish CYVX to a public URL and send it to one external tester." : top.nba,
    mission: top.mission,
    expectedImpact: top.impact,
    proofPlan: top.proof,
    confidence: confidence + "%",
    primaryDimension: top.label,
    secondaryDimension: second.label,
    scores: dimensions.map(d => ({dimension:d.label, score:d.score}))
  };
}

function cyvxAnalyze(text){ const r = cyvxDeepAnalyze(text); return {constraint:r.topConstraint, opportunity:r.topOpportunity, nba:r.nextBestAction, mission:r.mission, confidence:r.confidence}; }

  function setText(id, value){
    const el = $(id);
    if(el) el.textContent = value;
  }

  function toast(msg){
    let t = $("toast");
    if(!t){
      t = document.createElement("div");
      t.id = "toast";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.className = "toast show";
    setTimeout(()=>t.className="toast",2200);
  }

  function modal(title, html){
    let m = $("cyvxModal");
    if(!m){
      m = document.createElement("div");
      m.id = "cyvxModal";
      m.innerHTML = '<div class="modal-card"><button id="modalClose">×</button><h2 id="modalTitle"></h2><div id="modalBody"></div></div>';
      document.body.appendChild(m);
      $("modalClose").onclick = () => m.classList.remove("show");
      m.onclick = e => { if(e.target === m) m.classList.remove("show"); };
    }
    $("modalTitle").textContent = title;
    $("modalBody").innerHTML = html;
    m.classList.add("show");
  }

  function runAnalyze(){
    const input = $("instantRealityInput");
    const result = cyvxAnalyze(input ? input.value : "");

    setText("instantConstraint", result.constraint);
    setText("instantOpportunity", result.opportunity);
    setText("instantNBA", result.nba);
    setText("instantMission", result.mission);
    setText("instantConfidence", result.confidence);

    const nbaTitle = document.querySelector(".nba h3");
    const nbaText = document.querySelector(".nba p");
    if(nbaTitle) nbaTitle.textContent = result.nba;
    if(nbaText) nbaText.textContent = result.constraint;

    toast("Next Best Action generated.");
  }

  document.addEventListener("click", function(e){
    const text = (e.target.textContent || "").trim();

    if(e.target.id === "instantAnalyzeBtn" || /Generate Next Best Action/i.test(text)){
      e.preventDefault();
      runAnalyze();
      return;
    }

    if(/Upload Reality/i.test(text)){
      e.preventDefault();
      const input = $("instantRealityInput");
      if(input){
        input.scrollIntoView({behavior:"smooth", block:"center"});
        input.focus();
      }
      toast("Paste reality, then generate NBA.");
      return;
    }

    if(/Model My Company/i.test(text)){
      e.preventDefault();
      const input = $("instantRealityInput");
      if(input) input.value = "Company reality: local dashboard running, proof pack complete, no public deployment, no first customer, need revenue path.";
      runAnalyze();
      return;
    }

    if(/Run Mission|Execute Now/i.test(text)){
      e.preventDefault();
      modal("Mission Started", "<p><b>Mission:</b> Create one measurable proof loop.</p><p>Status: queued</p><p>Next: capture outcome after execution.</p>");
      toast("Mission queued.");
      return;
    }

    if(/View Full Proof Pack/i.test(text)){
      e.preventDefault();
      modal("CYVX Proof Pack", "<p><b>Completed:</b> 10 / 10</p><p><b>Average Trust:</b> 92</p><p>CYVX converted reality inputs into missions, outcomes, learning, and trust updates.</p>");
      return;
    }

    if(/Self Scan/i.test(text)){
      e.preventDefault();
      modal("Self Scan", "<p>CYVX is active.</p><p><b>Top constraint:</b> public deployment and external user validation.</p><p><b>Next:</b> run first public proof loop.</p>");
      return;
    }

    if(/Simulation/i.test(text)){
      e.preventDefault();
      modal("Simulation", "<p><b>Best scenario:</b> deploy public demo first.</p><p><b>Reason:</b> unlocks external users and real feedback.</p>");
      return;
    }

    if(/Agent Registry/i.test(text)){
      e.preventDefault();
      modal("Agent Registry", "<p>Reality Engine: active</p><p>Verifier: active</p><p>Portfolio Brain: active</p><p>Executor: ready</p>");
      return;
    }

    if(/Create Mission/i.test(text)){
      e.preventDefault();
      modal("Create Mission", "<p><b>Mission:</b> Deploy public demo and test with one external user.</p><p><b>Confidence:</b> 88%</p>");
      return;
    }

    const card = e.target.closest(".proof-pack,.network,.mission,.nba,.glow");
    if(card){
      e.preventDefault();
      if(card.classList.contains("proof-pack")) modal("Proof Pack", "<p>10/10 reality loops completed.</p><p>Trust: 90 → 92</p>");
      else if(card.classList.contains("network")) modal("Reality Graph", "<p>Reality graph online.</p><p>Nodes: reality, mission, outcome, proof, trust.</p>");
      else if(card.classList.contains("mission")) modal("Mission Control", "<p>7 active missions.</p><p>Highest impact: public demo + first user proof.</p>");
      else if(card.classList.contains("nba")) modal("Next Best Action", "<p>Run one reality → mission → outcome loop and record the result.</p>");
      else modal("CYVX Autonomy Engine", "<p>Watching. Learning. Coordinating. Improving.</p>");
    }
  }, true);

  document.addEventListener("keydown", function(e){
    if(e.key === "/" && document.activeElement.tagName !== "TEXTAREA"){
      e.preventDefault();
      modal("Command Palette", "<p>Try: analyze repo, deploy demo, find opportunity, expand CYVX, run mission.</p>");
    }
  });

  console.log("CYVX force wiring loaded.");
})();

/* CYVX FORCE WIRE — makes visible dashboard controls work */
(function(){
  function $(id){ return document.getElementById(id); }

  function cyvxAnalyze(text){
    const t = String(text || "").toLowerCase();

    const hasDeploy = /deploy|public|server|hosting|production|localhost|url|website/.test(t);
    const hasRevenue = /revenue|customer|sales|roi|money|proof|funding|client/.test(t);
    const hasRepo = /repo|github|readme|branch|commit|issue|pull request|code/.test(t);
    const hasUI = /ui|dashboard|mobile|screen|layout|design|clutter|wow/.test(t);

    return {
      constraint: hasDeploy ? "Public deployment and first-user access are the current bottleneck."
        : hasUI ? "The interface needs one clear value moment and fewer dead controls."
        : hasRevenue ? "Revenue needs proof-backed adoption evidence."
        : hasRepo ? "Repository reality needs conversion into one measurable mission."
        : "Reality is messy and needs decision compression.",
      opportunity: hasDeploy ? "Public demo unlocks first users, feedback, testimonials, and revenue conversations." : hasRevenue ? "Use the proof pack as the first revenue wedge."
        : hasUI ? "Turn CYVX into an attention-grabbing interactive command center."
        : hasRepo ? "Use repository proof as the first operating reality."
        : "Convert messy reality into a mission loop.",
      nba: hasDeploy ? "Publish CYVX to a public URL and send it to one external tester." : "Run one reality → mission → outcome loop and record the result.",
      mission: hasDeploy ? "Deploy CYVX publicly and run one external user test."
        : hasUI ? "Finish the interactive 60-second CYVX value moment."
        : "Create one measurable proof loop.",
      confidence: "88%"
    };
  }

  function setText(id, value){
    const el = $(id);
    if(el) el.textContent = value;
  }

  function toast(msg){
    let t = $("toast");
    if(!t){
      t = document.createElement("div");
      t.id = "toast";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.className = "toast show";
    setTimeout(()=>t.className="toast",2200);
  }

  function modal(title, html){
    let m = $("cyvxModal");
    if(!m){
      m = document.createElement("div");
      m.id = "cyvxModal";
      m.innerHTML = '<div class="modal-card"><button id="modalClose">×</button><h2 id="modalTitle"></h2><div id="modalBody"></div></div>';
      document.body.appendChild(m);
      $("modalClose").onclick = () => m.classList.remove("show");
      m.onclick = e => { if(e.target === m) m.classList.remove("show"); };
    }
    $("modalTitle").textContent = title;
    $("modalBody").innerHTML = html;
    m.classList.add("show");
  }

  function runAnalyze(){
    const input = $("instantRealityInput");
    const result = cyvxAnalyze(input ? input.value : "");

    setText("instantConstraint", result.constraint);
    setText("instantOpportunity", result.opportunity);
    setText("instantNBA", result.nba);
    setText("instantMission", result.mission);
    setText("instantConfidence", result.confidence);

    const nbaTitle = document.querySelector(".nba h3");
    const nbaText = document.querySelector(".nba p");
    if(nbaTitle) nbaTitle.textContent = result.nba;
    if(nbaText) nbaText.textContent = result.constraint;

    toast("Next Best Action generated.");
  }

  document.addEventListener("click", function(e){
    const text = (e.target.textContent || "").trim();

    if(e.target.id === "instantAnalyzeBtn" || /Generate Next Best Action/i.test(text)){
      e.preventDefault();
      runAnalyze();
      return;
    }

    if(/Upload Reality/i.test(text)){
      e.preventDefault();
      const input = $("instantRealityInput");
      if(input){
        input.scrollIntoView({behavior:"smooth", block:"center"});
        input.focus();
      }
      toast("Paste reality, then generate NBA.");
      return;
    }

    if(/Model My Company/i.test(text)){
      e.preventDefault();
      const input = $("instantRealityInput");
      if(input) input.value = "Company reality: local dashboard running, proof pack complete, no public deployment, no first customer, need revenue path.";
      runAnalyze();
      return;
    }

    if(/Run Mission|Execute Now/i.test(text)){
      e.preventDefault();
      modal("Mission Started", "<p><b>Mission:</b> Create one measurable proof loop.</p><p>Status: queued</p><p>Next: capture outcome after execution.</p>");
      toast("Mission queued.");
      return;
    }

    if(/View Full Proof Pack/i.test(text)){
      e.preventDefault();
      modal("CYVX Proof Pack", "<p><b>Completed:</b> 10 / 10</p><p><b>Average Trust:</b> 92</p><p>CYVX converted reality inputs into missions, outcomes, learning, and trust updates.</p>");
      return;
    }

    if(/Self Scan/i.test(text)){
      e.preventDefault();
      modal("Self Scan", "<p>CYVX is active.</p><p><b>Top constraint:</b> public deployment and external user validation.</p><p><b>Next:</b> run first public proof loop.</p>");
      return;
    }

    if(/Simulation/i.test(text)){
      e.preventDefault();
      modal("Simulation", "<p><b>Best scenario:</b> deploy public demo first.</p><p><b>Reason:</b> unlocks external users and real feedback.</p>");
      return;
    }

    if(/Agent Registry/i.test(text)){
      e.preventDefault();
      modal("Agent Registry", "<p>Reality Engine: active</p><p>Verifier: active</p><p>Portfolio Brain: active</p><p>Executor: ready</p>");
      return;
    }

    if(/Create Mission/i.test(text)){
      e.preventDefault();
      modal("Create Mission", "<p><b>Mission:</b> Deploy public demo and test with one external user.</p><p><b>Confidence:</b> 88%</p>");
      return;
    }

    const card = e.target.closest(".proof-pack,.network,.mission,.nba,.glow");
    if(card){
      e.preventDefault();
      if(card.classList.contains("proof-pack")) modal("Proof Pack", "<p>10/10 reality loops completed.</p><p>Trust: 90 → 92</p>");
      else if(card.classList.contains("network")) modal("Reality Graph", "<p>Reality graph online.</p><p>Nodes: reality, mission, outcome, proof, trust.</p>");
      else if(card.classList.contains("mission")) modal("Mission Control", "<p>7 active missions.</p><p>Highest impact: public demo + first user proof.</p>");
      else if(card.classList.contains("nba")) modal("Next Best Action", "<p>Run one reality → mission → outcome loop and record the result.</p>");
      else modal("CYVX Autonomy Engine", "<p>Watching. Learning. Coordinating. Improving.</p>");
    }
  }, true);

  document.addEventListener("keydown", function(e){
    if(e.key === "/" && document.activeElement.tagName !== "TEXTAREA"){
      e.preventDefault();
      modal("Command Palette", "<p>Try: analyze repo, deploy demo, find opportunity, expand CYVX, run mission.</p>");
    }
  });

  console.log("CYVX force wiring loaded.");
})();

/* CYVX FORCE WIRE — makes visible dashboard controls work */
(function(){
  function $(id){ return document.getElementById(id); }

  function cyvxAnalyze(text){
    const t = String(text || "").toLowerCase();

    const hasDeploy = /deploy|public|server|hosting|production|localhost|url|website/.test(t);
    const hasRevenue = /revenue|customer|sales|roi|money|proof|funding|client/.test(t);
    const hasRepo = /repo|github|readme|branch|commit|issue|pull request|code/.test(t);
    const hasUI = /ui|dashboard|mobile|screen|layout|design|clutter|wow/.test(t);

    return {
      constraint: hasDeploy ? "Public deployment and first-user access are the current bottleneck."
        : hasUI ? "The interface needs one clear value moment and fewer dead controls."
        : hasRevenue ? "Revenue needs proof-backed adoption evidence."
        : hasRepo ? "Repository reality needs conversion into one measurable mission."
        : "Reality is messy and needs decision compression.",
      opportunity: hasDeploy ? "Public demo unlocks first users, feedback, testimonials, and revenue conversations." : hasRevenue ? "Use the proof pack as the first revenue wedge."
        : hasUI ? "Turn CYVX into an attention-grabbing interactive command center."
        : hasRepo ? "Use repository proof as the first operating reality."
        : "Convert messy reality into a mission loop.",
      nba: hasDeploy ? "Publish CYVX to a public URL and send it to one external tester." : "Run one reality → mission → outcome loop and record the result.",
      mission: hasDeploy ? "Deploy CYVX publicly and run one external user test."
        : hasUI ? "Finish the interactive 60-second CYVX value moment."
        : "Create one measurable proof loop.",
      confidence: "88%"
    };
  }

  function setText(id, value){
    const el = $(id);
    if(el) el.textContent = value;
  }

  function toast(msg){
    let t = $("toast");
    if(!t){
      t = document.createElement("div");
      t.id = "toast";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.className = "toast show";
    setTimeout(()=>t.className="toast",2200);
  }

  function modal(title, html){
    let m = $("cyvxModal");
    if(!m){
      m = document.createElement("div");
      m.id = "cyvxModal";
      m.innerHTML = '<div class="modal-card"><button id="modalClose">×</button><h2 id="modalTitle"></h2><div id="modalBody"></div></div>';
      document.body.appendChild(m);
      $("modalClose").onclick = () => m.classList.remove("show");
      m.onclick = e => { if(e.target === m) m.classList.remove("show"); };
    }
    $("modalTitle").textContent = title;
    $("modalBody").innerHTML = html;
    m.classList.add("show");
  }

  function runAnalyze(){
    const input = $("instantRealityInput");
    const result = cyvxAnalyze(input ? input.value : "");

    setText("instantConstraint", result.constraint);
    setText("instantOpportunity", result.opportunity);
    setText("instantNBA", result.nba);
    setText("instantMission", result.mission);
    setText("instantConfidence", result.confidence);

    const nbaTitle = document.querySelector(".nba h3");
    const nbaText = document.querySelector(".nba p");
    if(nbaTitle) nbaTitle.textContent = result.nba;
    if(nbaText) nbaText.textContent = result.constraint;

    toast("Next Best Action generated.");
  }

  document.addEventListener("click", function(e){
    const text = (e.target.textContent || "").trim();

    if(e.target.id === "instantAnalyzeBtn" || /Generate Next Best Action/i.test(text)){
      e.preventDefault();
      runAnalyze();
      return;
    }

    if(/Upload Reality/i.test(text)){
      e.preventDefault();
      const input = $("instantRealityInput");
      if(input){
        input.scrollIntoView({behavior:"smooth", block:"center"});
        input.focus();
      }
      toast("Paste reality, then generate NBA.");
      return;
    }

    if(/Model My Company/i.test(text)){
      e.preventDefault();
      const input = $("instantRealityInput");
      if(input) input.value = "Company reality: local dashboard running, proof pack complete, no public deployment, no first customer, need revenue path.";
      runAnalyze();
      return;
    }

    if(/Run Mission|Execute Now/i.test(text)){
      e.preventDefault();
      modal("Mission Started", "<p><b>Mission:</b> Create one measurable proof loop.</p><p>Status: queued</p><p>Next: capture outcome after execution.</p>");
      toast("Mission queued.");
      return;
    }

    if(/View Full Proof Pack/i.test(text)){
      e.preventDefault();
      modal("CYVX Proof Pack", "<p><b>Completed:</b> 10 / 10</p><p><b>Average Trust:</b> 92</p><p>CYVX converted reality inputs into missions, outcomes, learning, and trust updates.</p>");
      return;
    }

    if(/Self Scan/i.test(text)){
      e.preventDefault();
      modal("Self Scan", "<p>CYVX is active.</p><p><b>Top constraint:</b> public deployment and external user validation.</p><p><b>Next:</b> run first public proof loop.</p>");
      return;
    }

    if(/Simulation/i.test(text)){
      e.preventDefault();
      modal("Simulation", "<p><b>Best scenario:</b> deploy public demo first.</p><p><b>Reason:</b> unlocks external users and real feedback.</p>");
      return;
    }

    if(/Agent Registry/i.test(text)){
      e.preventDefault();
      modal("Agent Registry", "<p>Reality Engine: active</p><p>Verifier: active</p><p>Portfolio Brain: active</p><p>Executor: ready</p>");
      return;
    }

    if(/Create Mission/i.test(text)){
      e.preventDefault();
      modal("Create Mission", "<p><b>Mission:</b> Deploy public demo and test with one external user.</p><p><b>Confidence:</b> 88%</p>");
      return;
    }

    const card = e.target.closest(".proof-pack,.network,.mission,.nba,.glow");
    if(card){
      e.preventDefault();
      if(card.classList.contains("proof-pack")) modal("Proof Pack", "<p>10/10 reality loops completed.</p><p>Trust: 90 → 92</p>");
      else if(card.classList.contains("network")) modal("Reality Graph", "<p>Reality graph online.</p><p>Nodes: reality, mission, outcome, proof, trust.</p>");
      else if(card.classList.contains("mission")) modal("Mission Control", "<p>7 active missions.</p><p>Highest impact: public demo + first user proof.</p>");
      else if(card.classList.contains("nba")) modal("Next Best Action", "<p>Run one reality → mission → outcome loop and record the result.</p>");
      else modal("CYVX Autonomy Engine", "<p>Watching. Learning. Coordinating. Improving.</p>");
    }
  }, true);

  document.addEventListener("keydown", function(e){
    if(e.key === "/" && document.activeElement.tagName !== "TEXTAREA"){
      e.preventDefault();
      modal("Command Palette", "<p>Try: analyze repo, deploy demo, find opportunity, expand CYVX, run mission.</p>");
    }
  });

  console.log("CYVX force wiring loaded.");
})();

document.addEventListener("click", (e) => {
  if(e.target && /Generate Next Best Action/i.test(e.target.textContent || "")){
    setTimeout(() => {
      const input = document.getElementById("instantRealityInput");
      const r = cyvxDeepAnalyze(input ? input.value : "");
      const card = document.querySelector(".result-card");
      if(card && !document.getElementById("instantImpact")){
        card.insertAdjacentHTML("beforeend",
          '<p><b>Expected Impact:</b> <span id="instantImpact"></span></p>' +
          '<p><b>Proof Plan:</b> <span id="instantProofPlan"></span></p>' +
          '<p><b>Primary Constraint Type:</b> <span id="instantPrimary"></span></p>'
        );
      }
      const set = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
      set("instantConstraint", r.topConstraint);
      set("instantOpportunity", r.topOpportunity);
      set("instantNBA", r.nextBestAction);
      set("instantMission", r.mission);
      set("instantConfidence", r.confidence);
      set("instantImpact", r.expectedImpact);
      set("instantProofPlan", r.proofPlan);
      set("instantPrimary", r.primaryDimension + " → " + r.secondaryDimension);
    }, 50);
  }
}, true);

/* CYVX VALUE MOMENT COMPLETE LOOP */
(function(){
  function $(id){ return document.getElementById(id); }

  function ensureLoopCard(){
    const result = document.querySelector(".result-card");
    if(!result || $("missionLoopCard")) return;

    result.insertAdjacentHTML("afterend", `
      <div class="mission-loop-card" id="missionLoopCard">
        <p class="kicker">Mission Loop</p>

        <div class="loop-grid">
          <div><span>Expected Impact</span><strong id="loopImpact">—</strong></div>
          <div><span>Proof Plan</span><strong id="loopProof">—</strong></div>
          <div><span>Dependencies</span><strong id="loopDeps">—</strong></div>
          <div><span>Status</span><strong id="loopStatus">Ready</strong></div>
        </div>

        <div class="loop-actions">
          <button class="primary" id="executeMissionBtn">Execute Mission</button>
          <button id="captureOutcomeBtn">Capture Outcome</button>
          <button id="updateTrustBtn">Update Trust</button>
        </div>

        <textarea id="outcomeText" placeholder="What actually happened? Example: Shared CYVX with 3 people; 1 completed the Value Moment."></textarea>

        <div class="trust-result" id="trustResult">
          <b>Trust:</b> <span id="trustBefore">88</span> → <span id="trustAfter">—</span>
          <p id="loopLearning">Learning will appear after outcome capture.</p>
        </div>
      </div>
    `);
  }

  function deriveLoop(){
    const constraint = $("instantConstraint")?.textContent || "";
    const nba = $("instantNBA")?.textContent || "";

    const deployment = /deployment|public|url|external/i.test(constraint + " " + nba);
    const revenue = /revenue|customer|sales/i.test(constraint + " " + nba);
    const ui = /ui|interface|value moment/i.test(constraint + " " + nba);

    return {
      impact: deployment
        ? "Unlocks first external user, feedback, testimonial, proof, and revenue path."
        : revenue
        ? "Turns proof into customer-facing credibility and first offer."
        : ui
        ? "Improves activation by making the product understandable in under 60 seconds."
        : "Creates one measured proof loop that improves trust and future decisions.",
      proof: deployment
        ? "Public URL + tester name/feedback + screenshot + captured outcome."
        : revenue
        ? "Offer page + target user + response + next step."
        : ui
        ? "Before/after screenshot + completed Value Moment result."
        : "Mission record + actual outcome + trust update.",
      deps: deployment
        ? "Hosting, public URL, working UI, one external tester."
        : revenue
        ? "Proof pack, simple offer, target customer, follow-up."
        : ui
        ? "Working analyzer, clear CTA, functional buttons."
        : "Mission, outcome, evidence."
    };
  }

  function refreshLoop(){
    ensureLoopCard();
    const d = deriveLoop();
    if($("loopImpact")) $("loopImpact").textContent = d.impact;
    if($("loopProof")) $("loopProof").textContent = d.proof;
    if($("loopDeps")) $("loopDeps").textContent = d.deps;
  }

  document.addEventListener("click", function(e){
    const text = e.target.textContent || "";

    if(/Generate Next Best Action/i.test(text)){
      setTimeout(refreshLoop, 80);
    }

    if(e.target.id === "executeMissionBtn"){
      e.preventDefault();
      refreshLoop();
      $("loopStatus").textContent = "Active";
      $("loopLearning").textContent = "Mission started. Capture the actual result when completed.";
      if(window.toast) window.toast("Mission started.");
    }

    if(e.target.id === "captureOutcomeBtn"){
      e.preventDefault();
      const outcome = $("outcomeText")?.value || "";
      $("loopStatus").textContent = outcome.trim() ? "Outcome Captured" : "Waiting for Outcome";
      $("loopLearning").textContent = outcome.trim()
        ? "Outcome captured. Ready to update trust and store learning."
        : "Add what actually happened before updating trust.";
    }

    if(e.target.id === "updateTrustBtn"){
      e.preventDefault();
      const outcome = $("outcomeText")?.value || "";
      const success = /shared|completed|deployed|launched|tested|user|feedback|success|done|working/i.test(outcome);
      $("trustAfter").textContent = outcome.trim() ? (success ? "91" : "86") : "—";
      $("loopStatus").textContent = outcome.trim() ? (success ? "Completed" : "Needs Review") : "Ready";
      $("loopLearning").textContent = success
        ? "Learning: this mission created usable reality evidence. Increase confidence in similar missions."
        : "Add an actual outcome before trust changes.";
    }
  }, true);

  document.addEventListener("DOMContentLoaded", ensureLoopCard);
})();


function renderCyvxWorkspace(name){
  const map={
    "Command Center":["Agency Score","Top Constraint","Current Mission","Next Best Action"],
    "Reality Intake":["Paste Reality","Detected Constraints","Signals","Proof Inputs"],
    "Mission Control":["Active Missions","Success Metrics","Dependencies","Owners"],
    "Execution Board":["Queued Actions","In Progress","Completed","Blocked"],
    "Intelligence Hub":["Patterns","Recommendations","Priorities","Truth Model"],
    "Reality Graph":["Entities","Edges","Constraints","Flow Map"],
    "Opportunities":["Opportunity Radar","Confidence","Expected Value","Entry Vector"],
    "Simulations":["Scenario","Risk","Upside","Decision"],
    "Decision Center":["Decision Brief","Tradeoffs","Confidence","Outcome History"],
    "Performance":["Agency Score","Missions Completed","Outcomes Captured","Learning Rate"],
    "Governance":["Trust Score","Approvals","Policy","Audit Log"],
    "Agent OS":["Commander","Architect","Executor","Auditor"]
  };

  const main=document.querySelector(".main") || document.querySelector("main") || document.body;
  let root=document.getElementById("cyvxWorkspace");
  if(!root){
    root=document.createElement("section");
    root.id="cyvxWorkspace";
    root.className="workspace-shell";
    main.prepend(root);
  }

  [...main.children].forEach(el=>{
    if(el.id !== "cyvxWorkspace") el.style.display = name === "Command Center" ? "" : "none";
  });

  if(name === "Command Center"){
    root.innerHTML="";
    root.style.display="none";
  }else{
    root.style.display="block";
    const items=map[name] || map["Command Center"];
    root.innerHTML=`
      <div class="workspace-title-row">
        <div>
          <p class="kicker">CYVX Workspace</p>
          <h1>${name}</h1>
          <p>${name} replaces the center content while preserving your existing CYVX shell.</p>
        </div>
        <button class="primary" id="workspaceCommandCenter">Command Center</button>
      </div>
      <div class="workspace-grid">
        ${items.map(x=>`
          <article class="runtime-panel workspace-card">
            <p class="kicker">${name}</p>
            <h3>${x}</h3>
            <p>Live ${x.toLowerCase()} workspace.</p>
          </article>
        `).join("")}
      </div>
    `;
    document.getElementById("workspaceCommandCenter")?.addEventListener("click",()=>renderCyvxWorkspace("Command Center"));
  }

  document.querySelectorAll(".side-nav button").forEach(b=>b.classList.toggle("active",b.textContent.trim()===name));
  window.scrollTo(0,0);
}

document.addEventListener("click",function(e){
  const btn=e.target.closest(".side-nav button");
  if(!btn) return;
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  renderCyvxWorkspace(btn.textContent.trim());
},true);
