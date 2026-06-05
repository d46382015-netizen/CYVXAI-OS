"use strict";

function getWorkspaceRoot(){
  let root=document.getElementById("workspace-root");
  if(root) return root;

  const hero=document.querySelector(".hero");
  root=document.createElement("div");
  root.id="workspace-root";

  if(hero){
    hero.parentNode.insertBefore(root,hero);
    hero.style.display="";
  }else{
    document.body.prepend(root);
  }

  return root;
}

function renderWorkspace(title){
  const root=getWorkspaceRoot();

  root.innerHTML=`
  <section class="workspace-view">
    <div class="workspace-header">
      <p class="kicker">CYVX Workspace</p>
      <h1>${title}</h1>
    </div>

    <div class="workspace-grid">
      <article class="runtime-panel">
        <h3>Overview</h3>
        <p>${title} workspace active.</p>
      </article>

      <article class="runtime-panel">
        <h3>Actions</h3>
        <p>Connected runtime actions appear here.</p>
      </article>

      <article class="runtime-panel">
        <h3>Data</h3>
        <p>Live API data appears here.</p>
      </article>

      <article class="runtime-panel">
        <h3>Outcomes</h3>
        <p>Execution evidence appears here.</p>
      </article>
    </div>
  </section>
  `;
}

document.addEventListener("click",(e)=>{
  const btn=e.target.closest(".side-nav button");
  if(!btn) return;

  const name=btn.textContent.trim();

  const hero=document.querySelector(".hero");
  const metrics=document.querySelector(".metrics");
  const nba=document.querySelector(".nba");

  if(hero) hero.style.display="none";
  if(metrics) metrics.style.display="none";
  if(nba) nba.style.display="none";

  renderWorkspace(name);
},true);
