"use strict";

function renderMissionLists() {
  const listHtml = state.missions.length ? state.missions.map((mission) => `
    <button class="mission-item ${mission.id === state.selectedId ? "active" : ""}" data-mission-id="${escapeHtml(mission.id)}" data-status="${escapeHtml(mission.status)}">
      <i></i><span><b>${escapeHtml(mission.title)}</b><small>${escapeHtml(mission.status)} · priority ${escapeHtml(mission.priority)}</small></span><span>${escapeHtml(new Date(mission.updated_at).toLocaleDateString())}</span>
    </button>
  `).join("") : `<div class="empty-state">${state.token ? "No durable missions exist yet." : "Connect an operator session to load missions."}</div>`;
  $("#missionStream").innerHTML = listHtml;
  $("#missionCatalog").innerHTML = listHtml;
  $("#metricMissions").textContent = String(state.missions.length || "—");
  $("#metricMissionDetail").textContent = state.token ? `${state.missions.filter((mission) => !terminalStatus(mission.status)).length} active or pending` : "Authenticate to inspect";
  $("#coreMissions").textContent = state.token ? String(state.missions.length) : "LOCKED";
}

function selectedMission() {
  return state.selectedBundle?.graph?.mission || state.missions.find((mission) => mission.id === state.selectedId) || null;
}

function nextActionForMission(mission) {
  if (!mission) return { constraint: "No mission selected.", action: "Create or select a durable mission.", confidence: "READY" };
  const map = {
    draft: ["Mission reality has not been validated.", "Validate feasibility and assumptions."],
    validated: ["The validated mission has no deterministic plan.", "Create the executable mission plan."],
    planned: ["Execution is waiting for governed authorization.", "Request production approval."],
    awaiting_approval: ["The mission is blocked at the approval gate.", "Approve or reject the mission."],
    approved: ["Approved work has no assigned execution agent.", "Assign agent-local to the mission."],
    queued: ["The mission is ready but no worker job is queued.", "Queue governed execution."],
    running: ["The persistent worker is executing the mission.", "Observe until the job reaches idle."],
    completed: ["Execution completed and now needs measured learning.", "Record proof, evaluate the outcome, and learn a reusable capability."],
    evaluated: ["The measured outcome is evaluated but not reusable yet.", "Convert learning into a reusable capability."],
    learned: ["The mission produced reusable organizational capability.", "Generate the next improvement mission."],
    failed: ["Execution failed and requires recovery evidence.", "Inspect the job error and choose a safe recovery action."],
    cancelled: ["The mission was cancelled.", "Create a corrected successor mission."],
  };
  const [constraint, action] = map[mission.status] || ["Mission state requires inspection.", "Inspect the durable mission graph."];
  return { constraint, action, confidence: mission.status.toUpperCase() };
}

function renderNextAction() {
  const insight = nextActionForMission(selectedMission());
  $("#nextConstraint").textContent = insight.constraint;
  $("#nextAction").textContent = insight.action;
  $("#actionConfidence").textContent = insight.confidence;
}

function renderMissionDetail() {
  const host = $("#missionDetail");
  const bundle = state.selectedBundle;
  if (!bundle?.graph?.mission) {
    host.innerHTML = `<div class="empty-state">Select a mission to inspect its state, job, evidence, audit, and outcome.</div>`;
    $("#proofMissionTitle").textContent = "No mission selected";
    $("#proofMissionState").textContent = "Choose a mission to load its evidence chain and exportable proof.";
    $("#evidenceGrid").innerHTML = `<div class="empty-state">Evidence appears here after a mission records proof.</div>`;
    $("#coreProof").textContent = "—";
    renderNextAction();
    return;
  }
  const mission = bundle.graph.mission;
  const job = bundle.job?.job;
  const outcome = bundle.outcome?.outcome;
  const evidence = bundle.evidence?.evidence || [];
  const events = bundle.events?.events || [];
  const audits = bundle.audits?.audits || [];
  const approval = bundle.graph.approval;
  const primaryAction = primaryMissionAction(mission);
  host.innerHTML = `
    <header class="detail-header">
      <div class="panel-label"><span>${escapeHtml(mission.id)}</span><b>${escapeHtml(mission.status)}</b></div>
      <h2>${escapeHtml(mission.title)}</h2>
      <p>${escapeHtml(mission.objective)}</p>
      <div class="chip-row"><span class="chip">${escapeHtml(mission.status)}</span><span class="chip">${escapeHtml(mission.risk_level)}</span><span class="chip">priority ${escapeHtml(mission.priority)}</span><span class="chip">agent ${escapeHtml(mission.assigned_agent_id || "unassigned")}</span></div>
    </header>
    <div class="detail-actions">
      ${primaryAction ? `<button class="primary" data-action="mission-transition">${escapeHtml(primaryAction)}</button>` : ""}
      ${!terminalStatus(mission.status) ? `<button data-action="run-selected">Run to idle</button>` : ""}
      ${["completed", "evaluated"].includes(mission.status) ? `<button data-action="record-proof">Record measured proof</button>` : ""}
      <button data-action="verify-proof">Verify evidence</button>
      <button data-action="export-proof">Export proof</button>
      <button data-action="refresh-selected">Refresh</button>
    </div>
    <div class="detail-grid">
      <section class="detail-block"><h3>Execution job</h3><pre>${escapeHtml(JSON.stringify(job || { status: "not queued" }, null, 2))}</pre></section>
      <section class="detail-block"><h3>Measured outcome</h3><pre>${escapeHtml(JSON.stringify(outcome || { status: "not recorded" }, null, 2))}</pre></section>
      <section class="detail-block"><h3>Approval</h3><pre>${escapeHtml(JSON.stringify(approval || { status: "not requested" }, null, 2))}</pre></section>
      <section class="detail-block"><h3>Evidence chain</h3><pre>${escapeHtml(JSON.stringify(evidence.map((item) => ({ sequence: item.sequence, title: item.title, type: item.type, sha256: item.artifact_sha256 })), null, 2))}</pre></section>
      <section class="detail-block"><h3>Event timeline</h3>${events.length ? events.slice(-12).reverse().map((event) => `<div class="timeline-row"><time>${escapeHtml(new Date(event.timestamp).toLocaleTimeString())}</time><b>${escapeHtml(event.type)}</b></div>`).join("") : `<div class="empty-state">No events loaded.</div>`}</section>
      <section class="detail-block"><h3>Audit trail</h3>${audits.length ? audits.slice(-12).reverse().map((audit) => `<div class="timeline-row"><time>${escapeHtml(new Date(audit.timestamp).toLocaleTimeString())}</time><b>${escapeHtml(`${audit.resource_type} · ${audit.action}`)}</b></div>`).join("") : `<div class="empty-state">No audits loaded.</div>`}</section>
    </div>
  `;
  $("#proofMissionTitle").textContent = mission.title;
  $("#proofMissionState").textContent = `${mission.status} · ${evidence.length} evidence record${evidence.length === 1 ? "" : "s"} · ${outcome ? "outcome captured" : "outcome pending"}`;
  $("#coreProof").textContent = String(evidence.length);
  $("#evidenceGrid").innerHTML = evidence.length ? evidence.map((item) => `
    <article class="evidence-card"><span>#${escapeHtml(item.sequence || "—")} · ${escapeHtml(item.type || "evidence")}</span><b>${escapeHtml(item.title || "Evidence record")}</b><small>${escapeHtml(item.artifact_sha256 || item.record_sha256 || "hash pending")}</small></article>
  `).join("") : `<div class="empty-state">No evidence has been recorded for this mission.</div>`;
  renderNextAction();
}

function primaryMissionAction(mission) {
  return ({
    draft: "Validate mission",
    validated: "Plan mission",
    planned: "Request approval",
    awaiting_approval: "Approve mission",
    approved: "Assign execution agent",
    queued: "Queue execution",
    running: "Observe worker",
    completed: "Record measured proof",
    evaluated: "Learn capability",
  })[mission.status] || "";
}

async function loadPublicStatus() {
  const [status, readiness] = await Promise.all([
    safeApi("/api/public/status", {}, false),
    safeApi("/api/v1/runtime/readiness", {}, false),
  ]);
  state.publicStatus = status._error ? { ok: false, error: status._error.message } : status;
  state.readiness = readiness._error ? null : readiness;
  renderPublicStatus();
  logActivity(state.publicStatus.ok ? "Public runtime snapshot refreshed." : "Public runtime reported a degraded state.");
}

async function loadMissions(selectNewest = false) {
  if (!state.token) {
    state.missions = [];
    renderMissionLists();
    renderNextAction();
    return;
  }
  const payload = await api("/api/v1/missions");
  state.missions = Array.isArray(payload.missions) ? payload.missions : [];
  if (selectNewest && state.missions[0]) state.selectedId = state.missions[0].id;
  if (!state.selectedId && state.missions[0]) state.selectedId = state.missions[0].id;
  if (state.selectedId && !state.missions.some((mission) => mission.id === state.selectedId)) state.selectedId = state.missions[0]?.id || "";
  if (state.selectedId) localStorage.setItem("cyvxSelectedMission", state.selectedId);
  renderMissionLists();
  if (state.selectedId) await loadSelectedMission();
  else renderMissionDetail();
  logActivity(`Loaded ${state.missions.length} durable mission${state.missions.length === 1 ? "" : "s"}.`);
}

async function loadSelectedMission() {
  if (!state.token || !state.selectedId) return;
  const id = encode(state.selectedId);
  const graph = await api(`/api/v1/missions/${id}`);
  const [job, outcome, evidence, events, audits] = await Promise.all([
    safeApi(`/api/v1/missions/${id}/job`),
    safeApi(`/api/v1/missions/${id}/outcome`),
    safeApi(`/api/v1/missions/${id}/evidence`),
    safeApi(`/api/v1/missions/${id}/events`),
    safeApi(`/api/v1/missions/${id}/audits`),
  ]);
  state.selectedBundle = { graph: graph.graph, job, outcome, evidence, events, audits };
  renderMissionLists();
  renderMissionDetail();
}

async function refreshAll() {
  if (state.busy) return;
  setBusy(true, "Refreshing connected production state.");
  try {
    await loadPublicStatus();
    if (state.token) await loadMissions();
    toast("Production state refreshed.");
  } catch (error) {
    toast(error.message);
    logActivity(`Refresh failed: ${error.message}`);
  } finally { setBusy(false); }
}

async function connectOperator(event) {
  event.preventDefault();
  showFormMessage("#authMessage", "");
  setBusy(true, "Connecting operator identity.");
  try {
    if (state.authMode === "local") {
      const result = await api("/api/v1/auth/token", {
        method: "POST",
        body: JSON.stringify({ organization_id: $("#authOrganization").value.trim(), user_id: $("#authUser").value.trim() }),
      }, false);
      saveSession(result.token, result.principal);
    } else {
      const token = $("#authToken").value.trim().replace(/^Bearer\s+/i, "");
      if (!token) throw new Error("Bearer token is required.");
      const principal = parseTokenPrincipal(token);
      if (!principal) throw new Error("Token payload could not be decoded.");
      saveSession(token, principal);
      await api("/api/v1/missions");
    }
    closeDialog("#authDialog");
    await loadMissions();
    toast("Operator connected.");
  } catch (error) {
    showFormMessage("#authMessage", error.message);
    logActivity(`Operator connection failed: ${error.message}`);
  } finally { setBusy(false); }
}
