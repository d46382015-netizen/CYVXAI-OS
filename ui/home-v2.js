"use strict";

function renderHomeV2(){

  const root=document.getElementById("realityOS") ||
             document.querySelector(".main") ||
             document.querySelector("main");

  if(!root) return;

  const existing=document.getElementById("cyvxHomeV2");
  if(existing) existing.remove();

  const hero=document.createElement("section");
  hero.id="cyvxHomeV2";

  hero.innerHTML=`
  <section class="cyvx-home-v2">

    <div class="hero-card">

      <div class="hero-header">
        <span>DIGITAL TWIN Ω</span>
      </div>

      <h1>
        What would you like to accomplish?
      </h1>

      <div class="goal-grid">

        <button>Make More Money</button>
        <button>Build A Business</button>
        <button>Get Customers</button>
        <button>Find A Better Job</button>
        <button>Improve Health</button>
        <button>Automate My Company</button>

      </div>

      <div class="recommendation">

        <span>CYVX Recommendation</span>

        <h2>
          Launch AI Automation Service
        </h2>

        <div class="recommendation-grid">

          <div>
            <label>Potential Outcome</label>
            <strong>$2k-$8k/mo</strong>
          </div>

          <div>
            <label>Confidence</label>
            <strong>91%</strong>
          </div>

          <div>
            <label>Time</label>
            <strong>14 Days</strong>
          </div>

        </div>

        <button class="execute-btn">
          Execute
        </button>

      </div>

    </div>

  </section>
  `;

  root.prepend(hero);
}

window.addEventListener("DOMContentLoaded",renderHomeV2);
