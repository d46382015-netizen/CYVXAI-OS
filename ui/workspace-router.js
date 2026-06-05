"use strict";

const WORKSPACES = {
  "Command Center":["Agency Score","Top Constraint","Current Mission","Next Best Action"],
  "Reality Intake":["Paste Reality","Detected Constraints","Signals","Proof Inputs"],
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

function main(){
  return document.querySelector("main") || document.querySelector(".main") || document.body;
}

function installWorkspaceRoot(){
  const m = main();
  if(document.getElementById("workspace-root")) return;

  const root = document.createElement("section");
  root.id = "workspace-root";
  root.className = "workspace-root";

  const children = [...m.children];
  for(const child of children){
    if(child.id === "workspace-root") continue;
    child.classList.add("workspace-original");
    child.dataset.workspaceOriginal = "1";
  }

  m.prepend(root);
}

function showOriginalDashboard(){
  const root = document.getElementById("workspace-root");
  if(root) root.innerHTML = "";
  document.querySelectorAll("[data-workspace-original='1']").forEach(el=>{
    el.style.display = "";
  });
}

function hideOriginalDashboard(){
  document.querySelectorAll("[data-workspace-original='1']").forEach(el=>{
    el.style.display = "none";
  });
}

function renderWorkspace(name){
  installWorkspaceRoot();
  const root = document.getElementById("workspace-root");
  const items = WORKSPACES[name] || WORKSPACES["Command Center"];

  hideOriginalDashboard();

  root.innerHTML = `
    <section class="workspace-shell">
      <div class="workspace-title-row">
        <div>
          <p class="kicker">CYVX Workspace</p>
          <h1>${name}</h1>
          <p>${name} replaces the center dashboard workspace.</p>
        </div>
        <button class="secondary" id="workspaceBack">Command Center</button>
      </div>

      <div class="workspace-grid">
        ${items.map(x=>`
          <article class="runtime-panel workspace-card">
            <p class="kicker">${name}</p>
            <h3>${x}</h3>
            <p>Live ${x.toLowerCase()} module ready.</p>
          </article>
        `).join("")}
      </div>
    </section>
  `;

  document.getElementById("workspaceBack")?.addEventListener("click", ()=>{
    showOriginalDashboard();
    document.querySelectorAll(".side-nav button").forEach(b=>b.classList.remove("active"));
  });

  document.querySelectorAll(".side-nav button").forEach(b=>{
    b.classList.toggle("active", b.textContent.trim() === name);
  });

  window.scrollTo(0,0);
}

document.addEventListener("click", function(e){
  const btn = e.target.closest(".side-nav button");
  if(!btn) return;
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();

  const name = btn.textContent.trim();
  if(name === "Command Center"){
    installWorkspaceRoot();
    showOriginalDashboard();
    document.querySelectorAll(".side-nav button").forEach(b=>b.classList.toggle("active", b.textContent.trim() === name));
    return;
  }

  renderWorkspace(name);
}, true);

window.addEventListener("DOMContentLoaded", installWorkspaceRoot);
