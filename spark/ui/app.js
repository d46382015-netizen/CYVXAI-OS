"use strict";

const state = {
  graph: null,
  loading: false,
  worlds: [],
};

const $ = (id) => document.getElementById(id);
const ownerInput = $("owner-id");
ownerInput.value = localStorage.getItem("spark.owner_id") || `founder_${uuid()}`;
localStorage.setItem("spark.owner_id", ownerInput.value);

async function api(path, options = {}) {
  const headers = { ...(options.body ? { "content-type": "application/json" } : {}), ...(options.headers || {}) };
  const response = await fetch(path, { ...options, headers, credentials: "same-origin" });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error?.message || payload?.message || `Request failed (${response.status})`);
  }
  return payload?.data ?? payload;
}

async function refreshPlatform() {
  try {
    const status = await api("/api/public/status");
    const metrics = status.metrics || {};
    setText("metric-sparks", metrics.sparks_total || 0);
    setText("metric-worlds", metrics.operational_worlds || 0);
    setText("metric-leads", metrics.leads_total || 0);
    setText("metric-outcomes", metrics.verified_outcomes || 0);
    const badge = $("runtime-status");
    badge.textContent = "Operational";
    badge.classList.add("online");
    badge.classList.remove("offline");
  } catch (error) {
    const badge = $("runtime-status");
    badge.textContent = "Offline";
    badge.classList.add("offline");
    badge.classList.remove("online");
  }
}

async function refreshWorlds() {
  const grid = $("world-grid");
  if (!grid) return;
  try {
    const response = await api(`/api/public/worlds?ts=${Date.now()}`);
    state.worlds = Array.isArray(response.worlds) ? response.worlds : [];
    if (!state.worlds.length) {
      grid.innerHTML = '<article class="empty-card">Operational Worlds will appear here after their approved mission finishes.</article>';
      return;
    }
    grid.innerHTML = state.worlds.map((world) => `
      <article class="world-card">
        <div class="world-top"><span class="status-pill online">${escapeHtml(world.status)}</span><small>${escapeHtml(relativeTime(world.updated_at || world.created_at))}</small></div>
        <h3>${escapeHtml(world.name)}</h3>
        <p>${escapeHtml(world.offer_name || "Operational World")}</p>
        <div class="world-meta">${world.location ? `<span>${escapeHtml(world.location)}</span>` : ""}<span>Owned asset</span><span>Lead intake live</span></div>
        <a href="${escapeAttribute(world.public_path || `/w/${world.slug}`)}" target="_blank" rel="noopener">Open World →</a>
      </article>
    `).join("");
  } catch (error) {
    grid.innerHTML = `<article class="empty-card">${escapeHtml(error.message)}</article>`;
  }
}

$("ignite-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (state.loading) return;
  const intention = $("intention").value.trim();
  const ownerId = ownerInput.value.trim();
  const worldName = $("world-name").value.trim();
  const price = Number($("price").value || 0);
  const paymentUrl = $("payment-url").value.trim();
  const world = {
    name: worldName || undefined,
    offer_name: $("offer-name").value.trim() || undefined,
    offer_description: $("offer-description").value.trim() || undefined,
    price_cents: Number.isFinite(price) && price > 0 ? Math.round(price * 100) : 0,
    currency: "USD",
    call_to_action: "Request service",
    location: $("location").value.trim() || undefined,
    email: $("contact-email").value.trim() || undefined,
    payment_url: paymentUrl || undefined,
  };

  setLoading(true);
  setFormStatus("Modeling the intention, ownership boundary, offer, mission, and proof plan…");
  try {
    state.graph = await api("/api/v1/sparks", {
      method: "POST",
      headers: { "idempotency-key": uuid() },
      body: JSON.stringify({
        owner_id: ownerId,
        intention,
        world,
        success_metrics: [
          { key: "world_operational", target: 1, unit: "boolean" },
          { key: "qualified_leads", target: 1, unit: "count" },
        ],
      }),
    });
    localStorage.setItem("spark.owner_id", ownerId);
    localStorage.setItem("spark.last_id", state.graph.spark.id);
    setFormStatus("Spark created. Review its bounded mission, then approve execution.");
    renderGraph();
    $("workspace").scrollIntoView({ behavior: "smooth", block: "start" });
    toast("Spark created. Approval is required before execution.");
    await refreshPlatform();
  } catch (error) {
    setFormStatus(error.message, true);
    toast(error.message, true);
  } finally {
    setLoading(false);
  }
});

$("approve-button").addEventListener("click", async () => {
  if (!state.graph || state.loading) return;
  setLoading(true);
  try {
    state.graph = await api(`/api/v1/sparks/${encodeURIComponent(state.graph.spark.id)}/approval`, {
      method: "POST",
      body: JSON.stringify({
        owner_id: ownerInput.value.trim(),
        decision: "approved",
        reason: "Founder approved the bounded World bootstrap mission and its listed capabilities.",
      }),
    });
    renderGraph();
    toast("Bounded authority approved. The mission is ready to execute.");
  } catch (error) {
    toast(error.message, true);
  } finally {
    setLoading(false);
  }
});

$("execute-button").addEventListener("click", async () => {
  if (!state.graph || state.loading) return;
  setLoading(true);
  try {
    state.graph = await api(`/api/v1/sparks/${encodeURIComponent(state.graph.spark.id)}/execute`, {
      method: "POST",
      body: JSON.stringify({ owner_id: ownerInput.value.trim(), max_steps: 20 }),
    });
    renderGraph();
    await Promise.all([refreshPlatform(), refreshWorlds()]);
    if (state.graph.world?.status === "operational") {
      toast("World launched. Website, offer, intake, follow-up, ownership, and proof are live.");
    } else {
      toast("Mission advanced. Review the next required action.");
    }
  } catch (error) {
    toast(error.message, true);
  } finally {
    setLoading(false);
  }
});

$("new-spark-button").addEventListener("click", () => {
  state.graph = null;
  localStorage.removeItem("spark.last_id");
  $("workspace").classList.add("hidden");
  $("ignite-form").reset();
  ownerInput.value = localStorage.getItem("spark.owner_id") || `founder_${uuid()}`;
  setFormStatus("");
  $("intention").focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

$("copy-world-button").addEventListener("click", async () => {
  const publicPath = state.graph?.world?.public_path;
  if (!publicPath) return;
  const url = new URL(publicPath, window.location.origin).toString();
  try {
    await navigator.clipboard.writeText(url);
    toast("Public World link copied.");
  } catch {
    window.prompt("Copy this World link:", url);
  }
});

$("refresh-worlds").addEventListener("click", refreshWorlds);

async function restoreLastSpark() {
  const sparkId = localStorage.getItem("spark.last_id");
  if (!sparkId) return;
  try {
    state.graph = await api(`/api/v1/sparks/${encodeURIComponent(sparkId)}`);
    renderGraph();
  } catch {
    localStorage.removeItem("spark.last_id");
  }
}

async function refreshGraph() {
  const sparkId = state.graph?.spark?.id;
  if (!sparkId || state.loading) return;
  try {
    state.graph = await api(`/api/v1/sparks/${encodeURIComponent(sparkId)}`);
    renderGraph();
  } catch {
    // Keep the last known local graph visible during a transient network failure.
  }
}

function renderGraph() {
  const graph = state.graph;
  if (!graph) return;
  const spark = graph.spark;
  const world = graph.world;
  const mission = graph.mission;
  const approvals = Array.isArray(graph.approvals) ? graph.approvals : [];
  const evidence = Array.isArray(graph.evidence) ? graph.evidence : [];
  const leads = Array.isArray(graph.leads) ? graph.leads : [];
  const steps = Array.isArray(mission?.steps) ? mission.steps : [];
  const completed = steps.filter((step) => step.status === "completed").length;
  const progress = steps.length ? Math.round(completed / steps.length * 100) : 0;

  $("workspace").classList.remove("hidden");
  setText("spark-title", spark.title);
  setText("spark-intention", spark.intention);
  setText("spark-status", readable(spark.status));
  setText("world-status", readable(world?.status || "not created"));
  setText("authority-tier", readable(spark.authority_tier));
  setText("evidence-count", evidence.length);
  setText("lead-count", leads.length);
  setText("mission-status", readable(mission?.status || "not planned"));
  setText("next-action", spark.next_action || "No further action required.");
  setText("proof-count-label", `${evidence.length} ${evidence.length === 1 ? "record" : "records"}`);
  setText("progress-label", `${progress}% complete · ${completed}/${steps.length} steps`);
  $("mission-progress").style.width = `${progress}%`;

  const pendingApproval = approvals.some((approval) => approval.status === "pending");
  $("approve-button").disabled = state.loading || !pendingApproval;
  $("execute-button").disabled = state.loading || spark.status !== "active" || mission?.status !== "active";

  const worldLink = $("world-link");
  const copyButton = $("copy-world-button");
  if (world?.public_path) {
    worldLink.href = world.public_path;
    worldLink.classList.remove("hidden");
    copyButton.classList.remove("hidden");
  } else {
    worldLink.classList.add("hidden");
    copyButton.classList.add("hidden");
  }

  $("mission-steps").innerHTML = steps.length ? steps.map((step) => `
    <div class="step ${escapeHtml(step.status)}">
      <span class="step-dot" aria-hidden="true"></span>
      <div><strong>${escapeHtml(step.title)}</strong>${step.message ? `<small>${escapeHtml(step.message)}</small>` : `<small>${escapeHtml(step.optional ? "Optional bounded capability" : "Required mission step")}</small>`}</div>
      <small>${escapeHtml(readable(step.status))}</small>
    </div>
  `).join("") : '<p class="muted">No mission steps are available.</p>';

  $("proof-stream").innerHTML = evidence.length ? evidence.slice().reverse().map((item) => `
    <div class="proof-item">
      <strong>${escapeHtml(readable(item.type))}</strong>
      <small>${escapeHtml(item.source || "CYVX runtime")} · ${escapeHtml(String(item.sha256 || "").slice(0, 14))}</small>
    </div>
  `).join("") : '<p class="muted">Proof appears here as real artifacts are generated and verified.</p>';
}

function setLoading(loading) {
  state.loading = loading;
  const submit = $("ignite-form").querySelector("button[type=submit]");
  if (submit) submit.disabled = loading;
  if (state.graph) {
    renderGraph();
  } else {
    $("approve-button").disabled = true;
    $("execute-button").disabled = true;
  }
}

function setFormStatus(message, isError = false) {
  const node = $("form-status");
  node.textContent = message;
  node.classList.toggle("error", isError);
}

function setText(id, value) {
  const node = $(id);
  if (node) node.textContent = String(value ?? "");
}

function toast(message, isError = false) {
  const node = $("toast");
  node.textContent = message;
  node.className = `toast show${isError ? " error" : ""}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { node.className = "toast"; }, 3400);
}

function readable(value) {
  return String(value ?? "—").replaceAll("_", " ");
}

function uuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
}

function relativeTime(value) {
  const timestamp = Date.parse(value || "");
  if (!Number.isFinite(timestamp)) return "recently";
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

async function init() {
  await Promise.allSettled([refreshPlatform(), refreshWorlds(), restoreLastSpark()]);
  setInterval(refreshPlatform, 30_000);
  setInterval(refreshWorlds, 45_000);
  setInterval(refreshGraph, 12_000);
}

init();
