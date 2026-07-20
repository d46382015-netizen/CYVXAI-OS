"use strict";

function switchView(name) {
  const titles = { overview: "Executive overview", missions: "Mission control", proof: "Evidence and proof", runtime: "Runtime topology" };
  $$('[data-view-panel]').forEach((panel) => panel.classList.toggle("active", panel.dataset.viewPanel === name));
  $$('[data-view]').forEach((button) => button.classList.toggle("active", button.dataset.view === name));
  $("#viewTitle").textContent = titles[name] || "CYVX Control Room";
}

async function executeCommand(command) {
  const text = String(command || "").trim().toLowerCase();
  if (!text) return;
  if (/^(status|refresh|health)/.test(text)) return refreshAll();
  if (/create|new mission/.test(text)) return openDialog("#missionDialog");
  if (/self.?scan|scan/.test(text)) return runSelfScan();
  if (/verify|proof/.test(text)) return verifySelectedProof();
  if (/run|execute|idle/.test(text)) return runSelectedToIdle();
  if (/mission/.test(text)) return switchView("missions");
  showOutput("Command not recognized", { command, supported: ["status", "create mission", "run selected", "self scan", "verify proof"] }, "COMMAND PALETTE");
}

function wireEvents() {
  document.addEventListener("click", async (event) => {
    const missionNode = event.target.closest("[data-mission-id]");
    if (missionNode) {
      state.selectedId = missionNode.dataset.missionId;
      localStorage.setItem("cyvxSelectedMission", state.selectedId);
      await loadSelectedMission();
      if (matchMedia("(max-width:980px)").matches) switchView("missions");
      return;
    }
    const viewNode = event.target.closest("[data-view]");
    if (viewNode) { switchView(viewNode.dataset.view); return; }
    const actionNode = event.target.closest("[data-action]");
    if (!actionNode || state.busy) return;
    const action = actionNode.dataset.action;
    if (action === "refresh") return refreshAll();
    if (action === "refresh-missions") return loadMissions();
    if (action === "refresh-selected") return loadSelectedMission();
    if (action === "auth") return openDialog("#authDialog");
    if (action === "command") { $("#commandInput").focus(); return; }
    if (action === "new-mission") { if (!state.token) openDialog("#authDialog"); else openDialog("#missionDialog"); return; }
    if (action === "mission-transition") return transitionSelected();
    if (action === "run-selected") return runSelectedToIdle();
    if (action === "record-proof") return openDialog("#proofDialog");
    if (action === "verify-proof") return verifySelectedProof();
    if (action === "export-proof") return exportSelectedProof();
    if (action === "repo-proof") return showMissionProof();
    if (action === "self-scan") return runSelfScan();
    if (action === "copy-runtime") return copyRuntime();
  });
  $("#authForm").addEventListener("submit", connectOperator);
  $("#missionForm").addEventListener("submit", createMission);
  $("#proofForm").addEventListener("submit", recordProof);
  $("#logoutButton").addEventListener("click", clearSession);
  $("#commandForm").addEventListener("submit", (event) => { event.preventDefault(); const input = $("#commandInput"); executeCommand(input.value); input.value = ""; });
  $$('[data-auth-mode]').forEach((button) => button.addEventListener("click", () => {
    state.authMode = button.dataset.authMode;
    $$('[data-auth-mode]').forEach((item) => item.classList.toggle("active", item === button));
    $("#localAuthFields").hidden = state.authMode !== "local";
    $("#tokenAuthFields").hidden = state.authMode !== "token";
  }));
  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {
      event.preventDefault();
      $("#commandInput").focus();
    }
  });
}

function startRealityCanvas() {
  const canvas = $("#realityCanvas");
  const context = canvas.getContext("2d");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let width;
  let height;
  let ratio;
  let points = [];
  let frame = 0;
  function resize() {
    ratio = Math.min(devicePixelRatio || 1, 2);
    width = innerWidth;
    height = innerHeight;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const count = Math.max(28, Math.min(80, Math.floor(width / 20)));
    points = Array.from({ length: count }, (_, index) => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.11,
      vy: (Math.random() - 0.5) * 0.09,
      size: index % 11 === 0 ? 2 : 0.8,
    }));
  }
  function draw() {
    frame += 1;
    context.clearRect(0, 0, width, height);
    const gradient = context.createRadialGradient(width * 0.44, height * 0.43, 0, width * 0.44, height * 0.43, Math.max(width, height) * 0.7);
    gradient.addColorStop(0, "rgba(116,247,255,.055)");
    gradient.addColorStop(0.5, "rgba(159,134,255,.025)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    points.forEach((point) => {
      if (!reduced) {
        point.x += point.vx;
        point.y += point.vy;
        if (point.x < 0 || point.x > width) point.vx *= -1;
        if (point.y < 0 || point.y > height) point.vy *= -1;
      }
      context.beginPath();
      context.fillStyle = point.size > 1 ? "rgba(200,255,46,.45)" : "rgba(230,240,255,.22)";
      context.arc(point.x, point.y, point.size, 0, Math.PI * 2);
      context.fill();
    });
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        const distance = Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y);
        if (distance > 120) continue;
        context.beginPath();
        context.strokeStyle = `rgba(116,247,255,${(1 - distance / 120) * 0.05})`;
        context.moveTo(points[i].x, points[i].y);
        context.lineTo(points[j].x, points[j].y);
        context.stroke();
      }
    }
    if (!reduced) requestAnimationFrame(draw);
  }
  addEventListener("resize", resize, { passive: true });
  resize();
  draw();
}

async function init() {
  wireEvents();
  renderOperator();
  renderMissionLists();
  renderMissionDetail();
  startRealityCanvas();
  logActivity("CYVX Control Room initialized.");
  await loadPublicStatus();
  if (state.token) {
    try { await loadMissions(); } catch (error) { logActivity(`Saved session could not load missions: ${error.message}`); }
  }
  if (location.hash === "#new") state.token ? openDialog("#missionDialog") : openDialog("#authDialog");
  setInterval(() => loadPublicStatus().catch(() => undefined), 15000);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
