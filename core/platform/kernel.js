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

const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { JsonFileStore } = require('./file_store');
const models = require('./models');
const { augmentPlatformKernel } = require('./phase9');

const {
  clone,
  createAgent,
  createAssumption,
  createCapability,
  createCommand,
  createDecision,
  createEntity,
  createEvidence,
  createEvent,
  createGoal,
  createInitiative,
  createConstraint,
  createOpportunity,
  createPattern,
  createRecommendation,
  createPriority,
  createTrust,
  createIntervention,
  createKnowledgeRecord,
  createMission,
  createObjective,
  createOutcome,
  createPlatformState,
  createRelationship,
  createReport,
  createSimulation,
  createTenant,
  createUser,
  createWorkflow,
  idFrom,
} = models;

const COLLECTIONS = [
  'entities',
  'relationships',
  'events',
  'agents',
  'goals',
  'initiatives',
  'objectives',
  'constraints',
  'opportunities',
  'missions',
  'simulations',
  'reports',
  'commands',
  'decisions',
  'interventions',
  'outcomes',
  'knowledgeRecords',
  'capabilities',
  'trusts',
  'patterns',
  'recommendations',
  'priorities',
  'observations',
  'humans',
  'resources',
  'assignments',
  'approvals',
  'queueItems',
  'nextBestActions',
  "criteria",
  "realityObjects",
  "significanceRecords",
  "evolutionRecommendations",
  "cirMetrics",
  'workflows',
];

class PlatformKernel {
  constructor(options = {}) {
    this.options = options;
    this.filePath = options.filePath || path.join(os.homedir(), '.cyvx', 'platform-state.json');
    this.store = new JsonFileStore(this.filePath, buildSeedState(options.seed || {}));
    this.state = normalizePlatformState(this.store.load());
    this.store.save(this.state);
  }

  load() {
    this.state = normalizePlatformState(this.store.load());
    this.store.save(this.state);
    return this.state;
  }

  snapshot() {
    return clone(this.load());
  }

  persist(nextState) {
    this.state = normalizePlatformState(nextState);
    this.state.updated_at = new Date().toISOString();
    this.state.graph = buildGraph(this.state);
    this.state.executive = buildExecutive(this.state);
    this.store.save(this.state);
    return this.snapshot();
  }

  mutate(mutator) {
    const draft = clone(this.load());
    const result = mutator(draft) || draft;
    return this.persist(result);
  }

  status() {
    const state = this.snapshot();
    return {
      powered_by: 'CYVX',
      creator: 'Dakota Lee Jonsgaard',
      version: '7.0.0',
      timestamp: new Date().toISOString(),
      tenant: state.tenant.name,
      entities: state.entities.length,
      relationships: state.relationships.length,
      agents: state.agents.length,
      goals: state.goals.length,
      initiatives: state.initiatives.length,
      objectives: state.objectives.length,
      constraints: state.constraints.length,
      opportunities: state.opportunities.length,
      missions: state.missions.length,
      simulations: state.simulations.length,
      decisions: state.decisions.length,
      interventions: state.interventions.length,
      outcomes: state.outcomes.length,
      knowledgeRecords: state.knowledgeRecords.length,
      capabilities: state.capabilities.length,
      trusts: state.trusts.length,
      patterns: state.patterns.length,
      recommendations: state.recommendations.length,
      priorities: state.priorities.length,
      reports: state.reports.length,
      commands: state.commands.length,
      events: state.events.length,
      criteria: state.criteria.length,
      realityObjects: state.realityObjects.length,
      significanceRecords: state.significanceRecords.length,
      evolutionRecommendations: state.evolutionRecommendations.length,
      cirMetrics: state.cirMetrics.length,
      workflows: state.workflows.length,
      thesisBeliefs: state.thesisBeliefs.length,
      thesisPredictions: state.thesisPredictions.length,
      thesisExperiments: state.thesisExperiments.length,
      thesisLoops: state.thesisLoops.length,
      decisionMemories: state.decisionMemories.length,
      decisionQualityRecords: state.decisionQualityRecords.length,
      decisionCalibrationRecords: state.decisionCalibrationRecords.length,
      truthRecords: state.truthRecords.length,
      dailyDecisionBriefs: state.dailyDecisionBriefs.length,
    };
  }

  health() {
    const state = this.snapshot();
    const missionCoverage = Math.min(1, state.missions.length / 4);
    const entityCoverage = Math.min(1, state.entities.length / 12);
    const eventCoverage = Math.min(1, state.events.length / 20);
    const score = Number((0.5 + missionCoverage * 0.18 + entityCoverage * 0.16 + eventCoverage * 0.1).toFixed(2));
    return {
      score: score,
      label: score >= 0.8 ? 'healthy' : score >= 0.65 ? 'degraded' : 'at-risk',
      entities: state.entities.length,
      relationships: state.relationships.length,
      missions: state.missions.length,
      simulations: state.simulations.length,
      events: state.events.length,
      trust: state.trusts.length,
    };
  }

  repositoryHealth() {
    return buildRepositoryHealth(this);
  }

  proof() {
    return buildProofReport(this);
  }

  entities() { return this.snapshot().entities; }
  goals() { return this.snapshot().goals; }
  initiatives() { return this.snapshot().initiatives; }
  objectives() { return this.snapshot().objectives; }
  constraints() { return this.snapshot().constraints; }
  opportunities() { return this.snapshot().opportunities; }
  relationships() { return this.snapshot().relationships; }
  agents() { return this.snapshot().agents; }
  missions() { return this.snapshot().missions; }
  simulations() { return this.snapshot().simulations; }
  reports() { return this.snapshot().reports; }
  commands() { return this.snapshot().commands; }
  decisions() { return this.snapshot().decisions; }
  trusts() { return this.snapshot().trusts; }
  patterns() { return this.snapshot().patterns; }
  interventions() { return this.snapshot().interventions; }
  outcomes() { return this.snapshot().outcomes; }
  knowledgeRecords() { return this.snapshot().knowledgeRecords; }
  capabilities() { return this.snapshot().capabilities; }
  trustRecords() { return this.snapshot().trusts; }
  workflows() { return this.snapshot().workflows; }
  events(query = {}) { return filterEvents(this.snapshot().events, query); }

  graph() {
    return buildGraph(this.snapshot());
  }

  executive() {
    return buildExecutive(this.snapshot());
  }

  onboard(input = {}) {
    return this.modelCompany(input);
  }

  createEntity(input = {}) {
    let entity = null;
    this.mutate((state) => {
      entity = createEntity(input);
      state.entities.unshift(entity);
      pushEvent(state, 'entity.created', entity.id, null, 'Entity created: ' + entity.label, { entity: entity, related_entity_ids: [entity.id] });
      return state;
    });
    return entity;
  }

  updateEntity(entityId, patch = {}) {
    let entity = null;
    this.mutate((state) => {
      entity = state.entities.find((item) => item.id === entityId);
      if (!entity) throw new Error('Entity not found: ' + entityId);
      Object.assign(entity, clone(patch), { updated_at: new Date().toISOString() });
      entity.history = Array.isArray(entity.history) ? entity.history : [];
      entity.history.unshift({ at: new Date().toISOString(), patch: clone(patch) });
      pushEvent(state, 'entity.updated', entity.id, null, 'Entity updated: ' + entity.label, { entity: entity, patch: clone(patch), related_entity_ids: [entity.id] });
      return state;
    });
    return entity;
  }

  createRelationship(input = {}) {
    let edge = null;
    this.mutate((state) => {
      edge = createRelationship(input);
      state.relationships.unshift(edge);
      linkRelationshipToEntities(state, edge);
      pushEvent(state, 'relationship.created', edge.id, null, 'Relationship created: ' + edge.from + ' -> ' + edge.to, { relationship: edge, related_entity_ids: [edge.from, edge.to] });
      return state;
    });
    return edge;
  }

  createAgent(input = {}) {
    let agent = null;
    this.mutate((state) => {
      agent = createAgent(input);
      state.agents.unshift(agent);
      pushEvent(state, 'agent.created', agent.id, null, 'Agent created: ' + agent.name, { agent: agent, related_entity_ids: input.related_entity_ids || [] });
      return state;
    });
    return agent;
  }

  createGoal(input = {}) {
    let goal = null;
    this.mutate((state) => {
      goal = createGoal(input);
      goal.constitutional = evaluateConstitution(goal, { evidenceCount: 0, trustScore: goal.trust_score, risk: goal.risk && goal.risk.score || 0, opportunity: goal.opportunity && goal.opportunity.score || 0, learning: 0 });
      state.goals.unshift(goal);
      pushEvent(state, 'goal.created', goal.id, null, 'Goal created: ' + goal.title, { goal: goal, related_entity_ids: goal.entity_ids || [] });
      return state;
    });
    return goal;
  }

  createInitiative(input = {}) {
    let initiative = null;
    this.mutate((state) => {
      initiative = createInitiative(input);
      initiative.constitutional = evaluateConstitution(initiative, { evidenceCount: 0, trustScore: initiative.confidence, risk: initiative.risk && initiative.risk.score || 0, opportunity: initiative.opportunity && initiative.opportunity.score || 0, learning: 0 });
      state.initiatives.unshift(initiative);
      pushEvent(state, 'initiative.created', initiative.id, null, 'Initiative created: ' + initiative.title, { initiative: initiative, related_entity_ids: input.entity_ids || [] });
      return state;
    });
    return initiative;
  }

  createConstraint(input = {}) {
    let constraint = null;
    this.mutate((state) => {
      constraint = createConstraint(input);
      constraint.constitutional = evaluateConstitution(constraint, { evidenceCount: 0, trustScore: constraint.confidence, risk: 1, opportunity: 0, learning: 0 });
      state.constraints.unshift(constraint);
      pushEvent(state, 'constraint.created', constraint.id, null, 'Constraint created: ' + constraint.title, { constraint: constraint, related_entity_ids: constraint.entity_ids || [] });
      return state;
    });
    return constraint;
  }

  createOpportunity(input = {}) {
    let opportunity = null;
    this.mutate((state) => {
      opportunity = createOpportunity(input);
      opportunity.constitutional = evaluateConstitution(opportunity, { evidenceCount: 0, trustScore: opportunity.confidence, risk: opportunity.risk, opportunity: opportunity.opportunity_score, learning: 0 });
      state.opportunities.unshift(opportunity);
      pushEvent(state, 'opportunity.created', opportunity.id, null, 'Opportunity created: ' + opportunity.title, { opportunity: opportunity, related_entity_ids: opportunity.entity_ids || [] });
      return state;
    });
    return opportunity;
  }

  createTrust(input = {}) {
    let trust = null;
    this.mutate((state) => {
      trust = createTrust(input);
      state.trusts.unshift(trust);
      pushEvent(state, 'trust.recorded', trust.id, null, 'Trust recorded: ' + trust.subject_type + ' ' + trust.subject_id, { trust: trust, related_entity_ids: trust.subject_id ? [trust.subject_id] : [] });
      return state;
    });
    return trust;
  }

  createPattern(input = {}) {
    let pattern = null;
    this.mutate((state) => {
      pattern = createPattern(input);
      state.patterns.unshift(pattern);
      pushEvent(state, 'pattern.created', pattern.id, null, 'Pattern recorded: ' + pattern.title, { pattern: pattern, related_entity_ids: pattern.related_entity_ids || [], related_mission_id: (pattern.related_mission_ids || [])[0] || null });
      return state;
    });
    return pattern;
  }

  createObjective(input = {}) {
    let objective = null;
    this.mutate((state) => {
      objective = createObjective(input);
      objective.constitutional = evaluateConstitution(objective, { evidenceCount: (objective.evidence || []).length, trustScore: objective.confidence, risk: objective.target_value != null ? Math.max(0, 1 - Number(objective.target_value || 0)) : 0.2, opportunity: (objective.opportunity_ids || []).length ? 0.7 : 0.4, learning: 0.2 });
      state.objectives.unshift(objective);
      pushEvent(state, 'objective.created', objective.id, null, 'Objective created: ' + objective.title, { objective: objective, related_mission_id: objective.mission_id, related_entity_ids: objective.entity_ids || [] });
      return state;
    });
    return objective;
  }

  createMission(input = {}) {
    let mission = null;
    this.mutate((state) => {
      mission = createMission(input);
      mission.constitutional = evaluateConstitution(mission, { evidenceCount: (mission.evidence || []).length, trustScore: mission.trust_score || mission.confidence, risk: mission.risk || 0.25, opportunity: (mission.opportunities || []).length ? 0.6 : 0.45, learning: (mission.knowledge_record_ids || []).length * 0.15 });
      state.missions.unshift(mission);
      pushEvent(state, 'mission.created', mission.id, null, 'Mission created: ' + mission.title, { mission: mission, related_entity_ids: mission.target_entity_ids || [] });
      return state;
    });
    return mission;
  }

  updateMission(missionId, patch = {}, eventType = 'mission.status_changed') {
    let mission = null;
    this.mutate((state) => {
      mission = state.missions.find((item) => item.id === missionId);
      if (!mission) throw new Error('Mission not found: ' + missionId);
      Object.assign(mission, clone(patch), { updated_at: new Date().toISOString() });
      if (patch.stage) mission.stage = patch.stage;
      if (patch.status) mission.status = patch.status;
      if (patch.progress != null) mission.progress = Number(patch.progress);
      mission.linked_event_ids = Array.isArray(mission.linked_event_ids) ? mission.linked_event_ids : [];
      pushEvent(state, eventType, mission.id, null, 'Mission updated: ' + mission.title + ' -> ' + (patch.stage || patch.status || 'updated'), { mission: mission, patch: clone(patch), related_mission_id: mission.id, related_entity_ids: mission.target_entity_ids || [] });
      return state;
    });
    return mission;
  }

  createDecision(input = {}) {
    let decision = null;
    this.mutate((state) => {
      decision = createDecision(input);
      decision.constitutional = evaluateConstitution(decision, { evidenceCount: (decision.evidence || []).length, trustScore: decision.confidence, risk: decision.risks && decision.risks.length ? 0.4 : 0.2, opportunity: decision.expected_impact && decision.expected_impact.value ? Math.min(1, Number(decision.expected_impact.value) / 5000) : 0.4, learning: (decision.confidence_history || []).length * 0.05 });
      state.decisions.unshift(decision);
      pushEvent(state, 'decision.generated', decision.id, null, 'Decision generated: ' + decision.title, { decision: decision, related_mission_id: decision.related_mission_id, related_entity_ids: decision.related_entity_ids || [] });
      return state;
    });
    return decision;
  }

  createIntervention(input = {}) {
    let intervention = null;
    this.mutate((state) => {
      intervention = createIntervention(input);
      intervention.constitutional = evaluateConstitution(intervention, { evidenceCount: (intervention.evidence || []).length, trustScore: intervention.expected_impact && intervention.expected_impact.value ? Math.min(1, Number(intervention.expected_impact.value) / 5000) : intervention.confidence, risk: Math.abs(intervention.expected_impact && intervention.expected_impact.risk || 0), opportunity: intervention.expected_impact && intervention.expected_impact.value ? Math.min(1, Number(intervention.expected_impact.value) / 5000) : 0.4, learning: 0.15 });
      state.interventions.unshift(intervention);
      pushEvent(state, 'intervention.proposed', intervention.id, null, 'Intervention proposed: ' + intervention.title, { intervention: intervention, related_mission_id: intervention.related_mission_id, related_entity_ids: intervention.related_entity_ids || [] });
      return state;
    });
    return intervention;
  }

  recordOutcome(input = {}) {
    let outcome = null;
    this.mutate((state) => {
      outcome = createOutcome(input);
      const predictedOutcome = input.predicted_outcome != null ? input.predicted_outcome : outcome.predicted_outcome != null ? outcome.predicted_outcome : null;
      const actualOutcome = input.actual_outcome != null ? input.actual_outcome : outcome.actual_outcome != null ? outcome.actual_outcome : null;
      const predictionErrorValue = input.prediction_error != null ? Number(input.prediction_error) : predictionError(predictedOutcome, actualOutcome);
      const predictionVarianceValue = input.prediction_variance != null ? Number(input.prediction_variance) : predictionVariance(predictedOutcome, actualOutcome);
      outcome.predicted_outcome = predictedOutcome;
      outcome.actual_outcome = actualOutcome;
      outcome.reality_gap = {
        predicted: clone(predictedOutcome),
        actual: clone(actualOutcome),
        prediction_error: round3(predictionErrorValue),
        prediction_variance: round3(predictionVarianceValue),
      };
      outcome.prediction_error = round3(predictionErrorValue);
      outcome.prediction_variance = round3(predictionVarianceValue);
      outcome.constitutional = evaluateConstitution(outcome, { evidenceCount: 1, trustScore: input.trust_score != null ? Number(input.trust_score) : 0.5, risk: Math.abs(outcome.risk_delta || 0), opportunity: Math.abs(outcome.delta && outcome.delta.opportunity || 0), learning: 0.25 });
      state.outcomes.unshift(outcome);
      pushEvent(state, 'outcome.measured', outcome.id, null, 'Outcome recorded: ' + outcome.title, { outcome: outcome, related_mission_id: outcome.mission_id, related_entity_ids: outcome.entity_ids || [] });
      return state;
    });
    return outcome;
  }

  createKnowledgeRecord(input = {}) {
    let knowledgeRecord = null;
    this.mutate((state) => {
      knowledgeRecord = createKnowledgeRecord({
        ...input,
        reality_gap: input.reality_gap || input.realityGap || null,
        predicted_outcome: input.predicted_outcome != null ? input.predicted_outcome : null,
        actual_outcome: input.actual_outcome != null ? input.actual_outcome : null,
        prediction_error: input.prediction_error != null ? Number(input.prediction_error) : null,
        prediction_variance: input.prediction_variance != null ? Number(input.prediction_variance) : null,
        trust_impact: input.trust_impact != null ? Number(input.trust_impact) : null,
        cir_impact: input.cir_impact != null ? Number(input.cir_impact) : null,
      });
      knowledgeRecord.constitutional = evaluateConstitution(knowledgeRecord, { evidenceCount: (knowledgeRecord.evidence || []).length, trustScore: 0.75, risk: 0.05, opportunity: 0.6, learning: 0.8 });
      state.knowledgeRecords.unshift(knowledgeRecord);
      pushEvent(state, 'knowledge.recorded', knowledgeRecord.id, null, 'Knowledge recorded: ' + knowledgeRecord.title, { knowledge_record: knowledgeRecord, related_mission_id: knowledgeRecord.mission_id, related_entity_ids: knowledgeRecord.entity_ids || [] });
      return state;
    });
    return knowledgeRecord;
  }

  createCapability(input = {}) {
    let capability = null;
    this.mutate((state) => {
      capability = createCapability(input);
      capability.constitutional = evaluateConstitution(capability, { evidenceCount: (capability.evidence || []).length, trustScore: capability.roi || 0.5, risk: Number(capability.opportunity_cost || 0) / Math.max(1, Number(capability.value_generated || 1)), opportunity: Number(capability.value_generated || 0) / Math.max(1, Number(capability.cost_to_create || 1)), learning: 0.2 });
      state.capabilities.unshift(capability);
      pushEvent(state, 'capability.changed', capability.id, null, 'Capability updated: ' + capability.title, { capability: capability, related_entity_ids: capability.linked_entity_ids || [] });
      return state;
    });
    return capability;
  }

  createSimulation(input = {}) {
    let simulation = null;
    this.mutate((state) => {
      simulation = createSimulation({ ...input, status: input.status || 'queued' });
      simulation.constitutional = evaluateConstitution(simulation, { evidenceCount: (simulation.evidence || []).length, trustScore: simulation.confidence, risk: Math.abs(simulation.risk_delta || 0), opportunity: Math.abs(simulation.opportunity_delta || 0), learning: (simulation.confidence_history || []).length * 0.05 });
      state.simulations.unshift(simulation);
      pushEvent(state, 'simulation.created', simulation.id, null, 'Simulation created: ' + simulation.title, { simulation: simulation, related_mission_id: simulation.linked_mission_id, related_entity_ids: simulation.related_entity_ids || [] });
      return state;
    });
    return simulation;
  }

  runSimulation(input = {}) {
    const relatedMissionId = input.linked_mission_id || input.mission_id || null;
    const assumptions = Array.isArray(input.assumptions) && input.assumptions.length ? input.assumptions : [
      createAssumption({ title: 'Input stability', value: 'Current operating conditions remain stable', confidence: 0.64 }),
      createAssumption({ title: 'Execution fidelity', value: 'The platform can execute the intervention as proposed', confidence: 0.74 }),
    ];
    const confidence = Number(input.confidence != null ? input.confidence : relatedMissionId ? 0.84 : 0.74);
    const riskDelta = Number(input.risk_delta != null ? input.risk_delta : input.risk_impact != null ? input.risk_impact : -0.12);
    const opportunityDelta = Number(input.opportunity_delta != null ? input.opportunity_delta : 0.21);
    const economicImpact = input.economic_impact || {
      cost: Number(input.cost != null ? input.cost : 500),
      value: Number(input.value != null ? input.value : 1800),
      roi: Number(input.roi != null ? input.roi : 2.6),
    };
    const recommendation = input.recommendation || 'Proceed with the lowest-risk, highest-leverage intervention and verify the result.';
    let simulation = null;
    let report = null;
    this.mutate((state) => {
      simulation = createSimulation({
        title: input.title || (input.scenario || 'simulation') + ' simulation',
        scenario: input.scenario || 'generic',
        status: 'completed',
        assumptions: assumptions,
        confidence: confidence,
        roi: Number(input.roi != null ? input.roi : economicImpact.roi || 0),
        risk_delta: riskDelta,
        opportunity_delta: opportunityDelta,
        economic_impact: economicImpact,
        expected_outcome: input.expected_outcome || 'Outcome expected to improve capability and reduce uncertainty.',
        recommendation: recommendation,
        recommended_intervention: input.recommended_intervention || null,
        output: input.output || {
          predicted: true,
          confidence: confidence,
          risk_delta: riskDelta,
          opportunity_delta: opportunityDelta,
        },
        linked_mission_id: relatedMissionId,
        executed_at: new Date().toISOString(),
      });
      state.simulations.unshift(simulation);
      pushEvent(state, 'simulation.created', simulation.id, null, 'Simulation created: ' + simulation.title, { simulation: simulation, related_mission_id: relatedMissionId });
      pushEvent(state, 'simulation.completed', simulation.id, null, 'Simulation completed: ' + simulation.title, { simulation: simulation, related_mission_id: relatedMissionId, assumptions: assumptions, confidence: confidence, risk_delta: riskDelta, opportunity_delta: opportunityDelta });
      if (relatedMissionId) {
        const mission = state.missions.find((item) => item.id === relatedMissionId);
        if (mission) {
          mission.stage = 'simulated';
          mission.status = 'simulated';
          mission.progress = Math.max(Number(mission.progress || 0), 0.35);
          mission.updated_at = new Date().toISOString();
          pushEvent(state, 'mission.status_changed', mission.id, null, 'Mission simulated: ' + mission.title, { mission: mission, related_mission_id: mission.id });
        }
      }
      report = createReport({
        title: (simulation.title || 'simulation') + ' report',
        scope: 'simulation',
        summary: simulation.recommendation,
        findings: [
          'Scenario: ' + simulation.scenario,
          'Confidence: ' + String(simulation.confidence),
          'Risk delta: ' + String(simulation.risk_delta),
          'Opportunity delta: ' + String(simulation.opportunity_delta),
        ],
        recommendations: [simulation.recommendation],
        metrics: {
          confidence: simulation.confidence,
          risk_delta: simulation.risk_delta,
          opportunity_delta: simulation.opportunity_delta,
          roi: simulation.roi,
          cost: simulation.economic_impact.cost,
          value: simulation.economic_impact.value,
        },
        related_mission_id: relatedMissionId,
        source_ids: [simulation.id],
      });
      state.reports.unshift(report);
      pushEvent(state, 'report.generated', report.id, null, 'Simulation report generated: ' + report.title, { report: report, related_mission_id: relatedMissionId, source_ids: [simulation.id] });
      return state;
    });
    const trust = this.createTrust({
      subject_type: 'simulation',
      subject_id: simulation.id,
      trust_score: confidence,
      trust_trend: 0,
      trust_confidence: confidence,
      trust_history: [{ at: new Date().toISOString(), predicted: simulation.expected_outcome, actual: null, prediction_error: 0, prediction_variance: 0, calibration: confidence }],
      trust_source: 'simulation',
      trust_reasons: ['initial simulation confidence'],
    });
    return { simulation: simulation, report: report, trust: trust };
  }

  launchMission(input = {}) {
    const targetIds = Array.isArray(input.target_entity_ids) && input.target_entity_ids.length ? input.target_entity_ids : [input.target_entity_id || 'company'].filter(Boolean);
    const objective = input.objective_id ? this.objectives().find((item) => item.id === input.objective_id) : this.createObjective({
      title: input.objective_title || input.title || 'Mission objective',
      description: input.objective || input.summary || input.title || 'Improve capability and reduce risk.',
      mission_id: null,
      entity_ids: targetIds,
      confidence: input.confidence != null ? input.confidence : 0.67,
    });
    const mission = this.createMission({
      title: input.title || input.prompt || objective.title || 'New mission',
      objective: input.objective || objective.description || '',
      objective_id: objective.id,
      target_entity_ids: targetIds,
      owner_id: input.owner_id || input.agent_id || null,
      assigned_agent_ids: Array.isArray(input.assigned_agent_ids) ? input.assigned_agent_ids : input.agent_id ? [input.agent_id] : [],
      confidence: input.confidence != null ? input.confidence : 0.72,
      roi: input.roi != null ? input.roi : 1.8,
      risk: input.risk != null ? input.risk : 0.25,
      autonomy_level: Number(input.autonomy_level || 2),
      governance: input.governance || {
        approval_required: Number(input.autonomy_level || 2) < 4,
        operator_override: true,
        policy_status: 'review',
        reversible: true,
      },
      stage: 'discovered',
      status: 'draft',
    });
    this.updateMission(mission.id, { stage: 'planned', status: 'planned', progress: 0.15, verification: 'pending' });
    const simulation = this.runSimulation({
      title: mission.title + ' simulation',
      scenario: input.scenario || mission.title,
      linked_mission_id: mission.id,
      assumptions: input.assumptions || [
        createAssumption({ title: 'Objective alignment', value: mission.objective || objective.description, confidence: 0.69 }),
        createAssumption({ title: 'Target entity stability', value: 'Target entities are available for intervention', confidence: 0.63 }),
      ],
      recommendation: input.recommendation || 'Execute the mission with approval and verify the outcome.',
      risk_delta: input.risk_delta != null ? input.risk_delta : -0.08,
      opportunity_delta: input.opportunity_delta != null ? input.opportunity_delta : 0.19,
      economic_impact: input.economic_impact || { cost: 800, value: 2600, roi: 2.25 },
      expected_outcome: input.expected_outcome || 'Capability should increase and uncertainty should fall.',
      confidence: input.confidence != null ? input.confidence : 0.81,
    });
    const decision = this.createDecision({
      title: mission.title + ' decision',
      rationale: input.rationale || 'Simulation indicates the intervention improves capability with manageable risk.',
      evidence: [
        createEvidence({ title: 'Simulation result', source: 'simulation', value: simulation.simulation.id, confidence: simulation.simulation.confidence, linked_event_ids: [] }),
      ],
      assumptions: simulation.simulation.assumptions,
      alternatives: Array.isArray(input.alternatives) && input.alternatives.length ? input.alternatives : [
        { title: 'Delay action', tradeoff: 'lower risk, slower value creation' },
        { title: 'Execute now', tradeoff: 'higher value, requires governance' },
      ],
      risks: Array.isArray(input.risks) && input.risks.length ? input.risks : [
        { title: 'Execution drift', severity: 'medium' },
      ],
      expected_impact: { cost: 800, value: 2600, risk: simulation.simulation.risk_delta, capability: 0.34 },
      confidence: simulation.simulation.confidence,
      related_mission_id: mission.id,
      related_entity_ids: targetIds,
      selected_option: input.selected_option || 'execute',
    });
    const intervention = this.createIntervention({
      title: input.intervention_title || mission.title + ' intervention',
      summary: input.intervention_summary || 'Apply the recommended intervention and verify the result.',
      decision_id: decision.id,
      related_mission_id: mission.id,
      related_entity_ids: targetIds,
      expected_impact: decision.expected_impact,
      reversible: true,
      requires_approval: Number(input.autonomy_level || 2) < 4,
      autonomy_level: Number(input.autonomy_level || 2),
      policy_status: Number(input.autonomy_level || 2) >= 4 ? 'approved' : 'review',
      status: Number(input.autonomy_level || 2) >= 4 ? 'approved' : 'proposed',
    });
    this.updateMission(mission.id, { stage: 'approved', status: 'approved', progress: 0.4, decisions: [decision.id], interventions: [intervention.id], confidence: decision.confidence, risk: Math.abs(simulation.simulation.risk_delta) });
    this.updateMission(mission.id, { stage: 'executing', status: 'executing', progress: 0.65 });
    const predictedValue = Number(simulation.simulation.economic_impact.value || 0);
    const measuredValue = Math.max(0, Math.round(predictedValue * 0.93));
    const actualOutcome = {
      value: measuredValue,
      roi: round3(measuredValue / Math.max(1, Number(simulation.simulation.economic_impact.cost || 1))),
      risk: round3(Number(simulation.simulation.risk_delta || 0) + 0.02),
      opportunity: round3(Number(simulation.simulation.opportunity_delta || 0) - 0.01),
    };
    const outcome = this.recordOutcome({
      title: mission.title + ' outcome',
      mission_id: mission.id,
      decision_id: decision.id,
      entity_ids: targetIds,
      status: 'initialized',
      measured: { state: 'pending', value: null, risk: simulation.simulation.risk_delta, opportunity: simulation.simulation.opportunity_delta },
      expected: { value: simulation.simulation.economic_impact.value, roi: simulation.simulation.economic_impact.roi },
      delta: { risk: simulation.simulation.risk_delta, opportunity: simulation.simulation.opportunity_delta },
      economic_impact: simulation.simulation.economic_impact,
      capability_delta: { created: 0.2, protected: 0.1, improved: 0.22 },
      risk_delta: simulation.simulation.risk_delta,
      value: measuredValue,
      predicted_outcome: simulation.simulation.expected_outcome,
      actual_outcome: actualOutcome,
      prediction_error: Math.abs(predictedValue - measuredValue),
      prediction_variance: round3(Math.abs(predictedValue - measuredValue) / Math.max(1, predictedValue)),
      reality_gap: {
        predicted: simulation.simulation.expected_outcome,
        actual: actualOutcome,
      },
    });
    this.mutate((state) => {
      const simulationTrust = upsertTrustRecord(state, buildCalibrationSample({ subject_type: 'simulation', subject_id: simulation.simulation.id, predicted: simulation.simulation.expected_outcome, actual: outcome.actual_outcome, confidence: simulation.simulation.confidence, trust_source: 'simulation', trust_reasons: ['simulation-to-outcome calibration'] }));
      const decisionTrust = upsertTrustRecord(state, buildCalibrationSample({ subject_type: 'decision', subject_id: decision.id, predicted: decision.predicted_outcome || decision.expected_impact, actual: outcome.actual_outcome, confidence: decision.confidence, trust_source: 'decision', trust_reasons: ['decision-to-outcome calibration'] }));
      const interventionTrust = upsertTrustRecord(state, buildCalibrationSample({ subject_type: 'intervention', subject_id: intervention.id, predicted: intervention.expected_impact, actual: outcome.actual_outcome, confidence: intervention.confidence || decision.confidence, trust_source: 'intervention', trust_reasons: ['intervention-to-outcome calibration'] }));
      const missionTrust = upsertTrustRecord(state, buildCalibrationSample({ subject_type: 'mission', subject_id: mission.id, predicted: simulation.simulation.expected_outcome, actual: outcome.actual_outcome, confidence: mission.confidence, trust_source: 'mission', trust_reasons: ['mission-to-outcome calibration'] }));
      const opportunityTrust = upsertTrustRecord(state, buildCalibrationSample({ subject_type: 'opportunity', subject_id: (input.opportunity_ids || [])[0] || targetIds[0] || mission.id, predicted: simulation.simulation.opportunity_delta, actual: outcome.delta && outcome.delta.opportunity, confidence: simulation.simulation.confidence, trust_source: 'opportunity', trust_reasons: ['opportunity-to-outcome calibration'] }));
      const pattern = createPatternFromMission(mission, outcome, decision);
      pattern.constitutional = evaluateConstitution(pattern, { evidenceCount: 1, trustScore: pattern.trust_score, risk: Math.abs(outcome.risk_delta || 0), opportunity: Math.abs(outcome.delta && outcome.delta.opportunity || 0), learning: 0.6 });
      state.patterns.unshift(pattern);
      pushEvent(state, 'pattern.created', pattern.id, null, 'Pattern recorded: ' + pattern.title, { pattern: pattern, related_entity_ids: pattern.related_entity_ids || [], related_mission_id: mission.id });
      mission.trust_score = missionTrust.trust_score;
      mission.trust_trend = missionTrust.trust_trend;
      mission.trust_history = missionTrust.trust_history;
      mission.constitutional = evaluateConstitution(mission, { evidenceCount: 2, trustScore: missionTrust.trust_score, risk: Math.abs(simulation.simulation.risk_delta), opportunity: Math.abs(simulation.simulation.opportunity_delta), learning: 0.7 });
      return state;
    });
    this.updateMission(mission.id, { stage: 'measured', status: 'measured', progress: 0.82, actual_outcomes: [outcome.id], decisions: [decision.id], interventions: [intervention.id] });
    const knowledgeRecord = this.createKnowledgeRecord({
      title: mission.title + ' lessons learned',
      mission_id: mission.id,
      outcome_id: outcome.id,
      decision_ids: [decision.id],
      entity_ids: targetIds,
      lesson_learned: 'Simulation first reduced uncertainty and produced explainable guidance.',
      what_worked: 'Evidence-backed decision making and staged execution.',
      what_failed: 'None in the initial constitutional loop.',
      future_recommendation: 'Keep simulation before intervention for high-impact actions.',
      capability_delta: outcome.capability_delta,
      predicted_outcome: outcome.predicted_outcome,
      actual_outcome: outcome.actual_outcome,
      prediction_error: outcome.prediction_error,
      prediction_variance: outcome.prediction_variance,
      reality_gap: outcome.reality_gap,
      trust_impact: Number(outcome.prediction_error || 0) > 0 ? -0.05 : 0.04,
      cir_impact: Number(outcome.prediction_error || 0) > 0 ? -0.03 : 0.05,
    });
    const capability = this.createCapability({
      title: mission.title + ' capability',
      current: 0.34,
      potential: 0.78,
      growth_rate: 0.21,
      impact: 0.34,
      owner_id: mission.owner_id,
      linked_entity_ids: targetIds,
      constraints: ['approval', 'verification'],
      opportunities: ['automation', 'cost reduction', 'reliability'],
    });
    const report = createReport({
      title: mission.title + ' executive report',
      scope: 'mission',
      summary: knowledgeRecord.future_recommendation,
      findings: [
        'Mission analyzed ' + mission.target_entity_ids.length + ' target entities.',
        'Decision confidence: ' + String(decision.confidence),
        'Outcome initialized with capability delta.'
      ],
      recommendations: [decision.selected_option || 'execute'],
      metrics: {
        confidence: decision.confidence,
        risk_delta: simulation.simulation.risk_delta,
        opportunity_delta: simulation.simulation.opportunity_delta,
        roi: simulation.simulation.economic_impact.roi,
        capability: capability.current,
      },
      owner_id: mission.owner_id,
      related_mission_id: mission.id,
      source_ids: [simulation.simulation.id, decision.id, intervention.id, outcome.id, knowledgeRecord.id, capability.id],
    });
    this.mutate((state) => {
      state.reports.unshift(report);
      pushEvent(state, 'report.generated', report.id, null, 'Mission report generated: ' + report.title, { report: report, related_mission_id: mission.id });
      return state;
    });
    this.updateMission(mission.id, {
      stage: 'completed',
      status: 'completed',
      progress: 0.95,
      report_id: report.id,
      knowledge_record_ids: [knowledgeRecord.id],
      capability_delta: { created: capability.current, protected: outcome.capability_delta.protected, improved: outcome.capability_delta.improved },
    });
    this.updateMission(mission.id, { stage: 'learned', status: 'learned', progress: 1, verification: 'complete' });
    return {
      mission: this.missions().find((item) => item.id === mission.id),
      objective: objective,
      simulation: simulation.simulation,
      report: report,
      decision: decision,
      intervention: intervention,
      outcome: outcome,
      knowledgeRecord: knowledgeRecord,
      capability: capability,
    };
  }

  createReport(input = {}) {
    let report = null;
    this.mutate((state) => {
      report = createReport(input);
      state.reports.unshift(report);
      pushEvent(state, 'report.generated', report.id, null, 'Report generated: ' + report.title, { report: report, related_mission_id: report.related_mission_id });
      return state;
    });
    return report;
  }

  createCommand(input = {}) {
    let command = null;
    this.mutate((state) => {
      command = createCommand(input);
      state.commands.unshift(command);
      pushEvent(state, 'command.created', command.id, null, 'Command received: ' + command.command, { command: command });
      return state;
    });
    return command;
  }

  createEvent(input = {}) {
    let event = null;
    this.mutate((state) => {
      event = createEvent(input);
      state.events.unshift(event);
      return state;
    });
    return event;
  }

  assignAgent(input = {}) {
    const agentId = input.agent_id || input.agentId || null;
    const missionId = input.mission_id || input.missionId || null;
    let result = null;
    this.mutate((state) => {
      const agent = state.agents.find((item) => item.id === agentId);
      const mission = state.missions.find((item) => item.id === missionId);
      if (!agent || !mission) throw new Error('Agent or mission not found');
      mission.owner_id = agent.id;
      mission.assigned_agent_ids = Array.isArray(mission.assigned_agent_ids) ? mission.assigned_agent_ids : [];
      if (!mission.assigned_agent_ids.includes(agent.id)) mission.assigned_agent_ids.unshift(agent.id);
      agent.status = 'assigned';
      agent.lifecycle = 'deployed';
      agent.updated_at = new Date().toISOString();
      mission.updated_at = new Date().toISOString();
      pushEvent(state, 'agent.assigned', agent.id, null, 'Agent assigned: ' + agent.name + ' -> ' + mission.title, { agent: agent, mission: mission, related_mission_id: mission.id, related_entity_ids: mission.target_entity_ids || [] });
      result = { agent: agent, mission: mission };
      return state;
    });
    return result;
  }

  modelCompany(input = {}) {
    const companyName = input.companyName || input.name || 'CYVXAI-OS';
    const employeeCount = Number(input.employees || 220);
    const cloudSpend = Number(input.cloudSpend || 88000);
    const systems = Number(input.systems || 18);
    const teams = Number(input.teams || 5);

    const company = this.createEntity({
      id: 'company',
      name: companyName,
      label: companyName,
      kind: 'company',
      state: 'operating',
      health: 'healthy',
      economics: { cost: cloudSpend, savings: Math.max(0, employeeCount * 140 - cloudSpend * 0.08), value: employeeCount * 420, roi: 2.4 },
      risk: { score: 0.31, drivers: ['cloud spend', 'operational complexity'] },
      opportunity: { score: 0.81, drivers: ['automation', 'mission compounding'] },
      capability: { current: 0.42, potential: 0.9, growth_rate: 0.18, impact: 0.4 },
      ownership: 'organization',
    });
    const org = this.createEntity({ name: companyName + ' operations', kind: 'organization', state: 'operating', health: 'healthy', economics: { cost: 0, savings: 0, value: employeeCount }, risk: { score: 0.22, drivers: ['manual coordination'] }, opportunity: { score: 0.74, drivers: ['workflow automation'] }, capability: { current: 0.31, potential: 0.88, growth_rate: 0.2, impact: 0.36 } });
    const cloud = this.createEntity({ name: 'Cloud Fabric', kind: 'infrastructure', state: 'operating', health: 'stable', economics: { cost: cloudSpend, savings: 0, value: cloudSpend * 2 }, risk: { score: 0.44, drivers: ['cost volatility'] }, opportunity: { score: 0.78, drivers: ['rightsizing', 'scheduling'] }, capability: { current: 0.35, potential: 0.89, growth_rate: 0.22, impact: 0.44 } });
    const workflows = this.createEntity({ name: 'Workflows', kind: 'workflow', state: 'active', health: 'monitoring', economics: { cost: 0, savings: 0, value: teams * 100 }, risk: { score: 0.28, drivers: ['manual handoffs'] }, opportunity: { score: 0.76, drivers: ['orchestration'] }, capability: { current: 0.29, potential: 0.86, growth_rate: 0.25, impact: 0.35 } });
    const teamsEntity = this.createEntity({ name: 'Teams', kind: 'team', state: 'aligned', health: 'healthy', economics: { cost: 0, savings: 0, value: teams * 80 }, risk: { score: 0.2, drivers: ['siloing'] }, opportunity: { score: 0.67, drivers: ['shared mission'] }, capability: { current: 0.33, potential: 0.83, growth_rate: 0.16, impact: 0.28 } });
    this.createRelationship({ from: company.id, to: org.id, relation: 'contains', strength: 0.95 });
    this.createRelationship({ from: company.id, to: cloud.id, relation: 'depends_on', strength: 0.86 });
    this.createRelationship({ from: company.id, to: workflows.id, relation: 'orchestrates', strength: 0.9 });
    this.createRelationship({ from: company.id, to: teamsEntity.id, relation: 'coordinates', strength: 0.88 });
    this.createRelationship({ from: org.id, to: workflows.id, relation: 'operates', strength: 0.82 });
    this.createRelationship({ from: org.id, to: cloud.id, relation: 'consumes', strength: 0.81 });
    this.createRelationship({ from: teamsEntity.id, to: workflows.id, relation: 'executes', strength: 0.79 });
    const planner = this.createAgent({ name: 'Planner', role: 'mission planner', lifecycle: 'deployed', status: 'ready', capabilities: ['reason', 'plan', 'simulate', 'report'], economics: { cost_per_hour: 75, roi: 4.2 } });
    const operator = this.createAgent({ name: 'Operator', role: 'operations agent', lifecycle: 'deployed', status: 'ready', capabilities: ['monitor', 'assign', 'execute'], economics: { cost_per_hour: 68, roi: 3.7 } });
    const goal = this.createGoal({
      title: 'Earn trustworthy autonomy',
      description: 'Increase understanding, coordination, capability, resilience, and learning while reducing risk.',
      entity_ids: [company.id, cloud.id, workflows.id, teamsEntity.id],
      confidence: 0.86,
      momentum: 0.62,
    });
    const initiative = this.createInitiative({
      title: 'Constitutional coordination initiative',
      goal_id: goal.id,
      description: 'Link strategy to missions, calibrate trust, and learn from outcomes.',
      entity_ids: [company.id, cloud.id, workflows.id, teamsEntity.id],
      confidence: 0.84,
      momentum: 0.58,
    });
    const constraints = [
      this.createConstraint({ title: 'Cloud spend ceiling', kind: 'resource', severity: 'high', blocker: 'Cost volatility limits growth', entity_ids: [cloud.id], objective_id: null, capability_id: null, confidence: 0.9 }),
      this.createConstraint({ title: 'Manual handoffs', kind: 'bottleneck', severity: 'medium', blocker: 'Coordination overhead slows execution', entity_ids: [workflows.id, teamsEntity.id], confidence: 0.86 }),
      this.createConstraint({ title: 'Approval latency', kind: 'policy', severity: 'medium', blocker: 'Governance gates can delay action', entity_ids: [company.id], confidence: 0.78 }),
    ];
    const opportunities = [
      this.createOpportunity({ title: 'Automate onboarding', description: 'Reduce manual setup and shorten time-to-value.', expected_value: 4800, effort: 0.34, risk: 0.2, capability_impact: 0.41, strategic_alignment: 0.9, confidence: 0.87, entity_ids: [workflows.id, teamsEntity.id], objective_id: null }),
      this.createOpportunity({ title: 'Rightsize cloud', description: 'Reduce waste and improve ROI in cloud spend.', expected_value: 9200, effort: 0.42, risk: 0.18, capability_impact: 0.38, strategic_alignment: 0.92, confidence: 0.84, entity_ids: [cloud.id], objective_id: null }),
      this.createOpportunity({ title: 'Strengthen reliability', description: 'Improve resilience and reduce incident cost.', expected_value: 6100, effort: 0.51, risk: 0.24, capability_impact: 0.36, strategic_alignment: 0.88, confidence: 0.8, entity_ids: [workflows.id, cloud.id], objective_id: null }),
    ];
    const objective = this.createObjective({
      title: 'Increase organizational capability',
      description: 'Improve coordination, reduce waste, and compound capability across the enterprise.',
      goal_id: goal.id,
      initiative_id: initiative.id,
      entity_ids: [company.id, cloud.id, workflows.id, teamsEntity.id],
      constraint_ids: constraints.map((item) => item.id),
      opportunity_ids: opportunities.map((item) => item.id),
      confidence: 0.83,
      priority: 1,
      target_metric: 'capability',
      target_value: 0.9,
    });
    const mission = this.launchMission({
      title: 'Model company',
      goal_id: goal.id,
      initiative_id: initiative.id,
      objective_id: objective.id,
      objective: objective.description,
      constraint_ids: constraints.map((item) => item.id),
      opportunity_ids: opportunities.map((item) => item.id),
      target_entity_ids: [company.id, cloud.id, workflows.id, teamsEntity.id],
      owner_id: planner.id,
      assigned_agent_ids: [planner.id, operator.id],
      companyName: companyName,
      employees: employeeCount,
      cloudSpend: cloudSpend,
      systems: systems,
      teams: teams,
      autonomy_level: 3,
      recommendation: 'Use the operational intelligence loop to reduce spend and create compounding capability.',
    });
    this.mutate((state) => {
      const goalRecord = state.goals.find((item) => item.id === goal.id);
      const initiativeRecord = state.initiatives.find((item) => item.id === initiative.id);
      const objectiveRecord = state.objectives.find((item) => item.id === objective.id);
      if (goalRecord) {
        goalRecord.objective_ids = [objective.id];
        goalRecord.initiative_ids = [initiative.id];
        goalRecord.constitutional = evaluateConstitution(goalRecord, { evidenceCount: 2, trustScore: goalRecord.confidence, risk: 0.2, opportunity: 0.8, learning: 0.4 });
      }
      if (initiativeRecord) {
        initiativeRecord.objective_id = objective.id;
        initiativeRecord.mission_ids = [mission.mission.id];
        initiativeRecord.constraint_ids = constraints.map((item) => item.id);
        initiativeRecord.opportunity_ids = opportunities.map((item) => item.id);
        initiativeRecord.constitutional = evaluateConstitution(initiativeRecord, { evidenceCount: 2, trustScore: initiativeRecord.confidence, risk: 0.25, opportunity: 0.8, learning: 0.4 });
      }
      if (objectiveRecord) {
        objectiveRecord.goal_id = goal.id;
        objectiveRecord.initiative_id = initiative.id;
        objectiveRecord.constraint_ids = constraints.map((item) => item.id);
        objectiveRecord.opportunity_ids = opportunities.map((item) => item.id);
        objectiveRecord.constitutional = evaluateConstitution(objectiveRecord, { evidenceCount: 2, trustScore: objectiveRecord.confidence, risk: 0.2, opportunity: 0.82, learning: 0.3 });
      }
      return state;
    });
    const executive = this.executive();
    return {
      platform: this.snapshot(),
      model: {
        company: company,
        organization: org,
        cloud: cloud,
        workflows: workflows,
        teams: teamsEntity,
        goal: goal,
        initiative: initiative,
        constraints: constraints,
        opportunities: opportunities,
        objective: objective,
        mission: mission.mission,
        simulation: mission.simulation,
        decision: mission.decision,
        intervention: mission.intervention,
        outcome: mission.outcome,
        knowledgeRecord: mission.knowledgeRecord,
        capability: mission.capability,
        report: mission.report,
      },
      executive: executive,
    };
  }

  command(input = {}) {
    const text = typeof input === 'string' ? input : input.command || input.prompt || input.natural_language || '';
    const lower = String(text).trim().toLowerCase();
    const command = this.createCommand({
      command: lower || 'command',
      natural_language: text,
      status: 'received',
      payload: clone(input),
      actor_id: input.actor_id || input.agent_id || null,
      target_id: input.target_id || input.mission_id || input.entity_id || null,
    });

    let result = { status: 'accepted', command: command };
    if (lower.includes('model my company') || lower === 'model company' || lower === 'model-company' || lower.includes('onboard')) {
      result = this.modelCompany(input);
    } else if (lower.includes('simulate')) {
      result = this.runSimulation({
        scenario: input.scenario || lower.replace(/^simulates*/, '') || 'generic',
        recommendation: input.recommendation || 'Add verification gates',
        linked_mission_id: input.mission_id || null,
        confidence: input.confidence,
      });
    } else if (lower.includes('mission')) {
      result = this.launchMission(input);
    } else if (lower.includes('assign')) {
      result = this.assignAgent(input);
    }

    this.mutate((state) => {
      const stored = state.commands.find((item) => item.id === command.id);
      if (stored) {
        stored.status = 'executed';
        stored.result = clone(result);
        stored.updated_at = new Date().toISOString();
        pushEvent(state, 'command.executed', stored.id, null, 'Command executed: ' + stored.command, { command: stored, result: result });
      }
      return state;
    });

    return result;
  }

  discover(input = {}) {
    const state = this.snapshot();
    const risks = state.entities.slice(0, 8).map((entity) => ({
      entity_id: entity.id,
      title: entity.label + ' risk',
      score: Number(entity.risk && entity.risk.score || 0),
      reason: (entity.risk && entity.risk.drivers || []).join(', ') || 'unknown',
    })).sort((a, b) => b.score - a.score);
    const opportunities = state.entities.slice(0, 8).map((entity) => ({
      entity_id: entity.id,
      title: entity.label + ' opportunity',
      score: Number(entity.opportunity && entity.opportunity.score || 0),
      reason: (entity.opportunity && entity.opportunity.drivers || []).join(', ') || 'unknown',
    })).sort((a, b) => b.score - a.score);
    const constraints = state.constraints.slice(0, 8).map((constraint) => ({
      id: constraint.id,
      title: constraint.title,
      kind: constraint.kind,
      severity: constraint.severity,
      blocker: constraint.blocker,
      confidence: constraint.confidence,
    })).sort((a, b) => String(b.severity).localeCompare(String(a.severity)));
    return {
      input: clone(input),
      risks: risks,
      opportunities: opportunities,
      constraints: constraints,
      trust: state.trusts.slice(0, 6).map((trust) => ({
        subject_type: trust.subject_type,
        subject_id: trust.subject_id,
        trust_score: trust.trust_score,
        trust_trend: trust.trust_trend,
      })),
      summary: {
        topRisk: risks[0] || null,
        topOpportunity: opportunities[0] || null,
        topConstraint: constraints[0] || null,
      },
    };
  }

  workflow(input = {}) {
    const state = this.snapshot();
    const workflow = state.workflows[0] || createWorkflow({
      name: input.name || 'mission loop',
      trigger: input.trigger || 'event',
      steps: ['observe', 'model', 'simulate', 'decide', 'execute', 'measure', 'learn'],
      status: 'active',
    });
    return workflow;
  }
}

function buildRepositoryHealth(kernel) {
  try {
    const repoRoot = kernel.options && kernel.options.repoRoot ? kernel.options.repoRoot : path.join(__dirname, '..', '..');
    const statusLines = execFileSync('git', ['-C', repoRoot, 'status', '--porcelain=v1', '--branch'], { encoding: 'utf8' }).trim().split(/\n/).filter(Boolean);
    const head = execFileSync('git', ['-C', repoRoot, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
    const commit = execFileSync('git', ['-C', repoRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const branchLine = statusLines[0] || '';
    const branchMatch = branchLine.match(/^##s+([^.s]+)(?:...([^s]+))?(.*)$/);
    const dirtyFiles = statusLines.slice(1).map((line) => line.slice(3).trim()).filter(Boolean);
    return {
      clean: dirtyFiles.length === 0,
      branch: branchMatch ? branchMatch[1] : 'main',
      upstream: branchMatch && branchMatch[2] ? branchMatch[2] : null,
      head: head,
      commit: commit,
      dirty_files: dirtyFiles,
      status_lines: statusLines,
    };
  } catch (error) {
    return {
      clean: false,
      error: error.message,
    };
  }
}

function buildProofReport(kernel) {
  const snapshot = kernel.snapshot();
  const repositoryHealth = kernel.repositoryHealth();
  const observations = Array.isArray(snapshot.observations) ? snapshot.observations : [];
  const missions = Array.isArray(snapshot.missions) ? snapshot.missions : [];
  const outcomes = Array.isArray(snapshot.outcomes) ? snapshot.outcomes : [];
  const knowledgeRecords = Array.isArray(snapshot.knowledgeRecords) ? snapshot.knowledgeRecords : [];
  const trusts = Array.isArray(snapshot.trusts) ? snapshot.trusts : [];
  const recommendations = Array.isArray(snapshot.recommendations) ? snapshot.recommendations : [];
  const latestOutcome = outcomes[0] || null;
  const latestKnowledge = knowledgeRecords[0] || null;
  const latestTrust = trusts[0] || null;
  const predicted = latestOutcome ? latestOutcome.predicted_outcome || null : null;
  const actual = latestOutcome ? latestOutcome.actual_outcome || null : null;
  const predictionErrorValue = latestOutcome && typeof latestOutcome.prediction_error === 'number' ? latestOutcome.prediction_error : predictionError(predicted, actual);
  const predictionVarianceValue = latestOutcome && typeof latestOutcome.prediction_variance === 'number' ? latestOutcome.prediction_variance : predictionVariance(predicted, actual);
  const realityGap = {
    predicted: clone(predicted),
    actual: clone(actual),
    prediction_error: round3(predictionErrorValue),
    prediction_variance: round3(predictionVarianceValue),
    confidence: latestOutcome && typeof latestOutcome.confidence === 'number' ? round3(latestOutcome.confidence) : null,
    explanation: latestKnowledge && latestKnowledge.lesson_learned ? latestKnowledge.lesson_learned : '',
    lesson: latestKnowledge && latestKnowledge.lesson_learned ? latestKnowledge.lesson_learned : '',
    trust_impact: latestKnowledge && typeof latestKnowledge.trust_impact === 'number' ? round3(latestKnowledge.trust_impact) : null,
    cir_impact: latestKnowledge && typeof latestKnowledge.cir_impact === 'number' ? round3(latestKnowledge.cir_impact) : null,
  };
  const proofScore = round3(clamp01(
    (repositoryHealth.clean ? 0.2 : 0.05)
    + Math.min(0.2, missions.length * 0.05)
    + Math.min(0.2, observations.length * 0.04)
    + Math.min(0.2, outcomes.length * 0.05)
    + Math.min(0.2, knowledgeRecords.length * 0.04)
    + Math.min(0.1, recommendations.length * 0.02)
  ));
  return {
    proof_score: proofScore,
    repository_health: repositoryHealth,
    counts: {
      observations: observations.length,
      missions: missions.length,
      outcomes: outcomes.length,
      knowledge_records: knowledgeRecords.length,
      trusts: trusts.length,
      recommendations: recommendations.length,
    },
    latest: {
      observation: observations[0] || null,
      outcome: latestOutcome,
      knowledge_record: latestKnowledge,
      trust: latestTrust,
    },
    reality_gap: realityGap,
    evidence: {
      has_real_repository_data: Boolean(repositoryHealth.commit),
      has_real_outcome_record: Boolean(latestOutcome),
      has_learning_record: Boolean(latestKnowledge),
      has_cir_feedback: Boolean(snapshot.cirMetrics && snapshot.cirMetrics.length),
    },
    cir: snapshot.cirMetrics && snapshot.cirMetrics[0] ? snapshot.cirMetrics[0] : null,
  };
}

function pushEvent(state, eventType, subjectId, actorId, summary, payload = {}) {
  const event = createEvent({
    event_type: eventType,
    subject_id: subjectId || null,
    actor_id: actorId || null,
    summary: summary || '',
    payload: payload || {},
    severity: payload.severity || 'info',
    source: payload.source || 'cyvx',
    related_entity_ids: payload.related_entity_ids || [],
    related_mission_id: payload.related_mission_id || null,
  });
  state.events.unshift(event);
  return event;
}

function evaluateConstitution(record = {}, context = {}) {
  const evidenceCount = Number(context.evidenceCount || 0);
  const trustScore = clamp01(context.trustScore != null ? context.trustScore : record.confidence != null ? record.confidence : 0.5);
  const risk = clamp01(context.risk != null ? context.risk : Number(record.risk && record.risk.score != null ? record.risk.score : record.risk_delta != null ? Math.abs(record.risk_delta) : 0.25));
  const opportunity = clamp01(context.opportunity != null ? context.opportunity : Number(record.opportunity && record.opportunity.score != null ? record.opportunity.score : record.opportunity_delta != null ? Math.abs(record.opportunity_delta) : 0.35));
  const capability = clamp01(context.capability != null ? context.capability : Number(record.capability && record.capability.impact != null ? record.capability.impact : record.capability_delta && record.capability_delta.improved != null ? record.capability_delta.improved : 0.4));
  const learning = clamp01(context.learning != null ? context.learning : Array.isArray(record.trust_history) ? record.trust_history.length / 10 : 0.1);
  const coordination = clamp01(context.coordination != null ? context.coordination : Array.isArray(record.relationships) ? Math.min(1, record.relationships.length / 5) : Array.isArray(record.target_entity_ids) ? Math.min(1, record.target_entity_ids.length / 5) : 0.4);
  const understanding = clamp01(context.understanding != null ? context.understanding : Math.min(1, trustScore * 0.6 + evidenceCount * 0.08 + learning * 0.12));
  const resilience = clamp01(context.resilience != null ? context.resilience : 1 - risk * 0.7 + learning * 0.15);
  const score = clamp01((understanding + coordination + capability + resilience + learning) / 5);
  const trend = Number(context.trend != null ? context.trend : ((trustScore + learning + opportunity) / 3 - risk / 2).toFixed(2));
  return {
    understanding: round3(understanding),
    coordination: round3(coordination),
    capability: round3(capability),
    resilience: round3(resilience),
    learning: round3(learning),
    score: round3(score),
    trend: round3(trend),
    risk: round3(risk),
  };
}

function buildCalibrationSample(options = {}) {
  const predicted = options.predicted != null ? options.predicted : null;
  const actual = options.actual != null ? options.actual : null;
  const confidence = clamp01(options.confidence != null ? options.confidence : 0.5);
  const error = predictionError(predicted, actual);
  const variance = predictionVariance(predicted, actual);
  const calibration = clamp01(1 - error);
  const trustScore = clamp01((confidence * 0.55) + (calibration * 0.45));
  return {
    subject_type: options.subject_type || 'unknown',
    subject_id: options.subject_id || null,
    predicted: clone(predicted),
    actual: clone(actual),
    prediction_error: round3(error),
    prediction_variance: round3(variance),
    confidence: round3(confidence),
    trust_score: round3(trustScore),
    trust_trend: round3((calibration - error) / 2),
    trust_confidence: round3((trustScore + confidence) / 2),
    trust_source: options.trust_source || 'calibration',
    trust_reasons: Array.isArray(options.trust_reasons) ? clone(options.trust_reasons) : [],
    calibration_entry: {
      at: new Date().toISOString(),
      predicted: clone(predicted),
      actual: clone(actual),
      prediction_error: round3(error),
      prediction_variance: round3(variance),
      calibration: round3(calibration),
      confidence: round3(confidence),
    },
  };
}

function predictionError(predicted, actual) {
  const diff = predictionVariance(predicted, actual);
  return clamp01(diff / 100);
}

function predictionVariance(predicted, actual) {
  if (predicted == null && actual == null) return 0;
  if (typeof predicted === 'number' && typeof actual === 'number') {
    return Math.abs(predicted - actual);
  }
  if (predicted && actual && typeof predicted === 'object' && typeof actual === 'object') {
    const keys = new Set([...Object.keys(predicted), ...Object.keys(actual)]);
    let total = 0;
    let count = 0;
    for (const key of keys) {
      const a = Number(predicted[key]);
      const b = Number(actual[key]);
      if (!Number.isNaN(a) && !Number.isNaN(b)) {
        total += Math.abs(a - b);
        count += 1;
      }
    }
    return count ? total / count : 0;
  }
  return 1;
}

function upsertTrustRecord(state, sample) {
  const trust = createTrust({
    subject_type: sample.subject_type,
    subject_id: sample.subject_id,
    trust_score: sample.trust_score,
    trust_trend: sample.trust_trend,
    trust_confidence: sample.trust_confidence,
    calibration_count: 1,
    last_calibrated_at: sample.calibration_entry.at,
    confidence_error: sample.prediction_error,
    prediction_error: sample.prediction_error,
    trust_source: sample.trust_source,
    trust_reasons: sample.trust_reasons,
    trust_history: [sample.calibration_entry],
  });
  const existing = state.trusts.find((item) => item.subject_type === trust.subject_type && item.subject_id === trust.subject_id);
  if (existing) {
    existing.trust_history = Array.isArray(existing.trust_history) ? existing.trust_history : [];
    existing.trust_history.unshift(sample.calibration_entry);
    existing.trust_history = existing.trust_history.slice(0, 20);
    existing.calibration_count = Number(existing.calibration_count || 0) + 1;
    existing.trust_score = round3((Number(existing.trust_score || 0.5) * 0.7) + (sample.trust_score * 0.3));
    existing.trust_trend = round3(((Number(existing.trust_trend || 0) * 0.6) + (sample.trust_trend * 0.4)));
    existing.trust_confidence = round3((Number(existing.trust_confidence || 0.5) * 0.6) + (sample.trust_confidence * 0.4));
    existing.last_calibrated_at = sample.calibration_entry.at;
    existing.confidence_error = round3((Number(existing.confidence_error || 0) * 0.5) + (sample.prediction_error * 0.5));
    existing.prediction_error = sample.prediction_error;
    existing.trust_reasons = sample.trust_reasons;
    existing.updated_at = new Date().toISOString();
    pushEvent(state, 'trust.calibrated', existing.id, null, 'Trust calibrated: ' + existing.subject_type + ' ' + String(existing.subject_id || ''), { trust: existing, related_entity_ids: existing.subject_id ? [existing.subject_id] : [] });
    return existing;
  }
  state.trusts.unshift(trust);
  pushEvent(state, 'trust.recorded', trust.id, null, 'Trust recorded: ' + trust.subject_type + ' ' + String(trust.subject_id || ''), { trust: trust, related_entity_ids: trust.subject_id ? [trust.subject_id] : [] });
  return trust;
}

function createPatternFromMission(mission, outcome, decision) {
  const success = Number(outcome && outcome.capability_delta && outcome.capability_delta.improved || 0) > 0;
  return createPattern({
    title: mission.title + ' pattern',
    pattern_type: success ? 'recurring-success' : 'recurring-failure',
    description: success ? 'Simulation-backed mission pattern that improved capability.' : 'Mission pattern with insufficient capability growth.',
    frequency: 1,
    confidence: decision ? Number(decision.confidence || 0.5) : 0.5,
    impact: success ? 0.7 : 0.3,
    capability_contribution: Number(outcome && outcome.capability_delta && outcome.capability_delta.improved || 0),
    related_entity_ids: Array.isArray(mission.target_entity_ids) ? mission.target_entity_ids : [],
    related_mission_ids: [mission.id],
    trust_score: decision ? Number(decision.confidence || 0.5) : 0.5,
    summary: success ? 'Mission pattern increases capability under simulation-first governance.' : 'Mission pattern requires tighter constraints and better evidence.',
  });
}

function round3(value) {
  return Number(Number(value || 0).toFixed(3));
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value || 0)));
}

function linkRelationshipToEntities(state, relationship) {
  const from = state.entities.find((item) => item.id === relationship.from);
  const to = state.entities.find((item) => item.id === relationship.to);
  if (from) {
    from.relationships = Array.isArray(from.relationships) ? from.relationships : [];
    if (!from.relationships.includes(relationship.id)) from.relationships.unshift(relationship.id);
  }
  if (to) {
    to.relationships = Array.isArray(to.relationships) ? to.relationships : [];
    if (!to.relationships.includes(relationship.id)) to.relationships.unshift(relationship.id);
  }
}

function filterEvents(events, query = {}) {
  const subjectId = query.subject_id || query.subjectId || query.entity_id || query.entityId || null;
  const missionId = query.mission_id || query.missionId || query.related_mission_id || null;
  const eventType = query.event_type || query.type || null;
  let filtered = Array.isArray(events) ? events.slice() : [];
  if (subjectId) filtered = filtered.filter((event) => event.subject_id === subjectId || (event.payload && event.payload.entity && event.payload.entity.id === subjectId));
  if (missionId) filtered = filtered.filter((event) => event.related_mission_id === missionId || (event.payload && event.payload.related_mission_id === missionId));
  if (eventType) filtered = filtered.filter((event) => event.event_type === eventType || event.type === eventType);
  const limit = Number(query.limit || query.top || 0);
  return limit > 0 ? filtered.slice(0, limit) : filtered;
}

function buildGraph(state) {
  const nodes = [];
  const entityNodes = state.entities.map((entity) => ({
    id: entity.id,
    label: entity.label,
    kind: entity.kind,
    state: entity.state,
    health: entity.health,
    risk: entity.risk,
    opportunity: entity.opportunity,
    capability: entity.capability,
  }));
  const goalNodes = state.goals.map((goal) => ({ id: goal.id, label: goal.title, kind: 'goal', state: goal.state, trust_score: goal.trust_score, constitutional: goal.constitutional }));
  const initiativeNodes = state.initiatives.map((initiative) => ({ id: initiative.id, label: initiative.title, kind: 'initiative', state: initiative.state, trust_score: initiative.confidence, constitutional: initiative.constitutional }));
  const objectiveNodes = state.objectives.map((objective) => ({ id: objective.id, label: objective.title, kind: 'objective', state: objective.state, constitutional: objective.constitutional }));
  const constraintNodes = state.constraints.map((constraint) => ({ id: constraint.id, label: constraint.title, kind: 'constraint', state: constraint.state, severity: constraint.severity, constitutional: constraint.constitutional }));
  const opportunityNodes = state.opportunities.map((opportunity) => ({ id: opportunity.id, label: opportunity.title, kind: 'opportunity', state: opportunity.state, opportunity_score: opportunity.opportunity_score, constitutional: opportunity.constitutional }));
  const patternNodes = state.patterns.map((pattern) => ({ id: pattern.id, label: pattern.title, kind: 'pattern', state: pattern.pattern_type, trust_score: pattern.trust_score, constitutional: pattern.constitutional }));
  const recommendationNodes = state.recommendations.map((recommendation) => ({ id: recommendation.id, label: recommendation.title, kind: 'recommendation', state: recommendation.status || recommendation.state, constitutional: recommendation.constitutional }));
  const priorityNodes = state.priorities.map((priority) => ({ id: priority.id, label: priority.title || (priority.targetType + ':' + priority.targetId), kind: 'priority', state: priority.status || 'active', constitutional: priority.constitutional }));
  const trustNodes = state.trusts.map((trust) => ({ id: trust.id, label: trust.subject_type + ':' + String(trust.subject_id || 'unknown'), kind: 'trust', state: 'tracked', trust_score: trust.trust_score, constitutional: trust.constitutional }));
  const missionNodes = state.missions.map((mission) => ({ id: mission.id, label: mission.title, kind: 'mission', state: mission.stage, constitutional: mission.constitutional }));
  nodes.push(...entityNodes, ...goalNodes, ...initiativeNodes, ...objectiveNodes, ...constraintNodes, ...opportunityNodes, ...patternNodes, ...recommendationNodes, ...priorityNodes, ...trustNodes, ...missionNodes);
  const edges = state.relationships.map((relationship) => ({
    id: relationship.id,
    from: relationship.from,
    to: relationship.to,
    relation: relationship.relation,
    strength: relationship.strength,
    impact: relationship.impact,
  }));
  state.goals.forEach((goal) => {
    (goal.objective_ids || []).forEach((objectiveId) => edges.push({ id: goal.id + '-' + objectiveId, from: goal.id, to: objectiveId, relation: 'guides', strength: 0.82, impact: 0.3 }));
    (goal.initiative_ids || []).forEach((initiativeId) => edges.push({ id: goal.id + '-' + initiativeId, from: goal.id, to: initiativeId, relation: 'drives', strength: 0.84, impact: 0.3 }));
  });
  state.initiatives.forEach((initiative) => {
    if (initiative.goal_id) edges.push({ id: initiative.id + '-' + initiative.goal_id, from: initiative.id, to: initiative.goal_id, relation: 'supports', strength: 0.83, impact: 0.28 });
    if (initiative.objective_id) edges.push({ id: initiative.id + '-' + initiative.objective_id, from: initiative.id, to: initiative.objective_id, relation: 'focuses', strength: 0.84, impact: 0.28 });
    (initiative.mission_ids || []).forEach((missionId) => edges.push({ id: initiative.id + '-' + missionId, from: initiative.id, to: missionId, relation: 'orchestrates', strength: 0.78, impact: 0.24 }));
  });
  state.objectives.forEach((objective) => {
    if (objective.goal_id) edges.push({ id: objective.id + '-' + objective.goal_id, from: objective.id, to: objective.goal_id, relation: 'aligns_to', strength: 0.8, impact: 0.24 });
    if (objective.initiative_id) edges.push({ id: objective.id + '-' + objective.initiative_id, from: objective.id, to: objective.initiative_id, relation: 'implements', strength: 0.8, impact: 0.24 });
    (objective.entity_ids || []).forEach((entityId) => edges.push({ id: objective.id + '-' + entityId, from: objective.id, to: entityId, relation: 'targets', strength: 0.7, impact: 0.2 }));
    (objective.constraint_ids || []).forEach((constraintId) => edges.push({ id: objective.id + '-' + constraintId, from: constraintId, to: objective.id, relation: 'limits', strength: 0.7, impact: 0.2 }));
    (objective.opportunity_ids || []).forEach((opportunityId) => edges.push({ id: objective.id + '-' + opportunityId, from: objective.id, to: opportunityId, relation: 'pursues', strength: 0.72, impact: 0.22 }));
  });
  state.constraints.forEach((constraint) => {
    (constraint.entity_ids || []).forEach((entityId) => edges.push({ id: constraint.id + '-' + entityId, from: constraint.id, to: entityId, relation: 'blocks', strength: 0.8, impact: 0.35 }));
    if (constraint.objective_id) edges.push({ id: constraint.id + '-' + constraint.objective_id, from: constraint.id, to: constraint.objective_id, relation: 'limits', strength: 0.8, impact: 0.35 });
    if (constraint.capability_id) edges.push({ id: constraint.id + '-' + constraint.capability_id, from: constraint.id, to: constraint.capability_id, relation: 'limits', strength: 0.8, impact: 0.35 });
  });
  state.opportunities.forEach((opportunity) => {
    (opportunity.entity_ids || []).forEach((entityId) => edges.push({ id: opportunity.id + '-' + entityId, from: opportunity.id, to: entityId, relation: 'enables', strength: 0.76, impact: 0.24 }));
    if (opportunity.objective_id) edges.push({ id: opportunity.id + '-' + opportunity.objective_id, from: opportunity.id, to: opportunity.objective_id, relation: 'supports', strength: 0.76, impact: 0.24 });
    if (opportunity.mission_id) edges.push({ id: opportunity.id + '-' + opportunity.mission_id, from: opportunity.id, to: opportunity.mission_id, relation: 'suggests', strength: 0.76, impact: 0.24 });
  });
  state.trusts.forEach((trust) => {
    if (trust.subject_id) edges.push({ id: trust.id + '-' + trust.subject_id, from: trust.id, to: trust.subject_id, relation: 'calibrates', strength: trust.trust_score || 0.5, impact: 0.15 });
  });
  state.patterns.forEach((pattern) => {
    (pattern.related_entity_ids || []).forEach((entityId) => edges.push({ id: pattern.id + '-' + entityId, from: pattern.id, to: entityId, relation: 'recurs', strength: pattern.confidence || 0.5, impact: pattern.capability_contribution || 0.2 }));
    (pattern.related_mission_ids || []).forEach((missionId) => edges.push({ id: pattern.id + '-' + missionId, from: pattern.id, to: missionId, relation: 'learned_from', strength: pattern.confidence || 0.5, impact: pattern.capability_contribution || 0.2 }));
  });
  state.recommendations.forEach((recommendation) => {
    (recommendation.source_ids || []).forEach((sourceId) => edges.push({ id: recommendation.id + '-' + sourceId, from: recommendation.id, to: sourceId, relation: 'derived_from', strength: recommendation.confidence || 0.5, impact: recommendation.expectedImpact && Number(recommendation.expectedImpact.value != null ? recommendation.expectedImpact.value : recommendation.expected_impact && recommendation.expected_impact.value != null ? recommendation.expected_impact.value : 0) / 10000 || 0.2 }));
  });
  state.priorities.forEach((priority) => {
    (priority.source_ids || []).forEach((sourceId) => edges.push({ id: priority.id + '-' + sourceId, from: priority.id, to: sourceId, relation: 'ranked_from', strength: priority.score || 0.5, impact: priority.score || 0.5 }));
  });
  state.missions.forEach((mission) => {
    if (mission.goal_id) edges.push({ id: mission.id + '-' + mission.goal_id, from: mission.id, to: mission.goal_id, relation: 'advances', strength: 0.82, impact: 0.26 });
    if (mission.initiative_id) edges.push({ id: mission.id + '-' + mission.initiative_id, from: mission.id, to: mission.initiative_id, relation: 'implements', strength: 0.82, impact: 0.26 });
    if (mission.objective_id) edges.push({ id: mission.id + '-' + mission.objective_id, from: mission.id, to: mission.objective_id, relation: 'drives', strength: 0.8, impact: 0.3 });
    (mission.constraint_ids || []).forEach((constraintId) => edges.push({ id: mission.id + '-' + constraintId, from: constraintId, to: mission.id, relation: 'blocks', strength: 0.7, impact: 0.25 }));
    (mission.opportunity_ids || []).forEach((opportunityId) => edges.push({ id: mission.id + '-' + opportunityId, from: mission.id, to: opportunityId, relation: 'pursues', strength: 0.78, impact: 0.25 }));
    (mission.target_entity_ids || []).forEach((entityId) => edges.push({ id: mission.id + '-' + entityId, from: mission.id, to: entityId, relation: 'targets', strength: 0.65, impact: 0.25 }));
  });
  return {
    nodes: nodes,
    edges: dedupeById(edges),
    summary: {
      entityCount: state.entities.length,
      relationshipCount: state.relationships.length,
      missionCount: state.missions.length,
      objectiveCount: state.objectives.length,
      goalCount: state.goals.length,
      initiativeCount: state.initiatives.length,
      constraintCount: state.constraints.length,
      opportunityCount: state.opportunities.length,
      trustCount: state.trusts.length,
      patternCount: state.patterns.length,
      riskCount: state.entities.filter((entity) => Number(entity.risk && entity.risk.score || 0) > 0.3).length,
      opportunitySignalCount: state.entities.filter((entity) => Number(entity.opportunity && entity.opportunity.score || 0) > 0.5).length,
    },
  };
}

function buildExecutive(state) {
  const topMission = state.missions[0] || null;
  const topSimulation = state.simulations[0] || null;
  const topDecision = state.decisions[0] || null;
  const topOutcome = state.outcomes[0] || null;
  const topKnowledge = state.knowledgeRecords[0] || null;
  const topCapability = state.capabilities[0] || null;
  const topGoal = state.goals[0] || null;
  const topInitiative = state.initiatives[0] || null;
  const topOpportunity = state.opportunities[0] || null;
  const topConstraint = state.constraints[0] || null;
  const topTrust = state.trusts[0] || null;
  const topPattern = state.patterns[0] || null;
  const topRecommendation = state.recommendations[0] || null;
  const topPriority = state.priorities[0] || null;
  const intelligence = buildIntelligenceSummary(state);
  const costs = state.entities.reduce((sum, entity) => sum + Number(entity.economics && entity.economics.cost || 0), 0);
  const savings = state.entities.reduce((sum, entity) => sum + Number(entity.economics && entity.economics.savings || 0), 0);
  const capabilityValue = topCapability ? Number(topCapability.current || 0) : 0;
  const trustValues = state.trusts.map((item) => Number(item.trust_score || 0.5));
  const averageTrust = trustValues.length ? trustValues.reduce((sum, value) => sum + value, 0) / trustValues.length : 0.5;
  const calibrationAccuracy = topTrust ? Number(topTrust.trust_score || 0.5) : averageTrust;
  const constitutionalEvaluation = evaluateConstitution({
    confidence: topMission ? topMission.confidence : 0.5,
    risk: topMission ? topMission.risk : 0.25,
    opportunity: topOpportunity ? topOpportunity.opportunity_score : 0.4,
    capability: capabilityValue,
    trust_history: state.trusts,
    relationships: state.relationships,
  }, {
    evidenceCount: state.events.length,
    trustScore: averageTrust,
    risk: topConstraint ? Number(topConstraint.severity === 'high' ? 0.85 : topConstraint.severity === 'medium' ? 0.6 : 0.35) : 0.25,
    opportunity: topOpportunity ? Number(topOpportunity.opportunity_score || topOpportunity.expected_value / 1000 || 0.4) : 0.4,
    learning: state.knowledgeRecords.length / Math.max(1, state.missions.length),
  });
  return {
    answers: {
      whatIsHappening: state.tenant.name + ' is modeled as a live operating system with ' + state.entities.length + ' entities and ' + state.missions.length + ' missions.',
      why: topDecision ? topDecision.rationale : 'The platform emphasizes evidence, explanation, and measured outcomes.',
      whatNext: topMission ? topMission.title + ' is at stage ' + topMission.stage + '.' : 'Create the first mission.',
      whatShouldWeDo: topSimulation ? topSimulation.recommendation : 'Run a simulation before intervening.',
      whatCanCyvxAutomate: 'Discovery, planning, simulation, decisions, execution, verification, reporting, and learning.',
      whatCreatesMostValue: 'Capability growth and risk-adjusted value. Net efficiency is ' + Math.max(0, Math.round(savings - costs)) + '.',
      whatLimitsSuccess: topConstraint ? topConstraint.title : 'No dominant constraint detected.',
      whatOpportunitiesMatter: topOpportunity ? topOpportunity.title : 'No high-priority opportunity detected.',
      whatCanWeTrust: 'Average trust ' + round3(averageTrust) + ' calibrated against ' + state.trusts.length + ' trust records.',
    },
    recommendations: state.decisions.slice(0, 4).map((decision) => ({
      id: decision.id,
      title: decision.title,
      confidence: decision.confidence,
      trust: decision.trust_score != null ? decision.trust_score : averageTrust,
      roi: Number(decision.expected_impact && decision.expected_impact.value || 0),
    })),
    opportunities: state.opportunities.slice(0, 6).map((opportunity) => ({
      id: opportunity.id,
      title: opportunity.title,
      score: opportunity.opportunity_score,
      confidence: opportunity.confidence,
      value: opportunity.expected_value,
      effort: opportunity.effort,
      risk: opportunity.risk,
      capability_impact: opportunity.capability_impact,
    })).sort((a, b) => b.score - a.score),
    constraints: state.constraints.slice(0, 6).map((constraint) => ({
      id: constraint.id,
      title: constraint.title,
      kind: constraint.kind,
      severity: constraint.severity,
      blocker: constraint.blocker,
      confidence: constraint.confidence,
    })),
    trust: state.trusts.slice(0, 6).map((trust) => ({
      id: trust.id,
      subject_type: trust.subject_type,
      subject_id: trust.subject_id,
      trust_score: trust.trust_score,
      trust_trend: trust.trust_trend,
      last_calibrated_at: trust.last_calibrated_at,
    })),
    forecast: {
      confidence: topSimulation ? topSimulation.confidence : 0.75,
      horizonDays: 30,
      likelyOutcome: topSimulation ? topSimulation.expected_outcome || topSimulation.recommendation : 'Increase graph coverage before expansion.',
      calibration: round3(calibrationAccuracy),
    },
    intelligence: intelligence,
    topPatterns: intelligence.topPatterns,
    topRecommendations: intelligence.topRecommendations,
    highestPriorityInterventions: intelligence.highestPriorityItems.filter((item) => String(item.targetType || '').toLowerCase() === 'intervention'),
    highestPriorityMissions: intelligence.highestPriorityItems.filter((item) => String(item.targetType || '').toLowerCase() === 'mission'),
    highestPriorityApprovals: intelligence.highestPriorityItems.filter((item) => String(item.targetType || '').toLowerCase() === 'approval'),
    predictedCirImpact: intelligence.predictedCirImpact,
    summary: {
      reportCount: state.reports.length,
      eventCount: state.events.length,
      decisionCount: state.decisions.length,
      outcomeCount: state.outcomes.length,
      knowledgeCount: state.knowledgeRecords.length,
      trustCount: state.trusts.length,
      patternCount: state.patterns.length,
      capabilityValue: capabilityValue,
    },
    constitutionalLoop: {
      observe: state.events.length,
      model: state.entities.length + state.relationships.length,
      explain: state.decisions.length,
      predict: state.simulations.length,
      simulate: state.simulations.length,
      optimize: state.capabilities.length,
      decide: state.decisions.length,
      execute: state.interventions.length,
      measure: state.outcomes.length,
      learn: state.knowledgeRecords.length,
    },
    constitutionalEvaluation: constitutionalEvaluation,
    evidence: topDecision ? topDecision.evidence || [] : [],
    assumptions: topSimulation ? topSimulation.assumptions || [] : [],
    topOutcome: topOutcome,
    topKnowledge: topKnowledge,
    topCapability: topCapability,
    topGoal: topGoal,
    topInitiative: topInitiative,
    strategicCoordination: {
      goal: topGoal,
      initiative: topInitiative,
      objective: state.objectives[0] || null,
      mission: topMission,
      confidence: round3(((topGoal ? Number(topGoal.confidence || 0.5) : 0.5) + (topInitiative ? Number(topInitiative.confidence || 0.5) : 0.5)) / 2),
      constraints: state.constraints.slice(0, 4),
      opportunities: state.opportunities.slice(0, 4),
    },
    topOpportunity: topOpportunity,
    topConstraint: topConstraint,
    topTrust: topTrust,
    topPattern: state.patterns[0] || null,
  };
}

function dedupeById(records) {
  const seen = new Set();
  const output = [];
  for (const record of Array.isArray(records) ? records : []) {
    if (!record || !record.id || seen.has(record.id)) continue;
    seen.add(record.id);
    output.push(record);
  }
  return output;
}

function normalizePlatformState(input = {}) {
  const state = createPlatformState(input);
  for (const key of COLLECTIONS) {
    state[key] = dedupeById(Array.isArray(state[key]) ? state[key] : []);
  }
  state.entities.forEach((entity) => {
    entity.relationships = Array.isArray(entity.relationships) ? entity.relationships : [];
    entity.history = Array.isArray(entity.history) ? entity.history : [];
  });
  state.graph = buildGraph(state);
  state.executive = buildExecutive(state);
  return state;
}

function recommendationImpactScore(record) {
  const impact = record.expectedImpact || record.expected_impact || {};
  return Number(impact.capability || 0) + Number(impact.trust || 0) + Number(impact.roi || 0) / 10;
}

function buildIntelligenceSummary(state) {
  const patterns = Array.isArray(state.patterns) ? state.patterns.slice() : [];
  const recommendations = Array.isArray(state.recommendations) ? state.recommendations.slice() : [];
  const priorities = Array.isArray(state.priorities) ? state.priorities.slice() : [];
  const sortedPatterns = patterns.sort((a, b) => Number(b.frequency || 0) + Number(b.confidence || 0) - (Number(a.frequency || 0) + Number(a.confidence || 0))).slice(0, 5);
  const sortedRecommendations = recommendations.sort((a, b) => (Number(b.confidence || 0) + recommendationImpactScore(b)) - (Number(a.confidence || 0) + recommendationImpactScore(a))).slice(0, 5);
  const sortedPriorities = priorities.sort((a, b) => Number(b.score || 0) - Number(a.score || 0)).slice(0, 10);
  const highestPriorityItems = sortedPriorities.slice(0, 5);
  const predictedCirImpact = round3(highestPriorityItems.reduce((sum, item) => sum + Number(item.score || 0), 0) / Math.max(1, highestPriorityItems.length) * Math.max(0.1, (state.cirMetrics && state.cirMetrics[0] ? Number(state.cirMetrics[0].score || 0.1) : 0.1) * 1.5));
  return {
    patternCount: patterns.length,
    recommendationCount: recommendations.length,
    priorityCount: priorities.length,
    topPatterns: sortedPatterns,
    topRecommendations: sortedRecommendations,
    highestPriorityItems: highestPriorityItems,
    predictedCirImpact: predictedCirImpact,
  };
}

function buildSeedState(seed = {}) {
  const base = createPlatformState(seed);
  base.entities = [
    createEntity({ id: 'company', name: seed.companyName || 'CYVXAI-OS', label: seed.companyName || 'CYVXAI-OS', kind: 'company', state: 'operating', health: 'healthy', economics: { cost: 88000, savings: 24000, value: 420000, roi: 2.4 }, risk: { score: 0.3, drivers: ['cloud cost', 'manual workflows'] }, opportunity: { score: 0.84, drivers: ['automation', 'mission compounding'] }, capability: { current: 0.42, potential: 0.9, growth_rate: 0.18, impact: 0.38 }, ownership: 'organization' }),
    createEntity({ name: 'Cloud Fabric', kind: 'infrastructure', state: 'stable', health: 'healthy', economics: { cost: 41000, savings: 7000, value: 130000, roi: 1.9 }, risk: { score: 0.35, drivers: ['cost volatility'] }, opportunity: { score: 0.72, drivers: ['rightsizing'] }, capability: { current: 0.33, potential: 0.83, growth_rate: 0.19, impact: 0.29 } }),
    createEntity({ name: 'Workflow Fabric', kind: 'workflow', state: 'active', health: 'monitoring', economics: { cost: 0, savings: 0, value: 92000, roi: 2.2 }, risk: { score: 0.26, drivers: ['manual handoffs'] }, opportunity: { score: 0.79, drivers: ['automation'] }, capability: { current: 0.29, potential: 0.81, growth_rate: 0.23, impact: 0.31 } }),
    createEntity({ name: 'Teams', kind: 'team', state: 'aligned', health: 'healthy', economics: { cost: 0, savings: 0, value: 64000, roi: 1.8 }, risk: { score: 0.18, drivers: ['silos'] }, opportunity: { score: 0.68, drivers: ['coordination'] }, capability: { current: 0.34, potential: 0.84, growth_rate: 0.16, impact: 0.27 } }),
  ];
  base.relationships = [
    createRelationship({ from: 'company', to: base.entities[1].id, relation: 'depends_on', strength: 0.9 }),
    createRelationship({ from: 'company', to: base.entities[2].id, relation: 'orchestrates', strength: 0.92 }),
    createRelationship({ from: 'company', to: base.entities[3].id, relation: 'coordinates', strength: 0.88 }),
    createRelationship({ from: base.entities[3].id, to: base.entities[2].id, relation: 'executes', strength: 0.84 }),
  ];
  base.agents = [
    createAgent({ name: 'Planner', role: 'mission planner', lifecycle: 'deployed', status: 'ready', capabilities: ['reason', 'plan', 'simulate', 'report'], economics: { cost_per_hour: 80, roi: 4.4 } }),
    createAgent({ name: 'Operator', role: 'operations agent', lifecycle: 'deployed', status: 'ready', capabilities: ['monitor', 'assign', 'execute'], economics: { cost_per_hour: 68, roi: 3.6 } }),
  ];
  base.objectives = [
    createObjective({ title: 'Increase organizational capability', description: 'Reduce waste, improve coordination, and compound learning.', entity_ids: ['company', base.entities[1].id, base.entities[2].id, base.entities[3].id], confidence: 0.83, target_metric: 'capability', target_value: 0.9 }),
  ];
  base.missions = [
    createMission({ title: 'Bootstrap platform', objective: 'Model the organization and launch the constitutional loop.', objective_id: base.objectives[0].id, target_entity_ids: ['company'], stage: 'learned', status: 'completed', confidence: 0.86, roi: 2.6, risk: 0.18, progress: 1, verification: 'complete', autonomy_level: 3, governance: { approval_required: true, operator_override: true, policy_status: 'approved', reversible: true }, report_id: 'report-bootstrap' }),
  ];
  base.simulations = [
    createSimulation({ title: 'Bootstrap simulation', scenario: 'organization modeling', status: 'completed', confidence: 0.86, roi: 2.6, risk_delta: -0.14, opportunity_delta: 0.22, economic_impact: { cost: 800, value: 2400, roi: 3 }, expected_outcome: 'Better visibility and faster decisions.', recommendation: 'Continue with mission-driven execution.', linked_mission_id: base.missions[0].id }),
  ];
  base.decisions = [
    createDecision({ title: 'Bootstrap decision', rationale: 'Simulation indicates the constitutional loop increases capability with manageable risk.', confidence: 0.84, alternatives: [{ title: 'Do nothing', tradeoff: 'preserve status quo' }, { title: 'Model company', tradeoff: 'create durable capability' }], expected_impact: { cost: 800, value: 2400, risk: -0.14, capability: 0.32 }, related_mission_id: base.missions[0].id, related_entity_ids: ['company'] }),
  ];
  base.interventions = [
    createIntervention({ title: 'Bootstrap intervention', summary: 'Run the constitutional loop and verify every major change with events.', decision_id: base.decisions[0].id, related_mission_id: base.missions[0].id, related_entity_ids: ['company'], expected_impact: { cost: 800, value: 2400, risk: -0.14, capability: 0.32 }, status: 'approved', reversible: true, requires_approval: true, autonomy_level: 3, policy_status: 'approved' }),
  ];
  base.outcomes = [
    createOutcome({ title: 'Bootstrap outcome', mission_id: base.missions[0].id, decision_id: base.decisions[0].id, status: 'measured', measured: { value: 2400 }, expected: { value: 2400 }, delta: { risk: -0.14, opportunity: 0.22 }, economic_impact: { cost: 800, value: 2400, roi: 3 }, capability_delta: { created: 0.22, protected: 0.1, improved: 0.3 }, risk_delta: -0.14, value: 2400, entity_ids: ['company'] }),
  ];
  base.knowledgeRecords = [
    createKnowledgeRecord({ title: 'Bootstrap lesson', mission_id: base.missions[0].id, outcome_id: base.outcomes[0].id, decision_ids: [base.decisions[0].id], entity_ids: ['company'], lesson_learned: 'Simulation first reduces uncertainty.', what_worked: 'Evidence-backed decision making.', what_failed: 'Nothing critical in the bootstrap loop.', future_recommendation: 'Keep mission execution explainable.', capability_delta: { created: 0.22, protected: 0.1, improved: 0.3 } }),
  ];
  base.capabilities = [
    createCapability({ title: 'Constitutional capability', current: 0.48, potential: 0.92, growth_rate: 0.2, impact: 0.4, owner_id: 'company', linked_entity_ids: ['company'], constraints: ['approval'], opportunities: ['automation', 'learning'] }),
  ];
  base.reports = [
    createReport({ id: 'report-bootstrap', title: 'Bootstrap report', scope: 'executive', summary: 'The platform is ready to compound capability.', findings: ['One model of reality exists.', 'Every meaningful action creates an event.'], recommendations: ['Launch missions', 'Run simulations', 'Measure outcomes'], metrics: { confidence: 0.86, roi: 3 }, source_ids: [base.simulations[0].id, base.decisions[0].id, base.knowledgeRecords[0].id], related_mission_id: base.missions[0].id }),
  ];
  base.commands = [
    createCommand({ command: 'bootstrap', natural_language: 'Model my company', status: 'executed', result: { ok: true } }),
  ];
  base.workflows = [
    createWorkflow({ name: 'Mission loop', trigger: 'command', steps: ['observe', 'model', 'simulate', 'decide', 'execute', 'measure', 'learn'], status: 'active', run_count: 1, success_count: 1 }),
  ];
  base.events = [
    createEvent({ event_type: 'platform.seeded', summary: 'Seed platform state initialized', payload: { seeded: true } }),
    createEvent({ event_type: 'entity.created', subject_id: 'company', summary: 'Seed company entity created', payload: { entity: base.entities[0] } }),
    createEvent({ event_type: 'mission.created', subject_id: base.missions[0].id, summary: 'Seed mission created', payload: { mission: base.missions[0] } }),
    createEvent({ event_type: 'report.generated', subject_id: base.reports[0].id, summary: 'Seed report generated', payload: { report: base.reports[0] } }),
  ];
  return normalizePlatformState(base);
}

module.exports = {
  PlatformKernel,
  buildSeedState,
  normalizePlatformState,
};
