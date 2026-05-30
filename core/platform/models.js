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

function iso(value) {
  return value ? new Date(value).toISOString() : new Date().toISOString();
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function idFrom(value, fallback) {
  const raw = String(value || fallback || "").trim().toLowerCase();
  return raw.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || String(fallback || "cyvx");
}

function withMeta(record = {}, type) {
  return {
    id: record.id || type + "-" + idFrom(record.name || record.title || record.label || type, type),
    type: type,
    created_at: iso(record.created_at),
    updated_at: iso(record.updated_at),
    ...record,
  };
}

function withConstitution(record = {}, type, defaults = {}) {
  return withMeta({
    title: record.title || record.name || record.label || defaults.title || type,
    name: record.name || record.title || record.label || defaults.name || type,
    label: record.label || record.title || record.name || defaults.label || type,
    state: record.state || defaults.state || 'active',
    metadata: record.metadata || {},
    relationships: Array.isArray(record.relationships) ? clone(record.relationships) : [],
    events: Array.isArray(record.events) ? clone(record.events) : [],
    evidence: Array.isArray(record.evidence) ? clone(record.evidence) : [],
    assumptions: Array.isArray(record.assumptions) ? clone(record.assumptions) : [],
    confidence: Number(record.confidence != null ? record.confidence : defaults.confidence != null ? defaults.confidence : 0.5),
    linked_event_ids: Array.isArray(record.linked_event_ids) ? clone(record.linked_event_ids) : [],
    ...defaults,
    ...record,
  }, type);
}

function createEntity(record = {}) {
  return withConstitution(record, 'entity', {
    label: record.label || record.name || 'entity',
    kind: record.kind || 'unknown',
    state: record.state || 'new',
    health: record.health || 'unknown',
    history: Array.isArray(record.history) ? clone(record.history) : [],
    relationships: Array.isArray(record.relationships) ? clone(record.relationships) : [],
    economics: record.economics || { cost: 0, savings: 0, value: 0, roi: 0 },
    risk: record.risk || { score: 0, drivers: [] },
    opportunity: record.opportunity || { score: 0, drivers: [] },
    ownership: record.ownership || 'platform',
    impact: Number(record.impact || 0),
    capability: record.capability || { current: 0, potential: 0, growth_rate: 0, impact: 0 },
    state_history: Array.isArray(record.state_history) ? clone(record.state_history) : [],
    constitutional: record.constitutional || { understanding: 0, coordination: 0, capability: 0, resilience: 0, learning: 0, score: 0, trend: 0, risk: 0 },
  });
}

function createRelationship(record = {}) {
  return withConstitution({
    id: record.id || 'relationship-' + idFrom(String(record.from || 'from') + '-' + String(record.relation || record.type || 'related_to') + '-' + String(record.to || 'to'), 'relationship'),
    ...record,
  }, 'relationship', {
    from: record.from,
    to: record.to,
    relation: record.relation || record.type || 'related_to',
    strength: Number(record.strength || 0.5),
    impact: Number(record.impact || 0),
    metadata: record.metadata || {},
  });
}

function createEvent(record = {}) {
  const nonce = record.nonce || record._nonce || Math.random().toString(36).slice(2, 10);
  return withConstitution({
    id: record.id || 'event-' + idFrom(String(record.event_type || record.type || 'event') + '-' + String(record.subject_id || 'subject') + '-' + String(record.summary || 'summary') + '-' + nonce, 'event'),
    ...record,
  }, 'event', {
    event_type: record.event_type || record.type || 'event',
    subject_id: record.subject_id || null,
    actor_id: record.actor_id || null,
    summary: record.summary || '',
    payload: record.payload || {},
    severity: record.severity || 'info',
    source: record.source || 'cyvx',
    related_entity_ids: Array.isArray(record.related_entity_ids) ? clone(record.related_entity_ids) : [],
    related_mission_id: record.related_mission_id || null,
  });
}

function createObservation(record = {}) {
  return withConstitution(record, 'observation', {
    title: record.title || record.summary || 'observation',
    source: record.source || 'cyvx',
    timestamp: record.timestamp || iso(record.timestamp),
    confidence: record.confidence != null ? Number(record.confidence) : 0.5,
    evidence: Array.isArray(record.evidence) ? clone(record.evidence) : [],
    observed_state: record.observed_state != null ? clone(record.observed_state) : {},
    observed_change: record.observed_change != null ? clone(record.observed_change) : {},
    subject_id: record.subject_id || null,
    related_entity_ids: Array.isArray(record.related_entity_ids) ? clone(record.related_entity_ids) : [],
  });
}

function createConstitutionalCriterion(record = {}) {
  return withConstitution(record, 'constitutional_criterion', {
    title: record.title || record.name || 'constitutional criterion',
    description: record.description || '',
    priority: Number(record.priority != null ? record.priority : 1),
    protected: Boolean(record.protected),
    measurement: record.measurement || '',
    preferred_state: record.preferred_state != null ? clone(record.preferred_state) : {},
    impermissible_state: record.impermissible_state != null ? clone(record.impermissible_state) : {},
    scoring_policy: record.scoring_policy || { method: 'weighted', weight: 1 },
    metadata: record.metadata || {},
  });
}

function createRealityObject(record = {}) {
  return withConstitution(record, 'reality_object', {
    title: record.title || record.name || 'reality object',
    type: record.reality_type || record.kind || record.type || 'unknown',
    state: record.state != null ? clone(record.state) : {},
    relationships: Array.isArray(record.relationships) ? clone(record.relationships) : [],
    resources: record.resources != null ? clone(record.resources) : {},
    constraints: Array.isArray(record.constraints) ? clone(record.constraints) : [],
    observations: Array.isArray(record.observations) ? clone(record.observations) : [],
    metadata: record.metadata || {},
    timestamp: record.timestamp || iso(record.timestamp),
  });
}

function createSignificanceRecord(record = {}) {
  return withConstitution(record, 'significance_record', {
    title: record.title || 'significance record',
    reality_object_id: record.reality_object_id || null,
    criterion_id: record.criterion_id || null,
    delta: record.delta != null ? clone(record.delta) : {},
    importance: Number(record.importance != null ? record.importance : 0),
    optionality: Number(record.optionality != null ? record.optionality : 0),
    risk: Number(record.risk != null ? record.risk : 0),
    opportunity: Number(record.opportunity != null ? record.opportunity : 0),
    salience: Number(record.salience != null ? record.salience : 0),
    confidence: record.confidence != null ? Number(record.confidence) : 0.5,
    rationale: record.rationale || '',
    evidence: Array.isArray(record.evidence) ? clone(record.evidence) : [],
    status: record.status || 'active',
    metadata: record.metadata || {},
  });
}

function createCIRMetric(record = {}) {
  return withConstitution(record, 'cir_metric', {
    title: record.title || 'cir metric',
    delta_reduced: Number(record.delta_reduced != null ? record.delta_reduced : 0),
    time_consumed: Number(record.time_consumed != null ? record.time_consumed : 0),
    resource_consumed: Number(record.resource_consumed != null ? record.resource_consumed : 0),
    confidence: record.confidence != null ? Number(record.confidence) : 0.5,
    calculation_window: record.calculation_window || '30d',
    related_interventions: Array.isArray(record.related_interventions) ? clone(record.related_interventions) : [],
    related_outcomes: Array.isArray(record.related_outcomes) ? clone(record.related_outcomes) : [],
    related_significance_records: Array.isArray(record.related_significance_records) ? clone(record.related_significance_records) : [],
    score: Number(record.score != null ? record.score : 0),
    metadata: record.metadata || {},
  });
}

function createAssumption(record = {}) {
  return withConstitution(record, 'assumption', {
    title: record.title || 'assumption',
    value: record.value || '',
    confidence: record.confidence != null ? Number(record.confidence) : 0.5,
    source: record.source || 'model',
    evidence_ids: Array.isArray(record.evidence_ids) ? clone(record.evidence_ids) : [],
    linked_event_ids: Array.isArray(record.linked_event_ids) ? clone(record.linked_event_ids) : [],
  });
}

function createEvidence(record = {}) {
  return withConstitution(record, 'evidence', {
    title: record.title || 'evidence',
    source: record.source || 'observation',
    value: record.value != null ? record.value : '',
    confidence: record.confidence != null ? Number(record.confidence) : 0.6,
    state: record.state || 'verified',
    linked_event_ids: Array.isArray(record.linked_event_ids) ? clone(record.linked_event_ids) : [],
  });
}

function createConfidence(record = {}) {
  return withConstitution(record, 'confidence', {
    title: record.title || 'confidence',
    score: record.score != null ? Number(record.score) : Number(record.confidence != null ? record.confidence : 0.5),
    source: record.source || 'assessment',
    contributors: Array.isArray(record.contributors) ? clone(record.contributors) : [],
    history: Array.isArray(record.history) ? clone(record.history) : [],
    error: record.error != null ? Number(record.error) : 0,
  });
}

function createAgent(record = {}) {
  return withConstitution(record, 'agent', {
    name: record.name || 'agent',
    role: record.role || 'observer',
    lifecycle: record.lifecycle || 'created',
    status: record.status || 'idle',
    memory: record.memory || { episodes: 0, documents: 0, decisions: 0 },
    planning: record.planning || { horizon_hours: 0, focus: '' },
    delegation: record.delegation || { children: 0, swarm: false },
    capabilities: Array.isArray(record.capabilities) ? clone(record.capabilities) : ['reason', 'plan', 'report'],
    tools: Array.isArray(record.tools) ? clone(record.tools) : [],
    ownership: record.ownership || 'platform',
    economics: record.economics || { cost_per_hour: 0, roi: 0 },
    trust_score: record.trust_score != null ? Number(record.trust_score) : 0.5,
    trust_trend: record.trust_trend != null ? Number(record.trust_trend) : 0,
    trust_history: Array.isArray(record.trust_history) ? clone(record.trust_history) : [],
  });
}

function createGoal(record = {}) {
  return withConstitution(record, 'goal', {
    title: record.title || 'goal',
    description: record.description || '',
    state: record.state || 'active',
    health: record.health || 'healthy',
    risk: record.risk || { score: 0, drivers: [] },
    opportunity: record.opportunity || { score: 0, drivers: [] },
    capability: record.capability || { current: 0, potential: 0, growth_rate: 0, impact: 0 },
    momentum: Number(record.momentum || 0),
    confidence: record.confidence != null ? Number(record.confidence) : 0.5,
    objective_ids: Array.isArray(record.objective_ids) ? clone(record.objective_ids) : [],
    initiative_ids: Array.isArray(record.initiative_ids) ? clone(record.initiative_ids) : [],
    entity_ids: Array.isArray(record.entity_ids) ? clone(record.entity_ids) : [],
    constitutional: record.constitutional || { understanding: 0, coordination: 0, capability: 0, resilience: 0, learning: 0, score: 0, trend: 0, risk: 0 },
  });
}

function createInitiative(record = {}) {
  return withConstitution(record, 'initiative', {
    title: record.title || 'initiative',
    description: record.description || '',
    state: record.state || 'active',
    health: record.health || 'healthy',
    risk: record.risk || { score: 0, drivers: [] },
    opportunity: record.opportunity || { score: 0, drivers: [] },
    capability: record.capability || { current: 0, potential: 0, growth_rate: 0, impact: 0 },
    momentum: Number(record.momentum || 0),
    confidence: record.confidence != null ? Number(record.confidence) : 0.5,
    goal_id: record.goal_id || null,
    objective_id: record.objective_id || null,
    mission_ids: Array.isArray(record.mission_ids) ? clone(record.mission_ids) : [],
    constraint_ids: Array.isArray(record.constraint_ids) ? clone(record.constraint_ids) : [],
    opportunity_ids: Array.isArray(record.opportunity_ids) ? clone(record.opportunity_ids) : [],
    constitutional: record.constitutional || { understanding: 0, coordination: 0, capability: 0, resilience: 0, learning: 0, score: 0, trend: 0, risk: 0 },
  });
}

function createObjective(record = {}) {
  return withConstitution(record, 'objective', {
    title: record.title || 'objective',
    description: record.description || '',
    priority: Number(record.priority || 1),
    target_metric: record.target_metric || '',
    target_value: record.target_value != null ? record.target_value : null,
    state: record.state || 'discovered',
    goal_id: record.goal_id || null,
    initiative_id: record.initiative_id || null,
    mission_id: record.mission_id || null,
    entity_ids: Array.isArray(record.entity_ids) ? clone(record.entity_ids) : [],
    constraint_ids: Array.isArray(record.constraint_ids) ? clone(record.constraint_ids) : [],
    opportunity_ids: Array.isArray(record.opportunity_ids) ? clone(record.opportunity_ids) : [],
    constitutional: record.constitutional || { understanding: 0, coordination: 0, capability: 0, resilience: 0, learning: 0, score: 0, trend: 0, risk: 0 },
  });
}

function createConstraint(record = {}) {
  return withConstitution(record, 'constraint', {
    title: record.title || 'constraint',
    kind: record.kind || 'bottleneck',
    description: record.description || '',
    state: record.state || 'active',
    severity: record.severity || 'medium',
    blocker: record.blocker || '',
    confidence: record.confidence != null ? Number(record.confidence) : 0.5,
    entity_ids: Array.isArray(record.entity_ids) ? clone(record.entity_ids) : [],
    mission_id: record.mission_id || null,
    objective_id: record.objective_id || null,
    capability_id: record.capability_id || null,
    constitutional: record.constitutional || { understanding: 0, coordination: 0, capability: 0, resilience: 0, learning: 0, score: 0, trend: 0, risk: 0 },
  });
}

function createOpportunity(record = {}) {
  return withConstitution(record, 'opportunity', {
    title: record.title || 'opportunity',
    description: record.description || '',
    state: record.state || 'identified',
    expected_value: Number(record.expected_value || 0),
    effort: Number(record.effort || 0),
    risk: Number(record.risk || 0),
    capability_impact: Number(record.capability_impact || 0),
    strategic_alignment: Number(record.strategic_alignment || 0),
    opportunity_score: Number(record.opportunity_score || record.score || 0),
    confidence: record.confidence != null ? Number(record.confidence) : 0.5,
    entity_ids: Array.isArray(record.entity_ids) ? clone(record.entity_ids) : [],
    mission_id: record.mission_id || null,
    objective_id: record.objective_id || null,
    constitutional: record.constitutional || { understanding: 0, coordination: 0, capability: 0, resilience: 0, learning: 0, score: 0, trend: 0, risk: 0 },
  });
}

function createMission(record = {}) {
  return withConstitution(record, 'mission', {
    title: record.title || 'mission',
    objective: record.objective || record.summary || '',
    lifecycle: Array.isArray(record.lifecycle) ? clone(record.lifecycle) : ['discovered', 'planned', 'simulated', 'approved', 'executing', 'measured', 'completed', 'learned'],
    stage: record.stage || 'discovered',
    status: record.status || 'draft',
    owner_id: record.owner_id || null,
    goal_id: record.goal_id || null,
    initiative_id: record.initiative_id || null,
    objective_id: record.objective_id || null,
    constraints: Array.isArray(record.constraints) ? clone(record.constraints) : [],
    constraint_ids: Array.isArray(record.constraint_ids) ? clone(record.constraint_ids) : [],
    target_entity_ids: Array.isArray(record.target_entity_ids) ? clone(record.target_entity_ids) : [],
    assigned_agent_ids: Array.isArray(record.assigned_agent_ids) ? clone(record.assigned_agent_ids) : [],
    risks: Array.isArray(record.risks) ? clone(record.risks) : [],
    opportunities: Array.isArray(record.opportunities) ? clone(record.opportunities) : [],
    opportunity_ids: Array.isArray(record.opportunity_ids) ? clone(record.opportunity_ids) : [],
    decisions: Array.isArray(record.decisions) ? clone(record.decisions) : [],
    interventions: Array.isArray(record.interventions) ? clone(record.interventions) : [],
    expected_outcomes: Array.isArray(record.expected_outcomes) ? clone(record.expected_outcomes) : [],
    actual_outcomes: Array.isArray(record.actual_outcomes) ? clone(record.actual_outcomes) : [],
    knowledge_record_ids: Array.isArray(record.knowledge_record_ids) ? clone(record.knowledge_record_ids) : [],
    capability_delta: record.capability_delta || { created: 0, protected: 0, improved: 0 },
    confidence: Number(record.confidence || 0),
    roi: Number(record.roi || 0),
    risk: Number(record.risk || 0),
    progress: Number(record.progress || 0),
    verification: record.verification || 'pending',
    autonomy_level: Number(record.autonomy_level || 1),
    governance: record.governance || { approval_required: true, operator_override: false, policy_status: 'review', reversible: true },
    report_id: record.report_id || null,
    trust_score: record.trust_score != null ? Number(record.trust_score) : 0.5,
    trust_trend: record.trust_trend != null ? Number(record.trust_trend) : 0,
    trust_history: Array.isArray(record.trust_history) ? clone(record.trust_history) : [],
    constitutional: record.constitutional || { understanding: 0, coordination: 0, capability: 0, resilience: 0, learning: 0, score: 0, trend: 0, risk: 0 },
  });
}

function createSimulation(record = {}) {
  return withConstitution(record, 'simulation', {
    title: record.title || 'simulation',
    scenario: record.scenario || record.type || 'generic',
    status: record.status || 'queued',
    assumptions: Array.isArray(record.assumptions) ? clone(record.assumptions) : [],
    confidence: Number(record.confidence || 0),
    roi: Number(record.roi || 0),
    risk_delta: Number(record.risk_delta != null ? record.risk_delta : record.risk_impact || 0),
    opportunity_delta: Number(record.opportunity_delta || 0),
    economic_impact: record.economic_impact || { cost: 0, value: 0, roi: 0 },
    expected_outcome: record.expected_outcome || '',
    actual_outcome: record.actual_outcome || null,
    prediction_error: record.prediction_error != null ? Number(record.prediction_error) : null,
    prediction_variance: record.prediction_variance != null ? Number(record.prediction_variance) : null,
    recommendation: record.recommendation || '',
    recommended_intervention: record.recommended_intervention || null,
    output: record.output || {},
    linked_mission_id: record.linked_mission_id || null,
    confidence_source: record.confidence_source || 'simulation',
    confidence_contributors: Array.isArray(record.confidence_contributors) ? clone(record.confidence_contributors) : [],
    confidence_history: Array.isArray(record.confidence_history) ? clone(record.confidence_history) : [],
    confidence_calibration: record.confidence_calibration || { error: 0, calibration: 0, history: [] },
    executed_at: record.executed_at || null,
  });
}

function createDecision(record = {}) {
  return withConstitution(record, 'decision', {
    title: record.title || 'decision',
    rationale: record.rationale || '',
    evidence: Array.isArray(record.evidence) ? clone(record.evidence) : [],
    assumptions: Array.isArray(record.assumptions) ? clone(record.assumptions) : [],
    alternatives: Array.isArray(record.alternatives) ? clone(record.alternatives) : [],
    risks: Array.isArray(record.risks) ? clone(record.risks) : [],
    expected_impact: record.expected_impact || { cost: 0, value: 0, risk: 0, capability: 0 },
    confidence: record.confidence != null ? Number(record.confidence) : 0.5,
    related_mission_id: record.related_mission_id || null,
    related_entity_ids: Array.isArray(record.related_entity_ids) ? clone(record.related_entity_ids) : [],
    selected_option: record.selected_option || null,
    confidence_source: record.confidence_source || 'decision',
    confidence_contributors: Array.isArray(record.confidence_contributors) ? clone(record.confidence_contributors) : [],
    confidence_history: Array.isArray(record.confidence_history) ? clone(record.confidence_history) : [],
    confidence_calibration: record.confidence_calibration || { error: 0, calibration: 0, history: [] },
    prediction_error: record.prediction_error != null ? Number(record.prediction_error) : null,
    predicted_outcome: record.predicted_outcome || null,
    actual_outcome: record.actual_outcome || null,
    trust_score: record.trust_score != null ? Number(record.trust_score) : 0.5,
    constitutional: record.constitutional || { understanding: 0, coordination: 0, capability: 0, resilience: 0, learning: 0, score: 0, trend: 0, risk: 0 },
  });
}

function createIntervention(record = {}) {
  return withConstitution(record, 'intervention', {
    title: record.title || 'intervention',
    summary: record.summary || '',
    status: record.status || 'proposed',
    target_reality_object_id: record.target_reality_object_id || null,
    significance_record_ids: Array.isArray(record.significance_record_ids) ? clone(record.significance_record_ids) : [],
    expected_delta_reduction: Number(record.expected_delta_reduction != null ? record.expected_delta_reduction : 0),
    cost: Number(record.cost != null ? record.cost : 0),
    risk: Number(record.risk != null ? record.risk : 0),
    reversible: record.reversible != null ? Boolean(record.reversible) : true,
    requires_approval: record.requires_approval != null ? Boolean(record.requires_approval) : true,
    autonomy_level: Number(record.autonomy_level || 1),
    policy_status: record.policy_status || 'review',
    governance_status: record.governance_status || record.policy_status || 'review',
    expected_impact: record.expected_impact || { cost: 0, value: 0, risk: 0, capability: 0 },
    resource_requirements: record.resource_requirements || {},
    expected_outcome: record.expected_outcome || '',
    related_mission_id: record.related_mission_id || null,
    related_entity_ids: Array.isArray(record.related_entity_ids) ? clone(record.related_entity_ids) : [],
    decision_id: record.decision_id || null,
    confidence_source: record.confidence_source || 'intervention',
    confidence_contributors: Array.isArray(record.confidence_contributors) ? clone(record.confidence_contributors) : [],
    confidence_history: Array.isArray(record.confidence_history) ? clone(record.confidence_history) : [],
    confidence_calibration: record.confidence_calibration || { error: 0, calibration: 0, history: [] },
    constitutional: record.constitutional || { understanding: 0, coordination: 0, capability: 0, resilience: 0, learning: 0, score: 0, trend: 0, risk: 0 },
  });
}

function createOutcome(record = {}) {
  return withConstitution(record, 'outcome', {
    title: record.title || 'outcome',
    status: record.status || 'placeholder',
    intervention_id: record.intervention_id || null,
    measured: record.measured || {},
    expected: record.expected || {},
    expected_result: record.expected_result || null,
    actual_result: record.actual_result || null,
    delta: record.delta || {},
    variance: record.variance != null ? clone(record.variance) : {},
    value: record.value || 0,
    capability_delta: record.capability_delta || { created: 0, protected: 0, improved: 0 },
    risk_delta: Number(record.risk_delta || 0),
    economic_impact: record.economic_impact || { cost: 0, value: 0, roi: 0 },
    lessons: Array.isArray(record.lessons) ? clone(record.lessons) : [],
    trust_impact: Number(record.trust_impact != null ? record.trust_impact : 0),
    capability_impact: Number(record.capability_impact != null ? record.capability_impact : 0),
    constitutional_impact: Number(record.constitutional_impact != null ? record.constitutional_impact : 0),
    mission_id: record.mission_id || null,
    entity_ids: Array.isArray(record.entity_ids) ? clone(record.entity_ids) : [],
    decision_id: record.decision_id || null,
    evidence: Array.isArray(record.evidence) ? clone(record.evidence) : [],
    predicted_outcome: record.predicted_outcome || null,
    actual_outcome: record.actual_outcome || null,
    prediction_error: record.prediction_error != null ? Number(record.prediction_error) : null,
    prediction_variance: record.prediction_variance != null ? Number(record.prediction_variance) : null,
    confidence_source: record.confidence_source || 'outcome',
    constitutional: record.constitutional || { understanding: 0, coordination: 0, capability: 0, resilience: 0, learning: 0, score: 0, trend: 0, risk: 0 },
  });
}

function createKnowledgeRecord(record = {}) {
  return withConstitution(record, 'knowledge_record', {
    title: record.title || 'knowledge record',
    state: record.state || 'recorded',
    mission_id: record.mission_id || null,
    outcome_id: record.outcome_id || null,
    decision_ids: Array.isArray(record.decision_ids) ? clone(record.decision_ids) : [],
    entity_ids: Array.isArray(record.entity_ids) ? clone(record.entity_ids) : [],
    lesson_learned: record.lesson_learned || '',
    what_worked: record.what_worked || '',
    what_failed: record.what_failed || '',
    future_recommendation: record.future_recommendation || '',
    capability_delta: record.capability_delta || { created: 0, protected: 0, improved: 0 },
    revision: Number(record.revision || 0),
    constitutional: record.constitutional || { understanding: 0, coordination: 0, capability: 0, resilience: 0, learning: 0, score: 0, trend: 0, risk: 0 },
  });
}

function createEvolutionRecommendation(record = {}) {
  return withConstitution(record, 'evolution_recommendation', {
    title: record.title || 'evolution recommendation',
    capability_gap: record.capability_gap || '',
    root_cause: record.root_cause || '',
    recommended_change: record.recommended_change || '',
    expected_improvement: record.expected_improvement || '',
    affected_service: record.affected_service || '',
    priority: Number(record.priority != null ? record.priority : 1),
    confidence: record.confidence != null ? Number(record.confidence) : 0.5,
    status: record.status || 'open',
    metadata: record.metadata || {},
  });
}

function createCapability(record = {}) {
  return withConstitution(record, 'capability', {
    title: record.title || record.name || 'capability',
    current: Number(record.current || 0),
    potential: Number(record.potential || 0),
    growth_rate: Number(record.growth_rate || 0),
    impact: Number(record.impact || 0),
    cost_to_create: Number(record.cost_to_create || 0),
    cost_to_maintain: Number(record.cost_to_maintain || 0),
    value_generated: Number(record.value_generated || 0),
    roi: Number(record.roi || 0),
    opportunity_cost: Number(record.opportunity_cost || 0),
    risk_adjusted_value: Number(record.risk_adjusted_value || 0),
    constraints: Array.isArray(record.constraints) ? clone(record.constraints) : [],
    opportunities: Array.isArray(record.opportunities) ? clone(record.opportunities) : [],
    owner_id: record.owner_id || null,
    linked_entity_ids: Array.isArray(record.linked_entity_ids) ? clone(record.linked_entity_ids) : [],
    constitutional: record.constitutional || { understanding: 0, coordination: 0, capability: 0, resilience: 0, learning: 0, score: 0, trend: 0, risk: 0 },
  });
}

function createTrust(record = {}) {
  return withConstitution(record, 'trust', {
    subject_type: record.subject_type || 'unknown',
    subject_id: record.subject_id || null,
    trust_score: Number(record.trust_score != null ? record.trust_score : 0.5),
    trust_trend: Number(record.trust_trend != null ? record.trust_trend : 0),
    trust_confidence: Number(record.trust_confidence != null ? record.trust_confidence : 0.5),
    trust_history: Array.isArray(record.trust_history) ? clone(record.trust_history) : [],
    calibration_count: Number(record.calibration_count || 0),
    last_calibrated_at: record.last_calibrated_at || null,
    confidence_error: Number(record.confidence_error != null ? record.confidence_error : 0),
    prediction_error: Number(record.prediction_error != null ? record.prediction_error : 0),
    trust_source: record.trust_source || 'calibration',
    trust_reasons: Array.isArray(record.trust_reasons) ? clone(record.trust_reasons) : [],
    constitutional: record.constitutional || { understanding: 0, coordination: 0, capability: 0, resilience: 0, learning: 0, score: 0, trend: 0, risk: 0 },
  });
}

function createPattern(record = {}) {
  return withConstitution(record, 'pattern', {
    title: record.title || 'pattern',
    pattern_type: record.pattern_type || 'recurring',
    description: record.description || '',
    frequency: Number(record.frequency || 0),
    confidence: Number(record.confidence != null ? record.confidence : 0.5),
    impact: Number(record.impact || 0),
    capability_contribution: Number(record.capability_contribution || 0),
    related_entity_ids: Array.isArray(record.related_entity_ids) ? clone(record.related_entity_ids) : [],
    related_mission_ids: Array.isArray(record.related_mission_ids) ? clone(record.related_mission_ids) : [],
    trust_score: Number(record.trust_score != null ? record.trust_score : 0.5),
    summary: record.summary || '',
    constitutional: record.constitutional || { understanding: 0, coordination: 0, capability: 0, resilience: 0, learning: 0, score: 0, trend: 0, risk: 0 },
  });
}

function createReport(record = {}) {
  return withConstitution(record, 'report', {
    title: record.title || 'report',
    scope: record.scope || 'executive',
    summary: record.summary || '',
    findings: Array.isArray(record.findings) ? clone(record.findings) : [],
    recommendations: Array.isArray(record.recommendations) ? clone(record.recommendations) : [],
    metrics: record.metrics || {},
    owner_id: record.owner_id || null,
    source_ids: Array.isArray(record.source_ids) ? clone(record.source_ids) : [],
    related_mission_id: record.related_mission_id || null,
  });
}

function createCommand(record = {}) {
  return withConstitution(record, 'command', {
    command: record.command || record.type || 'command',
    natural_language: record.natural_language || record.prompt || '',
    status: record.status || 'received',
    target_id: record.target_id || null,
    actor_id: record.actor_id || null,
    payload: record.payload || {},
    result: record.result || null,
  });
}

function createWorkflow(record = {}) {
  return withConstitution(record, 'workflow', {
    name: record.name || 'workflow',
    trigger: record.trigger || 'event',
    steps: Array.isArray(record.steps) ? clone(record.steps) : [],
    status: record.status || 'idle',
    owner_id: record.owner_id || null,
    run_count: Number(record.run_count || 0),
    success_count: Number(record.success_count || 0),
  });
}

function createTenant(record = {}) {
  return withConstitution(record, 'tenant', {
    name: record.name || 'tenant',
    plan: record.plan || 'standard',
    isolation: record.isolation || 'tenant',
    status: record.status || 'active',
    metadata: record.metadata || {},
  });
}

function createUser(record = {}) {
  return withConstitution(record, 'user', {
    name: record.name || 'user',
    email: record.email || '',
    role: record.role || 'observer',
    tenant_id: record.tenant_id || null,
    status: record.status || 'active',
    permissions: Array.isArray(record.permissions) ? clone(record.permissions) : [],
  });
}

function createPlatformState(input = {}) {
  const tenant = createTenant(input.tenant || { name: input.companyName || input.name || 'CYVXAI-OS' });
  const user = createUser(input.user || { name: input.ownerName || 'Dakota Lee Jonsgaard', role: 'owner', tenant_id: tenant.id });
  return {
    id: input.id || 'platform-' + tenant.id,
    powered_by: 'CYVX',
    creator: 'Dakota Lee Jonsgaard',
    tenant: tenant,
    user: user,
    entities: Array.isArray(input.entities) ? input.entities.map(createEntity) : [],
    relationships: Array.isArray(input.relationships) ? input.relationships.map(createRelationship) : [],
    events: Array.isArray(input.events) ? input.events.map(createEvent) : [],
    observations: Array.isArray(input.observations) ? input.observations.map(createObservation) : [],
    criteria: Array.isArray(input.criteria) ? input.criteria.map(createConstitutionalCriterion) : [],
    realityObjects: Array.isArray(input.realityObjects) ? input.realityObjects.map(createRealityObject) : [],
    significanceRecords: Array.isArray(input.significanceRecords) ? input.significanceRecords.map(createSignificanceRecord) : [],
    evolutionRecommendations: Array.isArray(input.evolutionRecommendations) ? input.evolutionRecommendations.map(createEvolutionRecommendation) : [],
    cirMetrics: Array.isArray(input.cirMetrics) ? input.cirMetrics.map(createCIRMetric) : [],
    humans: Array.isArray(input.humans) ? input.humans : [],
    resources: Array.isArray(input.resources) ? input.resources : [],
    assignments: Array.isArray(input.assignments) ? input.assignments : [],
    approvals: Array.isArray(input.approvals) ? input.approvals : [],
    queueItems: Array.isArray(input.queueItems) ? input.queueItems : [],
    nextBestActions: Array.isArray(input.nextBestActions) ? input.nextBestActions : [],
    agents: Array.isArray(input.agents) ? input.agents.map(createAgent) : [],
    goals: Array.isArray(input.goals) ? input.goals.map(createGoal) : [],
    initiatives: Array.isArray(input.initiatives) ? input.initiatives.map(createInitiative) : [],
    objectives: Array.isArray(input.objectives) ? input.objectives.map(createObjective) : [],
    constraints: Array.isArray(input.constraints) ? input.constraints.map(createConstraint) : [],
    opportunities: Array.isArray(input.opportunities) ? input.opportunities.map(createOpportunity) : [],
    missions: Array.isArray(input.missions) ? input.missions.map(createMission) : [],
    simulations: Array.isArray(input.simulations) ? input.simulations.map(createSimulation) : [],
    reports: Array.isArray(input.reports) ? input.reports.map(createReport) : [],
    commands: Array.isArray(input.commands) ? input.commands.map(createCommand) : [],
    decisions: Array.isArray(input.decisions) ? input.decisions.map(createDecision) : [],
    interventions: Array.isArray(input.interventions) ? input.interventions.map(createIntervention) : [],
    outcomes: Array.isArray(input.outcomes) ? input.outcomes.map(createOutcome) : [],
    knowledgeRecords: Array.isArray(input.knowledgeRecords) ? input.knowledgeRecords.map(createKnowledgeRecord) : [],
    capabilities: Array.isArray(input.capabilities) ? input.capabilities.map(createCapability) : [],
    trusts: Array.isArray(input.trusts) ? input.trusts.map(createTrust) : [],
    patterns: Array.isArray(input.patterns) ? input.patterns.map(createPattern) : [],
    workflows: Array.isArray(input.workflows) ? input.workflows.map(createWorkflow) : [],
    graph: input.graph || { nodes: [], edges: [] },
    executive: input.executive || { answers: {}, recommendations: [] },
    created_at: iso(input.created_at),
    updated_at: iso(input.updated_at),
  };
}

module.exports = {
  clone,
  createAgent,
  createAssumption,
  createCapability,
  createCommand,
  createConfidence,
  createConstraint,
  createDecision,
  createConstitutionalCriterion,
  createEntity,
  createEvidence,
  createEvent,
  createEvolutionRecommendation,
  createGoal,
  createIntervention,
  createInitiative,
  createKnowledgeRecord,
  createMission,
  createObjective,
  createOpportunity,
  createObservation,
  createOutcome,
  createPattern,
  createRealityObject,
  createSignificanceRecord,
  createCIRMetric,
  createPlatformState,
  createRelationship,
  createReport,
  createSimulation,
  createTenant,
  createTrust,
  createUser,
  createWorkflow,
  idFrom,
  iso,
};
