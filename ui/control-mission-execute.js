"use strict";

async function createMission(event) {
  event.preventDefault();
  if (!state.token) { openDialog("#authDialog"); return; }
  showFormMessage("#missionMessage", "");
  setBusy(true, "Creating durable mission.");
  try {
    const title = $("#missionTitle").value.trim();
    const objective = $("#missionObjective").value.trim();
    if (!title || !objective) throw new Error("Mission title and objective are required.");
    const constraints = $("#missionConstraints").value.split(/\n/).map((value) => value.trim()).filter(Boolean);
    const metricName = $("#missionMetric").value.trim() || "verified measurable outcome";
    const result = await api("/api/v1/missions", requestOptions("POST", {
      title,
      objective,
      context: { source: "cinematic-control-room", created_at: new Date().toISOString() },
      constraints,
      opportunities: ["Convert the objective into verified evidence and reusable capability"],
      success_metrics: [{ key: "primary_outcome", name: metricName, target: 1 }],
      approval_required: true,
      risk_level: $("#missionRisk").value,
      priority: Number($("#missionPriority").value || 80),
    }, "create"));
    state.selectedId = result.mission.id;
    localStorage.setItem("cyvxSelectedMission", state.selectedId);
    $("#missionForm").reset();
    $("#missionPriority").value = "80";
    $("#missionMetric").value = "verified measurable outcome";
    closeDialog("#missionDialog");
    await loadMissions();
    switchView("missions");
    toast("Durable mission created.");
  } catch (error) {
    showFormMessage("#missionMessage", error.message);
    logActivity(`Mission creation failed: ${error.message}`);
  } finally { setBusy(false); }
}

async function getFreshGraph() {
  if (!state.selectedId) throw new Error("Select a mission first.");
  return (await api(`/api/v1/missions/${encode(state.selectedId)}`)).graph;
}

async function executeTransition(graph) {
  const mission = graph.mission;
  const id = encode(mission.id);
  logActivity(`Mission ${mission.title}: ${mission.status}.`);
  switch (mission.status) {
    case "draft":
      return api(`/api/v1/missions/${id}/validate`, requestOptions("POST", { feasible: true, blockers: [], assumptions: ["Operator validated measurable objective and production runtime availability"] }, "validate", mission.id));
    case "validated":
      return api(`/api/v1/missions/${id}/plan`, requestOptions("POST", {
        actions: [
          { step: 1, description: `Execute mission objective: ${mission.objective}` },
          { step: 2, description: "Capture deterministic execution evidence and measured output" },
          { step: 3, description: "Return the mission to the evaluation and learning loop" },
        ],
        dependencies: ["mission-runtime", "persistent-worker", "evidence-ledger"],
        estimated_duration_minutes: 5,
        resource_requirements: { runtime: "local-production", evidence: true, logging: true },
      }, "plan", mission.id));
    case "planned":
      return api(`/api/v1/missions/${id}/approval-request`, requestOptions("POST", { reason: "Governed production execution from CYVX Control Room" }, "approval-request", mission.id));
    case "awaiting_approval": {
      if (!graph.approval?.id) throw new Error("Approval record is missing.");
      return api(`/api/v1/approvals/${encode(graph.approval.id)}/decide`, requestOptions("POST", { decision: "approved", decision_reason: "Operator approved governed production execution" }, "approve", mission.id));
    }
    case "approved":
      return api(`/api/v1/missions/${id}/assign-agent`, requestOptions("POST", { agent_id: "agent-local" }, "assign", mission.id));
    case "queued":
      return api(`/api/v1/missions/${id}/execute`, requestOptions("POST", {}, "execute", mission.id));
    case "running":
      return waitForIdle(mission.id);
    case "completed":
      openDialog("#proofDialog");
      return null;
    case "evaluated":
      return learnCapability(mission);
    default:
      throw new Error(`No automatic transition is available from ${mission.status}.`);
  }
}

async function transitionSelected() {
  if (!state.token) { openDialog("#authDialog"); return; }
  setBusy(true, "Executing the next governed mission transition.");
  try {
    const graph = await getFreshGraph();
    await executeTransition(graph);
    await loadMissions();
    toast("Mission transition completed.");
  } catch (error) {
    toast(error.message);
    logActivity(`Mission transition failed: ${error.message}`);
  } finally { setBusy(false); }
}

async function waitForIdle(missionId, timeoutMs = 120000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const [graphResult, jobResult] = await Promise.all([
      api(`/api/v1/missions/${encode(missionId)}`),
      safeApi(`/api/v1/missions/${encode(missionId)}/job`),
    ]);
    const status = graphResult.graph.mission.status;
    const jobStatus = jobResult.job?.status;
    logActivity(`Worker observation: mission ${status}${jobStatus ? ` · job ${jobStatus}` : ""}.`);
    if (["completed", "failed", "cancelled", "evaluated", "learned"].includes(status)) return graphResult.graph;
    if (["failed", "dead_letter", "cancelled"].includes(jobStatus)) return graphResult.graph;
    await sleep(1500);
  }
  throw new Error("Mission did not reach idle before the observation timeout.");
}

async function runSelectedToIdle() {
  if (!state.token) { openDialog("#authDialog"); return; }
  if (!state.selectedId) { toast("Select or create a mission first."); return; }
  setBusy(true, "Starting full mission lifecycle to idle.");
  try {
    for (let cycle = 0; cycle < 10; cycle += 1) {
      const graph = await getFreshGraph();
      const status = graph.mission.status;
      if (terminalStatus(status)) {
        if (status === "completed") toast("Mission reached idle with a measured outcome ready for proof.");
        else toast(`Mission reached terminal state: ${status}.`);
        break;
      }
      await executeTransition(graph);
      if (status === "queued" || status === "running") await waitForIdle(graph.mission.id);
      await sleep(180);
    }
    await loadMissions();
    switchView("missions");
    logActivity("Full governed lifecycle reached idle.");
  } catch (error) {
    toast(error.message);
    logActivity(`Lifecycle stopped: ${error.message}`);
  } finally { setBusy(false); }
}

async function learnCapability(mission, lesson = "Measured mission outcome converted into reusable organizational capability", improvement = "Use the learned capability to generate the next higher-leverage mission") {
  return api(`/api/v1/missions/${encode(mission.id)}/learn-capability`, requestOptions("POST", {
    title: `Capability: ${mission.title}`,
    description: `${lesson}. Next improvement: ${improvement}`,
    inputs: ["mission objective", "governed plan", "verified evidence"],
    outputs: ["measured outcome", "reusable learning", "next improvement"],
    permissions_required: ["mission.execute", "evidence.verify"],
    tests: ["mission completed", "evidence chain valid", "outcome evaluated"],
    cost_basis: { execution_minutes: 5 },
    risk_level: mission.risk_level || "medium",
    is_reusable: true,
  }, "learn", mission.id));
}

async function recordProof(event) {
  event.preventDefault();
  if (!state.selectedId) return;
  showFormMessage("#proofMessage", "");
  setBusy(true, "Recording measured proof and learning.");
  try {
    let graph = await getFreshGraph();
    const mission = graph.mission;
    if (!["completed", "evaluated"].includes(mission.status)) throw new Error(`Mission must be completed or evaluated; current state is ${mission.status}.`);
    const summary = $("#proofSummary").value.trim();
    const metricName = $("#proofMetricName").value.trim() || "outcome";
    const metricValue = Number($("#proofMetricValue").value);
    const lesson = $("#proofLesson").value.trim();
    const improvement = $("#proofImprovement").value.trim();
    if (!summary || !lesson || !improvement || !Number.isFinite(metricValue)) throw new Error("Summary, metric, lesson, and improvement are required.");
    await api(`/api/v1/missions/${encode(mission.id)}/evidence`, requestOptions("POST", {
      type: "measured_outcome",
      title: `Measured outcome: ${mission.title}`,
      source: "cyvx-control-room",
      content: { result_summary: summary, metrics: { [metricName]: metricValue }, lesson, next_improvement: improvement, recorded_at: new Date().toISOString() },
    }, "evidence", mission.id));
    if (mission.status === "completed") {
      await api(`/api/v1/missions/${encode(mission.id)}/evaluate`, requestOptions("POST", {
        success: metricValue > 0,
        lessons_learned: [lesson],
        improvements: [improvement],
        capability_delta: { [metricName]: metricValue },
      }, "evaluate", mission.id));
      graph = await getFreshGraph();
    }
    if (graph.mission.status === "evaluated") await learnCapability(graph.mission, lesson, improvement);
    closeDialog("#proofDialog");
    $("#proofForm").reset();
    $("#proofMetricName").value = "outcome";
    $("#proofMetricValue").value = "1";
    await loadMissions();
    switchView("proof");
    toast("Evidence verified into reusable learning.");
  } catch (error) {
    showFormMessage("#proofMessage", error.message);
    logActivity(`Proof recording failed: ${error.message}`);
  } finally { setBusy(false); }
}

async function verifySelectedProof() {
  if (!state.token || !state.selectedId) { toast("Select an authenticated mission first."); return; }
  setBusy(true, "Verifying evidence chain.");
  try {
    const result = await api("/api/v1/evidence/verify", requestOptions("POST", { mission_id: state.selectedId }, "verify", state.selectedId));
    showOutput(result.report?.valid ? "Evidence chain is valid" : "Evidence chain failed verification", result.report, "EVIDENCE VERIFICATION");
    await loadSelectedMission();
  } catch (error) { toast(error.message); logActivity(`Evidence verification failed: ${error.message}`); }
  finally { setBusy(false); }
}

async function exportSelectedProof() {
  if (!state.token || !state.selectedId) { toast("Select an authenticated mission first."); return; }
  setBusy(true, "Exporting mission proof.");
  try {
    const payload = await api(`/api/v1/missions/${encode(state.selectedId)}/export`);
    const blob = new Blob([JSON.stringify(payload.export, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `cyvx-proof-${state.selectedId}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Mission proof exported.");
  } catch (error) { toast(error.message); logActivity(`Proof export failed: ${error.message}`); }
  finally { setBusy(false); }
}

async function showMissionProof() {
  if (!state.token || !state.selectedId) { toast("Select an authenticated mission first."); return; }
  setBusy(true, "Loading cryptographic mission proof.");
  try {
    const payload = await api(`/api/v1/missions/${encode(state.selectedId)}/proof`);
    showOutput("Mission proof", payload.proof, "CRYPTOGRAPHIC PROOF");
  } catch (error) { toast(error.message); }
  finally { setBusy(false); }
}

async function runSelfScan() {
  setBusy(true, "Running CYVX self scan.");
  try {
    const payload = await api("/api/v1/self-scan", {}, false);
    showOutput("CYVX self scan", payload, "REALITY ENGINE");
    logActivity("Repository self scan completed.");
  } catch (error) {
    showOutput("Self scan requires operator API authorization", { error: error.message, fallback: state.publicStatus }, "REALITY ENGINE");
    logActivity(`Self scan unavailable: ${error.message}`);
  } finally { setBusy(false); }
}

function copyRuntime() {
  navigator.clipboard.writeText($("#runtimeJson").textContent).then(() => toast("Runtime JSON copied.")).catch(() => toast("Clipboard permission was denied."));
}
