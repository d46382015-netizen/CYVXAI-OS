/**
 * CYVX — Autonomous Infrastructure Intelligence
 * © 2026 Dakota Lee Jonsgaard. All rights reserved.
 * Creator & Architect: Dakota Lee Jonsgaard
 * https://cyvx.ai | dakota@cyvx.ai
 *
 * This software is the exclusive intellectual property
 * of Dakota Lee Jonsgaard. Unauthorized use prohibited.
 */
"use strict";

function augmentCoordinationPlatform(PlatformKernel, models) {
  if (PlatformKernel.prototype.__cyvxCoordinationV1Augmented) return;
  PlatformKernel.prototype.__cyvxCoordinationV1Augmented = true;

  const { clone, createEvent, idFrom } = models;

  const originalSnapshot = PlatformKernel.prototype.snapshot;
  const originalStatus = PlatformKernel.prototype.status;
  const originalExecutive = PlatformKernel.prototype.executive;
  const originalGraph = PlatformKernel.prototype.graph;

  PlatformKernel.prototype.humans = function humans(query = {}) {
    return listRecords(this.snapshot().humans || [], query);
  };

  PlatformKernel.prototype.resources = function resources(query = {}) {
    return listRecords(this.snapshot().resources || [], query);
  };

  PlatformKernel.prototype.assignments = function assignments(query = {}) {
    return listRecords(this.snapshot().assignments || [], query);
  };

  PlatformKernel.prototype.approvals = function approvals(query = {}) {
    return listRecords(this.snapshot().approvals || [], query);
  };

  PlatformKernel.prototype.queue = function queue(query = {}) {
    return listRecords(this.snapshot().queueItems || [], query);
  };

  PlatformKernel.prototype.nextBestActions = function nextBestActions(query = {}) {
    return listRecords(this.snapshot().nextBestActions || [], query);
  };

  PlatformKernel.prototype.createHuman = function createHuman(input = {}) {
    let human = null;
    this.mutate((state) => {
      state.humans = ensure(state, "humans");
      human = buildHuman(input);
      state.humans.unshift(human);
      appendEvent(state, "human.created", human.id, "Human created: " + human.name, { human, related_entity_ids: input.related_entity_ids || [] });
      return state;
    });
    return human;
  };

  PlatformKernel.prototype.updateHuman = function updateHuman(humanId, patch = {}) {
    let human = null;
    this.mutate((state) => {
      state.humans = ensure(state, "humans");
      human = state.humans.find((item) => item.id === humanId);
      if (!human) throw new Error("Human not found: " + humanId);
      Object.assign(human, clone(patch), { updated_at: new Date().toISOString() });
      human.assignmentHistory = Array.isArray(human.assignmentHistory) ? human.assignmentHistory : [];
      human.assignmentHistory.unshift({ at: new Date().toISOString(), patch: clone(patch) });
      appendEvent(state, "human.updated", human.id, "Human updated: " + human.name, { human, patch: clone(patch) });
      return state;
    });
    return human;
  };

  PlatformKernel.prototype.createResource = function createResource(input = {}) {
    let resource = null;
    this.mutate((state) => {
      state.resources = ensure(state, "resources");
      resource = buildResource(input);
      state.resources.unshift(resource);
      appendEvent(state, "resource.updated", resource.id, "Resource registered: " + resource.resourceType, { resource });
      return state;
    });
    return resource;
  };

  PlatformKernel.prototype.allocateResource = function allocateResource(input = {}) {
    let resource = null;
    const amount = Number(input.amount != null ? input.amount : 0);
    this.mutate((state) => {
      state.resources = ensure(state, "resources");
      resource = findResource(state, input);
      if (!resource) {
        resource = buildResource({ resourceType: input.resourceType || input.resource_type || "compute", amount: Math.max(0, amount) });
        state.resources.unshift(resource);
      }
      resource.allocated = round3(Math.min(Number(resource.amount || 0), Number(resource.allocated || 0) + Math.max(0, amount)));
      resource.available = round3(Math.max(0, Number(resource.amount || 0) - resource.allocated));
      resource.utilization = round3(Number(resource.amount || 0) > 0 ? resource.allocated / Number(resource.amount || 0) : 0);
      resource.status = resource.available > 0 ? "partially_allocated" : "allocated";
      resource.updated_at = new Date().toISOString();
      resource.allocationHistory = Array.isArray(resource.allocationHistory) ? resource.allocationHistory : [];
      resource.allocationHistory.unshift({ at: new Date().toISOString(), action: "allocate", amount, mission_id: input.mission_id || null });
      appendEvent(state, "resource.allocated", resource.id, "Resource allocated: " + resource.resourceType, { resource, mission_id: input.mission_id || null, amount, related_entity_ids: input.related_entity_ids || [] });
      return state;
    });
    return resource;
  };

  PlatformKernel.prototype.releaseResource = function releaseResource(input = {}) {
    let resource = null;
    const amount = Number(input.amount != null ? input.amount : 0);
    this.mutate((state) => {
      state.resources = ensure(state, "resources");
      resource = findResource(state, input);
      if (!resource) throw new Error("Resource not found for release");
      resource.allocated = round3(Math.max(0, Number(resource.allocated || 0) - Math.max(0, amount)));
      resource.available = round3(Math.max(0, Number(resource.amount || 0) - resource.allocated));
      resource.utilization = round3(Number(resource.amount || 0) > 0 ? resource.allocated / Number(resource.amount || 0) : 0);
      resource.status = resource.allocated > 0 ? "partially_allocated" : "available";
      resource.updated_at = new Date().toISOString();
      resource.allocationHistory = Array.isArray(resource.allocationHistory) ? resource.allocationHistory : [];
      resource.allocationHistory.unshift({ at: new Date().toISOString(), action: "release", amount, mission_id: input.mission_id || null });
      appendEvent(state, "resource.released", resource.id, "Resource released: " + resource.resourceType, { resource, mission_id: input.mission_id || null, amount, related_entity_ids: input.related_entity_ids || [] });
      return state;
    });
    return resource;
  };

  PlatformKernel.prototype.createApproval = function createApproval(input = {}) {
    let approval = null;
    this.mutate((state) => {
      state.approvals = ensure(state, "approvals");
      approval = buildApproval(input);
      state.approvals.unshift(approval);
      appendEvent(state, "approval.created", approval.id, "Approval created: " + approval.status, { approval, related_mission_id: approval.target_id || input.mission_id || null });
      return state;
    });
    return approval;
  };

  PlatformKernel.prototype.updateApproval = function updateApproval(approvalId, patch = {}) {
    let approval = null;
    this.mutate((state) => {
      state.approvals = ensure(state, "approvals");
      approval = state.approvals.find((item) => item.id === approvalId);
      if (!approval) throw new Error("Approval not found: " + approvalId);
      Object.assign(approval, clone(patch), { updated_at: new Date().toISOString() });
      approval.audit_trail = Array.isArray(approval.audit_trail) ? approval.audit_trail : [];
      approval.audit_trail.unshift({ at: new Date().toISOString(), patch: clone(patch) });
      appendEvent(state, approvalEventType(String(patch.state || patch.status || approval.state || approval.status || "pending").toLowerCase()), approval.id, "Approval updated: " + (patch.state || patch.status || approval.state || approval.status), { approval, patch: clone(patch) });
      return state;
    });
    return approval;
  };

  PlatformKernel.prototype.approve = function approve(input = {}) {
    return this.updateApproval(input.approval_id || input.approvalId || input.id, { state: "approved", status: "approved", reason: input.reason || "approved", approver_id: input.approver_id || input.approverId || null });
  };

  PlatformKernel.prototype.rejectApproval = function rejectApproval(input = {}) {
    return this.updateApproval(input.approval_id || input.approvalId || input.id, { state: "rejected", status: "rejected", reason: input.reason || "rejected", approver_id: input.approver_id || input.approverId || null });
  };

  PlatformKernel.prototype.createAssignment = function createAssignment(input = {}) {
    let assignment = null;
    this.mutate((state) => {
      state.assignments = ensure(state, "assignments");
      const validation = validateAssignment(state, input);
      if (!validation.ok) {
        assignment = buildAssignment(Object.assign({}, input, { status: "rejected", reason: validation.reason, authority_validated: validation.authority_validated, constraint_validated: validation.constraint_validated }));
        state.assignments.unshift(assignment);
        appendEvent(state, "assignment.rejected", assignment.id, "Assignment rejected: " + validation.reason, { assignment, reason: validation.reason, related_mission_id: assignment.mission_id, related_entity_ids: validation.related_entity_ids });
        return state;
      }
      assignment = buildAssignment(Object.assign({}, input, validation, { status: "assigned", reason: input.reason || validation.reason || "mission assignment" }));
      state.assignments.unshift(assignment);
      const mission = resolveMission(state, assignment.mission_id);
      const actor = findActor(state, assignment.actor_type, assignment.actor_id);
      if (mission) {
        mission.assigned_actor_id = assignment.actor_id;
        mission.assigned_actor_type = assignment.actor_type;
        mission.assigned_assignment_id = assignment.id;
        mission.assigned_resource_ids = Array.isArray(assignment.resource_ids) ? clone(assignment.resource_ids) : [];
        mission.updated_at = new Date().toISOString();
      }
      if (actor) {
        actor.currentMissionId = assignment.mission_id;
        actor.currentWorkload = Number(actor.currentWorkload || 0) + 1;
        actor.assignmentHistory = Array.isArray(actor.assignmentHistory) ? actor.assignmentHistory : [];
        actor.assignmentHistory.unshift({ at: new Date().toISOString(), mission_id: assignment.mission_id, assignment_id: assignment.id });
        actor.status = "assigned";
        actor.updated_at = new Date().toISOString();
      }
      appendEvent(state, "assignment.created", assignment.id, "Assignment created: " + assignment.actor_type, { assignment, related_mission_id: assignment.mission_id, related_entity_ids: assignment.resource_ids });
      appendEvent(state, assignment.actor_type === "human" ? "human.assigned" : "agent.assigned", assignment.actor_id, "Actor assigned to mission", { assignment, related_mission_id: assignment.mission_id, related_entity_ids: assignment.resource_ids });
      appendEvent(state, "mission.assigned", assignment.mission_id, "Mission assigned", { assignment, related_mission_id: assignment.mission_id, related_entity_ids: assignment.resource_ids });
      return state;
    });
    return assignment;
  };

  PlatformKernel.prototype.assignMission = function assignMission(input = {}) {
    return this.createAssignment(input);
  };

  PlatformKernel.prototype.enqueueMission = function enqueueMission(input = {}) {
    let item = null;
    this.mutate((state) => {
      state.queueItems = ensure(state, "queueItems");
      const mission = resolveMission(state, input.mission_id || input.missionId || input.mission);
      if (!mission) throw new Error("Mission not found for queue");
      item = buildQueueItem(Object.assign({}, input, { mission_id: mission.id, state: input.state || "queued" }));
      state.queueItems.unshift(item);
      mission.queue_item_id = item.id;
      mission.stage = input.state || "queued";
      mission.status = input.state || "queued";
      mission.updated_at = new Date().toISOString();
      appendEvent(state, "mission.queued", mission.id, "Mission queued: " + mission.title, { queue_item: item, mission, related_mission_id: mission.id, related_entity_ids: mission.target_entity_ids || [] });
      return state;
    });
    return item;
  };

  PlatformKernel.prototype.updateQueueItem = function updateQueueItem(queueItemId, patch = {}) {
    let item = null;
    this.mutate((state) => {
      state.queueItems = ensure(state, "queueItems");
      item = state.queueItems.find((entry) => entry.id === queueItemId);
      if (!item) throw new Error("Queue item not found: " + queueItemId);
      Object.assign(item, clone(patch), { updated_at: new Date().toISOString() });
      item.history = Array.isArray(item.history) ? item.history : [];
      item.history.unshift({ at: new Date().toISOString(), patch: clone(patch) });
      appendEvent(state, "mission." + String(item.state || patch.state || "queued"), item.mission_id || item.id, "Queue item updated: " + item.state, { queue_item: item, patch: clone(patch), related_mission_id: item.mission_id });
      return state;
    });
    return item;
  };

  PlatformKernel.prototype.runQueuedMission = function runQueuedMission(input = {}) {
    const state = this.snapshot();
    const queueItem = (state.queueItems || []).find((item) => item.id === (input.queue_item_id || input.queueItemId));
    if (!queueItem) throw new Error("Queue item not found");
    const mission = (state.missions || []).find((item) => item.id === queueItem.mission_id);
    if (!mission) throw new Error("Mission not found");
    this.updateMission(mission.id, { stage: "running", status: "running" }, "mission.running");
    const outcome = this.recordOutcome({
      mission_id: mission.id,
      title: mission.title + " outcome",
      expected_result: mission.expected_outcome || mission.objective || "expected improvement",
      actual_result: input.actual_result || "completed",
      predicted_outcome: input.predicted_outcome != null ? clone(input.predicted_outcome) : clone(mission.expected_outcome || null),
      actual_outcome: input.actual_outcome != null ? clone(input.actual_outcome) : clone(input.actual_result || null),
      prediction_error: input.prediction_error != null ? input.prediction_error : null,
      prediction_variance: input.prediction_variance != null ? input.prediction_variance : null,
      variance: input.variance != null ? input.variance : 0,
      trust_impact: input.trust_impact != null ? input.trust_impact : 0.12,
      capability_impact: input.capability_impact != null ? input.capability_impact : 0.18,
      constitutional_impact: input.constitutional_impact != null ? input.constitutional_impact : 0.2,
      evidence: input.evidence || [],
      risk_delta: input.risk_delta != null ? input.risk_delta : -0.1,
      economic_impact: input.economic_impact || { cost: 0, savings: 0, value: 0, roi: 0 },
    });
    const knowledgeRecord = this.createKnowledgeRecord({
      title: mission.title + " lesson",
      lesson_learned: input.lesson || "Execution completed and lessons captured.",
      outcome_id: outcome.id,
      mission_id: mission.id,
      decision_ids: Array.isArray(mission.decision_ids) ? clone(mission.decision_ids) : [],
      entity_ids: mission.target_entity_ids || [],
      reality_gap: outcome.reality_gap,
      predicted_outcome: outcome.predicted_outcome,
      actual_outcome: outcome.actual_outcome,
      prediction_error: outcome.prediction_error,
      prediction_variance: outcome.prediction_variance,
      trust_impact: input.trust_impact != null ? input.trust_impact : 0.12,
      cir_impact: input.cir_impact != null ? input.cir_impact : 0.1,
      capability_delta: input.capability_impact != null ? input.capability_impact : 0.18,
      future_recommendation: input.future_recommendation || "Refine the next mission based on observed results.",
    });
    const capability = this.createCapability({
      title: mission.title + " capability",
      cost_to_create: Math.max(1, Number(input.cost_to_create || 1)),
      cost_to_maintain: Math.max(0, Number(input.cost_to_maintain || 0)),
      value_generated: Math.max(0, Number(input.value_generated || 1)),
      opportunity_cost: Math.max(0, Number(input.opportunity_cost || 0)),
      risk_adjusted_value: Math.max(0, Number(input.risk_adjusted_value || 1)),
      evidence: [{ id: outcome.id, type: "outcome" }],
      linked_entity_ids: mission.target_entity_ids || [],
    });
    this.updateMission(mission.id, { stage: "learned", status: "learned", outcome_id: outcome.id, knowledge_record_id: knowledgeRecord.id, capability_id: capability.id }, "mission.learned");
    this.updateQueueItem(queueItem.id, { state: "learned", mission_id: mission.id, outcome_id: outcome.id, knowledge_record_id: knowledgeRecord.id });
    this.calculateCir({ source: "mission.learned", related_mission_id: mission.id, related_outcome_ids: [outcome.id] });
    return {
      queueItem: this.queue({ id: queueItem.id })[0] || queueItem,
      mission: this.missions().find((item) => item.id === mission.id) || mission,
      outcome,
      knowledgeRecord,
      capability,
    };
  };

  PlatformKernel.prototype.completeMission = function completeMission(input = {}) {
    return this.runQueuedMission(input);
  };

  PlatformKernel.prototype.nextBestAction = function nextBestAction(input = {}) {
    let action = null;
    this.mutate((state) => {
      state.nextBestActions = ensure(state, "nextBestActions");
      action = buildNextBestAction(state, input);
      state.nextBestActions.unshift(action);
      appendEvent(state, "next_action.generated", action.id, "Next best action generated: " + action.title, { next_best_action: action, related_entity_ids: action.source_ids || [] });
      return state;
    });
    return action;
  };

  PlatformKernel.prototype.coordination = function coordination(input = {}) {
    const state = this.snapshot();
    const nextBestAction = this.nextBestActions()[0] || this.nextBestAction(input);
    return {
      powered_by: "CYVX",
      creator: "Dakota Lee Jonsgaard",
      timestamp: new Date().toISOString(),
      summary: coordinationSummary(state, nextBestAction),
      agents: this.agents(),
      humans: this.humans(),
      resources: this.resources(),
      assignments: this.assignments(),
      approvals: this.approvals(),
      queue: this.queue(),
      missions: this.missions(),
      nextBestAction,
      domains: domainSummary(state),
    };
  };

  PlatformKernel.prototype.coordinateScenario = function coordinateScenario(input = {}) {
    const domain = String(input.domain || input.name || "cloud-operations").toLowerCase();
    const scenario = scenarioData(domain);
    const observation = this.createObservation(scenario.observation);
    const realityObject = this.createRealityObject(scenario.realityObject);
    const criterion = this.createCriterion(scenario.criterion);
    const significanceRecord = this.generateSignificance({ criterion_id: criterion.id, reality_object_id: realityObject.id, evidence: [observation], rationale: scenario.significanceReason, confidence: scenario.significanceConfidence });
    const intervention = this.createIntervention(Object.assign({}, scenario.intervention, { significance_record_ids: [significanceRecord.id], target_reality_object_id: realityObject.id, related_entity_ids: scenario.relatedEntityIds }));
    const decision = this.createDecision(Object.assign({}, scenario.decision, { evidence: [observation, significanceRecord], significance_record_ids: [significanceRecord.id], intervention_id: intervention.id }));
    const mission = this.createMission(Object.assign({}, scenario.mission, { significance_record_id: significanceRecord.id, intervention_id: intervention.id, decision_id: decision.id, target_entity_ids: scenario.relatedEntityIds, autonomy_level: scenario.autonomyLevel }));
    const actor = scenario.actorType === "human" ? this.createHuman(scenario.actor) : this.createAgent(scenario.actor);
    const resource = this.allocateResource(Object.assign({}, scenario.resource, { mission_id: mission.id }));
    const approvalNeeded = scenario.autonomyLevel <= 3 || scenario.riskLevel > 0.5 || scenario.confidence < 0.7;
    const approval = this.createApproval({
      target_type: "mission",
      target_id: mission.id,
      approver_id: scenario.approver.id,
      approver_type: "human",
      scope: "mission_execution",
      status: approvalNeeded ? "pending" : "approved",
      state: approvalNeeded ? "pending" : "approved",
      reason: approvalNeeded ? "Approval required by policy" : "Auto-approved by policy",
      confidence: scenario.confidence,
      risk_level: scenario.riskLevel > 0.75 ? "high" : scenario.riskLevel > 0.45 ? "medium" : "low",
    });
    if (!approvalNeeded) this.updateApproval(approval.id, { state: "approved", status: "approved", reason: "Auto-approved by policy" });
    const assignment = this.assignMission({ mission_id: mission.id, actor_type: scenario.actorType, actor_id: actor.id, resource_ids: [resource.id], approval_id: approval.id, trust_score: scenario.trustScore, capability_fit: scenario.capabilityFit, reason: scenario.assignmentReason });
    const queueItem = this.enqueueMission({ mission_id: mission.id, actor_id: actor.id, resource_ids: [resource.id], priority: scenario.priority, reason: scenario.queueReason, state: "queued" });
    this.updateMission(mission.id, { stage: "running", status: "running", assigned_actor_id: actor.id, assigned_actor_type: scenario.actorType }, "mission.running");
    const completion = this.runQueuedMission({ queue_item_id: queueItem.id, actual_result: scenario.actualResult, lesson: scenario.lesson, future_recommendation: scenario.futureRecommendation, capability_impact: scenario.capabilityImpact, trust_impact: scenario.trustImpact, risk_delta: scenario.riskDelta, economic_impact: scenario.economicImpact, evidence: [observation] });
    const nba = this.nextBestAction({ domain, mission_id: mission.id, significance_record_id: significanceRecord.id, outcome_id: completion.outcome.id, trust_score: scenario.trustScore, recent_outcomes: [completion.outcome.id] });
    return {
      domain,
      observation,
      realityObject,
      criterion,
      significanceRecord,
      intervention,
      decision,
      mission,
      actor,
      resource,
      approval,
      assignment,
      queueItem: completion.queueItem,
      outcome: completion.outcome,
      knowledgeRecord: completion.knowledgeRecord,
      capability: completion.capability,
      nextBestAction: nba,
      cir: this.cir(),
      coordination: this.coordination({ domain }),
    };
  };

  PlatformKernel.prototype.snapshot = function snapshotWithCoordinationV1() {
    const state = originalSnapshot.call(this);
    state.humans = Array.isArray(state.humans) ? state.humans : [];
    state.resources = Array.isArray(state.resources) ? state.resources : [];
    state.assignments = Array.isArray(state.assignments) ? state.assignments : [];
    state.approvals = Array.isArray(state.approvals) ? state.approvals : [];
    state.queueItems = Array.isArray(state.queueItems) ? state.queueItems : [];
    state.nextBestActions = Array.isArray(state.nextBestActions) ? state.nextBestActions : [];
    return state;
  };

  PlatformKernel.prototype.status = function statusWithCoordinationV1() {
    const base = originalStatus.call(this);
    const state = this.snapshot();
    return Object.assign({}, base, { humans: state.humans.length, resources: state.resources.length, assignments: state.assignments.length, approvals: state.approvals.length, queueItems: state.queueItems.length, nextBestActions: state.nextBestActions.length });
  };

  PlatformKernel.prototype.executive = function executiveWithCoordinationV1() {
    const base = originalExecutive.call(this);
    const state = this.snapshot();
    return Object.assign({}, base, { coordination: this.coordination(), coordinationSummary: { queueDepth: state.queueItems.length, pendingApprovals: state.approvals.filter((item) => String(item.state || item.status || "").toLowerCase() === "pending").length, activeAssignments: state.assignments.filter((item) => String(item.status || "").toLowerCase() === "assigned").length, resourceUtilization: average(state.resources.map((item) => Number(item.utilization || 0))), nextBestAction: state.nextBestActions[0] || null } });
  };

  PlatformKernel.prototype.graph = function graphWithCoordinationV1() {
    const base = originalGraph.call(this);
    const state = this.snapshot();
    const graph = clone(base);
    graph.nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
    graph.edges = Array.isArray(graph.edges) ? graph.edges : [];
    graph.nodes.push(...state.humans.map((item) => ({ id: item.id, label: item.name, kind: "human", state: item.status, constitutional: item.constitutional })));
    graph.nodes.push(...state.resources.map((item) => ({ id: item.id, label: item.resourceType, kind: "resource", state: item.status, constitutional: item.constitutional })));
    graph.nodes.push(...state.assignments.map((item) => ({ id: item.id, label: item.actor_type + " assignment", kind: "assignment", state: item.status, constitutional: item.constitutional })));
    graph.nodes.push(...state.approvals.map((item) => ({ id: item.id, label: "approval", kind: "approval", state: item.state || item.status, constitutional: item.constitutional })));
    graph.nodes.push(...state.queueItems.map((item) => ({ id: item.id, label: "queue item", kind: "queue_item", state: item.state, constitutional: item.constitutional })));
    graph.nodes.push(...state.nextBestActions.map((item) => ({ id: item.id, label: item.title, kind: "next_best_action", state: item.status, constitutional: item.constitutional })));
    graph.edges.push(...state.assignments.filter((item) => item.actor_id && item.mission_id).map((item) => ({ id: item.id + "-mission", from: item.id, to: item.mission_id, relation: "coordinates", strength: item.trust_score || 0.5, impact: item.capability_fit || 0.5 })));
    graph.edges.push(...state.assignments.filter((item) => item.actor_id).map((item) => ({ id: item.id + "-actor", from: item.id, to: item.actor_id, relation: "assigned_to", strength: item.trust_score || 0.5, impact: item.capability_fit || 0.5 })));
    graph.edges.push(...state.approvals.filter((item) => item.target_id).map((item) => ({ id: item.id + "-approval", from: item.id, to: item.target_id, relation: "approves", strength: item.confidence || 0.5, impact: item.confidence || 0.5 })));
    graph.edges.push(...state.queueItems.filter((item) => item.mission_id).map((item) => ({ id: item.id + "-queue", from: item.id, to: item.mission_id, relation: "queues", strength: item.priority || 0.5, impact: item.priority || 0.5 })));
    graph.edges.push(...state.nextBestActions.map((item) => (item.source_ids || []).map((sourceId) => ({ id: item.id + "-" + sourceId, from: item.id, to: sourceId, relation: "derived_from", strength: item.confidence || 0.5, impact: item.confidence || 0.5 }))).flat());
    return graph;
  };

  function buildHuman(input = {}) {
    const name = String(input.name || input.title || "human");
    return { id: input.id || "human-" + idFrom(name, "human"), type: "human", name, role: input.role || "approver", authorityLevel: Number(input.authorityLevel != null ? input.authorityLevel : input.authority_level != null ? input.authority_level : 1), approvalScope: Array.isArray(input.approvalScope) ? clone(input.approvalScope) : Array.isArray(input.approval_scope) ? clone(input.approval_scope) : ["read"], escalationPath: Array.isArray(input.escalationPath) ? clone(input.escalationPath) : Array.isArray(input.escalation_path) ? clone(input.escalation_path) : [], assignedMissions: Array.isArray(input.assignedMissions) ? clone(input.assignedMissions) : [], status: input.status || "available", trustScore: Number(input.trustScore != null ? input.trustScore : input.trust_score != null ? input.trust_score : 0.5), currentWorkload: Number(input.currentWorkload != null ? input.currentWorkload : input.current_workload != null ? input.current_workload : 0), currentMissionId: input.currentMissionId || input.current_mission_id || null, assignmentHistory: Array.isArray(input.assignmentHistory) ? clone(input.assignmentHistory) : [], performanceScore: Number(input.performanceScore != null ? input.performanceScore : input.performance_score != null ? input.performance_score : 0.5), domainFit: input.domainFit || input.domain_fit || {}, metadata: input.metadata || {}, created_at: input.created_at || new Date().toISOString(), updated_at: input.updated_at || new Date().toISOString() };
  }

  function buildResource(input = {}) {
    const amount = Number(input.amount != null ? input.amount : 0);
    const allocated = Number(input.allocated != null ? input.allocated : 0);
    return { id: input.id || "resource-" + idFrom(String(input.resourceType || input.resource_type || "resource") + "-" + String(input.name || input.title || input.resourceType || "resource"), "resource"), type: "resource", resourceType: input.resourceType || input.resource_type || "compute", amount, allocated, available: Number(input.available != null ? input.available : Math.max(0, amount - allocated)), utilization: Number(input.utilization != null ? input.utilization : amount > 0 ? allocated / amount : 0), status: input.status || "available", metadata: input.metadata || {}, allocationHistory: Array.isArray(input.allocationHistory) ? clone(input.allocationHistory) : [], created_at: input.created_at || new Date().toISOString(), updated_at: input.updated_at || new Date().toISOString() };
  }

  function buildApproval(input = {}) {
    return { id: input.id || "approval-" + idFrom(String(input.target_id || input.targetId || "target") + "-" + String(input.approver_id || input.approverId || "approver"), "approval"), type: "approval", target_type: input.target_type || input.targetType || "mission", target_id: input.target_id || input.targetId || null, approver_id: input.approver_id || input.approverId || null, approver_type: input.approver_type || input.approverType || "human", scope: input.scope || "execution", state: input.state || "pending", status: input.status || "pending", reason: input.reason || "", confidence: Number(input.confidence != null ? input.confidence : 0.5), risk_level: input.risk_level || input.riskLevel || "medium", audit_trail: Array.isArray(input.audit_trail) ? clone(input.audit_trail) : [], metadata: input.metadata || {}, created_at: input.created_at || new Date().toISOString(), updated_at: input.updated_at || new Date().toISOString() };
  }

  function buildAssignment(input = {}) {
    return { id: input.id || "assignment-" + idFrom(String(input.mission_id || input.missionId || "mission") + "-" + String(input.actor_id || input.actorId || "actor"), "assignment"), type: "assignment", mission_id: input.mission_id || input.missionId || null, actor_type: input.actor_type || input.actorType || "agent", actor_id: input.actor_id || input.actorId || null, actor_name: input.actor_name || input.actorName || "", status: input.status || "created", reason: input.reason || "", trust_score: Number(input.trust_score != null ? input.trust_score : input.trustScore != null ? input.trustScore : 0.5), capability_fit: Number(input.capability_fit != null ? input.capability_fit : input.capabilityFit != null ? input.capabilityFit : 0.5), authority_validated: Boolean(input.authority_validated != null ? input.authority_validated : input.authorityValidated), constraint_validated: Boolean(input.constraint_validated != null ? input.constraint_validated : input.constraintValidated), resource_ids: Array.isArray(input.resource_ids) ? clone(input.resource_ids) : [], approval_id: input.approval_id || input.approvalId || null, queue_item_id: input.queue_item_id || input.queueItemId || null, metadata: input.metadata || {}, created_at: input.created_at || new Date().toISOString(), updated_at: input.updated_at || new Date().toISOString() };
  }

  function buildQueueItem(input = {}) {
    return { id: input.id || "queue-" + idFrom(String(input.mission_id || input.missionId || "mission") + "-" + String(input.state || "queued"), "queue"), type: "queue_item", mission_id: input.mission_id || input.missionId || null, actor_id: input.actor_id || input.actorId || null, assignment_id: input.assignment_id || input.assignmentId || null, state: input.state || "queued", priority: Number(input.priority != null ? input.priority : 0.5), reason: input.reason || "", queue_type: input.queue_type || input.queueType || "execution", attempts: Number(input.attempts || 0), scheduled_for: input.scheduled_for || input.scheduledFor || null, resource_ids: Array.isArray(input.resource_ids) ? clone(input.resource_ids) : [], metadata: input.metadata || {}, created_at: input.created_at || new Date().toISOString(), updated_at: input.updated_at || new Date().toISOString() };
  }

  function buildNextBestAction(state, input = {}) {
    const pendingApprovals = (state.approvals || []).filter((item) => String(item.state || item.status || "").toLowerCase() === "pending");
    const queued = (state.queueItems || []).find((item) => String(item.state || "").toLowerCase() === "queued");
    const lowConfidence = (state.missions || []).find((item) => Number(item.confidence != null ? item.confidence : 0.5) < 0.7);
    let kind = "next_mission";
    let title = "Launch next mission";
    let rationale = "No urgent blockers detected.";
    let expected = { capability: 0.2, trust: 0.1, roi: 0.1 };
    let confidence = 0.74;
    let sourceIds = [];
    const alternatives = [{ kind: "next_mission", title: "Generate the next mission", rationale: "Convert clarity into action." }];
    if (pendingApprovals.length) {
      kind = "approval";
      title = "Approve mission " + pendingApprovals[0].target_id;
      rationale = "Pending approval blocks execution.";
      expected = { capability: 0.12, trust: 0.14, roi: 0.08 };
      confidence = Number(pendingApprovals[0].confidence != null ? pendingApprovals[0].confidence : 0.7);
      sourceIds = [pendingApprovals[0].id];
    } else if (queued) {
      kind = "execution";
      title = "Run queued mission " + queued.mission_id;
      rationale = "Queued work should move into execution.";
      expected = { capability: 0.18, trust: 0.11, roi: 0.16 };
      confidence = 0.78;
      sourceIds = [queued.id];
    } else if (lowConfidence) {
      kind = "calibration";
      title = "Calibrate mission " + lowConfidence.id;
      rationale = "Confidence is below threshold and should be checked against reality.";
      expected = { capability: 0.09, trust: 0.2, roi: 0.06 };
      confidence = Number(lowConfidence.confidence != null ? lowConfidence.confidence : 0.5);
      sourceIds = [lowConfidence.id];
    }
    return { id: input.id || "nba-" + idFrom(String(title) + "-" + String(sourceIds[0] || "source"), "nba"), type: "next_best_action", kind: input.kind || kind, title: input.title || title, rationale: input.rationale || rationale, source_ids: Array.isArray(input.source_ids) ? clone(input.source_ids) : sourceIds, confidence: Number(input.confidence != null ? input.confidence : confidence), expected_impact: input.expected_impact != null ? clone(input.expected_impact) : expected, alternatives: Array.isArray(input.alternatives) ? clone(input.alternatives) : alternatives, status: input.status || "open", metadata: input.metadata || { domain: input.domain || "coordination", source: "coordination" }, created_at: input.created_at || new Date().toISOString(), updated_at: input.updated_at || new Date().toISOString() };
  }

  function validateAssignment(state, input = {}) {
    const mission = resolveMission(state, input.mission_id || input.missionId || input.mission);
    const actor = findActor(state, input.actor_type || input.actorType || "agent", input.actor_id || input.actorId || null);
    if (!mission) return { ok: false, reason: "Mission not found", related_entity_ids: [] };
    if (!actor) return { ok: false, reason: "Actor not found", related_entity_ids: [mission.id] };
    const trustScore = Number(actor.trustScore != null ? actor.trustScore : 0.5);
    const capabilityFit = Number(input.capability_fit != null ? input.capability_fit : trustScore);
    const authorityValidated = String(input.actor_type || input.actorType || "agent").toLowerCase() === "human" ? Number(actor.authorityLevel || 0) >= Number(input.required_authority || 1) : true;
    const constraintValidated = !Array.isArray(input.constraint_ids) || !input.constraint_ids.length || (Array.isArray(mission.constraint_ids) && input.constraint_ids.every((id) => mission.constraint_ids.includes(id)));
    if (trustScore < Number(input.min_trust_score != null ? input.min_trust_score : 0.35)) return { ok: false, reason: "Trust score too low", related_entity_ids: [mission.id, actor.id], authority_validated: authorityValidated, constraint_validated: constraintValidated };
    if (!authorityValidated) return { ok: false, reason: "Authority insufficient", related_entity_ids: [mission.id, actor.id], authority_validated: false, constraint_validated: constraintValidated };
    if (!constraintValidated) return { ok: false, reason: "Constraint validation failed", related_entity_ids: [mission.id, actor.id], authority_validated: authorityValidated, constraint_validated: false };
    return { ok: true, reason: "Validated", capability_fit: capabilityFit, trust_score: trustScore, authority_validated: authorityValidated, constraint_validated: constraintValidated, related_entity_ids: [mission.id, actor.id] };
  }

  function findActor(state, actorType, actorId) {
    if (!actorId) return null;
    return String(actorType || "agent").toLowerCase() === "human" ? (state.humans || []).find((item) => item.id === actorId) || null : (state.agents || []).find((item) => item.id === actorId) || null;
  }

  function findResource(state, input = {}) {
    if (input.resource_id || input.resourceId) return (state.resources || []).find((item) => item.id === (input.resource_id || input.resourceId)) || null;
    if (input.resourceType || input.resource_type) return (state.resources || []).find((item) => String(item.resourceType || "").toLowerCase() === String(input.resourceType || input.resource_type || "").toLowerCase()) || null;
    return null;
  }

  function resolveMission(state, input) {
    if (!input) return null;
    if (typeof input === "object" && input.id) return (state.missions || []).find((item) => item.id === input.id) || input;
    return (state.missions || []).find((item) => item.id === input) || null;
  }

  function scenarioData(domain) {
    if (domain.includes("cloud")) {
      return baseScenario("cloud-operations", "cloud", "Cloud spend increased while reliability decreased", "Optimize cloud spend", "reduce cloud cost while improving reliability", "Cloud cost reduction mission", "Cloud Ops Agent", "budget", "Cloud Approver", "platform manager", 3, 0.42, 0.88, 0.9, 0.86, 0.22, 0.14, -0.16, "Cloud spend reduced and reliability stabilized", "Rightsizing with guardrails reduced waste without harming reliability.", "Repeat rightsizing monthly and preserve budget headroom.", { cost: 2200, savings: 9800, value: 11800, roi: 4.4 }, "cloud-ops");
    }
    if (domain.includes("sales") || domain.includes("revenue")) {
      return baseScenario("revenue-operations", "revenue", "Qualified leads increased while conversion decreased", "Improve revenue conversion", "increase conversion and improve qualification", "Revenue conversion mission", "RevOps Lead", "time", "Revenue Approver", "sales manager", 2, 0.35, 0.87, 0.86, 0.82, 0.19, 0.1, -0.12, "Conversion improved and pipeline quality increased", "Improved qualification reduces friction and increases revenue efficiency.", "Keep the qualification rubric in the operating cadence.", { cost: 1800, savings: 6000, value: 7800, roi: 3.3 }, "revops");
    }
    return baseScenario("robotics-operations", "robotics", "Fleet slowed while maintenance alerts increased", "Stabilize fleet operations", "increase fleet completion and reduce maintenance alerts", "Robotics stabilization mission", "Fleet Agent", "robot", "Robotics Approver", "ops lead", 3, 0.46, 0.9, 0.91, 0.84, 0.24, 0.15, -0.18, "Fleet throughput recovered and alerts declined", "Preventive maintenance protects execution capacity and reduces fragility.", "Establish a maintenance cadence tied to throughput thresholds.", { cost: 2600, savings: 9200, value: 12100, roi: 3.7 }, "robotics");
  }

  function baseScenario(domain, realityType, obsTitle, criterionTitle, objective, missionTitle, actorName, resourceType, approverName, approverRole, autonomyLevel, riskLevel, trustScore, capabilityFit, confidence, capabilityImpact, trustImpact, riskDelta, actualResult, lesson, futureRecommendation, economicImpact, source) {
    return {
      observation: { title: obsTitle, source, subject_id: domain, confidence, observed_state: {}, observed_change: {}, evidence: [{ id: source + "-metric", type: "metric" }] },
      realityObject: { title: domain, reality_type: realityType, state: {}, resources: {}, constraints: [], observations: [], metadata: { domain } },
      criterion: { title: criterionTitle, description: objective, priority: 5, protected: true, preferred_state: {}, impermissible_state: {}, scoring_policy: { method: "weighted", weight: 1 }, metadata: { domain } },
      significanceReason: "The observed change deserves intervention.",
      significanceConfidence: confidence,
      intervention: { title: criterionTitle, expected_delta_reduction: 0.3, cost: economicImpact.cost, risk: riskLevel, reversibility: "reversible", resource_requirements: [resourceType], confidence, expected_outcome: actualResult, governance_status: "ready", status: "proposed", metadata: { domain } },
      decision: { title: criterionTitle + " decision", rationale: objective, assumptions: [{ id: "assumption-" + source, type: "assumption", title: "Action improves reality", value: "true", confidence: 0.7 }], alternatives: [{ id: "alt-" + source + "-1", title: "Delay action", rationale: "Preserves current state but compounds risk." }, { id: "alt-" + source + "-2", title: "Proceed", rationale: "Converts attention into capability." }], expected_impact: { capability: capabilityImpact, trust: trustImpact, roi: economicImpact.roi }, confidence, metadata: { domain } },
      mission: { title: missionTitle, objective, expected_outcome: actualResult, priority: 0.8, confidence, metadata: { domain } },
      actorType: domain === "revenue-operations" ? "human" : "agent",
      actor: { name: actorName, role: domain === "revenue-operations" ? "operator" : "orchestrator", authorityLevel: 4, approvalScope: ["mission_execution"], escalationPath: ["owner"], trustScore, performanceScore: 0.85, currentWorkload: 0, capabilities: [domain] },
      resource: { resourceType, amount: resourceType === "time" ? 40 : resourceType === "robot" ? 6 : 3000, allocated: 0, metadata: { domain } },
      approver: { id: "approver-" + source, name: approverName, role: approverRole, authorityLevel: 4, approvalScope: ["mission_execution"], escalationPath: ["owner"], trustScore: 0.9, currentWorkload: 0 },
      assignmentReason: "Coordination requires trusted execution.",
      queueReason: "Mission should enter execution queue.",
      priority: 0.85,
      confidence,
      riskLevel,
      trustScore,
      capabilityFit,
      actualResult,
      lesson,
      futureRecommendation,
      capabilityImpact,
      trustImpact,
      riskDelta,
      economicImpact,
      relatedEntityIds: [domain],
      autonomyLevel,
    };
  }

  function coordinationSummary(state, nextBestAction) {
    return {
      queueDepth: (state.queueItems || []).length,
      pendingApprovals: (state.approvals || []).filter((item) => String(item.state || item.status || "").toLowerCase() === "pending").length,
      activeAssignments: (state.assignments || []).filter((item) => String(item.status || "").toLowerCase() === "assigned").length,
      resourceUtilization: average((state.resources || []).map((item) => Number(item.utilization || 0))),
      nextBestAction: nextBestAction || (state.nextBestActions || [])[0] || null,
      liveMissions: (state.missions || []).length,
      humans: (state.humans || []).length,
      agents: (state.agents || []).length,
      resources: (state.resources || []).length,
    };
  }

  function domainSummary(state) {
    const domains = {};
    for (const record of state.nextBestActions || []) {
      const domain = record.metadata && record.metadata.domain ? record.metadata.domain : "coordination";
      domains[domain] = domains[domain] || { next_actions: 0, missions: 0 };
      domains[domain].next_actions += 1;
    }
    for (const mission of state.missions || []) {
      const domain = mission.metadata && mission.metadata.domain ? mission.metadata.domain : "coordination";
      domains[domain] = domains[domain] || { next_actions: 0, missions: 0 };
      domains[domain].missions += 1;
    }
    return domains;
  }

  function approvalEventType(stateType) {
    if (stateType === "approved") return "approval.approved";
    if (stateType === "rejected") return "approval.rejected";
    if (stateType === "escalated") return "approval.escalated";
    if (stateType === "expired") return "approval.expired";
    return "approval.created";
  }

  function listRecords(records, query = {}) {
    let items = Array.isArray(records) ? records.slice() : [];
    if (query.state) items = items.filter((item) => String(item.state || item.status || "").toLowerCase() === String(query.state).toLowerCase());
    if (query.status) items = items.filter((item) => String(item.status || "").toLowerCase() === String(query.status).toLowerCase());
    if (query.id) items = items.filter((item) => item.id === query.id);
    if (query.type) items = items.filter((item) => String(item.type || item.kind || "").toLowerCase() === String(query.type).toLowerCase());
    if (query.subject_id) items = items.filter((item) => item.subject_id === query.subject_id || item.reality_object_id === query.subject_id || item.criterion_id === query.subject_id || item.mission_id === query.subject_id || item.actor_id === query.subject_id);
    const limit = Number(query.limit || query.top || 0);
    return limit > 0 ? items.slice(0, limit) : items;
  }

  function ensure(state, key) {
    state[key] = Array.isArray(state[key]) ? state[key] : [];
    return state[key];
  }

  function appendEvent(state, type, subjectId, summary, payload = {}) {
    const event = createEvent({ event_type: type, subject_id: subjectId || null, summary: summary || "", payload, related_entity_ids: payload.related_entity_ids || [], related_mission_id: payload.related_mission_id || null, severity: payload.severity || "info", source: payload.source || "cyvx" });
    state.events = Array.isArray(state.events) ? state.events : [];
    state.events.unshift(event);
    return event;
  }

  function average(values) {
    const numbers = (Array.isArray(values) ? values : []).map((value) => Number(value)).filter((value) => !Number.isNaN(value));
    if (!numbers.length) return 0.5;
    return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
  }

  function round3(value) {
    return Number(Number(value || 0).toFixed(3));
  }
}

module.exports = { augmentCoordinationPlatform };
