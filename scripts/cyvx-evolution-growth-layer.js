#!/usr/bin/env node
"use strict";

const fs=require("fs");
const path=require("path");
const now=new Date().toISOString();

const mkdir=p=>fs.mkdirSync(p,{recursive:true});
const readJson=(p,fallback)=>{try{return JSON.parse(fs.readFileSync(p,"utf8"))}catch{return fallback}};
const write=(p,v)=>{mkdir(path.dirname(p));fs.writeFileSync(p,v)};
const writeJson=(p,o)=>write(p,JSON.stringify(o,null,2));

const profile=readJson("data/evolution/evolution-profile.json",{
  potential:{score:50,possible_futures:[]},
  agency:{score:50},
  capability:{score:50,capabilities:[]},
  growth:{capability_gain:0,agency_gain:0,potential_expansion:0}
});

const missions=readJson("data/missions/evolution-missions.json",[]);
const outcomes=readJson("data/outcomes/evolution-outcomes.json",[]);
const lessons=readJson("data/learning/evolution-lessons.json",[]);

const identity={
  id:"cyvx-user-demo",
  created_at:now,
  archetype:"Adaptive Builder",
  title:"Reality Navigator",
  current_level:Math.max(1,Math.floor((profile.capability?.score||50)/10)),
  xp:(missions.length*80)+(outcomes.filter(o=>o.score>0).length*120)+(lessons.length*60),
  agency_score:profile.agency?.score||50,
  capability_score:profile.capability?.score||50,
  potential_score:profile.potential?.score||50
};

const masteryPaths=[
  {
    id:"learn",
    name:"Learn",
    purpose:"Build knowledge and skill faster.",
    level:1,
    progress:profile.capability?.score||50,
    unlock:"Skill quests and learning missions"
  },
  {
    id:"earn",
    name:"Earn",
    purpose:"Find opportunities and convert capability into income.",
    level:1,
    progress:Math.max(30,profile.agency?.resource_access_score||50),
    unlock:"Opportunity missions"
  },
  {
    id:"build",
    name:"Build",
    purpose:"Turn ideas into working projects.",
    level:1,
    progress:Math.max(40,profile.agency?.execution_quality||50),
    unlock:"Project missions"
  },
  {
    id:"improve",
    name:"Improve",
    purpose:"Strengthen habits, systems, and personal growth.",
    level:1,
    progress:Math.max(40,profile.agency?.adaptation_rate||50),
    unlock:"Growth missions"
  },
  {
    id:"operate",
    name:"Operate",
    purpose:"Coordinate people, work, systems, and outcomes.",
    level:1,
    progress:Math.max(40,profile.agency?.coordination_score||50),
    unlock:"Operations missions"
  },
  {
    id:"explore",
    name:"Explore",
    purpose:"Discover opportunities, futures, and paths.",
    level:1,
    progress:profile.potential?.score||50,
    unlock:"Potential maps"
  }
];

const achievements=[
  {
    id:"first-reality-upload",
    name:"Reality Uploaded",
    description:"Created the first structured reality input.",
    unlocked:true
  },
  {
    id:"first-mission-generated",
    name:"Mission Generated",
    description:"Converted reality into a measurable mission.",
    unlocked:missions.length>0
  },
  {
    id:"first-outcome-recorded",
    name:"Outcome Recorded",
    description:"Recorded at least one expected-vs-actual result.",
    unlocked:outcomes.some(o=>o.score>0)
  },
  {
    id:"first-lesson-stored",
    name:"Lesson Stored",
    description:"Converted an outcome into learning.",
    unlocked:lessons.length>0
  },
  {
    id:"agency-above-60",
    name:"Agency Rising",
    description:"Raised agency score above 60.",
    unlocked:(profile.agency?.score||0)>=60
  },
  {
    id:"potential-expanded",
    name:"Expanded Potential",
    description:"Unlocked future possibilities.",
    unlocked:(profile.potential?.possible_futures||[]).length>0
  }
];

const progression={
  created_at:now,
  level:identity.current_level,
  xp:identity.xp,
  next_level_xp:(identity.current_level+1)*1000,
  completion_rate:Math.round((achievements.filter(a=>a.unlocked).length/achievements.length)*100),
  unlocked_achievements:achievements.filter(a=>a.unlocked).length,
  total_achievements:achievements.length,
  mastery_paths:masteryPaths.map(p=>({id:p.id,name:p.name,progress:p.progress}))
};

const growth={
  created_at:now,
  capability_gain:profile.growth?.capability_gain||0,
  agency_gain:profile.growth?.agency_gain||0,
  potential_expansion:profile.growth?.potential_expansion||0,
  transformation:{
    before:"Reality-to-mission demo",
    after:"Potential-to-growth adaptive agency system",
    summary:"CYVX now tracks identity, progression, mastery, achievements, agency, capability, potential, outcomes, and learning."
  }
};

const report={
  system:"CYVX Evolution Growth Layer",
  created_at:now,
  status:"phase-3-complete",
  loop:"Potential -> Agency -> Capability -> Reality -> Decision -> Mission -> Outcome -> Learning -> Growth",
  identity,
  progression,
  achievements_unlocked:achievements.filter(a=>a.unlocked).map(a=>a.name),
  mastery_paths:masteryPaths.map(p=>p.name),
  growth,
  next:"Use real users to validate whether the top recommendation feels correct and valuable."
};

writeJson("data/identity/user-identity.json",identity);
writeJson("data/progression/progression-state.json",progression);
writeJson("data/achievements/achievements.json",achievements);
writeJson("data/mastery/mastery-paths.json",masteryPaths);
writeJson("data/growth/growth-report.json",growth);
writeJson("data/evolution/evolution-growth-report.json",report);

writeJson("core/identity/identity-engine.json",{
  purpose:"Track who the user is becoming through capability, agency, and potential growth.",
  status:"phase-3-baseline"
});
writeJson("core/progression/progression-engine.json",{
  purpose:"Convert missions, outcomes, and lessons into XP, levels, and progress.",
  status:"phase-3-baseline"
});
writeJson("core/achievements/achievement-engine.json",{
  purpose:"Reward meaningful proof of growth, not empty activity.",
  status:"phase-3-baseline"
});
writeJson("core/mastery/mastery-engine.json",{
  purpose:"Organize CYVX into Learn, Earn, Build, Improve, Operate, and Explore paths.",
  status:"phase-3-baseline"
});
writeJson("core/growth/growth-engine.json",{
  purpose:"Show how outcomes expand capability, agency, and potential.",
  status:"phase-3-baseline"
});

write("public/evolution.html",`<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>CYVX Evolution</title>
<style>
body{margin:0;background:#07111f;color:white;font-family:Arial,system-ui}
.wrap{max-width:1180px;margin:auto;padding:28px}
.hero,.card{background:#0e1b2d;border:1px solid #24466f;border-radius:24px;padding:22px;margin:14px 0}
h1{font-size:42px;margin:8px 0}
p{color:#bed0e6}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px}
.big{font-size:36px;font-weight:900;color:#35f0a0}
.tag{color:#35f0a0;font-weight:900}
.bar{height:12px;background:#182d48;border-radius:999px;overflow:hidden}
.fill{height:100%;background:#35f0a0}
.badge{border:1px solid #35f0a0;border-radius:18px;padding:14px;background:#0b2137}
.locked{opacity:.45}
</style>
</head>
<body>
<div class="wrap">
  <div class="hero">
    <div class="tag">CYVX ADAPTIVE AGENCY MODE</div>
    <h1>Potential → Agency → Capability → Reality → Outcome → Growth</h1>
    <p>CYVX now tracks not just what you do, but how your capability, agency, and future possibilities expand over time.</p>
  </div>

  <div class="grid">
    <div class="card"><div class="big">${identity.current_level}</div><p>Level</p></div>
    <div class="card"><div class="big">${identity.agency_score}</div><p>Agency Score</p></div>
    <div class="card"><div class="big">${identity.capability_score}</div><p>Capability Score</p></div>
    <div class="card"><div class="big">${identity.potential_score}</div><p>Potential Score</p></div>
  </div>

  <div class="card">
    <h2>Identity</h2>
    <p><b>Archetype:</b> ${identity.archetype}</p>
    <p><b>Title:</b> ${identity.title}</p>
    <p><b>XP:</b> ${identity.xp} / ${progression.next_level_xp}</p>
    <div class="bar"><div class="fill" style="width:${Math.min(100,Math.round(identity.xp/progression.next_level_xp*100))}%"></div></div>
  </div>

  <h2>Mastery Paths</h2>
  <div class="grid">
    ${masteryPaths.map(p=>`<div class="card"><h3>${p.name}</h3><p>${p.purpose}</p><p><b>Unlock:</b> ${p.unlock}</p><div class="bar"><div class="fill" style="width:${Math.min(100,p.progress)}%"></div></div><p>${p.progress}/100</p></div>`).join("")}
  </div>

  <h2>Achievements</h2>
  <div class="grid">
    ${achievements.map(a=>`<div class="badge ${a.unlocked?"":"locked"}"><h3>${a.unlocked?"✓ ":"○ "}${a.name}</h3><p>${a.description}</p></div>`).join("")}
  </div>

  <div class="card">
    <h2>Growth Report</h2>
    <p><b>Before:</b> ${growth.transformation.before}</p>
    <p><b>After:</b> ${growth.transformation.after}</p>
    <p><b>Capability Gain:</b> +${growth.capability_gain}</p>
    <p><b>Agency Gain:</b> +${growth.agency_gain}</p>
    <p><b>Potential Expansion:</b> +${growth.potential_expansion}</p>
  </div>
</div>
</body>
</html>`);

write("docs/architecture/CYVX_EVOLUTION_GROWTH.md",`# CYVX Evolution Growth Layer

Generated: ${now}

## Phase 3 Built

- Identity Engine
- Progression Engine
- Achievement Engine
- Mastery Path Engine
- Growth Engine
- User-facing Evolution Dashboard

## Core Loop

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

## Strategic Shift

CYVX is no longer only a mission system. It is now structured as an Adaptive Agency platform that can support Learn, Earn, Build, Improve, Operate, and Explore modes.
`);

console.log(JSON.stringify(report,null,2));
