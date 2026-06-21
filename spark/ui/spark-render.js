"use strict";

export const $ = (id) => document.getElementById(id);

export function renderStatus(status) {
  const metrics = status?.metrics || {};
  $("runtime-status").textContent = "Operational";
  $("runtime-status").classList.add("operational");
  $("metric-sparks").textContent = formatNumber(metrics.sparks_total);
  $("metric-worlds").textContent = formatNumber(metrics.operational_worlds);
  $("metric-leads").textContent = formatNumber(metrics.leads_total);
  $("metric-outcomes").textContent = formatNumber(metrics.verified_outcomes);
}

export function renderOffline() {
  $("runtime-status").textContent = "Offline";
  $("runtime-status").classList.remove("operational");
}

export function renderWorlds(worlds) {
  const grid = $("world-grid");
  if (!worlds.length) {
    grid.innerHTML = '<article class="empty-card">Operational Worlds will appear here.</article>';
    return;
  }
  grid.innerHTML = worlds.map((world) => `
    <article class="world-card">
      <div><span class="status-pill operational">Operational</span><small>${escapeHtml(world.location || "Global")}</small></div>
      <h3>${escapeHtml(world.name)}</h3>
      <p>${escapeHtml(world.offer_name || "Owned operational World")}</p>
      <a class="secondary" href="${escapeHtml(world.public_path)}">Open World →</a>
    </article>`).join("");
}

export function renderGraph(graph, busy = false) {
  if (!graph) return;
  $("workspace").classList.remove("hidden");
  $("spark-title").textContent = graph.spark.title;
  $("spark-intention").textContent = graph.spark.intention;
  $("spark-status").textContent = humanize(graph.spark.status);
  $("world-status").textContent = humanize(graph.world?.status || "not created");
  $("authority-tier").textContent = humanize(graph.spark.authority_tier || "observe");
  $("evidence-count").textContent = formatNumber(graph.evidence?.length);
  $("lead-count").textContent = formatNumber(graph.leads?.length);
  $("mission-status").textContent = humanize(graph.mission?.status || "not planned");
  $("next-action").textContent = graph.spark.next_action || "No further action is required.";

  const steps = Array.isArray(graph.mission?.steps) ? graph.mission.steps : [];
  const completed = steps.filter((step) => step.status === "completed").length;
  const percent = steps.length ? Math.round((completed / steps.length) * 100) : 0;
  $("mission-progress").style.width = `${percent}%`;
  $("progress-label").textContent = `${completed} of ${steps.length} mission steps complete · ${percent}%`;

  const pendingApproval = graph.approvals?.some((approval) => approval.status === "pending");
  $("approve-button").disabled = busy || !pendingApproval;
  $("execute-button").disabled = busy || graph.spark.status !== "active" || graph.mission?.status !== "active";

  const worldLink = $("world-link");
  const copyButton = $("copy-world-button");
  if (graph.world?.public_path) {
    worldLink.href = graph.world.public_path;
    worldLink.classList.remove("hidden");
    copyButton.classList.remove("hidden");
  } else {
    worldLink.classList.add("hidden");
    copyButton.classList.add("hidden");
  }

  $("mission-steps").innerHTML = steps.length ? steps.map((step) => `
    <div class="step ${escapeHtml(step.status)}">
      <span class="step-dot"></span>
      <div><strong>${escapeHtml(step.title)}</strong>${step.message ? `<small>${escapeHtml(step.message)}</small>` : ""}</div>
      <small>${escapeHtml(humanize(step.status))}</small>
    </div>`).join("") : '<p class="muted">No mission steps exist yet.</p>';

  const evidence = Array.isArray(graph.evidence) ? graph.evidence : [];
  $("proof-count-label").textContent = `${evidence.length} ${evidence.length === 1 ? "record" : "records"}`;
  $("proof-stream").innerHTML = evidence.length ? evidence.slice().reverse().map((item) => `
    <div class="proof-item">
      <strong>${escapeHtml(humanize(item.type))}</strong>
      <small>${escapeHtml(item.source || "CYVX")} · ${escapeHtml(String(item.sha256 || "proof").slice(0, 12))}</small>
    </div>`).join("") : '<p class="muted">Proof appears as real artifacts are created.</p>';
}

export function showToast(message, type = "success") {
  const toast = $("toast");
  toast.textContent = message;
  toast.dataset.type = type;
  toast.classList.add("visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("visible"), 3600);
}

export function formatNumber(value) {
  return new Intl.NumberFormat().format(Number(value || 0));
}

export function humanize(value) {
  return String(value || "").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}
