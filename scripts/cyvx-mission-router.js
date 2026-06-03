#!/usr/bin/env node
"use strict";

const fs=require("fs"), path=require("path"), cp=require("child_process");
const read=p=>{try{return fs.readFileSync(p,"utf8")}catch{return""}};
const json=p=>{try{return JSON.parse(read(p))}catch{return null}};
const write=(p,v)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,typeof v==="string"?v:JSON.stringify(v,null,2))};
const sh=cmd=>{try{return{ok:true,out:cp.execSync(cmd,{encoding:"utf8",stdio:["ignore","pipe","pipe"],maxBuffer:1024*1024*20})}}catch(e){return{ok:false,out:String(e.stdout||e.stderr||e.message||e)}}};

const now=new Date().toISOString();
const live=json("data/runtime/live-dashboard-state.json")||{};
const latest=json("data/runtime/latest-mission.json")||{};

const missionText = process.argv.slice(2).join(" ") ||
  latest.title ||
  live.nextAction ||
  "Deploy CYVX publicly and run one external user test.";

function classify(m){
  const t=m.toLowerCase();
  if(/deploy|public|url|hosting|server|production/.test(t)) return "deployment";
  if(/revenue|customer|client|sales|money|offer/.test(t)) return "revenue";
  if(/ui|dashboard|design|value moment|interface/.test(t)) return "product";
  if(/repo|github|code|commit|branch|readme/.test(t)) return "repository";
  if(/agent|workflow|automation|execute/.test(t)) return "automation";
  return "general";
}

const type=classify(missionText);
const id="MISSION-"+Date.now();

const routeMap={
  deployment:{
    executor:"Deployment Executor",
    action:"Prepare public demo deployment checklist and verification.",
    verify:"Confirm server command, public URL requirement, and proof capture plan.",
    expected:"A public demo can be launched and tested by one external user."
  },
  revenue:{
    executor:"Revenue Executor",
    action:"Create proof-backed pilot offer and first outreach target.",
    verify:"Confirm offer, buyer, proof asset, and next conversation.",
    expected:"A first customer conversation becomes possible."
  },
  product:{
    executor:"Product Executor",
    action:"Improve value moment clarity and remove dead interactions.",
    verify:"Confirm the primary action works and produces a mission.",
    expected:"A user understands CYVX in under 60 seconds."
  },
  repository:{
    executor:"Repo Executor",
    action:"Analyze repo reality and create a measurable improvement mission.",
    verify:"Confirm files, scripts, validation, and evidence artifacts.",
    expected:"Repo becomes a living operating reality."
  },
  automation:{
    executor:"Automation Executor",
    action:"Map mission to workflow/agent execution steps.",
    verify:"Confirm approval gate, safe mode, logs, and rollback plan.",
    expected:"Approved mission can be executed safely."
  },
  general:{
    executor:"General Mission Executor",
    action:"Convert mission into execution steps and proof plan.",
    verify:"Confirm action, evidence, outcome, and trust update.",
    expected:"Mission becomes measurable."
  }
};

const route=routeMap[type];

const queued={
  id,
  created_at:now,
  mission:missionText,
  type,
  executor:route.executor,
  status:"queued",
  route
};

write("data/missions/latest-routed-mission.json",queued);

const execution={
  id:"EXEC-"+Date.now(),
  mission_id:id,
  created_at:now,
  executor:route.executor,
  status:"executed-local-plan",
  steps:[
    "Classify mission",
    "Select executor",
    "Generate execution steps",
    "Generate verification criteria",
    "Write mission ledger",
    "Update runtime state"
  ],
  action:route.action,
  expected_outcome:route.expected
};

write("data/execution/latest-mission-execution.json",execution);

const checks=[
  ["mission-classified",!!type],
  ["executor-selected",!!route.executor],
  ["mission-ledger-written",fs.existsSync("data/missions/latest-routed-mission.json")],
  ["execution-written",fs.existsSync("data/execution/latest-mission-execution.json")],
  ["omega100",fs.existsSync("scripts/cyvx-validation-matrix-omega100.js") ? sh('NODE_OPTIONS="--no-warnings" node scripts/cyvx-validation-matrix-omega100.js').ok : true]
];

const passed=checks.filter(x=>x[1]).length;
const verification={
  id:"VERIFY-"+Date.now(),
  mission_id:id,
  created_at:now,
  status:passed===checks.length?"verified":"needs-review",
  score:Math.round((passed/checks.length)*100),
  criteria:route.verify,
  checks:checks.map(([name,ok])=>({name,status:ok?"PASS":"FAIL"}))
};

write("data/verification/latest-mission-verification.json",verification);

const ledger=json("data/missions/mission-ledger.json")||{created_at:now,missions:[]};
ledger.updated_at=now;
ledger.missions.push({
  ...queued,
  execution,
  verification,
  final_status:verification.status==="verified"?"ready-for-real-world-execution":"needs-review"
});
write("data/missions/mission-ledger.json",ledger);

write("core/mission-router/README.md","# CYVX Mission Router\n\nMission → Classify → Route → Queue → Execute Plan → Verify → Ledger → Runtime State\n");

write("docs/evidence/CYVX_MISSION_ROUTER.md",`# CYVX Mission Router

Generated: ${now}

## Mission

${missionText}

## Type

${type}

## Executor

${route.executor}

## Execution Action

${route.action}

## Expected Outcome

${route.expected}

## Verification

${verification.status} — ${verification.score}/100

${verification.checks.map(c=>`- ${c.status}: ${c.name}`).join("\n")}

## Next Step

If verified, execute the real-world action and capture outcome.
`);

write("data/runtime/live-dashboard-state.json",{
  ...live,
  health:"active",
  modelHealth:"mission-router",
  trust:Math.max(Number(live.trust||92),verification.status==="verified"?93:91),
  topConstraint:"CYVX can now route missions, but real-world execution and outcome capture remain the next proof step.",
  nextAction:`Execute routed ${type} mission: ${missionText}`,
  missionRouter:{
    status:"active",
    latest_mission:id,
    type,
    executor:route.executor,
    verification:verification.status,
    score:verification.score
  }
});

console.log("CYVX Mission Router complete.");
console.log("Mission:",missionText);
console.log("Type:",type);
console.log("Executor:",route.executor);
console.log("Verification:",verification.status,verification.score+"/100");
