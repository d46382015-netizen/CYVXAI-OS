"use strict";

const { POSTS, EXPANDED_CATALOG_PROOF } = require("./catalog-expanded");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[character]));
}

function publicConfig(config) {
  return {
    brand: "CYVX FIELD MANUAL",
    checkout_url: config.checkoutUrl || "",
    proof: EXPANDED_CATALOG_PROOF,
    posts: POSTS.map((post) => ({
      id: post.id,
      slug: post.slug,
      title: post.title,
      category: post.category,
      keyword: post.keyword,
      outcome: post.outcome || null,
      difficulty: post.difficulty || null,
      time: post.time || null,
      cost: post.cost || null,
      slides: post.slides.length,
      channels: post.channels || [],
      source_sha256: post.source_sha256 || null,
    })),
  };
}

function libraryHtml() {
  const categoryOrder = ["OPERATE", "SECURE", "BUILD", "SELL", "OWN", "CAPITAL", "WEB3"];
  return categoryOrder.map((category) => {
    const posts = POSTS.filter((post) => post.category === category);
    if (!posts.length) return "";
    const cards = posts.map((post) => `
      <article class="card library-card" data-category="${escapeHtml(category)}">
        <strong>${escapeHtml(post.module)}</strong>
        <h3>${escapeHtml(post.title)}</h3>
        <p>${escapeHtml(post.outcome || post.hook || "Executable production system.")}</p>
        <div class="meta">${escapeHtml(post.difficulty || "Production")} · ${escapeHtml(post.time || `${post.slides.length} slides`)} · ${escapeHtml(post.cost || "Measured cost")}</div>
        <a class="preview" href="/api/v1/posts/${encodeURIComponent(post.id)}/slides/1.svg" target="_blank" rel="noopener">PREVIEW MODULE</a>
      </article>`).join("");
    return `<section class="library-group"><div class="label">${escapeHtml(category)} / ${posts.length} MODULES</div><div class="grid">${cards}</div></section>`;
  }).join("");
}

function landingHtml(config) {
  const checkout = config.checkoutUrl
    ? `<a class="button secondary" href="${escapeHtml(config.checkoutUrl)}" rel="noopener">OPEN OPERATOR VAULT — $29</a>`
    : "";
  const library = libraryHtml();
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="CYVX Field Manual: 33 production systems across security, engineering, sales, operations, ownership, capital, and Web3."><title>CYVX Field Manual</title>
<style>
:root{color-scheme:dark;font-family:"JetBrains Mono","IBM Plex Mono",ui-monospace,SFMono-Regular,monospace;background:#0d0e10;color:#f3f4f6}*{box-sizing:border-box}body{margin:0;background:linear-gradient(#0d0e10dd,#0d0e10),repeating-linear-gradient(90deg,transparent 0 79px,#22252a 80px),repeating-linear-gradient(0deg,transparent 0 79px,#22252a 80px);min-height:100vh}main{width:min(1180px,calc(100% - 28px));margin:24px auto;border:1px solid #343840;background:#0d0e10ef;position:relative}.cross{position:absolute;color:#00ff66;font-size:24px}.tl{left:-9px;top:-18px}.tr{right:-9px;top:-18px}.bl{left:-9px;bottom:-18px}.br{right:-9px;bottom:-18px}.hero{padding:clamp(38px,7vw,90px);display:grid;gap:30px}.label{color:#00ff66;letter-spacing:.15em;font-size:.82rem}.hero h1{font-size:clamp(3rem,10vw,7.7rem);line-height:.9;letter-spacing:-.06em;margin:0;max-width:990px}.lead{max-width:820px;color:#a1a7b3;font:1.1rem/1.7 system-ui,sans-serif}.loop{display:flex;flex-wrap:wrap;gap:10px;color:#6b7280;font-size:.75rem}.loop b{color:#f3f4f6}.panel{background:#16181c;border:1px solid #343840;padding:clamp(24px,5vw,52px);display:grid;gap:22px}.library{display:grid;gap:42px}.library-group{display:grid;gap:14px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px}.card{border:1px solid #343840;padding:20px;min-height:190px;display:grid;align-content:start;gap:10px}.card strong{color:#00ff66}.card h3{margin:0}.card p{color:#a1a7b3;font:.92rem/1.55 system-ui,sans-serif;margin:0}.meta{color:#6b7280;font-size:.72rem}.preview{color:#f3f4f6;text-decoration:none;border-top:1px solid #343840;padding-top:12px;font-size:.72rem;margin-top:auto}.preview:hover{color:#00ff66}.form{display:grid;gap:14px;max-width:720px}input,select{width:100%;background:#0d0e10;border:1px solid #343840;color:#f3f4f6;padding:16px;font:inherit}label.check{display:flex;gap:12px;align-items:flex-start;color:#a1a7b3;font:.9rem/1.5 system-ui,sans-serif}label.check input{width:auto;margin-top:4px}.button,button{display:inline-flex;justify-content:center;align-items:center;min-height:54px;padding:14px 20px;background:#00ff66;color:#07140c;border:0;font:700 .9rem/1 ui-monospace,monospace;text-decoration:none;cursor:pointer}.secondary{background:transparent;color:#f3f4f6;border:1px solid #343840}.actions{display:flex;flex-wrap:wrap;gap:12px}.status{min-height:28px;color:#00ff66;font:.9rem/1.5 system-ui,sans-serif}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:#343840}.metric{background:#0d0e10;padding:22px}.metric b{display:block;font-size:1.7rem}.metric span{color:#6b7280;font-size:.72rem}.footer{padding:24px;color:#6b7280;font-size:.72rem;border-top:1px solid #343840}@media(max-width:650px){.metrics{grid-template-columns:1fr 1fr}.hero h1{font-size:3.4rem}.actions>*{width:100%}.card{min-height:0}}
</style></head><body><main><span class="cross tl">+</span><span class="cross tr">+</span><span class="cross bl">+</span><span class="cross br">+</span>
<section class="hero"><div class="label">CYVX / FIELD MANUAL / PRODUCTION LIBRARY</div><h1>BUILD REAL SYSTEMS. OWN THE RESULT.</h1><p class="lead">Thirty-three executable operating modules across cybersecurity, engineering, sales, business operations, ownership, capital, and Web3—connected to real lead capture, delivery, provider verification, telemetry, and revenue attribution.</p><div class="loop"><b>INPUT</b> → MODEL → EXECUTE → MEASURE → LEARN → IMPROVE → MONETIZE</div></section>
<section class="panel"><div class="label">FREE OPERATOR STARTER ACCESS</div><h2>Choose the system you requested.</h2><form class="form" id="lead-form"><select name="keyword" aria-label="Requested system"><option value="MANUAL">MANUAL — Operator readiness assessment</option><option value="SECURE">SECURE — Phone theft response checklist</option><option value="DEPLOY">DEPLOY — Mobile website starter files</option></select><input name="first_name" autocomplete="given-name" placeholder="FIRST NAME" maxlength="80"><input name="email" type="email" autocomplete="email" placeholder="PRIMARY EMAIL" required maxlength="254"><label class="check"><input name="consent" type="checkbox" value="true">Send future CYVX operating systems, field manuals, and product updates. The requested file is delivered even when this is unchecked.</label><input name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px"><button type="submit">GRANT ACCESS</button><div id="status" class="status" aria-live="polite"></div></form><div class="actions">${checkout}</div></section>
<section class="panel"><div class="label">VERIFIED PUBLICATION SYSTEM</div><div class="metrics"><div class="metric"><b>33</b><span>APPROVED POSTS</span></div><div class="metric"><b>234</b><span>RENDERED SLIDES</span></div><div class="metric"><b>7</b><span>CONNECTED PILLARS</span></div><div class="metric"><b>6</b><span>PUBLICATION CHANNELS</span></div></div></section>
<section class="panel library"><div><div class="label">FIELD MANUAL LIBRARY</div><h2>Production modules, not disconnected inspiration.</h2></div>${library}</section>
<section class="panel"><div class="label">SYSTEM TARGETS</div><div class="metrics"><div class="metric"><b>≥1.5%</b><span>LEAD CAPTURE EFFICIENCY</span></div><div class="metric"><b>≥$10</b><span>REVENUE / 1,000 REACH</span></div><div class="metric"><b>≥10%</b><span>30-DAY CUSTOMER CONVERSION</span></div><div class="metric"><b>100%</b><span>SOURCE PROVENANCE</span></div></div></section><footer class="footer">© 2026 CYVX. Educational systems. Verify platform, legal, financial, and security requirements before execution.</footer></main>
<script>const form=document.getElementById('lead-form'),statusNode=document.getElementById('status');form.addEventListener('submit',async(event)=>{event.preventDefault();statusNode.textContent='VALIDATING TRANSMISSION...';const data=Object.fromEntries(new FormData(form).entries());data.consent=data.consent==='true';try{const response=await fetch('/api/v1/leads',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)}),result=await response.json();if(!response.ok)throw new Error(result.error||'Access failed');statusNode.innerHTML='ACCESS GRANTED. <a href="'+result.download_url+'">DOWNLOAD '+result.asset+'</a>';form.reset()}catch(error){statusNode.textContent='TRANSMISSION FAILED: '+error.message}});</script></body></html>`;
}

module.exports = { publicConfig, landingHtml, libraryHtml, escapeHtml };
