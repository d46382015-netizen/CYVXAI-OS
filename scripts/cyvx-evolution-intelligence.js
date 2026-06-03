#!/usr/bin/env node
"use strict";

const fs=require("fs");
const path=require("path");

const now=new Date().toISOString();
const mkdir=p=>fs.mkdirSync(p,{recursive:true});
const readJson=(p,fallback)=>{try{return JSON.parse(fs.readFileSync(p,"utf8"))}catch{return fallback}};
const writeJson=(p,o)=>{mkdir(path.dirname(p));fs.writeFileSync(p,JSON.stringify(o,null,2))};

function parseReality(text){
  return String(text||"")
    .replace(/\\n/g,"\n")
    .split(/\n|;|\||•|- /)
    .map(x=>x.trim())
    .filter(x=>x.length>2);
}

function classifyConstraint(line){
  const l=line.toLowerCase();
  if(/user|customer|paying|revenue|sales|money/.test(l)) return {type:"growth",constraint:"Demand/growth constraint",impact:98};
  if(/demo|public|deploy|host|website/.test(l)) return {type:"deployment",constraint:"Public access constraint",impact:92};
  if(/onboard|clear|friction|confusing|simple/.test(l)) return {type:"adoption",constraint:"Onboarding clarity constraint",impact:88};
  if(/outcome|proof|measure|score|trust/.test(l)) return {type:"trust",constraint:"Outcome proof constraint",impact:85};
  if(/approval|gate|safe|automation|risk/.test(l)) return {type:"governance",constraint:"Execution safety constraint",impact:79};
  if(/learn|school|grade|skill|study/.test(l)) return {type:"learning",constraint:"Capability gap",impact:83};
  if(/job|career|resume|interview/.test(l)) return {type:"career",constraint:"Opportunity access constraint",impact:86};
  return {type:"general",constraint:"Unstructured reality constraint",impact:65};
}

function decisionFor(type){
  return ({
    growth:"Prioritize first-user acquisition and proof of demand.",
    deployment:"Prioritize a public runtime users can access.",
    adoption:"Prioritize reducing first-minute confusion.",
    trust:"Prioritize expected-vs-actual outcome proof.",
    governance:"Prioritize approval gates before automation.",
    learning:"Prioritize the highest-leverage skill gap.",
    career:"Prioritize visible proof of capability and outreach.",
    general:"Prioritize converting this into a measurable mission."
  })[type] || "Prioritize measurable next action.";
}

function actionFor(type){
  return ({
    growth:"Invite 3 target users to upload real situations and record outcomes.",
    deployment:"Deploy the public demo and add the link to README.",
    adoption:"Compress onboarding into one question, one analysis, one top mission.",
    trust:"Record expected result, actual result, score, and lesson for each mission.",
    governance:"Require explicit approval before destructive or external actions.",
    learning:"Create one focused learning quest with practice and feedback.",
    career:"Create one proof artifact and send it to 5 relevant people.",
    general:"Define owner, next action, expected result, and measurement."
  })[type] || "Create measurable next action.";
}

function expectedFor(type){
  return ({
    growth:"At least one external user completes the CYVX loop.",
    deployment:"A public URL is usable by someone outside the local machine.",
    adoption:"A new user understands the value in under 60 seconds.",
    trust:"Every mission has a measurable outcome record.",
    governance:"No unsafe automation executes without approval.",
    learning:"The user gains measurable capability.",
    career:"The user gains a stronger opportunity signal.",
    general:"The situation becomes measurable and actionable."
  })[type] || "A measurable result is recorded.";
}

function outcomeScore(actual){
  const a=String(actual||"").toLowerCase();
  if(!a) return 0;
  if(/success|done|complete|launched|approved|user|paid|fixed|passed|yes/.test(a)) return 100;
  if(/partial|started|some|progress|testing/.test(a)) return 60;
  if(/blocked|failed|rejected|no|none/.test(a)) return 20;
  return 45;
}

const demoReality=[
  "Need more paying users",
  "Need public demo",
  "Need clearer onboarding",
  "Need mission outcome proof",
  "Need approval gates before automation",
  "Need learning and career modes later"
].join("\n");

const realityItems=parseReality(demoReality);

const decisions=realityItems.map((item,i)=>{
  const c=classifyConstraint(item);
  return {
    id:`decision-${String(i+1).padStart(3,"0")}`,
    created_at:now,
    reality:item,
    constraint:c.constraint,
    type:c.type,
    impact:c.impact,
    recommendation:decisionFor(c.type),
    confidence:Math.min(96,c.impact-3)
  };
}).sort((a,b)=>b.impact-a.impact);

const missions=decisions.map((d,i)=>({
  id:`evolution-mission-${String(i+1).padStart(3,"0")}`,
  created_at:now,
  decision_id:d.id,
  title:d.recommendation,
  source_reality:d.reality,
  constraint:d.constraint,
  type:d.type,
  priority:d.impact>=90?"critical":d.impact>=80?"high":"medium",
  impact_score:d.impact,
  confidence:d.confidence,
  status:"waiting_approval",
  action:actionFor(d.type),
  expected_outcome:expectedFor(d.type)
}));

const outcomes=missions.map((m,i)=>{
  const actual=i===0?"Testing with first external user is next.":null;
  const score=outcomeScore(actual);
  return {
    id:`evolution-outcome-${String(i+1).padStart(3,"0")}`,
    created_at:now,
    mission_id:m.id,
    expected:m.expected_outcome,
    actual,
    score,
    status:score>=70?"success":score>=40?"partial":"not_measured"
  };
});

const lessons=outcomes.map(o=>({
  id:`lesson-${o.id}`,
  created_at:now,
  outcome_id:o.id,
  mission_id:o.mission_id,
  lesson:o.score>=70
    ?"This action produced strong progress."
    :o.score>=40
      ?"This action needs follow-through to prove value."
      :"This mission still needs real-world execution."
}));

const profile=readJson("data/evolution/evolution-profile.json",{
  potential:{score:50,possible_futures:[],unlocked_futures:[],blocked_futures:[]},
  agency:{score:50,decision_quality:50,execution_quality:50,adaptation_rate:50,coordination_score:50,resource_access_score:50},
  capability:{score:50,capabilities:[]},
  opportunities:{discovered:[],active:[],completed:[],missed:[]},
  growth:{capability_gain:0,agency_gain:0,potential_expansion:0}
});

const avgDecision=Math.round(decisions.reduce((a,b)=>a+b.confidence,0)/Math.max(1,decisions.length));
const measured=outcomes.filter(o=>o.score>0);
const avgOutcome=measured.length?Math.round(measured.reduce((a,b)=>a+b.score,0)/measured.length):0;

profile.updated_at=now;
profile.reality={items:realityItems,constraints:decisions.map(d=>d.constraint)};
profile.decisions=decisions.map(d=>d.id);
profile.missions=missions.map(m=>m.id);
profile.outcomes=outcomes.map(o=>o.id);
profile.learning=lessons.map(l=>l.id);

profile.agency.decision_quality=avgDecision;
profile.agency.execution_quality=avgOutcome;
profile.agency.adaptation_rate=Math.max(profile.agency.adaptation_rate||50, measured.length?65:50);
profile.agency.score=Math.round(
  (profile.agency.decision_quality+
   profile.agency.execution_quality+
   profile.agency.adaptation_rate+
   profile.agency.coordination_score+
   profile.agency.resource_access_score)/5
);

profile.capability.score=Math.max(profile.capability.score||50, 55);
profile.growth.capability_gain=Math.max(profile.growth.capability_gain||0,5);
profile.growth.agency_gain=Math.max(profile.growth.agency_gain||0,profile.agency.score-50);
profile.growth.potential_expansion=Math.max(profile.growth.potential_expansion||0,7);
profile.potential.score=Math.max(profile.potential.score||50,Math.min(100,50+profile.growth.potential_expansion));
profile.potential.possible_futures=[
  "Public beta with real user outcomes",
  "Learn/Earn/Build/Improve/Operate modes",
  "Capability-based user progression",
  "Trust-scored mission recommendations"
];

const report={
  system:"CYVX Evolution Intelligence Layer",
  created_at:now,
  loop:"Potential -> Agency -> Capability -> Reality -> Constraint -> Decision -> Mission -> Outcome -> Learning -> Growth",
  counts:{
    reality_items:realityItems.length,
    decisions:decisions.length,
    missions:missions.length,
    outcomes:outcomes.length,
    lessons:lessons.length
  },
  top_decision:decisions[0],
  top_mission:missions[0],
  agency_score:profile.agency.score,
  capability_score:profile.capability.score,
  potential_score:profile.potential.score,
  next:"Phase 3 should add identity, progression, achievements, mastery paths, and user-facing growth dashboard."
};

writeJson("data/decisions/evolution-decisions.json",decisions);
writeJson("data/missions/evolution-missions.json",missions);
writeJson("data/outcomes/evolution-outcomes.json",outcomes);
writeJson("data/learning/evolution-lessons.json",lessons);
writeJson("data/evolution/evolution-profile.json",profile);
writeJson("data/evolution/evolution-intelligence-report.json",report);

writeJson("core/decision/decision-engine.json",{
  purpose:"Convert reality constraints into ranked decisions.",
  inputs:["reality_items","constraints","capabilities","agency_score"],
  outputs:["recommendation","confidence","impact"]
});

writeJson("core/mission/mission-engine.json",{
  purpose:"Convert decisions into approved, measurable missions.",
  status:"operational-baseline"
});

writeJson("core/learning/learning-engine.json",{
  purpose:"Convert outcomes into lessons and growth signals.",
  status:"operational-baseline"
});

writeJson("core/evolution/evolution-engine.json",{
  purpose:"Unify Potential, Agency, Capability, Reality, Mission, Outcome, Learning, and Growth.",
  status:"phase-2-operational"
});

fs.writeFileSync("docs/architecture/CYVX_EVOLUTION_INTELLIGENCE.md",`# CYVX Evolution Intelligence Layer

Generated: ${now}

## Unified Loop

Potential
↓
Adaptive Agency
↓
Capability
↓
Reality
↓
Constraint
↓
Decision
↓
Mission
↓
Outcome
↓
Learning
↓
Growth
↓
Expanded Potential

## Phase 2 Built

- Reality parser
- Constraint classifier
- Decision engine
- Mission generator
- Outcome scoring
- Learning extraction
- Agency score update
- Capability score update
- Potential score update

## Next Phase

Identity, progression, achievements, mastery paths, and public growth dashboard.
`);

console.log(JSON.stringify(report,null,2));
