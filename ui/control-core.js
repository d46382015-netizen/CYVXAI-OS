"use strict";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const state = {
  token: localStorage.getItem("cyvxMissionToken") || "",
  principal: safeParse(localStorage.getItem("cyvxMissionPrincipal"), null),
  publicStatus: null,
  readiness: null,
  missions: [],
  selectedId: localStorage.getItem("cyvxSelectedMission") || "",
  selectedBundle: null,
  activity: [],
  authMode: "local",
  busy: false,
};

function safeParse(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character]));
}

function encode(value) { return encodeURIComponent(String(value)); }
function terminalStatus(status) { return ["completed", "failed", "cancelled", "evaluated", "learned"].includes(status); }
function nowLabel() { return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }

function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove("show"), 2600);
}

function logActivity(message) {
  state.activity.unshift({ time: nowLabel(), message: String(message) });
  state.activity = state.activity.slice(0, 16);
  const feed = $("#activityFeed");
  feed.innerHTML = state.activity.map((item) => `<div><time>${escapeHtml(item.time)}</time><span>${escapeHtml(item.message)}</span></div>`).join("");
}

function setBusy(busy, label = "") {
  state.busy = busy;
  document.body.classList.toggle("busy", busy);
  if (label) logActivity(label);
}

async function api(path, options = {}, requireAuth = true) {
  const headers = { accept: "application/json", ...(options.headers || {}) };
  if (options.body !== undefined && !headers["content-type"]) headers["content-type"] = "application/json";
  if (requireAuth && state.token) headers.authorization = `Bearer ${state.token}`;
  const response = await fetch(path, { cache: "no-store", ...options, headers });
  let payload = {};
  try { payload = await response.json(); } catch { /* empty response */ }
  if (!response.ok) {
    const error = Object.assign(new Error(payload.message || payload.error || `Request failed (${response.status})`), {
      status: response.status,
      code: payload.error,
      payload,
    });
    if (response.status === 401 && requireAuth && state.token) logActivity("Operator token was rejected or expired.");
    throw error;
  }
  return payload;
}

async function safeApi(path, options = {}, requireAuth = true) {
  try { return await api(path, options, requireAuth); } catch (error) { return { _error: error }; }
}

function requestOptions(method, body, action, missionId = "global") {
  return {
    method,
    headers: { "idempotency-key": `control:${action}:${missionId}:${Date.now()}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

function openDialog(selector) {
  const dialog = $(selector);
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function closeDialog(selector) {
  const dialog = $(selector);
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

function showOutput(title, payload, kicker = "SYSTEM OUTPUT") {
  $("#outputKicker").textContent = kicker;
  $("#outputTitle").textContent = title;
  const body = $("#outputBody");
  if (typeof payload === "string") body.innerHTML = `<p>${escapeHtml(payload)}</p>`;
  else body.innerHTML = `<pre>${escapeHtml(JSON.stringify(payload, null, 2))}</pre>`;
  openDialog("#outputDialog");
}

function showFormMessage(id, message) {
  const node = $(id);
  node.hidden = !message;
  node.textContent = message || "";
}

function parseTokenPrincipal(token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return { id: payload.sub, organization_id: payload.organization_id, role: payload.role, expires_at: payload.exp ? new Date(payload.exp * 1000).toISOString() : null };
  } catch { return null; }
}

function saveSession(token, principal) {
  state.token = token;
  state.principal = principal;
  localStorage.setItem("cyvxMissionToken", token);
  localStorage.setItem("cyvxMissionPrincipal", JSON.stringify(principal));
  renderOperator();
}

function clearSession() {
  state.token = "";
  state.principal = null;
  state.missions = [];
  state.selectedBundle = null;
  localStorage.removeItem("cyvxMissionToken");
  localStorage.removeItem("cyvxMissionPrincipal");
  localStorage.removeItem("cyvxSelectedMission");
  renderOperator();
  renderMissionLists();
  renderMissionDetail();
  toast("Operator session cleared.");
}

function renderOperator() {
  const label = $("#operatorLabel");
  const avatar = $("#operatorAvatar");
  if (state.principal) {
    label.textContent = `${state.principal.id || state.principal.user_id || "operator"} · ${state.principal.role || "authorized"}`;
    avatar.textContent = String(state.principal.id || state.principal.user_id || "O").slice(0, 1).toUpperCase();
  } else {
    label.textContent = "Connect operator";
    avatar.textContent = "D";
  }
}

function statusBoolean(value) {
  if (typeof value === "boolean") return value;
  if (!value || typeof value !== "object") return false;
  if (typeof value.ready === "boolean") return value.ready;
  if (typeof value.ok === "boolean") return value.ok;
  if (typeof value.configured === "boolean") return value.configured;
  if (typeof value.database === "boolean") return value.database;
  return value.status === "ok";
}

function renderPublicStatus() {
  const payload = state.publicStatus || {};
  const mission = payload.mission_runtime || payload.services?.missions || state.readiness || {};
  const runtimeOk = Boolean(payload.ok && (payload.ready ?? true));
  const workerReady = Boolean(mission?.dependencies?.worker?.ready || mission?.ready);
  const revenueReady = Boolean(payload.revenue_operator?.database || payload.services?.revenue_operator?.database);
  const capabilities = Array.isArray(payload.capabilities) ? payload.capabilities.length : 0;
  const outcomes = payload.metrics?.outcomes ?? payload.metrics?.completed_outcomes ?? "—";

  const pill = $("#runtimePill");
  pill.className = `runtime-pill ${runtimeOk ? "ok" : "bad"}`;
  $("span", pill).textContent = runtimeOk ? "Runtime operational" : "Runtime degraded";
  $("#coreHealth").textContent = runtimeOk ? "OPERATIONAL" : "DEGRADED";
  $("#coreTimestamp").textContent = payload.timestamp ? new Date(payload.timestamp).toLocaleTimeString() : "LIVE";
  $("#coreWorker").textContent = workerReady ? "READY" : "OFFLINE";
  $("#coreRevenue").textContent = revenueReady ? "ONLINE" : "CHECK";
  $("#metricRuntime").textContent = runtimeOk ? "100%" : payload.ok ? "LIVE" : "DOWN";
  $("#metricRuntimeDetail").textContent = payload.version || "Public gateway";
  $("#metricCapabilities").textContent = String(capabilities);
  $("#metricOutcomes").textContent = String(outcomes);
  $("#runtimeJson").textContent = JSON.stringify(payload, null, 2);

  const services = [
    ["PUBLIC GATEWAY", Boolean(payload.ok), payload.version || "Gateway health"],
    ["MISSION DATABASE", Boolean(mission?.dependencies?.database?.ready), mission?.dependencies?.database?.path || "Durable SQLite state"],
    ["MISSION WORKER", workerReady, mission?.dependencies?.worker?.heartbeat?.worker_id || "Persistent execution queue"],
    ["UNIVERSAL OPERATOR", statusBoolean(payload.universal_operator || payload.services?.universal_operator), "Company operator runtime"],
    ["REVENUE ENGINE", revenueReady, "Revenue persistence"],
    ["GITHUB CONTROL", Boolean(payload.github?.configured), payload.github?.configured ? "Connected" : "Optional configuration"],
    ["INTEGRATIONS", Boolean(payload.integrations?.ready ?? true), payload.integrations?.required ? "Required providers" : "Optional providers"],
    ["SPARK FACTORY", true, `${payload.metrics?.worlds ?? 0} public worlds`],
  ];
  $("#runtimeTopology").innerHTML = services.map(([name, ok, detail]) => `
    <article class="topology-card glass-panel"><span>${name}</span><b class="${ok ? "ok" : "bad"}">${ok ? "ONLINE" : "ATTENTION"}</b><small>${escapeHtml(detail)}</small></article>
  `).join("");
}
