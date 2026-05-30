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

function augmentKernelV1(PlatformKernel, models) {
  if (PlatformKernel.prototype.__cyvxKernelV1Augmented) return;
  PlatformKernel.prototype.__cyvxKernelV1Augmented = true;

  const {
    clone,
    createCIRMetric,
    createConstitutionalCriterion,
    createEvent,
    createEvolutionRecommendation,
    createRealityObject,
    createSignificanceRecord,
  } = models;

  const originalGraph = PlatformKernel.prototype.graph;
  const originalReality = PlatformKernel.prototype.reality;
  const originalExecutive = PlatformKernel.prototype.executive;
  const originalStatus = PlatformKernel.prototype.status;
  const originalCreateIntervention = PlatformKernel.prototype.createIntervention;
  const originalRecordOutcome = PlatformKernel.prototype.recordOutcome;

  PlatformKernel.prototype.criteria = function criteria(query = {}) {
    return listRecords(this.snapshot().criteria || [], query);
  };

  PlatformKernel.prototype.realityObjects = function realityObjects(query = {}) {
    return listRecords(this.snapshot().realityObjects || [], query);
  };

  PlatformKernel.prototype.significanceRecords = function significanceRecords(query = {}) {
    return listRecords(this.snapshot().significanceRecords || [], query);
  };

  PlatformKernel.prototype.evolutionRecommendations = function evolutionRecommendations(query = {}) {
    return listRecords(this.snapshot().evolutionRecommendations || [], query);
  };

  PlatformKernel.prototype.cirMetrics = function cirMetrics(query = {}) {
    return listRecords(this.snapshot().cirMetrics || [], query);
  };

  PlatformKernel.prototype.createCriterion = function createCriterion(input = {}) {
    let criterion = null;
    this.mutate((state) => {
      criterion = createConstitutionalCriterion(input);
      state.criteria = Array.isArray(state.criteria) ? state.criteria : [];
      state.criteria.unshift(criterion);
      appendKernelEvent(state, "criterion.created", criterion.id, "Criterion created: " + (criterion.title || criterion.name || criterion.id), { criterion: criterion, related_entity_ids: input.related_entity_ids || [] });
      appendCirMetric(state, { source: "criterion.created", related_criterion_id: criterion.id });
      return state;
    });
    return criterion;
  };

  PlatformKernel.prototype.updateCriterion = function updateCriterion(criterionId, patch = {}) {
    let criterion = null;
    this.mutate((state) => {
      criterion = (state.criteria || []).find((item) => item.id === criterionId);
      if (!criterion) throw new Error("Criterion not found: " + criterionId);
      Object.assign(criterion, clone(patch), { updated_at: new Date().toISOString() });
      criterion.history = Array.isArray(criterion.history) ? criterion.history : [];
      criterion.history.unshift({ at: new Date().toISOString(), patch: clone(patch) });
      appendKernelEvent(state, "criterion.updated", criterion.id, "Criterion updated: " + (criterion.title || criterion.name || criterion.id), { criterion: criterion, patch: clone(patch) });
      appendCirMetric(state, { source: "criterion.updated", related_criterion_id: criterion.id });
      return state;
    });
    return criterion;
  };

  PlatformKernel.prototype.createRealityObject = function createRealityObjectEntry(input = {}) {
    let realityObject = null;
    this.mutate((state) => {
      realityObject = createRealityObject(input);
      state.realityObjects = Array.isArray(state.realityObjects) ? state.realityObjects : [];
      state.realityObjects.unshift(realityObject);
      appendKernelEvent(state, "reality_object.created", realityObject.id, "Reality object created: " + (realityObject.title || realityObject.name || realityObject.id), { reality_object: realityObject, related_entity_ids: input.related_entity_ids || [] });
      appendCirMetric(state, { source: "reality_object.created", related_reality_object_id: realityObject.id });
      return state;
    });
    return realityObject;
  };

  PlatformKernel.prototype.updateRealityObject = function updateRealityObjectEntry(realityObjectId, patch = {}) {
    let realityObject = null;
    this.mutate((state) => {
      realityObject = (state.realityObjects || []).find((item) => item.id === realityObjectId);
      if (!realityObject) throw new Error("Reality object not found: " + realityObjectId);
      Object.assign(realityObject, clone(patch), { updated_at: new Date().toISOString() });
      realityObject.history = Array.isArray(realityObject.history) ? realityObject.history : [];
      realityObject.history.unshift({ at: new Date().toISOString(), patch: clone(patch) });
      appendKernelEvent(state, "reality_object.updated", realityObject.id, "Reality object updated: " + (realityObject.title || realityObject.name || realityObject.id), { reality_object: realityObject, patch: clone(patch) });
      appendCirMetric(state, { source: "reality_object.updated", related_reality_object_id: realityObject.id });
      return state;
    });
    return realityObject;
  };

  PlatformKernel.prototype.createSignificanceRecord = function createSignificanceRecordEntry(input = {}) {
    let record = null;
    this.mutate((state) => {
      record = createSignificanceRecord(input);
      state.significanceRecords = Array.isArray(state.significanceRecords) ? state.significanceRecords : [];
      state.significanceRecords.unshift(record);
      appendKernelEvent(state, "significance_record.created", record.id, "Significance recorded: " + (record.title || record.id), { significance_record: record, related_entity_ids: input.related_entity_ids || [] });
      appendCirMetric(state, { source: "significance_record.created", related_significance_record_id: record.id });
      return state;
    });
    return record;
  };

  PlatformKernel.prototype.updateSignificanceRecord = function updateSignificanceRecord(significanceRecordId, patch = {}) {
    let record = null;
    this.mutate((state) => {
      record = (state.significanceRecords || []).find((item) => item.id === significanceRecordId);
      if (!record) throw new Error("Significance record not found: " + significanceRecordId);
      Object.assign(record, clone(patch), { updated_at: new Date().toISOString() });
      record.history = Array.isArray(record.history) ? record.history : [];
      record.history.unshift({ at: new Date().toISOString(), patch: clone(patch) });
      appendKernelEvent(state, "significance_record.updated", record.id, "Significance updated: " + (record.title || record.id), { significance_record: record, patch: clone(patch) });
      appendCirMetric(state, { source: "significance_record.updated", related_significance_record_id: record.id });
      return state;
    });
    return record;
  };

  PlatformKernel.prototype.generateSignificance = function generateSignificance(input = {}) {
    const state = this.snapshot();
    const criterion = resolveCriterion(state, input);
    const realityObject = resolveRealityObject(state, input);
    if (!criterion || !realityObject) {
      return { significanceRecord: null, attentionPortfolio: this.kernelSummary().topSignificanceRecords || [] };
    }
    return this.createSignificanceRecord(buildSignificanceInput(criterion, realityObject, input));
  };

  PlatformKernel.prototype.createEvolutionRecommendation = function createEvolutionRecommendationEntry(input = {}) {
    let recommendation = null;
    this.mutate((state) => {
      recommendation = createEvolutionRecommendation(input);
      state.evolutionRecommendations = Array.isArray(state.evolutionRecommendations) ? state.evolutionRecommendations : [];
      state.evolutionRecommendations.unshift(recommendation);
      appendKernelEvent(state, "evolution_recommendation.created", recommendation.id, "Evolution recommendation created: " + (recommendation.title || recommendation.id), { evolution_recommendation: recommendation });
      appendCirMetric(state, { source: "evolution_recommendation.created", related_evolution_recommendation_id: recommendation.id });
      return state;
    });
    return recommendation;
  };

  PlatformKernel.prototype.calculateCir = function calculateCir(input = {}) {
    let metric = null;
    this.mutate((state) => {
      metric = buildCirMetric(state, input);
      state.cirMetrics = Array.isArray(state.cirMetrics) ? state.cirMetrics : [];
      state.cirMetrics.unshift(metric);
      appendKernelEvent(state, "cir.calculated", metric.id, "CIR calculated: " + String(metric.score), { cir_metric: metric });
      return state;
    });
    return metric;
  };

  PlatformKernel.prototype.cir = function cirSummary() {
    const state = this.snapshot();
    const metric = state.cirMetrics && state.cirMetrics[0] ? state.cirMetrics[0] : buildCirMetric(state, { source: "read" });
    return {
      current: metric,
      history: (state.cirMetrics || []).slice(0, 10),
      summary: {
        score: metric.score,
        delta_reduced: metric.delta_reduced,
        resource_consumed: metric.resource_consumed,
        time_consumed: metric.time_consumed,
        confidence: metric.confidence,
      },
    };
  };

  PlatformKernel.prototype.kernelSummary = function kernelSummary() {
    const state = this.snapshot();
    const cir = this.cir();
    const topSignificanceRecords = (state.significanceRecords || []).slice().sort((a, b) => Number(b.salience || b.importance || 0) - Number(a.salience || a.importance || 0)).slice(0, 5);
    const topInterventions = (state.interventions || []).slice().sort((a, b) => Number(b.expected_delta_reduction || 0) - Number(a.expected_delta_reduction || 0)).slice(0, 5);
    const recentOutcomes = (state.outcomes || []).slice(0, 5);
    const evolutionRecommendations = (state.evolutionRecommendations || []).slice(0, 5);
    return {
      powered_by: "CYVX",
      creator: "Dakota Lee Jonsgaard",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      services: {
        constitution: { criteria: (state.criteria || []).length, protected: (state.criteria || []).filter((item) => item.protected).length },
        reality: { realityObjects: (state.realityObjects || []).length, observations: (state.observations || []).length, drift: state.reality && state.reality.reality_drift != null ? state.reality.reality_drift : 0 },
        significance: { records: (state.significanceRecords || []).length, topSalience: topSignificanceRecords[0] || null },
        intervention: { queue: (state.interventions || []).length, topIntervention: topInterventions[0] || null },
        learning: { outcomes: (state.outcomes || []).length, trust: (state.trusts || []).length, knowledge: (state.knowledgeRecords || []).length },
        evolution: { recommendations: (state.evolutionRecommendations || []).length, open: (state.evolutionRecommendations || []).filter((item) => (item.status || "open") !== "closed").length },
      },
      counts: { criteria: (state.criteria || []).length, realityObjects: (state.realityObjects || []).length, significanceRecords: (state.significanceRecords || []).length, interventions: (state.interventions || []).length, outcomes: (state.outcomes || []).length, evolutionRecommendations: (state.evolutionRecommendations || []).length, cirMetrics: (state.cirMetrics || []).length, recommendations: (state.recommendations || []).length, priorities: (state.priorities || []).length },
      cir: cir,
      topSignificanceRecords: topSignificanceRecords,
      topInterventions: topInterventions,
      recentOutcomes: recentOutcomes,
      evolutionRecommendations: evolutionRecommendations,
      intelligence: typeof this.intelligence === 'function' ? this.intelligence() : null,
      remainingKernelGaps: computeKernelGaps(state),
    };
  };

  PlatformKernel.prototype.kernel = function kernel() {
    return this.kernelSummary();
  };

  PlatformKernel.prototype.graph = function graphWithKernelV1() {
    const base = originalGraph.call(this);
    const state = this.snapshot();
    const graph = clone(base);
    graph.nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
    graph.edges = Array.isArray(graph.edges) ? graph.edges : [];
    graph.nodes.push(...(state.criteria || []).map((item) => ({ id: item.id, label: item.title || item.name, kind: "criterion", state: item.state || "active", constitutional: item.constitutional })));
    graph.nodes.push(...(state.realityObjects || []).map((item) => ({ id: item.id, label: item.title || item.name, kind: "reality_object", state: item.state, constitutional: item.constitutional })));
    graph.nodes.push(...(state.significanceRecords || []).map((item) => ({ id: item.id, label: item.title || item.name, kind: "significance", state: item.status || "active", constitutional: item.constitutional })));
    graph.nodes.push(...(state.evolutionRecommendations || []).map((item) => ({ id: item.id, label: item.title || item.name, kind: "evolution_recommendation", state: item.status || "open", constitutional: item.constitutional })));
    graph.nodes.push(...(state.cirMetrics || []).map((item) => ({ id: item.id, label: item.title || item.name, kind: "cir_metric", state: item.status || "calculated", constitutional: item.constitutional })));
    graph.edges.push(...(state.significanceRecords || []).map((item) => {
      const edges = [];
      if (item.reality_object_id) edges.push({ id: item.id + "-" + item.reality_object_id, from: item.id, to: item.reality_object_id, relation: "scores", strength: item.salience || 0.5, impact: item.importance || 0.2 });
      if (item.criterion_id) edges.push({ id: item.id + "-" + item.criterion_id, from: item.id, to: item.criterion_id, relation: "evaluated_by", strength: item.salience || 0.5, impact: item.importance || 0.2 });
      return edges;
    }).flat());
    graph.edges.push(...(state.interventions || []).map((item) => {
      const edges = [];
      (item.significance_record_ids || []).forEach((significanceId) => edges.push({ id: item.id + "-" + significanceId, from: item.id, to: significanceId, relation: "targets", strength: item.confidence || 0.5, impact: item.expected_delta_reduction || 0.2 }));
      if (item.target_reality_object_id) edges.push({ id: item.id + "-" + item.target_reality_object_id, from: item.id, to: item.target_reality_object_id, relation: "acts_on", strength: item.confidence || 0.5, impact: item.expected_delta_reduction || 0.2 });
      return edges;
    }).flat());
    graph.edges.push(...(state.outcomes || []).map((item) => item.intervention_id ? ({ id: item.id + "-" + item.intervention_id, from: item.id, to: item.intervention_id, relation: "validates", strength: 0.82, impact: item.capability_impact || 0.2 }) : null).filter(Boolean));
    return graph;
  };

  PlatformKernel.prototype.reality = function realityWithKernelV1() {
    const base = originalReality.call(this);
    const state = this.snapshot();
    const realityObjects = state.realityObjects || [];
    const drift = Number((Number(base.reality_drift || 0) + Math.min(0.3, realityObjects.length / 100)).toFixed(2));
    return Object.assign({}, base, { reality_objects: realityObjects.length, reality_objects_top: realityObjects.slice(0, 5), reality_drift: drift });
  };

  PlatformKernel.prototype.status = function statusWithKernelV1() {
    const base = originalStatus.call(this);
    const state = this.snapshot();
    return Object.assign({}, base, { criteria: state.criteria.length, realityObjects: state.realityObjects.length, significanceRecords: state.significanceRecords.length, evolutionRecommendations: state.evolutionRecommendations.length, cirMetrics: state.cirMetrics.length });
  };

  PlatformKernel.prototype.executive = function executiveWithKernelV1() {
    const base = originalExecutive.call(this);
    const kernelSummary = this.kernelSummary();
    return Object.assign({}, base, { kernel: kernelSummary, cir: kernelSummary.cir, topSignificanceRecords: kernelSummary.topSignificanceRecords, topInterventions: kernelSummary.topInterventions, recentOutcomes: kernelSummary.recentOutcomes, evolutionRecommendations: kernelSummary.evolutionRecommendations });
  };

  PlatformKernel.prototype.createIntervention = function createInterventionWithKernelV1(input = {}) {
    const intervention = originalCreateIntervention.call(this, input);
    this.mutate((state) => {
      appendKernelEvent(state, "intervention.created", intervention.id, "Intervention created: " + intervention.title, { intervention: intervention, related_mission_id: intervention.related_mission_id, related_entity_ids: intervention.related_entity_ids || [] });
      return state;
    });
    this.calculateCir({ source: "intervention.created", related_intervention_ids: [intervention.id] });
    return intervention;
  };

  PlatformKernel.prototype.recordOutcome = function recordOutcomeWithKernelV1(input = {}) {
    const outcome = originalRecordOutcome.call(this, input);
    this.mutate((state) => {
      appendKernelEvent(state, "outcome.created", outcome.id, "Outcome created: " + outcome.title, { outcome: outcome, related_mission_id: outcome.mission_id, related_entity_ids: outcome.entity_ids || [] });
      return state;
    });
    this.calculateCir({ source: "outcome.created", related_outcome_ids: [outcome.id] });
    return outcome;
  };

  PlatformKernel.prototype.proposeIntervention = function proposeIntervention(input = {}) {
    return this.createIntervention(input);
  };

  function appendKernelEvent(state, eventType, subjectId, summary, payload = {}) {
    const event = createEvent({ event_type: eventType, subject_id: subjectId || null, summary: summary || "", payload: payload || {}, related_entity_ids: payload.related_entity_ids || [], related_mission_id: payload.related_mission_id || null, severity: payload.severity || "info", source: payload.source || "cyvx" });
    state.events = Array.isArray(state.events) ? state.events : [];
    state.events.unshift(event);
    return event;
  }

  function appendCirMetric(state, context = {}) {
    const metric = buildCirMetric(state, context);
    state.cirMetrics = Array.isArray(state.cirMetrics) ? state.cirMetrics : [];
    state.cirMetrics.unshift(metric);
    appendKernelEvent(state, "cir.calculated", metric.id, "CIR calculated: " + String(metric.score), { cir_metric: metric });
    return metric;
  }

  function buildCirMetric(state, context = {}) {
    const significance = state.significanceRecords || [];
    const interventions = state.interventions || [];
    const outcomes = state.outcomes || [];
    const deltaReduced = round3(significance.reduce((sum, record) => sum + Math.max(0, Number(record.importance || 0) + Number(record.salience || 0)), 0) + outcomes.reduce((sum, outcome) => sum + Math.max(0, Number(outcome.capability_impact || 0) + Number(outcome.constitutional_impact || 0) + Math.max(0, -Number(outcome.risk_delta || 0))), 0));
    const resourceConsumed = round3(interventions.reduce((sum, item) => sum + Math.max(0, Number(item.cost || 0)), 0) + outcomes.reduce((sum, item) => sum + Math.max(0, Number(item.economic_impact && item.economic_impact.cost || 0)), 0));
    const timeConsumed = round3(Math.max(1, interventions.length + outcomes.length + significance.length / 2));
    const confidence = round3(average([...significance.map((item) => Number(item.confidence != null ? item.confidence : 0.5)), ...interventions.map((item) => Number(item.confidence != null ? item.confidence : 0.5)), ...outcomes.map((item) => Number(item.trust_impact != null ? Math.max(0, Math.min(1, 0.5 + item.trust_impact)) : 0.5))]));
    const score = round3(deltaReduced / Math.max(1, resourceConsumed + timeConsumed));
    return createCIRMetric({ title: "CIR " + new Date().toISOString(), delta_reduced: deltaReduced, time_consumed: timeConsumed, resource_consumed: resourceConsumed, confidence: confidence, calculation_window: context.calculation_window || "current", related_interventions: interventions.slice(0, 10).map((item) => item.id), related_outcomes: outcomes.slice(0, 10).map((item) => item.id), related_significance_records: significance.slice(0, 10).map((item) => item.id), score: score, metadata: { source: context.source || "kernel", context: clone(context) } });
  }

  function computeKernelGaps(state) {
    const gaps = [];
    if (!(state.criteria || []).length) gaps.push("No constitutional criteria defined");
    if (!(state.realityObjects || []).length) gaps.push("No reality objects mapped");
    if (!(state.significanceRecords || []).length) gaps.push("No significance records generated");
    if (!(state.interventions || []).length) gaps.push("No interventions queued");
    if (!(state.outcomes || []).length) gaps.push("No outcomes recorded");
    if (!(state.evolutionRecommendations || []).length) gaps.push("No evolution recommendations created");
    if (!(state.cirMetrics || []).length) gaps.push("CIR has not been calculated yet");
    return gaps;
  }

  function buildSignificanceInput(criterion, realityObject, input = {}) {
    const delta = measureDelta(realityObject.state || realityObject.observed_state || {}, criterion.preferred_state || {});
    const importance = clamp01((Number(criterion.priority || 1) / 5) + delta);
    const optionality = clamp01(1 - delta * 0.5 + Number(criterion.protected ? 0.1 : 0));
    const risk = clamp01(delta * 0.6 + Number(criterion.protected ? 0.1 : 0.2));
    const opportunity = clamp01(1 - risk + (1 - Number(input.risk_weight || 0.5)) * 0.1);
    const salience = clamp01((importance + optionality + opportunity - risk) / 3);
    return { title: input.title || (criterion.title || criterion.name || "criterion") + " on " + (realityObject.title || realityObject.name || realityObject.id), reality_object_id: realityObject.id, criterion_id: criterion.id, delta: { raw: delta, desired: clone(criterion.preferred_state || {}), observed: clone(realityObject.state || realityObject.observed_state || {}) }, importance: importance, optionality: optionality, risk: risk, opportunity: opportunity, salience: salience, confidence: input.confidence != null ? Number(input.confidence) : Number((criterion.confidence != null ? criterion.confidence : 0.5) * 0.5 + (realityObject.confidence != null ? realityObject.confidence : 0.5) * 0.5), rationale: input.rationale || "Reality and constitution were compared.", evidence: Array.isArray(input.evidence) ? clone(input.evidence) : (Array.isArray(realityObject.observations) ? clone(realityObject.observations) : []), status: input.status || "active", metadata: input.metadata || { source: "kernel" }, linked_event_ids: input.linked_event_ids || [] };
  }

  function resolveCriterion(state, input = {}) {
    if (input.criterion_id) return (state.criteria || []).find((item) => item.id === input.criterion_id) || null;
    if (input.criterion) return input.criterion;
    return (state.criteria || [])[0] || null;
  }

  function resolveRealityObject(state, input = {}) {
    if (input.reality_object_id) return (state.realityObjects || []).find((item) => item.id === input.reality_object_id) || null;
    if (input.realityObject) return input.realityObject;
    return (state.realityObjects || [])[0] || null;
  }

  function listRecords(records, query = {}) {
    let items = Array.isArray(records) ? records.slice() : [];
    if (query.state) items = items.filter((item) => String(item.state || item.status || "").toLowerCase() === String(query.state).toLowerCase());
    if (query.status) items = items.filter((item) => String(item.status || "").toLowerCase() === String(query.status).toLowerCase());
    if (query.subject_id) items = items.filter((item) => item.subject_id === query.subject_id || item.reality_object_id === query.subject_id || item.criterion_id === query.subject_id);
    const limit = Number(query.limit || query.top || 0);
    return limit > 0 ? items.slice(0, limit) : items;
  }

  function measureDelta(a, b) {
    if (a == null && b == null) return 0;
    if (typeof a === "number" && typeof b === "number") return Math.abs(a - b);
    if (Array.isArray(a) || Array.isArray(b)) return Math.abs((Array.isArray(a) ? a : []).length - (Array.isArray(b) ? b : []).length) / Math.max(1, (Array.isArray(a) ? a : []).length + (Array.isArray(b) ? b : []).length);
    if (a && b && typeof a === "object" && typeof b === "object") {
      const keys = new Set(Object.keys(a).concat(Object.keys(b)));
      let total = 0;
      let count = 0;
      for (const key of keys) {
        const av = a[key];
        const bv = b[key];
        if (typeof av === "number" || typeof bv === "number") {
          total += Math.abs(Number(av || 0) - Number(bv || 0));
          count += 1;
        } else if (JSON.stringify(av) !== JSON.stringify(bv)) {
          total += 1;
          count += 1;
        }
      }
      return count ? total / count : 1;
    }
    return a === b ? 0 : 1;
  }

  function average(values) {
    const numbers = (Array.isArray(values) ? values : []).map((value) => Number(value)).filter((value) => !Number.isNaN(value));
    if (!numbers.length) return 0.5;
    return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
  }

  function round3(value) {
    return Number(Number(value || 0).toFixed(3));
  }

  function clamp01(value) {
    return Math.max(0, Math.min(1, Number(value || 0)));
  }
}

module.exports = { augmentKernelV1 };
