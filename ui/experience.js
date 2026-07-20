"use strict";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const statusDialog = $("#statusDialog");
let latestStatus = null;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character]));
}

function stateClass(ok) { return ok ? "ok" : "bad"; }
function stateLabel(ok, good = "ONLINE", bad = "OFFLINE") { return ok ? good : bad; }

async function getJson(path) {
  const response = await fetch(path, { headers: { accept: "application/json" }, cache: "no-store" });
  let payload = {};
  try { payload = await response.json(); } catch { /* response body is optional */ }
  if (!response.ok) throw Object.assign(new Error(payload.message || `Request failed (${response.status})`), { response, payload });
  return payload;
}

function setMetric(id, label, ok) {
  const node = document.getElementById(id);
  if (!node) return;
  node.textContent = label;
  node.className = stateClass(ok);
}

function countReadyServices(payload) {
  const services = payload?.services || {};
  return Object.values(services).filter((service) => {
    if (!service || typeof service !== "object") return false;
    if (typeof service.ready === "boolean") return service.ready;
    if (typeof service.configured === "boolean") return service.configured;
    if (typeof service.ok === "boolean") return service.ok;
    if (typeof service.database === "boolean") return service.database;
    return service.status === "ok";
  }).length;
}

function renderStatus(payload) {
  latestStatus = payload;
  const mission = payload.mission_runtime || payload.services?.missions || {};
  const workerReady = Boolean(mission?.dependencies?.worker?.ready || mission?.ready);
  const universalReady = Boolean(payload.universal_operator?.ok || payload.services?.universal_operator?.ok);
  const revenueReady = Boolean(payload.revenue_operator?.database || payload.services?.revenue_operator?.database);
  const capabilities = Array.isArray(payload.capabilities) ? payload.capabilities : [];
  const runtimeReady = Boolean(payload.ready ?? payload.ok);

  $("#heroVersion").textContent = payload.version || "LIVE";
  $("#heroServices").textContent = String(countReadyServices(payload));
  $("#heroCapabilities").textContent = String(capabilities.length);
  $("#coreState").textContent = runtimeReady ? "OPERATIONAL" : "DEGRADED";
  $("#realityState").textContent = payload.timestamp ? `Observed ${new Date(payload.timestamp).toLocaleTimeString()}` : "Runtime observed";
  $("#missionState").textContent = workerReady ? "Persistent worker ready" : "Worker needs attention";
  $("#proofState").textContent = payload.github?.configured ? "Repository proof connected" : "Local proof runtime active";

  setMetric("gatewayMetric", stateLabel(Boolean(payload.ok), "ONLINE", "DEGRADED"), Boolean(payload.ok));
  setMetric("workerMetric", stateLabel(workerReady, "READY", "OFFLINE"), workerReady);
  setMetric("operatorMetric", stateLabel(universalReady, "ONLINE", "DEGRADED"), universalReady);
  setMetric("revenueMetric", stateLabel(revenueReady, "CONNECTED", "OFFLINE"), revenueReady);

  $("#previewVelocity").textContent = payload.metrics?.outcomes ?? payload.metrics?.worlds ?? "LIVE";
  $("#previewReady").textContent = runtimeReady ? "RUNTIME OPERATIONAL" : "RUNTIME DEGRADED";
  $("#previewMissions").textContent = mission?.metrics?.missions ?? mission?.active_missions ?? "—";
  $("#previewCapabilities").textContent = String(capabilities.length);

  const capabilityGrid = $("#capabilityGrid");
  if (capabilities.length) {
    capabilityGrid.innerHTML = capabilities.slice(0, 9).map((capability, index) => `
      <article>
        <span>${String(index + 1).padStart(2, "0")}</span>
        <b>${escapeHtml(capability.key || capability.description || "Production capability")}</b>
        <small>${escapeHtml(capability.description || `Risk: ${capability.risk || "governed"}. Approval: ${capability.requires_approval ? "required" : "policy controlled"}.`)}</small>
      </article>
    `).join("");
  } else {
    capabilityGrid.innerHTML = [
      ["API", "Production gateway", "Health, readiness, public status, and governed internal routing."],
      ["DB", "Durable mission state", "SQLite-backed missions, jobs, approvals, outcomes, evidence, and audits."],
      ["LOG", "Measured execution", "Worker heartbeats, structured logs, evidence hashing, and runtime proof."],
    ].map(([tag, title, detail]) => `<article><span>${tag}</span><b>${title}</b><small>${detail}</small></article>`).join("");
  }
}

function renderStatusDialog(payload, error) {
  const details = $("#statusDetails");
  if (error) {
    $("#dialogTitle").textContent = "Runtime could not be reached";
    details.innerHTML = `<div class="status-row"><span>Error</span><b class="bad">${escapeHtml(error.message)}</b></div>`;
    return;
  }
  const mission = payload.mission_runtime || payload.services?.missions || {};
  const workerReady = Boolean(mission?.dependencies?.worker?.ready || mission?.ready);
  const rows = [
    ["Public gateway", Boolean(payload.ok), payload.ok ? "Online" : "Degraded"],
    ["Mission database", Boolean(mission?.dependencies?.database?.ready), mission?.dependencies?.database?.ready ? "Ready" : "Unavailable"],
    ["Mission worker", workerReady, workerReady ? "Heartbeat current" : "Heartbeat missing"],
    ["Universal operator", Boolean(payload.universal_operator?.ok || payload.services?.universal_operator?.ok), (payload.universal_operator?.ok || payload.services?.universal_operator?.ok) ? "Online" : "Degraded"],
    ["Revenue database", Boolean(payload.revenue_operator?.database || payload.services?.revenue_operator?.database), (payload.revenue_operator?.database || payload.services?.revenue_operator?.database) ? "Connected" : "Offline"],
    ["Integrations", Boolean(payload.integrations?.ready ?? true), payload.integrations?.ready === false ? "Needs configuration" : "Policy ready"],
  ];
  $("#dialogTitle").textContent = payload.ready ? "CYVX is operational" : "CYVX is running with constraints";
  details.innerHTML = rows.map(([label, ok, value]) => `<div class="status-row"><span>${label}</span><b class="${stateClass(ok)}">${escapeHtml(value)}</b></div>`).join("");
}

async function loadStatus(openDialog = false) {
  let payload;
  let error;
  try {
    payload = await getJson("/api/public/status");
    renderStatus(payload);
  } catch (failure) {
    error = failure;
    try {
      const health = await getJson("/healthz");
      payload = health;
      renderStatus(health);
    } catch (healthFailure) {
      error = healthFailure;
      setMetric("gatewayMetric", "UNREACHABLE", false);
      $("#coreState").textContent = "OFFLINE";
    }
  }
  if (openDialog) {
    renderStatusDialog(payload || {}, error);
    if (typeof statusDialog.showModal === "function") statusDialog.showModal();
    else statusDialog.setAttribute("open", "");
  }
}

async function loadWorlds() {
  const grid = $("#worldGrid");
  try {
    const payload = await getJson("/api/public/worlds");
    const worlds = Array.isArray(payload.worlds) ? payload.worlds : [];
    if (!worlds.length) return;
    grid.innerHTML = worlds.slice(0, 6).map((world) => `
      <a class="world-card" href="${escapeHtml(world.public_path || `/spark/w/${world.slug || world.id}`)}">
        <span>${escapeHtml(world.status || "operational")}</span>
        <b>${escapeHtml(world.name || world.offer_name || "CYVX World")}</b>
        <small>${escapeHtml([world.offer_name, world.location].filter(Boolean).join(" · ") || "Public operating asset")}</small>
      </a>
    `).join("");
  } catch (error) {
    grid.innerHTML = `<p>World registry unavailable: ${escapeHtml(error.message)}</p>`;
  }
}

function wireActions() {
  document.addEventListener("click", (event) => {
    const actionNode = event.target.closest("[data-action]");
    if (!actionNode) return;
    const action = actionNode.dataset.action;
    if (action === "live-status") {
      event.preventDefault();
      loadStatus(true);
    }
    if (action === "proof") {
      event.preventDefault();
      $("#proof")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });
}

function wireReveal() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => entry.target.classList.toggle("visible", entry.isIntersecting));
  }, { threshold: 0.12 });
  $$(".reveal").forEach((node) => observer.observe(node));
}

function wireTilt() {
  if (matchMedia("(pointer: coarse)").matches || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  $$('[data-tilt]').forEach((node) => {
    node.addEventListener("pointermove", (event) => {
      const rect = node.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      node.style.transform = `perspective(1100px) rotateX(${(-y * 8).toFixed(2)}deg) rotateY(${(x * 10).toFixed(2)}deg) translateZ(6px)`;
    });
    node.addEventListener("pointerleave", () => { node.style.transform = ""; });
  });
}

function startClock() {
  const node = $("#windowClock");
  const tick = () => { node.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }); };
  tick();
  setInterval(tick, 1000);
}

function startRealityField() {
  const canvas = $("#realityField");
  const context = canvas.getContext("2d", { alpha: true });
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let width = 0;
  let height = 0;
  let ratio = 1;
  let nodes = [];
  let frame = 0;

  function resize() {
    ratio = Math.min(devicePixelRatio || 1, 2);
    width = innerWidth;
    height = innerHeight;
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const count = Math.max(32, Math.min(95, Math.floor(width / 19)));
    nodes = Array.from({ length: count }, (_, index) => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * (index % 7 === 0 ? 0.28 : 0.13),
      vy: (Math.random() - 0.5) * 0.12,
      radius: index % 9 === 0 ? 1.9 : 0.75 + Math.random() * 0.7,
      phase: Math.random() * Math.PI * 2,
    }));
  }

  function draw() {
    frame += 1;
    context.clearRect(0, 0, width, height);
    const time = frame * 0.008;
    for (const node of nodes) {
      if (!reduced) {
        node.x += node.vx;
        node.y += node.vy;
        if (node.x < -20) node.x = width + 20;
        if (node.x > width + 20) node.x = -20;
        if (node.y < -20) node.y = height + 20;
        if (node.y > height + 20) node.y = -20;
      }
      const alpha = 0.18 + Math.sin(time + node.phase) * 0.08;
      context.beginPath();
      context.fillStyle = `rgba(220,255,235,${alpha})`;
      context.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      context.fill();
    }
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const distance = Math.hypot(dx, dy);
        if (distance > 135) continue;
        context.beginPath();
        context.strokeStyle = `rgba(121,248,255,${(1 - distance / 135) * 0.055})`;
        context.lineWidth = 0.7;
        context.moveTo(nodes[i].x, nodes[i].y);
        context.lineTo(nodes[j].x, nodes[j].y);
        context.stroke();
      }
    }
    if (!reduced) requestAnimationFrame(draw);
  }

  addEventListener("resize", resize, { passive: true });
  resize();
  draw();
}

function init() {
  wireActions();
  wireReveal();
  wireTilt();
  startClock();
  startRealityField();
  loadStatus();
  loadWorlds();
  setInterval(() => loadStatus(false), 15000);
}

document.addEventListener("DOMContentLoaded", init);
