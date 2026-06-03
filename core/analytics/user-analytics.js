"use strict";
const fs=require("fs"),path=require("path");
const mkdir=p=>fs.mkdirSync(p,{recursive:true});
const writeJson=(p,o)=>{mkdir(path.dirname(p));fs.writeFileSync(p,JSON.stringify(o,null,2));};
function countDir(d){try{return fs.readdirSync(d).filter(f=>f.endsWith(".json")).length}catch{return 0}}
function analytics(){
  const a={
    created_at:new Date().toISOString(),
    uploads:countDir("data/uploads"),
    missions:countDir("data/missions"),
    approvals:countDir("data/approvals"),
    outcomes:countDir("data/outcomes"),
    lessons:countDir("data/lessons"),
    activation_loop:"upload -> mission -> approval -> outcome -> lesson",
    beta_readiness: countDir("data/outcomes")>0 ? "ready-for-first-users" : "needs-outcomes"
  };
  writeJson("data/analytics/user-activation.json",a);
  return a;
}
module.exports={analytics};
