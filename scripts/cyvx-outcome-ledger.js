#!/usr/bin/env node
"use strict";
const {recordOutcome}=require("../core/outcomes/outcome-ledger");
const r=recordOutcome({
  mission_id:"mission-demo-001",
  expected:"User receives one useful mission.",
  actual:"Demo launched and generated a mission.",
  lesson:"Reality uploads need parser, scoring, approval, and outcome proof."
});
console.log(JSON.stringify(r,null,2));
