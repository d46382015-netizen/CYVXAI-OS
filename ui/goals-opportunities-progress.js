"use strict";

function renderGoalsOpportunitiesProgress(){

  const home=document.getElementById("cyvxHomeV2");
  if(!home) return;

  document.getElementById("cyvxUserLayer")?.remove();

  const section=document.createElement("section");
  section.id="cyvxUserLayer";

  section.innerHTML=`

  <section class="user-layer">

    <div class="user-card">

      <div class="section-head">
        <h2>Your Goals</h2>
        <span>What you're trying to accomplish</span>
      </div>

      <div class="goal-cards">

        <article>
          <strong>Increase Income</strong>
          <small>Target</small>
        </article>

        <article>
          <strong>Build Business</strong>
          <small>Target</small>
        </article>

        <article>
          <strong>Get Customers</strong>
          <small>Target</small>
        </article>

        <article>
          <strong>Automate Work</strong>
          <small>Target</small>
        </article>

      </div>

    </div>

    <div class="user-card">

      <div class="section-head">
        <h2>Top Opportunities</h2>
        <span>Highest leverage opportunities right now</span>
      </div>

      <div class="opportunity-list">

        <article>
          <div>
            <strong>Local AI Automation Service</strong>
            <small>$2k-$8k/mo</small>
          </div>
          <span>91%</span>
        </article>

        <article>
          <div>
            <strong>Business Process Automation</strong>
            <small>$1k-$5k/mo</small>
          </div>
          <span>84%</span>
        </article>

        <article>
          <div>
            <strong>Content Distribution Engine</strong>
            <small>Compounding Asset</small>
          </div>
          <span>87%</span>
        </article>

      </div>

    </div>

    <div class="user-card">

      <div class="section-head">
        <h2>Progress</h2>
        <span>Future trajectory</span>
      </div>

      <div class="progress-grid">

        <article>
          <label>Income</label>
          <strong>$0 → $2k+</strong>
        </article>

        <article>
          <label>Business</label>
          <strong>Idea → Customers</strong>
        </article>

        <article>
          <label>Automation</label>
          <strong>Manual → Autonomous</strong>
        </article>

        <article>
          <label>Execution</label>
          <strong>Growing ↑</strong>
        </article>

      </div>

    </div>

  </section>
  `;

  home.insertAdjacentElement("afterend",section);
}

window.addEventListener(
  "DOMContentLoaded",
  ()=>setTimeout(renderGoalsOpportunitiesProgress,500)
);
