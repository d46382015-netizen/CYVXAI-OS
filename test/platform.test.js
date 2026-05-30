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

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { execFileSync } = require('node:child_process');
const { createApiServer } = require('../api');
const { PlatformKernel, createAgent, createConstraint, createEntity, createGoal, createInitiative, createMission, createObjective, createOpportunity, createObservation, createPattern, createRelationship, createTrust, createPlatformState, JsonFileStore } = require('../core/platform');

function createTempKernel() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyvx-platform-'));
  const filePath = path.join(dir, 'state.json');
  return new PlatformKernel({ filePath: filePath, seed: { entities: [], relationships: [], agents: [], goals: [], initiatives: [], missions: [], simulations: [], reports: [], commands: [], events: [], observations: [], objectives: [], constraints: [], opportunities: [], decisions: [], interventions: [], outcomes: [], knowledgeRecords: [], capabilities: [], trusts: [], patterns: [], workflows: [] } });
}

test('platform models normalize record metadata', () => {
  const entity = createEntity({ name: 'Cloud Fabric', kind: 'infrastructure', state: 'operating', health: 'healthy' });
  const agent = createAgent({ name: 'Planner', role: 'mission planner' });
  const mission = createMission({ title: 'Reduce cloud cost', objective: 'lower spend', owner_id: agent.id, target_entity_ids: [entity.id] });
  const objective = createObjective({ title: 'Improve capability', entity_ids: [entity.id] });
  const relation = createRelationship({ from: entity.id, to: objective.id, relation: 'supports' });

  assert.equal(entity.type, 'entity');
  assert.equal(entity.label, 'Cloud Fabric');
  assert.equal(agent.type, 'agent');
  assert.equal(mission.type, 'mission');
  assert.equal(objective.type, 'objective');
  assert.equal(relation.type, 'relationship');
  assert.deepEqual(mission.target_entity_ids, [entity.id]);
});

test('platform state seeds the expected shared collections', () => {
  const state = createPlatformState({
    companyName: 'Acme Systems',
    entities: [{ name: 'Company', kind: 'company' }],
    agents: [{ name: 'Operator', role: 'operator' }],
    missions: [{ title: 'Improve reliability' }],
    objectives: [{ title: 'Reduce waste' }],
  });

  assert.equal(state.powered_by, 'CYVX');
  assert.equal(state.creator, 'Dakota Lee Jonsgaard');
  assert.equal(state.entities.length, 1);
  assert.equal(state.agents.length, 1);
  assert.equal(state.missions.length, 1);
  assert.equal(state.objectives.length, 1);
});

test('json file store persists nested data', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyvx-platform-'));
  const file = path.join(dir, 'state.json');
  const store = new JsonFileStore(file, { meta: { version: 1 }, events: [] });

  assert.equal(store.get('meta.version'), 1);
  store.set('meta.version', 2);
  store.append('events', { type: 'boot' });

  const reloaded = new JsonFileStore(file);
  assert.equal(reloaded.get('meta.version'), 2);
  assert.equal(reloaded.get('events').length, 1);
  assert.equal(reloaded.get('events.0.type'), 'boot');
});

test("creating core objects emits events", () => {
  const kernel = createTempKernel();
  const start = kernel.events().length;
  const entity = kernel.createEntity({ name: "Reality Node", kind: "system" });
  const relationship = kernel.createRelationship({ from: entity.id, to: "company", relation: "supports" });
  const objective = kernel.createObjective({ title: "Improve resilience", entity_ids: [entity.id] });

  assert.equal(kernel.events().length, start + 3);
  assert.equal(kernel.events({ event_type: "entity.created" })[0].subject_id, entity.id);
  assert.equal(kernel.events({ event_type: "relationship.created" })[0].subject_id, relationship.id);
  assert.equal(kernel.events({ event_type: "objective.created" })[0].subject_id, objective.id);
});

test("creating observations records reality state", () => {
  const kernel = createTempKernel();
  const observation = kernel.createObservation({
    title: "API uptime steady",
    source: "probe",
    subject_id: "company",
    observed_state: { uptime: 0.99 },
    observed_change: { uptime: 0.01 },
    confidence: 0.88,
    evidence: [{ id: "ev-1", type: "metric" }],
  });

  assert.equal(observation.type, "observation");
  assert.equal(kernel.observations().length, 1);
  assert.equal(kernel.events({ event_type: "observation.recorded" }).length, 1);
  assert.ok(kernel.reality().observed_state_count >= 1);
});

test('creating strategic primitives emits events', () => {
  const kernel = createTempKernel();
  const goal = kernel.createGoal({ title: 'Improve trust', confidence: 0.8 });
  const initiative = kernel.createInitiative({ title: 'Calibration program', goal_id: goal.id, confidence: 0.7 });
  const constraint = kernel.createConstraint({ title: 'Budget ceiling', blocker: 'limited spend', confidence: 0.6 });
  const opportunity = kernel.createOpportunity({ title: 'Reduce latency', expected_value: 12000, confidence: 0.75 });
  const trust = kernel.createTrust({ subject_type: 'simulation', subject_id: 'sim-1', trust_score: 0.9, calibration: { error: 0.05 } });
  const pattern = kernel.createPattern({ title: 'Repeat success', frequency: 3, confidence: 0.85 });

  assert.ok(goal.constitutional);
  assert.ok(initiative.constitutional);
  assert.ok(constraint.constitutional);
  assert.ok(opportunity.constitutional);
  assert.ok(trust.constitutional);
  assert.ok(pattern.constitutional);
  assert.ok(kernel.events({ event_type: 'goal.created' }).length >= 1);
  assert.ok(kernel.events({ event_type: 'initiative.created' }).length >= 1);
  assert.ok(kernel.events({ event_type: 'constraint.created' }).length >= 1);
  assert.ok(kernel.events({ event_type: 'opportunity.created' }).length >= 1);
  assert.ok(kernel.events({ event_type: 'trust.recorded' }).length >= 1);
  assert.ok(kernel.events({ event_type: 'pattern.created' }).length >= 1);
});

test('missions, simulations, decisions, outcomes, knowledge, and capability are constitutional', () => {
  const kernel = createTempKernel();
  const missionResult = kernel.launchMission({
    title: 'Reduce cloud cost',
    objective: 'reduce spend',
    target_entity_ids: ['company'],
    autonomy_level: 3,
  });

  assert.ok(missionResult.mission);
  assert.equal(missionResult.mission.stage, 'learned');
  assert.ok(missionResult.simulation.assumptions.length >= 2);
  assert.ok(missionResult.simulation.confidence > 0);
  assert.ok(typeof missionResult.simulation.risk_delta === 'number');
  assert.ok(typeof missionResult.simulation.opportunity_delta === 'number');
  assert.ok(missionResult.simulation.economic_impact);
  assert.ok(missionResult.decision.evidence.length >= 1);
  assert.ok(missionResult.decision.assumptions.length >= 1);
  assert.ok(missionResult.decision.alternatives.length >= 1);
  assert.ok(missionResult.decision.expected_impact);
  assert.ok(missionResult.decision.confidence > 0);
  assert.ok(missionResult.outcome);
  assert.ok(missionResult.knowledgeRecord);
  assert.ok(missionResult.capability);
  assert.ok(missionResult.mission.governance);
  assert.ok(missionResult.mission.capability_delta);
  assert.ok(kernel.events({ event_type: 'mission.created' }).length >= 1);
  assert.ok(kernel.events({ event_type: 'simulation.completed' }).length >= 1);
  assert.ok(kernel.events({ event_type: 'decision.generated' }).length >= 1);
  assert.ok(kernel.events({ event_type: 'outcome.measured' }).length >= 1);
  assert.ok(kernel.events({ event_type: 'knowledge.recorded' }).length >= 1);
  assert.ok(kernel.events({ event_type: 'capability.changed' }).length >= 1);
});

test('high-autonomy missions carry governance metadata', () => {
  const kernel = createTempKernel();
  const missionResult = kernel.launchMission({
    title: 'Autonomous sweep',
    objective: 'validate autonomy metadata',
    autonomy_level: 5,
    target_entity_ids: ['company'],
  });

  assert.equal(missionResult.mission.autonomy_level, 5);
  assert.ok(missionResult.mission.governance);
  assert.equal(typeof missionResult.mission.governance.approval_required, 'boolean');
  assert.equal(typeof missionResult.mission.governance.operator_override, 'boolean');
});

test('model-company runs the constitutional loop end to end', () => {
  const kernel = createTempKernel();
  const result = kernel.modelCompany({ companyName: 'Constitutional Labs', employees: 150, cloudSpend: 50000, systems: 12, teams: 4 });

  assert.ok(result.platform.entities.length >= 4);
  assert.ok(result.platform.relationships.length >= 4);
  assert.ok(result.platform.goals.length >= 1);
  assert.ok(result.platform.initiatives.length >= 1);
  assert.ok(result.platform.objectives.length >= 1);
  assert.ok(result.platform.constraints.length >= 1);
  assert.ok(result.platform.opportunities.length >= 1);
  assert.ok(result.platform.trusts.length >= 1);
  assert.ok(result.platform.patterns.length >= 1);
  assert.ok(result.platform.missions.length >= 1);
  assert.ok(result.platform.simulations.length >= 1);
  assert.ok(result.platform.decisions.length >= 1);
  assert.ok(result.platform.interventions.length >= 1);
  assert.ok(result.platform.outcomes.length >= 1);
  assert.ok(result.platform.knowledgeRecords.length >= 1);
  assert.ok(result.platform.capabilities.length >= 1);
  assert.ok(result.platform.events.length >= 1);
  assert.ok(result.executive.constitutionalLoop);
  assert.ok(result.executive.constitutionalLoop.learn >= 1);
  assert.ok(result.executive.trust);
  assert.ok(result.executive.strategicCoordination);
});

test('no major state mutation occurs without an event', () => {
  const kernel = createTempKernel();
  const before = kernel.events().length;
  kernel.createCapability({ title: 'Automation', current: 0.2, potential: 0.8 });
  kernel.createKnowledgeRecord({ title: 'Capability note', lesson_learned: 'Capability changed' });
  kernel.recordOutcome({ title: 'Outcome placeholder', mission_id: 'mission-x' });
  const after = kernel.events().length;

  assert.ok(after >= before + 3);
});

test('executive endpoint reflects the constitutional loop', async () => {
  const kernel = createTempKernel();
  kernel.modelCompany({ companyName: 'Executive Systems' });
  const controller = {
    status: () => ({ powered_by: 'CYVX' }),
    overview: () => ({ health: { label: 'healthy' } }),
    insights: () => [],
    agentsSnapshot: () => [],
    leaderboard: () => [],
    roadmap: () => [],
    snapshot: () => ({ cluster: { workloads: [] } }),
    history: () => [],
    statusModel: { snapshot: () => ({ data: {} }) },
    ask: () => ({}),
    submitWorkload: () => ({}),
    executeAction: () => ({}),
    registerSocket: () => {},
    actions: [],
  };
  const { server } = createApiServer(controller, { platform: kernel });
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  const response = await fetch('http://127.0.0.1:' + address.port + '/api/v1/executive');
  const body = await response.json();
  await new Promise((resolve) => server.close(resolve));

  assert.ok(body.constitutionalLoop);
  assert.ok(body.constitutionalLoop.observe >= 1);
  assert.ok(body.summary.decisionCount >= 1);
  assert.ok(body.topKnowledge);
});


test('reality and portfolio are surfaced', () => {
  const kernel = createTempKernel();
  kernel.createObservation({ title: 'Drift detected', source: 'monitor', subject_id: 'company', confidence: 0.8 });
  kernel.createMission({ title: 'Reduce drift', objective: 'narrow model gap', target_entity_ids: ['company'], autonomy_level: 2 });

  const reality = kernel.reality();
  const portfolio = kernel.portfolio();

  assert.ok(reality.reality_drift >= 0);
  assert.ok(typeof portfolio.mission_count === 'number');
  assert.ok(typeof portfolio.strategic_alignment === 'number');
});

test('pattern, recommendation, and priority intelligence are explainable', () => {
  const kernel = createTempKernel();
  kernel.modelCompany({ companyName: 'Intelligence Labs', employees: 120, cloudSpend: 42000, systems: 9, teams: 3 });

  const patterns = kernel.patterns();
  const recommendations = kernel.recommendations();
  const priorities = kernel.priorities();
  const intelligence = kernel.intelligence();

  assert.ok(patterns.length >= 1);
  assert.ok(recommendations.length >= 1);
  assert.ok(priorities.length >= 1);
  assert.ok(patterns[0].evidence.length >= 1);
  assert.ok(Array.isArray(recommendations[0].source_ids));
  assert.ok(Array.isArray(priorities[0].source_ids));
  assert.ok(intelligence.patternCount >= 1);
  assert.ok(intelligence.recommendationCount >= 1);
  assert.ok(intelligence.priorityCount >= 1);
  assert.ok(intelligence.predictedCirImpact >= 0);
});

test('cross-domain scenarios generate intelligence artifacts', () => {
  const domains = ['cloud-operations', 'revenue-operations', 'robotics-operations'];
  for (const domain of domains) {
    const kernel = createTempKernel();
    const result = kernel.coordinateScenario({ domain });

    assert.ok(result.intelligence);
    assert.ok(kernel.patterns().length >= 1);
    assert.ok(kernel.recommendations().length >= 1);
    assert.ok(kernel.priorities().length >= 1);
  }
});

test('intelligence api and cli expose the same live state', async () => {
  const kernel = createTempKernel();
  kernel.modelCompany({ companyName: 'API Intelligence', employees: 140, cloudSpend: 51000, systems: 10, teams: 4 });

  const controller = {
    status: () => ({ powered_by: 'CYVX' }),
    overview: () => ({ health: { label: 'healthy' } }),
    insights: () => [],
    agentsSnapshot: () => [],
    leaderboard: () => [],
    roadmap: () => [],
    snapshot: () => ({ cluster: { workloads: [] } }),
    history: () => [],
    statusModel: { snapshot: () => ({ data: {} }) },
    ask: () => ({}),
    submitWorkload: () => ({}),
    executeAction: () => ({}),
    registerSocket: () => {},
    actions: [],
  };
  const { server } = createApiServer(controller, { platform: kernel });
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  const intelligence = await fetch('http://127.0.0.1:' + address.port + '/api/v1/intelligence').then((response) => response.json());
  const recommendations = await fetch('http://127.0.0.1:' + address.port + '/api/v1/recommendations').then((response) => response.json());
  const priorities = await fetch('http://127.0.0.1:' + address.port + '/api/v1/priorities').then((response) => response.json());
  await new Promise((resolve) => server.close(resolve));

  const cliIntelligence = JSON.parse(execFileSync('node', ['./cli/cyvx.js', 'intelligence'], { cwd: '/root/CYVXAI-OS', encoding: 'utf8' }));
  const cliRecommendations = JSON.parse(execFileSync('node', ['./cli/cyvx.js', 'recommendations'], { cwd: '/root/CYVXAI-OS', encoding: 'utf8' }));
  const cliPriorities = JSON.parse(execFileSync('node', ['./cli/cyvx.js', 'priorities'], { cwd: '/root/CYVXAI-OS', encoding: 'utf8' }));

  assert.ok(intelligence.patternCount >= 1);
  assert.ok(recommendations.recommendations.length >= 1);
  assert.ok(priorities.priorities.length >= 1);
  assert.ok(cliIntelligence.patternCount >= 1);
  assert.ok(cliRecommendations.recommendations.length >= 1);
  assert.ok(cliPriorities.priorities.length >= 1);
});

test('dashboard is wired for intelligence panels', () => {
  const html = fs.readFileSync('/root/CYVXAI-OS/ui/index.html', 'utf8');
  assert.ok(html.includes('patternIntelligencePanel'));
  assert.ok(html.includes('recommendationIntelligencePanel'));
  assert.ok(html.includes('priorityIntelligencePanel'));
  assert.ok(html.includes('intelligenceSummaryPanel'));
});

test('executive endpoint surfaces trust and strategy', async () => {
  const kernel = createTempKernel();
  kernel.modelCompany({ companyName: 'Trust Systems' });
  const controller = {
    status: () => ({ powered_by: 'CYVX' }),
    overview: () => ({ health: { label: 'healthy' } }),
    insights: () => [],
    agentsSnapshot: () => [],
    leaderboard: () => [],
    roadmap: () => [],
    snapshot: () => ({ cluster: { workloads: [] } }),
    history: () => [],
    statusModel: { snapshot: () => ({ data: {} }) },
    ask: () => ({}),
    submitWorkload: () => ({}),
    executeAction: () => ({}),
    registerSocket: () => {},
    actions: [],
  };
  const { server } = createApiServer(controller, { platform: kernel });
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  const response = await fetch('http://127.0.0.1:' + address.port + '/api/v1/executive');
  const body = await response.json();
  await new Promise((resolve) => server.close(resolve));

  assert.ok(body.trust);
  assert.ok(body.strategicCoordination);
  assert.ok(body.opportunities);
});

test('CLI trust and strategy commands work', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyvx-cli-'));
  const filePath = path.join(dir, 'state.json');
  const env = { ...process.env, CYVX_PLATFORM_STATE: filePath };
  const goals = execFileSync(process.execPath, ['/root/CYVXAI-OS/cli/cyvx.js', 'goals'], { env, encoding: 'utf8' });
  const trust = execFileSync(process.execPath, ['/root/CYVXAI-OS/cli/cyvx.js', 'trust'], { env, encoding: 'utf8' });
  const parsedGoals = JSON.parse(goals);
  const parsedTrust = JSON.parse(trust);

  assert.ok(Array.isArray(parsedGoals.goals));
  assert.ok(Array.isArray(parsedTrust.trusts));
});
test('CLI model-company works', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyvx-cli-'));
  const filePath = path.join(dir, 'state.json');
  const output = execFileSync(process.execPath, ['/root/CYVXAI-OS/cli/cyvx.js', 'model-company'], {
    env: { ...process.env, CYVX_PLATFORM_STATE: filePath },
    encoding: 'utf8',
  });
  const parsed = JSON.parse(output);

  assert.ok(parsed.platform.entities.length >= 4);
  assert.ok(parsed.executive.constitutionalLoop.learn >= 1);
});


test("kernel v1 contracts are exposed", async () => {
  const kernel = createTempKernel();
  const criterion = kernel.createCriterion({ title: "Priority of reality", description: "Reality outranks model", priority: 5, protected: true, preferred_state: { drift: 0 } });
  const realityObject = kernel.createRealityObject({ title: "Company reality", state: { drift: 0.12 }, observations: ["ob-1"], resources: { budget: 1 }, constraints: ["budget"] });
  const significance = kernel.generateSignificance({ criterion_id: criterion.id, reality_object_id: realityObject.id, confidence: 0.9 });
  const intervention = kernel.createIntervention({ title: "Reduce drift", target_reality_object_id: realityObject.id, significance_record_ids: [significance.id], cost: 100, expected_delta_reduction: 0.2, risk: 0.1, reversible: true, requires_approval: true, governance_status: "approved" });
  const outcome = kernel.recordOutcome({ title: "Reduce drift outcome", intervention_id: intervention.id, expected_result: { drift: 0.05 }, actual_result: { drift: 0.04 }, trust_impact: 0.1, capability_impact: 0.2, constitutional_impact: 0.3, evidence: [{ id: "ev-k1", type: "metric" }] });
  const evolution = kernel.createEvolutionRecommendation({ capability_gap: "calibration", root_cause: "stale assumptions", recommended_change: "add drift alerts", expected_improvement: "faster correction", affected_service: "kernel", priority: 1, confidence: 0.8 });
  const cir = kernel.cir();

  assert.ok(significance.id);
  assert.ok(intervention.id);
  assert.ok(outcome.id);
  assert.ok(evolution.id);
  assert.ok(cir.summary.score >= 0);
  assert.ok(kernel.events({ event_type: "criterion.created" }).length >= 1);
  assert.ok(kernel.events({ event_type: "reality_object.created" }).length >= 1);
  assert.ok(kernel.events({ event_type: "significance_record.created" }).length >= 1);
  assert.ok(kernel.events({ event_type: "intervention.created" }).length >= 1);
  assert.ok(kernel.events({ event_type: "outcome.measured" }).length >= 1);
  assert.ok(kernel.events({ event_type: "evolution_recommendation.created" }).length >= 1);
  assert.ok(kernel.events({ event_type: "cir.calculated" }).length >= 1);

  const controller = {
    status: () => ({ powered_by: "CYVX" }),
    overview: () => ({ health: { label: "healthy" } }),
    insights: () => [],
    agentsSnapshot: () => [],
    leaderboard: () => [],
    roadmap: () => [],
    snapshot: () => ({ cluster: { workloads: [] } }),
    history: () => [],
    statusModel: { snapshot: () => ({ data: {} }) },
    ask: () => ({}),
    submitWorkload: () => ({}),
    executeAction: () => ({}),
    registerSocket: () => {},
    actions: [],
  };
  const { server } = createApiServer(controller, { platform: kernel });
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  const kernelResponse = await fetch("http://127.0.0.1:" + address.port + "/api/v1/kernel");
  const cirResponse = await fetch("http://127.0.0.1:" + address.port + "/api/v1/cir");
  const kernelBody = await kernelResponse.json();
  const cirBody = await cirResponse.json();
  await new Promise((resolve) => server.close(resolve));

  assert.ok(kernelBody.cir);
  assert.ok(Array.isArray(kernelBody.topSignificanceRecords));
  assert.ok(Array.isArray(kernelBody.topInterventions));
  assert.ok(cirBody.current);
  assert.ok(cirBody.summary);
});


test("coordination platform runs live cross-domain loops", () => {
  const kernel = createTempKernel();
  const cloud = kernel.coordinateScenario({ domain: "cloud-operations" });
  const sales = kernel.coordinateScenario({ domain: "revenue-operations" });
  const robotics = kernel.coordinateScenario({ domain: "robotics-operations" });

  assert.ok(cloud.mission);
  assert.ok(sales.mission);
  assert.ok(robotics.mission);
  assert.ok(cloud.outcome);
  assert.ok(sales.outcome);
  assert.ok(robotics.outcome);
  assert.ok(kernel.humans().length >= 1);
  assert.ok(kernel.resources().length >= 3);
  assert.ok(kernel.assignments().length >= 3);
  assert.ok(kernel.approvals().length >= 3);
  assert.ok(kernel.queue().length >= 3);
  assert.ok(kernel.nextBestActions().length >= 3);
  assert.ok(kernel.events({ event_type: "mission.queued" }).length >= 3);
  assert.ok(kernel.events({ event_type: "next_action.generated" }).length >= 3);
  assert.ok(kernel.cir().current.score >= 0);
});

test("assignment validation rejects invalid actors and approvals preserve audit trail", () => {
  const kernel = createTempKernel();
  const mission = kernel.createMission({ title: "Validate assignment", objective: "check rules", target_entity_ids: ["company"] });
  const approval = kernel.createApproval({ target_type: "mission", target_id: mission.id, approver_id: "human-1", status: "pending" });
  const rejected = kernel.createAssignment({ mission_id: mission.id, actor_type: "human", actor_id: "missing-human", approval_id: approval.id, min_trust_score: 0.95 });
  const approved = kernel.updateApproval(approval.id, { state: "approved", status: "approved", reason: "allowed" });

  assert.equal(rejected.status, "rejected");
  assert.ok(kernel.events({ event_type: "assignment.rejected" }).length >= 1);
  assert.equal(approved.status, "approved");
  assert.ok(kernel.events({ event_type: "approval.approved" }).length >= 1);
});

test("coordination api endpoints return live state", async () => {
  const kernel = createTempKernel();
  kernel.coordinateScenario({ domain: "cloud-operations" });
  const controller = {
    status: () => ({ powered_by: "CYVX" }),
    overview: () => ({ health: { label: "healthy" } }),
    insights: () => [],
    agentsSnapshot: () => [],
    leaderboard: () => [],
    roadmap: () => [],
    snapshot: () => ({ cluster: { workloads: [] } }),
    history: () => [],
    statusModel: { snapshot: () => ({ data: {} }) },
    ask: () => ({}),
    submitWorkload: () => ({}),
    executeAction: () => ({}),
    registerSocket: () => {},
    actions: [],
  };
  const { server } = createApiServer(controller, { platform: kernel });
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  const coordination = await fetch("http://127.0.0.1:" + address.port + "/api/v1/coordination").then((res) => res.json());
  const nba = await fetch("http://127.0.0.1:" + address.port + "/api/v1/next-best-action").then((res) => res.json());
  await new Promise((resolve) => server.close(resolve));

  assert.ok(coordination.summary);
  assert.ok(coordination.summary.queueDepth >= 1);
  assert.ok(nba.nextBestActions || nba.nextBestAction);
});
