"use strict";

function augmentDecisionIntelligence(PlatformKernel, models) {
  if (PlatformKernel.prototype.__cyvxDecisionIntelligenceAugmented) return;
  PlatformKernel.prototype.__cyvxDecisionIntelligenceAugmented = true;

  const { clone, createEvent, idFrom } = models;

  const originalCreateDecision = PlatformKernel.prototype.createDecision;
  const originalRecordOutcome = PlatformKernel.prototype.recordOutcome;
  const originalCreateIntervention = PlatformKernel.prototype.createIntervention;
  const originalCreateMission = PlatformKernel.prototype.createMission;
  const originalLaunchMission = PlatformKernel.prototype.launchMission;
  const originalCoordinateScenario = PlatformKernel.prototype.coordinateScenario;
  const originalModelCompany = PlatformKernel.prototype.modelCompany;
  const originalCreateReport = PlatformKernel.prototype.createReport;
  const originalExecutive = PlatformKernel.prototype.executive;
  const originalStatus = PlatformKernel.prototype.status;

  PlatformKernel.prototype.decisionMemories = function decisionMemories(query = {}) {
    return filterRecords(this.snapshot().decisionMemories || [], query);
  };

  PlatformKernel.prototype.decisionQualityRecords = function decisionQualityRecords(query = {}) {
    return filterRecords(this.snapshot().decisionQualityRecords || [], query);
  };

  PlatformKernel.prototype.decisionCalibrationRecords = function decisionCalibrationRecords(query = {}) {
    return filterRecords(this.snapshot().decisionCalibrationRecords || [], query);
  };

  PlatformKernel.prototype.truthRecords = function truthRecords(query = {}) {
    return filterRecords(this.snapshot().truthRecords || [], query);
  };

  PlatformKernel.prototype.dailyDecisionBriefs = function dailyDecisionBriefs(query = {}) {
    return filterRecords(this.snapshot().dailyDecisionBriefs || [], query);
  };

  PlatformKernel.prototype.decisionImprovementRate = function decisionImprovementRate() {
    return buildDecisionImprovementRate(this.snapshot());
  };

  PlatformKernel.prototype.truthModel = function truthModel() {
    return buildTruthModel(this.snapshot());
  };

  PlatformKernel.prototype.dailyDecisionBrief = function dailyDecisionBrief() {
    const state = this.snapshot();
    const brief = buildDailyDecisionBrief(state);
    this.mutate((draft) => {
      draft.dailyDecisionBriefs = Array.isArray(draft.dailyDecisionBriefs) ? draft.dailyDecisionBriefs : [];
      draft.dailyDecisionBriefs.unshift(brief);
      appendDecisionEvent(draft, "decision.brief.created", brief.id, "Daily decision brief created: " + brief.what_matters_most, { brief });
      return draft;
    });
    return brief;
  };

  PlatformKernel.prototype.createDecision = function createDecisionWithDecisionIntelligence(input = {}) {
    const truth = buildTruthEnvelope(input);
    let decision = originalCreateDecision.call(this, Object.assign({}, input, { truth_model: truth, counterfactual: buildCounterfactualFromInput(input), recommendation_type: input.recommendation_type || input.kind || "recommendation", domain: input.domain || input.metadata && input.metadata.domain || null }));
    this.mutate((state) => {
      state.decisionMemories = ensure(state, "decisionMemories");
      const memory = buildDecisionMemoryRecord(decision, input, { status: "open" });
      state.decisionMemories.unshift(memory);
      decision.decision_memory_id = memory.id;
      decision.truth_model = truth;
      decision.counterfactual = buildCounterfactualFromInput(input);
      decision.learning_records = Array.isArray(decision.learning_records) ? decision.learning_records : [];
      decision.calibration_records = Array.isArray(decision.calibration_records) ? decision.calibration_records : [];
      appendDecisionEvent(state, "decision.created", decision.id, "Decision created: " + decision.title, { decision, decision_memory: memory });
      return state;
    });
    return decision;
  };

  PlatformKernel.prototype.recordOutcome = function recordOutcomeWithDecisionIntelligence(input = {}) {
    const outcome = originalRecordOutcome.call(this, input);
    const decisionId = input.decision_id || input.decisionId || outcome && outcome.decision_id || null;
    if (!decisionId) return outcome;
    this.mutate((state) => {
      state.decisionMemories = Array.isArray(state.decisionMemories) ? state.decisionMemories : [];
      state.decisionQualityRecords = Array.isArray(state.decisionQualityRecords) ? state.decisionQualityRecords : [];
      state.decisionCalibrationRecords = Array.isArray(state.decisionCalibrationRecords) ? state.decisionCalibrationRecords : [];
      state.truthRecords = Array.isArray(state.truthRecords) ? state.truthRecords : [];
      const decision = findDecision(state, decisionId);
      const memory = findDecisionMemory(state, decisionId) || buildDecisionMemoryRecord(decision || { id: decisionId }, input, { status: "closed" });
      const baseline = resolveBaselineOutcome(decision, input);
      const decisionScore = scoreOutcome(outcome, input.expected_outcome || input.actual_outcome || input.measured || {});
      const baselineScore = scoreOutcome(baseline, baseline);
      const improved = decisionScore >= baselineScore;
      const improvementRate = round3(decisionScore - baselineScore);
      const quality = buildDecisionQuality({
        decision,
        outcome,
        baseline,
        improved,
        improvementRate,
        truth: buildTruthEnvelope(Object.assign({}, input, { observed: outcome.actual_outcome || outcome.measured || input.actual_outcome || null, validated: outcome.actual_outcome || outcome.measured || null })),
      });
      const calibration = buildCalibrationRecord({ decision, outcome, baseline, memory, quality });
      const updatedMemory = Object.assign({}, memory, {
        outcome_id: outcome.id,
        actual_outcome: clone(outcome.actual_outcome || outcome.measured || null),
        metrics_before: clone(baseline),
        metrics_after: clone(outcome.actual_outcome || outcome.measured || outcome || null),
        delta: clone(outcome.reality_gap || outcome.delta || {}),
        success_level: improved ? "improved" : "regressed",
        evidence: Array.isArray(memory.evidence) ? memory.evidence.slice() : [],
        decision_quality: quality,
        learning_record: {
          lesson: buildLesson(decision, outcome, improved),
          improved,
          improvement_rate: improvementRate,
        },
        validation_status: improved ? "validated" : "unvalidated",
        updated_at: new Date().toISOString(),
      });
      upsertById(state.decisionMemories, updatedMemory);
      state.decisionQualityRecords.unshift(quality);
      state.decisionCalibrationRecords.unshift(calibration);
      state.truthRecords.unshift(quality.truth_model);
      if (decision) {
        decision.actual_outcome = clone(outcome.actual_outcome || outcome.measured || null);
        decision.learning_records = Array.isArray(decision.learning_records) ? decision.learning_records : [];
        decision.learning_records.unshift({ at: new Date().toISOString(), lesson: updatedMemory.learning_record.lesson, improved, improvement_rate: improvementRate });
        decision.calibration_records = Array.isArray(decision.calibration_records) ? decision.calibration_records : [];
        decision.calibration_records.unshift(calibration);
        decision.decision_quality = quality;
        decision.validation_status = updatedMemory.validation_status;
      }
      appendDecisionEvent(state, "decision.validated", decisionId, "Decision validated: " + (decision && decision.title || decisionId), { decision, outcome, decision_memory: updatedMemory, decision_quality: quality });
      return state;
    });
    return outcome;
  };

  PlatformKernel.prototype.createIntervention = function createInterventionWithDecisionIntelligence(input = {}) {
    const withDecision = Object.assign({}, input, { decision_id: input.decision_id || input.decisionId || latestDecisionId(this.snapshot()) });
    const intervention = originalCreateIntervention.call(this, withDecision);
    if (intervention && withDecision.decision_id) intervention.decision_id = withDecision.decision_id;
    return intervention;
  };

  PlatformKernel.prototype.createMission = function createMissionWithDecisionIntelligence(input = {}) {
    const withDecision = Object.assign({}, input, { decision_id: input.decision_id || input.decisionId || latestDecisionId(this.snapshot()) });
    const mission = originalCreateMission.call(this, withDecision);
    if (mission && withDecision.decision_id) mission.decision_id = withDecision.decision_id;
    return mission;
  };

  PlatformKernel.prototype.launchMission = function launchMissionWithDecisionIntelligence(input = {}) {
    const decisionId = input.decision_id || input.decisionId || latestDecisionId(this.snapshot());
    const result = originalLaunchMission.call(this, Object.assign({}, input, { decision_id: decisionId }));
    if (result && result.mission) result.mission.decision_id = decisionId;
    if (result && result.intervention) result.intervention.decision_id = decisionId;
    if (result && result.decision) result.decision.decision_memory_id = result.decision.decision_memory_id || decisionId;
    return result;
  };

  PlatformKernel.prototype.coordinateScenario = function coordinateScenarioWithDecisionIntelligence(input = {}) {
    const result = originalCoordinateScenario.call(this, Object.assign({}, input, { decision_id: input.decision_id || input.decisionId || latestDecisionId(this.snapshot()) }));
    return attachDecisionReferences(result, input);
  };

  PlatformKernel.prototype.modelCompany = function modelCompanyWithDecisionIntelligence(input = {}) {
    const result = originalModelCompany.call(this, Object.assign({}, input, { decision_id: input.decision_id || input.decisionId || latestDecisionId(this.snapshot()) }));
    return attachDecisionReferences(result, input);
  };

  PlatformKernel.prototype.createReport = function createReportWithDecisionIntelligence(input = {}) {
    const report = originalCreateReport.call(this, input);
    if (report && input.decision_id) report.decision_id = input.decision_id;
    return report;
  };

  PlatformKernel.prototype.executive = function executiveWithDecisionIntelligence() {
    const base = originalExecutive.call(this);
    const state = this.snapshot();
    const decisionIntelligence = this.decisionIntelligence();
    const truthModel = this.truthModel();
    const brief = this.dailyDecisionBrief();
    return Object.assign({}, base, {
      decision_intelligence: decisionIntelligence,
      truth_model: truthModel,
      daily_decision_brief: brief,
      decision_improvement_rate: this.decisionImprovementRate(),
      decision_memory_count: (state.decisionMemories || []).length,
    });
  };

  PlatformKernel.prototype.status = function statusWithDecisionIntelligence() {
    const base = originalStatus.call(this);
    const decisionIntelligence = this.decisionIntelligence();
    return Object.assign({}, base, {
      decisionMemories: decisionIntelligence.memory_count,
      decisionQualityRecords: decisionIntelligence.quality_count,
      decisionCalibrationRecords: decisionIntelligence.calibration_count,
      dailyDecisionBriefs: decisionIntelligence.brief_count,
    });
  };

  PlatformKernel.prototype.decisionIntelligence = function decisionIntelligence() {
    const state = this.snapshot();
    const memories = Array.isArray(state.decisionMemories) ? state.decisionMemories : [];
    const qualityRecords = Array.isArray(state.decisionQualityRecords) ? state.decisionQualityRecords : [];
    const calibrationRecords = Array.isArray(state.decisionCalibrationRecords) ? state.decisionCalibrationRecords : [];
    const truthModel = buildTruthModel(state);
    return {
      memory_count: memories.length,
      quality_count: qualityRecords.length,
      calibration_count: calibrationRecords.length,
      improvement_rate: buildDecisionImprovementRate(state),
      by_domain: groupDecisionImprovement(memories, "domain"),
      by_recommendation_type: groupDecisionImprovement(memories, "recommendation_type"),
      truth_model: truthModel,
      decision_quality_score: qualityRecords.length ? round3(average(qualityRecords.map((item) => Number(item.decision_quality_score || 0)))) : 0,
      calibration_score: calibrationRecords.length ? round3(average(calibrationRecords.map((item) => Number(item.calibration_accuracy || 0)))) : 0,
      recent_decisions: memories.slice(0, 10),
      recent_quality: qualityRecords.slice(0, 10),
      recent_calibration: calibrationRecords.slice(0, 10),
      brief_count: (state.dailyDecisionBriefs || []).length,
    };
  };

  function buildTruthEnvelope(input = {}) {
    return {
      observed: clone(input.observed || input.observation || input.observation_state || null),
      inferred: clone(input.inferred || input.thesis || input.significance || null),
      predicted: clone(input.predicted || input.expected_outcome || input.prediction || null),
      recommended: clone(input.recommended || input.recommendation || input.selected_action || null),
      validated: clone(input.validated || input.actual_outcome || null),
    };
  }

  function buildCounterfactualFromInput(input = {}) {
    return {
      recommended_path: clone(input.expected_outcome || input.predicted || input.recommendation || null),
      baseline_path: clone(input.baseline_outcome || input.baseline || input.do_nothing || null),
      comparison: clone(input.counterfactual_comparison || null),
    };
  }

  function buildDecisionMemoryRecord(decision, input = {}, patch = {}) {
    return {
      id: input.id || "decision-memory-" + idFrom(String(decision && decision.id || input.decision_id || input.title || "decision"), "decision-memory"),
      type: "decision_memory",
      decision_id: decision && decision.id || input.decision_id || null,
      situation: input.context || input.situation || decision && decision.title || "decision",
      context: clone(input.context || input.situation || decision && decision.context || null),
      observation_references: Array.isArray(input.observation_references) ? clone(input.observation_references) : Array.isArray(decision && decision.observation_references) ? clone(decision.observation_references) : [],
      significance_references: Array.isArray(input.significance_references) ? clone(input.significance_references) : Array.isArray(decision && decision.significance_references) ? clone(decision.significance_references) : [],
      thesis_references: Array.isArray(input.thesis_references) ? clone(input.thesis_references) : Array.isArray(decision && decision.thesis_references) ? clone(decision.thesis_references) : [],
      recommendation: clone(input.recommendation || decision && decision.recommendation || null),
      alternatives: Array.isArray(input.alternatives) ? clone(input.alternatives) : Array.isArray(decision && decision.alternatives) ? clone(decision.alternatives) : [],
      evidence: Array.isArray(input.evidence) ? clone(input.evidence) : Array.isArray(decision && decision.evidence) ? clone(decision.evidence) : [],
      confidence: Number(input.confidence != null ? input.confidence : decision && decision.confidence != null ? decision.confidence : 0.5),
      selected_action: clone(input.selected_action || decision && decision.selected_option || null),
      expected_outcome: clone(input.expected_outcome || decision && decision.expected_outcome || null),
      actual_outcome: clone(input.actual_outcome || null),
      decision_quality: clone(patch.decision_quality || null),
      learning_records: Array.isArray(input.learning_records) ? clone(input.learning_records) : [],
      calibration_records: Array.isArray(input.calibration_records) ? clone(input.calibration_records) : [],
      baseline_outcome: clone(input.baseline_outcome || input.baseline || null),
      improvement_rate: Number(input.improvement_rate != null ? input.improvement_rate : 0),
      improved: Boolean(input.improved),
      recommendation_type: input.recommendation_type || decision && decision.recommendation_type || "recommendation",
      domain: input.domain || decision && decision.domain || null,
      validation_status: patch.status || input.validation_status || "open",
      lesson: input.lesson || "",
      created_at: input.created_at || new Date().toISOString(),
      updated_at: input.updated_at || new Date().toISOString(),
    };
  }

  function buildDecisionQuality({ decision, outcome, baseline, improved, improvementRate, truth }) {
    const accepted = Boolean(decision);
    const executed = Boolean(outcome);
    const outcomeImproved = Boolean(improved);
    const confidenceAccuracy = clamp01(1 - Math.min(1, Math.abs(Number(decision && decision.confidence != null ? decision.confidence : 0.5) - Number(outcome && outcome.confidence != null ? outcome.confidence : 0.5))));
    const impactMagnitude = scoreOutcome(outcome, outcome && outcome.actual_outcome || outcome && outcome.measured || outcome || {});
    const outcomeQuality = clamp01(scoreOutcome(outcome, outcome && outcome.actual_outcome || outcome && outcome.measured || outcome || {}) - scoreOutcome(baseline, baseline) + 0.5);
    const score = round3((Number(accepted) + Number(executed) + Number(outcomeImproved) + confidenceAccuracy + outcomeQuality) / 5);
    return {
      id: "decision-quality-" + idFrom(String(decision && decision.id || outcome && outcome.id || "decision"), "decision-quality"),
      type: "decision_quality",
      decision_id: decision && decision.id || null,
      outcome_id: outcome && outcome.id || null,
      recommendation_accepted: accepted,
      action_executed: executed,
      outcome_improved: outcomeImproved,
      impact_magnitude: round3(impactMagnitude),
      confidence_accuracy: round3(confidenceAccuracy),
      outcome_quality: round3(outcomeQuality),
      decision_quality_score: score,
      improvement_rate: round3(improvementRate),
      baseline_outcome: clone(baseline),
      actual_outcome: clone(outcome && (outcome.actual_outcome || outcome.measured || outcome || null)),
      truth_model: truth,
      created_at: new Date().toISOString(),
    };
  }

  function buildCalibrationRecord({ decision, outcome, baseline, memory, quality }) {
    const confidence = Number(decision && decision.confidence != null ? decision.confidence : 0.5);
    const actual = Number(outcome && outcome.confidence != null ? outcome.confidence : outcome && outcome.trust_score != null ? outcome.trust_score : 0.5);
    const confidenceDrift = round3(Math.abs(confidence - actual));
    const calibrationAccuracy = round3(1 - Math.min(1, confidenceDrift));
    return {
      id: "decision-calibration-" + idFrom(String(decision && decision.id || outcome && outcome.id || "decision"), "decision-calibration"),
      type: "decision_calibration",
      decision_id: decision && decision.id || null,
      outcome_id: outcome && outcome.id || null,
      confidence: round3(confidence),
      actual: round3(actual),
      calibration_accuracy: calibrationAccuracy,
      confidence_drift: confidenceDrift,
      trustworthiness: quality.decision_quality_score,
      memory_id: memory && memory.id || null,
      created_at: new Date().toISOString(),
    };
  }

  function buildDecisionImprovementRate(state) {
    const memories = Array.isArray(state.decisionMemories) ? state.decisionMemories : [];
    const relevant = memories.filter((item) => item.improved != null);
    const improved = relevant.filter((item) => item.improved).length;
    const total = Math.max(1, relevant.length);
    const rate = improved / total;
    return {
      lifetime: round3(rate),
      last_30_days: round3(rateForWindow(relevant, 30)),
      last_90_days: round3(rateForWindow(relevant, 90)),
      by_domain: groupDecisionImprovement(relevant, "domain"),
      by_recommendation_type: groupDecisionImprovement(relevant, "recommendation_type"),
      improved,
      total: relevant.length,
      rate: round3(rate),
    };
  }

  function groupDecisionImprovement(records, key) {
    const groups = new Map();
    for (const record of records) {
      const groupKey = String(record[key] || "unknown");
      if (!groups.has(groupKey)) groups.set(groupKey, []);
      groups.get(groupKey).push(record);
    }
    const output = {};
    for (const [groupKey, items] of groups.entries()) {
      const improved = items.filter((item) => item.improved).length;
      output[groupKey] = {
        improved,
        total: items.length,
        rate: round3(improved / Math.max(1, items.length)),
      };
    }
    return output;
  }

  function rateForWindow(records, days) {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const filtered = records.filter((item) => Date.parse(item.updated_at || item.created_at || new Date().toISOString()) >= cutoff);
    if (!filtered.length) return 0;
    return filtered.filter((item) => item.improved).length / filtered.length;
  }

  function buildTruthModel(state) {
    const recentObservation = (state.observations || [])[0] || null;
    const recentDecision = (state.decisions || [])[0] || null;
    const recentOutcome = (state.outcomes || [])[0] || null;
    const recentRecommendation = (state.recommendations || [])[0] || null;
    const recentValidated = (state.decisionMemories || []).find((item) => item.validation_status === "validated") || null;
    return {
      observed: recentObservation ? {
        type: "observed",
        source: recentObservation.source || "cyvx",
        summary: recentObservation.title || recentObservation.summary || "",
        evidence: recentObservation.evidence || [],
      } : null,
      inferred: recentDecision ? {
        type: "inferred",
        source: "decision",
        summary: recentDecision.title || recentDecision.rationale || "",
        confidence: recentDecision.confidence,
      } : null,
      predicted: recentDecision ? {
        type: "predicted",
        summary: recentDecision.predicted_outcome || recentDecision.expected_outcome || null,
        confidence: recentDecision.confidence,
      } : null,
      recommended: recentRecommendation ? {
        type: "recommended",
        summary: recentRecommendation.title || recentRecommendation.rationale || "",
        confidence: recentRecommendation.confidence,
      } : null,
      validated: recentOutcome ? {
        type: "validated",
        summary: recentOutcome.actual_outcome || recentOutcome.measured || null,
        validation_status: recentValidated ? recentValidated.validation_status : "validated",
      } : null,
      mapping: {
        observation_to_recommendation: recentObservation && recentRecommendation ? "linked" : "unlinked",
        recommendation_to_decision: recentRecommendation && recentDecision ? "linked" : "unlinked",
        decision_to_outcome: recentDecision && recentOutcome ? "linked" : "unlinked",
      },
    };
  }

  function buildDailyDecisionBrief(state) {
    const decisions = Array.isArray(state.decisions) ? state.decisions : [];
    const memories = Array.isArray(state.decisionMemories) ? state.decisionMemories : [];
    const quality = Array.isArray(state.decisionQualityRecords) ? state.decisionQualityRecords : [];
    const latestDecision = decisions[0] || null;
    const latestMemory = memories[0] || null;
    const latestQuality = quality[0] || null;
    const recommendation = (state.recommendations || [])[0] || null;
    const before = latestMemory && latestMemory.metrics_before || null;
    const after = latestMemory && latestMemory.metrics_after || null;
    const improvement = latestMemory && latestMemory.improvement_rate != null ? latestMemory.improvement_rate : 0;
    return {
      id: "daily-brief-" + new Date().toISOString().slice(0, 10),
      date: new Date().toISOString().slice(0, 10),
      what_matters_most: latestDecision && latestDecision.title || recommendation && recommendation.title || "No active decision",
      why_it_matters: latestDecision && latestDecision.rationale || recommendation && recommendation.rationale || "It shapes the next measurable outcome.",
      what_happens_if_ignored: latestDecision && latestDecision.counterfactual && latestDecision.counterfactual.baseline_path ? JSON.stringify(latestDecision.counterfactual.baseline_path) : "Baseline path likely persists.",
      recommended_action: latestDecision && latestDecision.selected_option || recommendation && recommendation.title || "Continue with the highest-value verified action.",
      expected_impact: latestDecision && latestDecision.expected_impact || recommendation && recommendation.expected_impact || null,
      confidence: Number(latestDecision && latestDecision.confidence != null ? latestDecision.confidence : recommendation && recommendation.confidence != null ? recommendation.confidence : 0.5),
      what_changed_since_yesterday: latestQuality ? "Decision quality " + String(latestQuality.decision_quality_score || 0) + ", improvement rate " + String(improvement) : "New evidence available.",
      what_cyx_learned: latestMemory && latestMemory.learning_record ? latestMemory.learning_record.lesson : "No validated lesson yet.",
      metrics_before: before,
      metrics_after: after,
      decision_improvement_rate: buildDecisionImprovementRate(state),
      truth_model: buildTruthModel(state),
      recent_decision_id: latestDecision && latestDecision.id || null,
      recommendation_type: latestDecision && latestDecision.recommendation_type || recommendation && recommendation.recommendation_type || "recommendation",
      domain: latestDecision && latestDecision.domain || null,
    };
  }

  function buildDecisionQuality({ decision, outcome, baseline, improved, improvementRate, truth }) {
    const accepted = Boolean(decision);
    const executed = Boolean(outcome);
    const confidenceAccuracy = clamp01(1 - Math.min(1, Math.abs(Number(decision && decision.confidence != null ? decision.confidence : 0.5) - Number(outcome && outcome.confidence != null ? outcome.confidence : 0.5))));
    const impactMagnitude = scoreOutcome(outcome, outcome && outcome.actual_outcome || outcome && outcome.measured || outcome || {});
    const outcomeQuality = clamp01(scoreOutcome(outcome, outcome && outcome.actual_outcome || outcome && outcome.measured || outcome || {}) - scoreOutcome(baseline, baseline) + 0.5);
    const score = round3((Number(accepted) + Number(executed) + Number(improved) + confidenceAccuracy + outcomeQuality) / 5);
    return {
      id: "decision-quality-" + idFrom(String(decision && decision.id || outcome && outcome.id || "decision"), "decision-quality"),
      type: "decision_quality",
      decision_id: decision && decision.id || null,
      outcome_id: outcome && outcome.id || null,
      recommendation_accepted: accepted,
      action_executed: executed,
      outcome_improved: Boolean(improved),
      impact_magnitude: round3(impactMagnitude),
      confidence_accuracy: round3(confidenceAccuracy),
      outcome_quality: round3(outcomeQuality),
      decision_quality_score: score,
      improvement_rate: round3(improvementRate),
      baseline_outcome: clone(baseline),
      actual_outcome: clone(outcome && (outcome.actual_outcome || outcome.measured || outcome || null)),
      truth_model: truth,
      created_at: new Date().toISOString(),
    };
  }

  function resolveBaselineOutcome(decision, input) {
    return clone(
      input.baseline_outcome ||
      input.baseline ||
      decision && decision.baseline_outcome ||
      decision && decision.counterfactual && decision.counterfactual.baseline_path ||
      null
    );
  }

  function scoreOutcome(outcome, fallback) {
    const source = outcome || fallback || {};
    const value = source.value != null ? Number(source.value) : source.roi != null ? Number(source.roi) * 100 : source.success != null ? Number(source.success) * 100 : source.score != null ? Number(source.score) : 0;
    const risk = source.risk != null ? Number(source.risk) : 0;
    const opportunity = source.opportunity != null ? Number(source.opportunity) : 0;
    return round3(Math.max(0, value + opportunity * 50 - risk * 50) / 100);
  }

  function buildLesson(decision, outcome, improved) {
    const title = decision && decision.title || "decision";
    return improved
      ? "The decision " + title + " improved reality and should be retained."
      : "The decision " + title + " did not improve reality and should be revised.";
  }

  function attachDecisionReferences(result, input = {}) {
    if (!result || !result.mission) return result;
    const decisionId = input.decision_id || input.decisionId || null;
    if (decisionId) {
      result.mission.decision_id = decisionId;
      if (result.intervention) result.intervention.decision_id = decisionId;
      if (result.decision) result.decision.decision_id = decisionId;
    }
    return result;
  }

  function findDecision(state, decisionId) {
    return (state.decisions || []).find((item) => item.id === decisionId) || null;
  }

  function findDecisionMemory(state, decisionId) {
    return (state.decisionMemories || []).find((item) => item.decision_id === decisionId) || null;
  }

  function latestDecisionId(state) {
    const decisions = Array.isArray(state.decisions) ? state.decisions : [];
    return decisions[0] ? decisions[0].id : null;
  }

  function upsertById(collection, record) {
    const index = collection.findIndex((item) => item.id === record.id);
    if (index >= 0) {
      collection[index] = Object.assign({}, collection[index], clone(record));
    } else {
      collection.unshift(record);
    }
  }

  function appendDecisionEvent(state, eventType, subjectId, summary, payload) {
    const event = createEvent({
      event_type: eventType,
      subject_id: subjectId,
      summary: summary,
      payload: payload || {},
      source: "decision_intelligence",
      related_entity_ids: [],
    });
    state.events = Array.isArray(state.events) ? state.events : [];
    state.events.unshift(event);
    return event;
  }

  function filterRecords(records, query) {
    const items = Array.isArray(records) ? records : [];
    const keys = Object.keys(query || {});
    if (!keys.length) return items;
    return items.filter((item) => keys.every((key) => {
      if (query[key] == null || query[key] === "") return true;
      const value = item[key];
      if (Array.isArray(value)) return value.includes(query[key]);
      return String(value) === String(query[key]);
    }));
  }

  function ensure(state, key) {
    state[key] = Array.isArray(state[key]) ? state[key] : [];
    return state[key];
  }

  function average(values) {
    if (!values.length) return 0;
    return values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length;
  }

  function round3(value) {
    return Number(Number(value || 0).toFixed(3));
  }

  function clamp01(value) {
    return Math.max(0, Math.min(1, Number(value || 0)));
  }
}

module.exports = { augmentDecisionIntelligence };
