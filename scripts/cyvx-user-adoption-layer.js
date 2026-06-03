#!/usr/bin/env node
"use strict";
const fs=require("fs"),path=require("path");
const now=new Date().toISOString();
const mkdir=p=>fs.mkdirSync(p,{recursive:true});
const write=(p,v)=>{mkdir(path.dirname(p));fs.writeFileSync(p,v)};
const json=(p,o)=>write(p,JSON.stringify(o,null,2));

mkdir("public"); mkdir("data/uploads"); mkdir("data/onboarding"); mkdir("data/missions"); mkdir("data/approvals"); mkdir("data/outcomes"); mkdir("data/demo");

const demoText=[
"Need more paying users",
"Need public demo",
"Need clearer onboarding",
"Need mission outcome proof",
"Need approval gates before automation"
].join("\n");

function parseReality(text){
  return String(text)
    .replace(/\\n/g,"\n")
    .split(/\n|;|\||•|- /)
    .map(x=>x.trim())
    .filter(x=>x.length>2);
}

function classify(line){
  const l=line.toLowerCase();
  if(/user|paying|customer|revenue|sales|money/.test(l)) return {type:"growth",score:98,constraint:"No active demand proof"};
  if(/demo|public|deploy|host/.test(l)) return {type:"deployment",score:92,constraint:"No public entry point"};
  if(/onboard|clear|friction|confusing/.test(l)) return {type:"adoption",score:88,constraint:"Onboarding friction"};
  if(/outcome|proof|measure|score/.test(l)) return {type:"trust",score:84,constraint:"No measured outcome proof"};
  if(/approval|gate|safe|automation/.test(l)) return {type:"governance",score:78,constraint:"Automation needs trust boundary"};
  return {type:"general",score:65,constraint:"Unstructured operational need"};
}

function actionFor(type){
  return ({
    growth:"Create first-user CTA, demo promise, and invite 3 target users to upload reality.",
    deployment:"Publish the public demo page and make it reachable from the README.",
    adoption:"Compress onboarding to one textarea, one button, one recommended mission.",
    trust:"Add expected vs actual result fields and score every mission outcome.",
    governance:"Keep all execution behind human approval gates until trust score improves.",
    general:"Convert this need into a measurable mission with owner, action, and outcome."
  })[type];
}

function expectedFor(type){
  return ({
    growth:"At least one external user tries CYVX.",
    deployment:"A public demo can be opened by anyone with the link.",
    adoption:"A new user understands CYVX in under 60 seconds.",
    trust:"Every mission has expected vs actual measurement.",
    governance:"No risky automation runs without approval.",
    general:"The need becomes trackable and measurable."
  })[type];
}

const items=parseReality(demoText);
const upload={id:"demo-reality-001",created_at:now,title:"Parsed demo reality upload",raw:demoText,items};

const missions=items.map((title,i)=>{
  const c=classify(title);
  return {
    id:`mission-${String(i+1).padStart(3,"0")}`,
    created_at:now,
    title,
    type:c.type,
    constraint:c.constraint,
    priority:c.score>=90?"critical":c.score>=80?"high":"medium",
    impact_score:c.score,
    confidence:Math.min(96,c.score-3),
    status:"waiting_approval",
    next_action:actionFor(c.type),
    expected_outcome:expectedFor(c.type)
  };
}).sort((a,b)=>b.impact_score-a.impact_score);

const top=missions[0];
const approvals=missions.map(m=>({id:`approval-${m.id}`,mission_id:m.id,status:"pending",requires_human:true,action:m.next_action,risk:"low"}));
const outcomes=missions.map(m=>({id:`outcome-${m.id}`,mission_id:m.id,expected:m.expected_outcome,actual:null,score:null,status:"not_measured"}));
const scorecard={created_at:now,reality_health:67,top_constraint:top.constraint,top_mission:top.title,missions_total:missions.length,pending_approvals:approvals.length,measured_outcomes:0,trust_score:0,status:"parser-priority-demo-ready"};

json("data/uploads/demo-reality-upload.json",upload);
json("data/missions/user-adoption-missions.json",missions);
json("data/approvals/approval-queue.json",approvals);
json("data/outcomes/outcome-scorecard.json",outcomes);
json("data/demo/public-demo-state.json",{upload,missions,approvals,outcomes,scorecard});

write("public/index.html",`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>CYVX Mission OS</title><style>
body{margin:0;background:#07111f;color:white;font-family:Arial,system-ui}.wrap{max-width:1120px;margin:auto;padding:28px}.hero,.card{background:#0e1b2d;border:1px solid #24466f;border-radius:22px;padding:22px;margin:14px 0}h1{font-size:40px;margin:8px 0}p{color:#bed0e6}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px}button{background:#35f0a0;border:0;border-radius:12px;padding:12px 16px;font-weight:800}textarea{width:100%;min-height:130px;border-radius:14px;background:#081827;color:white;border:1px solid #24466f;padding:12px}.tag{color:#35f0a0;font-weight:800}.danger{color:#ffdc73}.mission{border-left:5px solid #35f0a0}.muted{font-size:14px;color:#8fa7c4}
</style></head><body><div class="wrap">
<div class="hero"><div class="tag">CYVX PUBLIC DEMO MODE</div><h1>Upload your reality. CYVX finds your highest-leverage mission.</h1><p>Now with reality parsing, constraint detection, priority scoring, approval gates, and outcome scoring.</p><button onclick="gen()">Analyze Reality</button></div>
<div class="card"><h2>Reality Upload</h2><textarea id="r">${demoText}</textarea></div>
<div class="grid"><div class="card"><h2 id="health">67</h2><p>Reality Health</p></div><div class="card"><h2 id="mc">5</h2><p>Missions</p></div><div class="card"><h2 id="ac">5</h2><p>Pending Approvals</p></div><div class="card"><h2 id="trust">0</h2><p>Trust Score</p></div></div>
<div class="card"><h2>Top Recommendation</h2><p><b>Top Constraint:</b> <span id="constraint">No active demand proof</span></p><p><b>Top Mission:</b> <span id="topMission">Need more paying users</span></p><p><b>Why:</b> <span id="why">This is the highest impact adoption bottleneck.</span></p><button onclick="approveTop(this)">Approve Top Mission</button></div>
<h2>Mission Queue</h2><div id="m" class="grid"></div>
<div class="card"><h2>Outcome Scorecard</h2><p><b>Expected:</b> <span id="expected">At least one external user tries CYVX.</span></p><p><b>Actual:</b> <input id="actual" placeholder="Enter actual result" style="width:80%;padding:10px;border-radius:10px"></p><button onclick="scoreOutcome()">Score Outcome</button><p><b>Outcome Score:</b> <span id="os">Not measured</span></p><p class="muted">Next: deploy public demo and record first real user mission outcome.</p></div>
</div><script>
function parseReality(text){return String(text).replace(/\\\\n/g,"\\n").split(/\\n|;|\\||•|- /).map(x=>x.trim()).filter(x=>x.length>2)}
function classify(line){let l=line.toLowerCase();if(/user|paying|customer|revenue|sales|money/.test(l))return{type:"growth",score:98,constraint:"No active demand proof"};if(/demo|public|deploy|host/.test(l))return{type:"deployment",score:92,constraint:"No public entry point"};if(/onboard|clear|friction|confusing/.test(l))return{type:"adoption",score:88,constraint:"Onboarding friction"};if(/outcome|proof|measure|score/.test(l))return{type:"trust",score:84,constraint:"No measured outcome proof"};if(/approval|gate|safe|automation/.test(l))return{type:"governance",score:78,constraint:"Automation needs trust boundary"};return{type:"general",score:65,constraint:"Unstructured operational need"}}
function actionFor(t){return{growth:"Create first-user CTA and invite 3 target users.",deployment:"Publish public demo and link it from README.",adoption:"Compress onboarding to one upload and one mission.",trust:"Track expected vs actual result for every mission.",governance:"Keep execution behind human approval gates.",general:"Make this measurable with owner, action, and outcome."}[t]}
function expectedFor(t){return{growth:"At least one external user tries CYVX.",deployment:"A public demo can be opened by link.",adoption:"User understands CYVX in under 60 seconds.",trust:"Every mission has expected vs actual measurement.",governance:"No risky automation runs without approval.",general:"The need becomes measurable."}[t]}
function gen(){let lines=parseReality(r.value);let missions=lines.map((x,i)=>{let c=classify(x);return{title:x,...c,action:actionFor(c.type),expected:expectedFor(c.type),priority:c.score>=90?"critical":c.score>=80?"high":"medium"}}).sort((a,b)=>b.score-a.score);mc.textContent=missions.length;ac.textContent=missions.length;health.textContent=Math.max(10,Math.min(95,100-Math.round(missions.length*6.5)));m.innerHTML="";let top=missions[0]||{};constraint.textContent=top.constraint||"None";topMission.textContent=top.title||"None";expected.textContent=top.expected||"None";why.textContent=top.score>=90?"This is the highest-impact adoption bottleneck.":"This is the clearest next measurable constraint.";missions.forEach((x,i)=>{let d=document.createElement("div");d.className="card mission";d.innerHTML="<div class=tag>"+x.priority+" · "+x.score+"</div><h3>"+x.title+"</h3><p><b>Constraint:</b> "+x.constraint+"</p><p><b>Action:</b> "+x.action+"</p><p><b>Expected:</b> "+x.expected+"</p><button onclick=\\"this.textContent='Approved';this.disabled=true\\">Approve Mission</button>";m.appendChild(d)})}
function approveTop(b){b.textContent="Top Mission Approved";b.disabled=true}
function scoreOutcome(){let v=actual.value.trim();if(!v){os.textContent="Enter actual result first";return}let s=/yes|done|complete|success|opened|tried|user/i.test(v)?100:/partial|some|maybe/i.test(v)?50:20;os.textContent=s+"/100";trust.textContent=s}
gen();
</script></body></html>`);

write("docs/operations/CYVX_USER_ADOPTION_LAYER.md",`# CYVX User Adoption Layer

Generated: ${now}

Built:
- Reality parser
- Constraint detection
- Priority scoring
- Ranked mission generation
- Top recommendation
- Approval queue
- Outcome scorecard
- Trust score demo

Next bottleneck:
Public deployment + first real user outcome.
`);

console.log("CYVX adoption parser + mission scoring layer built.");
