#!/usr/bin/env node
"use strict";

const fs = require("fs");

const engine = `
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
    topOpportunity: top.opportunity,
    nextBestAction: top.nba,
    mission: top.mission,
    expectedImpact: top.impact,
    proofPlan: top.proof,
    confidence: confidence + "%",
    primaryDimension: top.label,
    secondaryDimension: second.label,
    scores: dimensions.map(d => ({dimension:d.label, score:d.score}))
  };
}
`;

let app = fs.readFileSync("ui/app.js","utf8");

/* Replace old analyzers if present */
app = app.replace(/function cyvxAnalyze\(text\)\{[\s\S]*?\n  \}/, engine + "\nfunction cyvxAnalyze(text){ const r = cyvxDeepAnalyze(text); return {constraint:r.topConstraint, opportunity:r.topOpportunity, nba:r.nextBestAction, mission:r.mission, confidence:r.confidence}; }");

app = app.replace(/function analyzeReality\(text\) \{[\s\S]*?\n\}/, engine + "\nfunction analyzeReality(text){ const r = cyvxDeepAnalyze(text); return {topConstraint:r.topConstraint, topOpportunity:r.topOpportunity, nextBestAction:r.nextBestAction, mission:r.mission, confidence:parseInt(r.confidence)/100}; }");

/* Make result updater display deep fields if elements exist */
if (!app.includes("instantImpact")) {
  app += `
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
`;
}

fs.writeFileSync("ui/app.js", app);
console.log("CYVX Constraint Engine wired into UI.");
