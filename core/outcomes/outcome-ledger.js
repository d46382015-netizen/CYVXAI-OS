"use strict";
const fs=require("fs"),path=require("path");
const mkdir=p=>fs.mkdirSync(p,{recursive:true});
const writeJson=(p,o)=>{mkdir(path.dirname(p));fs.writeFileSync(p,JSON.stringify(o,null,2));};
const now=()=>new Date().toISOString();

function scoreOutcome(expected,actual){
  const a=String(actual||"").toLowerCase();
  if(!actual) return 0;
  if(/done|complete|success|passed|launched|approved|user|paid|yes|fixed/.test(a)) return 100;
  if(/partial|some|progress|started/.test(a)) return 55;
  if(/failed|blocked|no|none|rejected/.test(a)) return 15;
  return 40;
}

function recordOutcome({mission_id,expected,actual,lesson}){
  const score=scoreOutcome(expected,actual);
  const record={id:`outcome-${Date.now()}`,created_at:now(),mission_id,expected,actual,score,lesson:lesson||"",status:score>=70?"success":score>=40?"partial":"failed"};
  writeJson(`data/outcomes/${record.id}.json`,record);
  writeJson(`data/lessons/lesson-${Date.now()}.json`,{created_at:now(),mission_id,lesson:record.lesson,score});
  return record;
}

module.exports={recordOutcome,scoreOutcome};
