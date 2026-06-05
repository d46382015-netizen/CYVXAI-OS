"use strict";

(function(){
  function el(id){ return document.getElementById(id); }

  function ensurePartner(){
    if(el("cyvxPartnerAlpha")) return;
    const target = document.querySelector(".hero") || document.body;
    target.insertAdjacentHTML("afterend", `
      <section id="cyvxPartnerAlpha" class="value-card">
        <div>
          <p class="kicker">CYVX Partner Alpha</p>
          <h2>What do you want CYVX to help you make real?</h2>
          <p>Agency = memory + mission + action + outcome + learning.</p>
        </div>
        <textarea id="partnerGoal" placeholder="Example: I need to make $5,000/month using my phone, CYVX repo, and no capital."></textarea>
        <button class="primary" id="partnerRun">Generate Agency Mission</button>
        <div class="result-card">
          <p><b>Agency Score:</b> <span id="partnerAgencyScore">—</span></p>
          <p><b>Top Constraint:</b> <span id="partnerConstraint">—</span></p>
          <p><b>Opportunity:</b> <span id="partnerOpportunity">—</span></p>
          <p><b>Mission:</b> <span id="partnerMission">—</span></p>
          <p><b>Next Best Action:</b> <span id="partnerNBA">—</span></p>
        </div>
      </section>
    `);
  }

  async function runPartner(){
    const goal = el("partnerGoal")?.value || "Increase my agency and create measurable outcomes.";
    const res = await fetch("/api/v1/partner/brief", {
      method:"POST",
      headers:{ "content-type":"application/json" },
      body:JSON.stringify({ goal })
    });
    const data = await res.json();
    const p = data.partner || data.data?.partner || data;
    el("partnerAgencyScore").textContent = p.agency_score ?? "—";
    el("partnerConstraint").textContent = p.top_constraint ?? "—";
    el("partnerOpportunity").textContent = p.opportunity ?? "—";
    el("partnerMission").textContent = p.mission?.title ?? "—";
    el("partnerNBA").textContent = p.mission?.next_best_action ?? "—";
  }

  window.addEventListener("DOMContentLoaded", ()=>{
    ensurePartner();
    el("partnerRun")?.addEventListener("click", runPartner);
  });
})();
