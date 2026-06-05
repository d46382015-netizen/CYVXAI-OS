"use strict";

const CYVX_PAGES = {
  "Command Center":["Partner Alpha","Agency Score","Next Best Action","Daily Brief"],
  "Reality Intake":["Upload Reality","Detected Constraints","Signals","Proof Inputs"],
  "Mission Control":["Active Missions","Success Metrics","Dependencies","Owners"],
  "Execution Board":["Queued Actions","In Progress","Completed","Blocked"],
  "Intelligence Hub":["Patterns","Recommendations","Priorities","Truth Model"],
  "Reality Graph":["Entities","Edges","Constraints","Flow Map"],
  "Opportunities":["Opportunity Radar","Confidence","Expected Value","Entry Vector"],
  "Simulations":["Scenario","Risk","Upside","Decision"],
  "Decision Center":["Decision Brief","Tradeoffs","Confidence","Outcome History"],
  "Performance":["Agency Score","Missions Completed","Outcomes Captured","Learning Rate"],
  "Governance":["Trust Score","Approvals","Policy","Audit Log"],
  "Agent OS":["Commander","Architect","Executor","Auditor"]
};

function openCyvxPage(name){
  const items = CYVX_PAGES[name] || CYVX_PAGES["Command Center"];
  let root = document.getElementById("cyvxPageRoot");
  if(!root){
    root = document.createElement("section");
    root.id = "cyvxPageRoot";
    root.className = "value-card cyvx-page-root";
    document.querySelector(".hero")?.insertAdjacentElement("beforebegin", root);
  }
  root.innerHTML = `
    <p class="kicker">CYVX PAGE</p>
    <h2>${name}</h2>
    <p>${name} is now a real page, not a notification modal.</p>
    <div class="page-grid">
      ${items.map(x=>`<article class="runtime-panel"><p class="kicker">${name}</p><h3>${x}</h3><p>Live ${x.toLowerCase()} module ready.</p></article>`).join("")}
    </div>
  `;
  document.querySelectorAll(".side-nav button").forEach(b=>b.classList.toggle("active", b.textContent.trim()===name));
  root.scrollIntoView({behavior:"smooth",block:"start"});
}

document.addEventListener("click", function(e){
  const btn = e.target.closest(".side-nav button");
  if(!btn) return;
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  openCyvxPage(btn.textContent.trim());
}, true);
