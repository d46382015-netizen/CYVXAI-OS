(() => {
  "use strict";

  const style = document.createElement("style");
  style.textContent = `
    #kreaControl{margin:18px 0;padding:18px;border:1px solid rgba(255,255,255,.12);border-radius:16px;background:rgba(10,14,24,.72);color:#eef2ff;font:14px/1.45 system-ui,sans-serif}
    #kreaControl h2{margin:0 0 8px;font-size:18px}.krea-grid{display:grid;gap:10px}.krea-row{display:flex;gap:10px;flex-wrap:wrap}.krea-row>*{flex:1;min-width:180px}
    #kreaPrompt{width:100%;min-height:90px;box-sizing:border-box;background:#080b12;color:inherit;border:1px solid rgba(255,255,255,.15);border-radius:10px;padding:10px}
    #kreaModel,#kreaAspect{background:#080b12;color:inherit;border:1px solid rgba(255,255,255,.15);border-radius:10px;padding:10px}
    #kreaGenerate{border:0;border-radius:10px;padding:10px 14px;font-weight:700;cursor:pointer}.krea-status{opacity:.8}.krea-result{white-space:pre-wrap;overflow:auto;max-height:220px;margin:0}
  `;
  document.head.appendChild(style);

  function mount() {
    if (document.getElementById("kreaControl")) return;
    const root = document.getElementById("app") || document.body;
    const panel = document.createElement("section");
    panel.id = "kreaControl";
    panel.innerHTML = `
      <div class="krea-grid">
        <div><h2>Creative Execution · Krea</h2><div id="kreaStatus" class="krea-status">Checking provider…</div></div>
        <textarea id="kreaPrompt" placeholder="Describe the production asset CYVX should create…"></textarea>
        <div class="krea-row">
          <select id="kreaModel"><option value="image/krea/krea-2/medium">Krea 2 Medium</option><option value="image/krea/krea-2/large">Krea 2 Large</option></select>
          <select id="kreaAspect"><option>16:9</option><option>1:1</option><option>4:5</option><option>9:16</option><option>3:2</option><option>2:3</option></select>
          <button id="kreaGenerate" type="button">Generate</button>
        </div>
        <pre id="kreaResult" class="krea-result"></pre>
      </div>`;
    root.prepend(panel);
    document.getElementById("kreaGenerate").addEventListener("click", generate);
    refreshStatus();
  }

  async function refreshStatus() {
    const el = document.getElementById("kreaStatus");
    try {
      const response = await fetch("/api/v1/integrations/krea/status", { credentials: "same-origin" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
      el.textContent = data.krea.configured ? "● Krea API ready" : "○ Krea API token not configured";
    } catch (error) {
      el.textContent = `Krea status unavailable: ${error.message}`;
    }
  }

  async function generate() {
    const button = document.getElementById("kreaGenerate");
    const result = document.getElementById("kreaResult");
    const prompt = document.getElementById("kreaPrompt").value.trim();
    if (!prompt) { result.textContent = "Enter a production prompt."; return; }
    button.disabled = true;
    result.textContent = "Submitting Krea job…";
    try {
      const response = await fetch("/api/v1/integrations/krea/generate", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: document.getElementById("kreaModel").value,
          input: { prompt, aspect_ratio: document.getElementById("kreaAspect").value, resolution: "1K" }
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
      result.textContent = JSON.stringify(data.result, null, 2);
      if (data.result?.job_id) poll(data.result.job_id, result);
    } catch (error) {
      result.textContent = `Generation failed: ${error.message}`;
    } finally {
      button.disabled = false;
    }
  }

  async function poll(jobId, result) {
    for (let i = 0; i < 120; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      try {
        const response = await fetch(`/api/v1/integrations/krea/jobs/${encodeURIComponent(jobId)}`, { credentials: "same-origin" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
        result.textContent = JSON.stringify(data.result, null, 2);
        const status = String(data.result?.status || "").toLowerCase();
        if (["completed", "failed", "canceled", "cancelled"].includes(status)) return;
      } catch (error) { result.textContent = `Polling failed: ${error.message}`; return; }
    }
    result.textContent += "\nPolling window ended; job remains available by ID.";
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
})();
