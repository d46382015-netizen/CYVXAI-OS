#!/usr/bin/env node
"use strict";
const fs=require("fs"),path=require("path");
const now=new Date().toISOString();
const mkdir=p=>fs.mkdirSync(p,{recursive:true});
const write=(p,v)=>{mkdir(path.dirname(p));fs.writeFileSync(p,v)};
const json=(p,o)=>write(p,JSON.stringify(o,null,2));

const inputs=[
"Need more paying users",
"Need public demo",
"Need clearer onboarding",
"Need mission outcome proof",
"Need approval gates before automation"
];

const upload={id:"demo-reality-001",created_at:now,title:"Demo reality upload",inputs};
const missions=inputs.map((x,i)=>({
 id:`mission-${i+1}`,
 created_at:now,
 title:x,
 priority:i===0?"critical":i<3?"high":"medium",
 status:"waiting_approval",
 expected_outcome:i===0?"Increase user adoption":"Reduce adoption friction",
 confidence:92-i*7,
 next_action:[
  "Create one-sentence value prop and CTA",
  "Publish demo runtime",
  "Compress onboarding to one upload step",
  "Track expected vs actual outcome",
  "Require approval before execution"
 ][i]
}));
const approvals=missions.map(m=>({id:`approval-${m.id}`,mission_id:m.id,status:"pending",requires_human:true,action:m.next_action}));
const outcomes=missions.map(m=>({id:`outcome-${m.id}`,mission_id:m.id,expected:m.expected_outcome,actual:null,score:null,status:"not_measured"}));
const onboarding={
 headline:"Upload your reality. CYVX finds your highest-leverage mission.",
 target:"Generate one useful mission in under 60 seconds.",
 steps:["Upload reality","Generate missions","Approve action","Measure outcome","Store learning"]
};
const scorecard={created_at:now,missions_total:missions.length,pending_approvals:approvals.length,measured_outcomes:0,status:"public-demo-ready"};

json("data/uploads/demo-reality-upload.json",upload);
json("data/onboarding/user-onboarding.json",onboarding);
json("data/missions/user-adoption-missions.json",missions);
json("data/approvals/approval-queue.json",approvals);
json("data/outcomes/outcome-scorecard.json",outcomes);
json("data/demo/public-demo-state.json",{onboarding,upload,missions,approvals,outcomes,scorecard});

write("public/index.html",`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>CYVX</title><style>
body{margin:0;background:#07111f;color:white;font-family:Arial,system-ui}.wrap{max-width:1100px;margin:auto;padding:30px}.hero,.card{background:#0e1b2d;border:1px solid #24466f;border-radius:22px;padding:22px;margin:14px 0}h1{font-size:42px}p{color:#bed0e6}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px}button{background:#35f0a0;border:0;border-radius:12px;padding:12px 16px;font-weight:800}textarea{width:100%;min-height:120px;border-radius:14px;background:#081827;color:white;border:1px solid #24466f;padding:12px}.tag{color:#35f0a0;font-weight:800}
</style></head><body><div class="wrap"><div class="hero"><div class="tag">CYVX PUBLIC DEMO MODE</div><h1>Upload your reality. CYVX finds your highest-leverage mission.</h1><p>Convert messy notes into missions, approvals, outcomes, and learning.</p><button onclick="gen()">Generate Missions</button></div><div class="card"><h2>Reality Upload</h2><textarea id="r">${inputs.join("\\n")}</textarea></div><div class="grid"><div class="card"><h2 id="mc">5</h2><p>Missions</p></div><div class="card"><h2 id="ac">5</h2><p>Pending approvals</p></div><div class="card"><h2>0</h2><p>Measured outcomes</p></div><div class="card"><h2>60s</h2><p>Time to value target</p></div></div><h2>Mission Queue</h2><div id="m" class="grid"></div><div class="card"><h2>Outcome Scorecard</h2><p><b>Expected:</b> User receives one clear mission from messy input.</p><p><b>Actual:</b> Waiting for first real user test.</p><p><b>Next:</b> Deploy public demo and record first mission outcome.</p></div></div><script>
function gen(){let lines=document.getElementById("r").value.split("\\n").map(x=>x.trim()).filter(Boolean);mc.textContent=lines.length;ac.textContent=lines.length;m.innerHTML="";lines.forEach((x,i)=>{let d=document.createElement("div");d.className="card";d.innerHTML="<div class=tag>"+(i==0?"critical":i<3?"high":"medium")+"</div><h3>"+x+"</h3><p><b>Status:</b> waiting approval</p><p><b>Action:</b> "+(["Create value prop and CTA","Publish demo runtime","Compress onboarding","Track expected vs actual","Require approval gate"][i]||"Create measurable mission")+"</p><button onclick=\\"this.textContent='Approved';this.disabled=true\\">Approve Mission</button>";m.appendChild(d)})}gen();
</script></body></html>`);

write("docs/operations/CYVX_USER_ADOPTION_LAYER.md",`# CYVX User Adoption Layer

Generated: ${now}

Built:
- User onboarding
- Reality upload
- Mission generation
- Approval queue
- Outcome scorecard
- Public demo mode

Next bottleneck:
Public runtime + first measured real user outcome.
`);

console.log("CYVX user adoption layer built.");
console.log("Open: public/index.html");
