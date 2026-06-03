"use strict";
const fs=require("fs"),path=require("path");
const mkdir=p=>fs.mkdirSync(p,{recursive:true});
const writeJson=(p,o)=>{mkdir(path.dirname(p));fs.writeFileSync(p,JSON.stringify(o,null,2));};
function readOutcomes(){
  try{return fs.readdirSync("data/outcomes").filter(f=>f.endsWith(".json")).map(f=>JSON.parse(fs.readFileSync(`data/outcomes/${f}`,"utf8")))}
  catch{return []}
}
function calculateTrust(){
  const outcomes=readOutcomes();
  const measured=outcomes.filter(o=>typeof o.score==="number");
  const avg=measured.length?Math.round(measured.reduce((a,b)=>a+b.score,0)/measured.length):0;
  const success=measured.filter(o=>o.score>=70).length;
  const trust={
    created_at:new Date().toISOString(),
    outcomes_total:outcomes.length,
    measured_outcomes:measured.length,
    mission_success_rate:measured.length?Math.round(success/measured.length*100):0,
    outcome_quality_score:avg,
    prediction_accuracy:avg,
    trust_score:Math.round((avg+(measured.length?success/measured.length*100:0))/2)
  };
  writeJson("data/trust/trust-score.json",trust);
  return trust;
}
module.exports={calculateTrust};
