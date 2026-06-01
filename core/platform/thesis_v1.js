"use strict";

function augmentThesisPlatform(PlatformKernel, models) {
  if (PlatformKernel.prototype.__cyvxThesisAugmented) return;
  PlatformKernel.prototype.__cyvxThesisAugmented = true;

  const { clone, createEvent, idFrom } = models;

  const BELIEFS = [
    {
      key: "reality",
      title: "Reality can be programmatically observed",
      status: "Unknown",
      baseline: 0.42,
      evidence: (state) => collectRealityEvidence(state),
      contradictions: (state) => collectRealityContradictions(state),
    },
    {
      key: "prediction",
      title: "Future outcomes can be predicted",
      status: "Unknown",
      baseline: 0.38,
      evidence: (state) => collectPredictionEvidence(state),
      contradictions: (state) => collectPredictionContradictions(state),
    },
    {
      key: "calibration",
      title: "Calibration improves over time",
      status: "Unknown",
      baseline: 0.34,
      evidence: (state) => collectCalibrationEvidence(state),
      contradictions: (state) => collectCalibrationContradictions(state),
    },
    {
      key: "trust",
      title: "Trust correlates with outcomes",
      status: "Unknown",
      baseline: 0.3,
      evidence: (state) => collectTrustEvidence(state),
      contradictions: (state) => collectTrustContradictions(state),
    },
    {
      key: "value",
      title: "Loop value exceeds loop cost",
      status: "Unknown",
      baseline: 0.28,
      evidence: (state) => collectValueEvidence(state),
      contradictions: (state) => collectValueContradictions(state),
    },
    {
      key: "generalization",
      title: "The same kernel works across domains",
      status: "Unknown",
      baseline: 0.26,
      evidence: (state) => collectGeneralizationEvidence(state),
      contradictions: (state) => collectGeneralizationContradictions(state),
    },
    {
      key: "extension",
      title: "The kernel can be extended without architectural rewrites",
      status: "Unknown",
      baseline: 0.35,
      evidence: (state) => collectExtensionEvidence(state),
      contradictions: (state) => collectExtensionContradictions(state),
    },
  ];

  PlatformKernel.prototype.thesisBeliefs = function thesisBeliefs(query = {}) {
    return filterRecords(this.thesisEngine().beliefs, query);
  };

  PlatformKernel.prototype.thesisPredictions = function thesisPredictions(query = {}) {
    return filterRecords(this.snapshot().thesisPredictions || [], query);
  };

  PlatformKernel.prototype.thesisExperiments = function thesisExperiments(query = {}) {
    return filterRecords(this.snapshot().thesisExperiments || [], query);
  };

  PlatformKernel.prototype.thesisLoops = function thesisLoops(query = {}) {
    return filterRecords(this.snapshot().thesisLoops || [], query);
  };

  PlatformKernel.prototype.thesisVerdicts = function thesisVerdicts(query = {}) {
    return filterRecords(this.thesisEngine().beliefs.map((belief) => ({
      belief: belief.belief,
      status: belief.status,
      confidence: belief.confidence,
      evidence_count: belief.evidence_count,
      contradictions_count: belief.contradictions_count,
      uncertainty: belief.uncertainty,
      last_updated: belief.last_updated,
    })), query);
  };

  PlatformKernel.prototype.recordThesisPrediction = function recordThesisPrediction(input = {}) {
    let prediction = null;
    this.mutate((state) => {
      state.thesisPredictions = ensure(state, "thesisPredictions");
      prediction = buildPredictionRecord(input);
      state.thesisPredictions.unshift(prediction);
      appendThesisEvent(state, "thesis.prediction.recorded", prediction.id, "Thesis prediction recorded: " + prediction.belief, { prediction });
      return state;
    });
    return prediction;
  };

  PlatformKernel.prototype.closeThesisPrediction = function closeThesisPrediction(predictionId, patch = {}) {
    let prediction = null;
    this.mutate((state) => {
      state.thesisPredictions = ensure(state, "thesisPredictions");
      prediction = state.thesisPredictions.find((item) => item.id === predictionId);
      if (!prediction) throw new Error("Thesis prediction not found: " + predictionId);
      Object.assign(prediction, clone(patch), { updated_at: new Date().toISOString() });
      prediction.actual_outcome = patch.actual_outcome != null ? clone(patch.actual_outcome) : prediction.actual_outcome;
      prediction.prediction_error = patch.prediction_error != null ? Number(patch.prediction_error) : prediction.prediction_error;
      prediction.confidence_error = patch.confidence_error != null ? Number(patch.confidence_error) : prediction.confidence_error;
      prediction.learning_record = patch.learning_record != null ? clone(patch.learning_record) : prediction.learning_record;
      prediction.trust_impact = patch.trust_impact != null ? Number(patch.trust_impact) : prediction.trust_impact;
      prediction.status = patch.status || "closed";
      appendThesisEvent(state, "thesis.prediction.closed", prediction.id, "Thesis prediction closed: " + prediction.belief, { prediction });
      return state;
    });
    return prediction;
  };

  PlatformKernel.prototype.recordThesisExperiment = function recordThesisExperiment(input = {}) {
    let experiment = null;
    this.mutate((state) => {
      state.thesisExperiments = ensure(state, "thesisExperiments");
      experiment = buildExperimentRecord(input);
      state.thesisExperiments.unshift(experiment);
      appendThesisEvent(state, "thesis.experiment.recorded", experiment.id, "Thesis experiment recorded: " + experiment.hypothesis, { experiment });
      return state;
    });
    return experiment;
  };

  PlatformKernel.prototype.recordThesisLoop = function recordThesisLoop(input = {}) {
    let loop = null;
    this.mutate((state) => {
      state.thesisLoops = ensure(state, "thesisLoops");
      loop = buildLoopRecord(input);
      state.thesisLoops.unshift(loop);
      appendThesisEvent(state, "thesis.loop.completed", loop.id, "Thesis loop completed: " + loop.belief, { loop });
      return state;
    });
    return loop;
  };

  PlatformKernel.prototype.thesisEngine = function thesisEngine(input = {}) {
    const state = this.snapshot();
    const beliefs = BELIEFS.map((definition) => buildBeliefState(state, definition));
    const beliefCount = beliefs.length;
    const supported = beliefs.filter((item) => item.status === "Supported").length;
    const partiallySupported = beliefs.filter((item) => item.status === "Partially Supported").length;
    const unknown = beliefs.filter((item) => item.status === "Unknown").length;
    const contradicted = beliefs.filter((item) => item.status === "Contradicted").length;
    const evidenceCount = beliefs.reduce((sum, item) => sum + item.evidence_count, 0);
    const contradictionCount = beliefs.reduce((sum, item) => sum + item.contradictions_count, 0);
    const averageConfidence = beliefCount ? round3(beliefs.reduce((sum, item) => sum + item.confidence, 0) / beliefCount) : 0;
    const averageUncertainty = beliefCount ? round3(beliefs.reduce((sum, item) => sum + item.uncertainty, 0) / beliefCount) : 1;
    return {
      powered_by: "CYVX",
      era: "3.5",
      generated_at: new Date().toISOString(),
      thesis_confidence: averageConfidence,
      confidence: averageConfidence,
      uncertainty: averageUncertainty,
      evidence_count: evidenceCount,
      contradiction_count: contradictionCount,
      beliefs: beliefs,
      verdicts: {
        supported: supported,
        partially_supported: partiallySupported,
        unknown: unknown,
        contradicted: contradicted,
      },
      top_uncertainties: beliefs.slice().sort((a, b) => b.uncertainty - a.uncertainty).slice(0, 10),
      top_evidence_gaps: beliefs.slice().sort((a, b) => b.evidence_gap - a.evidence_gap).slice(0, 10),
      top_experiments: (state.thesisExperiments || []).slice(0, 10),
      highest_remaining_uncertainty: beliefs.slice().sort((a, b) => b.uncertainty - a.uncertainty)[0] || null,
      evidence_summary: buildEvidenceSummary(state),
      uncertainty_engine: buildUncertaintyEngine(beliefs),
    };
  };

  PlatformKernel.prototype.thesisDashboard = function thesisDashboard(input = {}) {
    const engine = this.thesisEngine(input);
    return {
      thesis_confidence: engine.thesis_confidence,
      thesis_uncertainty: engine.uncertainty,
      verdicts: engine.verdicts,
      beliefs: engine.beliefs,
      top_uncertainties: engine.top_uncertainties,
      top_evidence_gaps: engine.top_evidence_gaps,
      top_experiments: engine.top_experiments,
      highest_remaining_uncertainty: engine.highest_remaining_uncertainty,
      evidence_summary: engine.evidence_summary,
      uncertainty_engine: engine.uncertainty_engine,
    };
  };

  PlatformKernel.prototype.thesisReport = function thesisReport(input = {}) {
    const engine = this.thesisEngine(input);
    return {
      report_type: "thesis_resolution_report",
      era: "3.5",
      generated_at: engine.generated_at,
      evidence_summary: engine.evidence_summary,
      thesis_metrics: engine.beliefs.map((belief) => ({
        belief: belief.belief,
        starting_confidence: belief.starting_confidence,
        ending_confidence: belief.confidence,
        evidence_added: belief.evidence_count,
        confidence_change: belief.confidence_change,
        status: belief.status,
      })),
      scientific_verdict: engine.beliefs.map((belief) => ({
        belief: belief.belief,
        status: belief.status,
        evidence_count: belief.evidence_count,
        evidence_quality: belief.evidence_quality,
        confidence_change: belief.confidence_change,
        remaining_uncertainty: belief.uncertainty,
      })),
      remaining_uncertainty: {
        top_100: engine.beliefs.slice().sort((a, b) => b.uncertainty - a.uncertainty).slice(0, 100),
        top_25: engine.top_uncertainties.slice(0, 25),
        top_10: engine.top_uncertainties.slice(0, 10),
        top_3: engine.top_uncertainties.slice(0, 3),
        highest_remaining_uncertainty: engine.highest_remaining_uncertainty,
      },
      most_valuable_next_experiment: chooseNextExperiment(engine),
      verdicts: engine.verdicts,
      thesis_confidence: engine.thesis_confidence,
      uncertainty: engine.uncertainty,
      beliefs: engine.beliefs,
    };
  };

  const originalStatus = PlatformKernel.prototype.status;
  PlatformKernel.prototype.status = function statusWithThesis() {
    const base = originalStatus.call(this);
    const thesis = this.thesisEngine();
    return Object.assign({}, base, {
      thesis_confidence: thesis.thesis_confidence,
      thesis_uncertainty: thesis.uncertainty,
      thesis_verdicts: thesis.verdicts,
      thesis_evidence_summary: thesis.evidence_summary,
    });
  };

  const originalExecutive = PlatformKernel.prototype.executive;
  PlatformKernel.prototype.executive = function executiveWithThesis() {
    const base = originalExecutive.call(this);
    const thesis = this.thesisReport();
    return Object.assign({}, base, {
      thesis: thesis,
      thesis_engine: this.thesisEngine(),
      thesis_dashboard: this.thesisDashboard(),
    });
  };

  function buildBeliefState(state, definition) {
    const evidence = safeArray(definition.evidence(state));
    const contradictions = safeArray(definition.contradictions(state));
    const startingConfidence = clamp01(definition.baseline);
    const evidenceStrength = round3(Math.min(1, evidence.length / 8 + averageScore(evidence, "score") * 0.15));
    const contradictionStrength = round3(Math.min(1, contradictions.length / 6 + averageScore(contradictions, "score") * 0.15));
    const confidence = clamp01(startingConfidence + evidenceStrength * 0.55 - contradictionStrength * 0.5);
    const evidenceQuality = round3(averageScore(evidence, "score"));
    const evidenceGap = round3(Math.max(0, 1 - evidenceStrength));
    const uncertainty = round3(Math.max(0, 1 - confidence + contradictionStrength * 0.35));
    const status = confidence >= 0.72 && evidence.length >= 3
      ? "Supported"
      : confidence >= 0.52 && evidence.length >= 1
        ? "Partially Supported"
        : contradictions.length > evidence.length && confidence <= 0.4
          ? "Contradicted"
          : "Unknown";
    return {
      belief: definition.title,
      key: definition.key,
      status: status,
      starting_confidence: round3(startingConfidence),
      confidence: round3(confidence),
      confidence_change: round3(confidence - startingConfidence),
      evidence_count: evidence.length,
      contradictions_count: contradictions.length,
      evidence_quality: evidenceQuality,
      evidence: evidence.slice(0, 12),
      contradictions: contradictions.slice(0, 12),
      missing_evidence: buildMissingEvidence(definition.key, evidence, contradictions),
      open_experiments: (state.thesisExperiments || []).filter((item) => item.belief_key === definition.key && (item.status || "open") !== "closed").slice(0, 10),
      pass_criteria: passCriteriaFor(definition.key),
      fail_criteria: failCriteriaFor(definition.key),
      last_updated: latestTimestamp(state, definition.key, evidence, contradictions),
      evidence_strength: evidenceStrength,
      evidence_gap: evidenceGap,
      uncertainty: uncertainty,
      information_gain: round3(evidenceStrength * (1 - contradictionStrength)),
    };
  }

  function buildEvidenceSummary(state) {
    const proofLedger = Array.isArray(state.proof_ledger) ? state.proof_ledger : [];
    const predictions = state.thesisPredictions || [];
    const experiments = state.thesisExperiments || [];
    const loops = state.thesisLoops || [];
    const truths = state.trusts || [];
    const outcomes = state.outcomes || [];
    const knowledge = state.knowledgeRecords || [];
    const observations = state.observations || [];
    return {
      experiments_executed: experiments.length,
      predictions_created: predictions.length,
      predictions_closed: predictions.filter((item) => (item.status || "").toLowerCase() === "closed").length,
      historical_loops_reconstructed: loops.length + outcomes.length,
      calibration_records_generated: outcomes.length + predictions.length,
      trust_updates_generated: truths.length,
      drift_events_measured: observations.length,
      failure_paths_discovered: (state.patterns || []).filter((item) => String(item.pattern_type || item.type || "").toLowerCase() === "failure").length,
      evidence_records_generated: observations.length + outcomes.length + knowledge.length + proofLedger.length,
    };
  }

  function buildUncertaintyEngine(beliefs) {
    return {
      top_100_uncertainties: beliefs.slice().sort((a, b) => b.uncertainty - a.uncertainty).slice(0, 100),
      top_25_uncertainties: beliefs.slice().sort((a, b) => b.uncertainty - a.uncertainty).slice(0, 25),
      top_10_uncertainties: beliefs.slice().sort((a, b) => b.uncertainty - a.uncertainty).slice(0, 10),
      top_3_uncertainties: beliefs.slice().sort((a, b) => b.uncertainty - a.uncertainty).slice(0, 3),
      highest_remaining_uncertainty: beliefs.slice().sort((a, b) => b.uncertainty - a.uncertainty)[0] || null,
    };
  }

  function buildPredictionRecord(input = {}) {
    return {
      id: input.id || "thesis-prediction-" + idFrom(String(input.belief || input.belief_key || input.hypothesis || "prediction"), "thesis-prediction"),
      type: "thesis_prediction",
      belief: input.belief || input.title || input.hypothesis || "prediction",
      belief_key: input.belief_key || input.key || idFrom(input.belief || input.title || input.hypothesis || "prediction", "prediction"),
      source: input.source || "thesis",
      observation: clone(input.observation || {}),
      expected_outcome: clone(input.expected_outcome || input.expectedOutcome || {}),
      confidence: clamp01(Number(input.confidence != null ? input.confidence : 0.5)),
      expected_timeframe: input.expected_timeframe || input.expectedTimeframe || "30d",
      expected_value: input.expected_value != null ? clone(input.expected_value) : null,
      actual_outcome: input.actual_outcome != null ? clone(input.actual_outcome) : null,
      prediction_error: input.prediction_error != null ? Number(input.prediction_error) : null,
      confidence_error: input.confidence_error != null ? Number(input.confidence_error) : null,
      learning_record: input.learning_record != null ? clone(input.learning_record) : null,
      trust_impact: input.trust_impact != null ? Number(input.trust_impact) : 0,
      status: input.status || "open",
      created_at: input.created_at || new Date().toISOString(),
      updated_at: input.updated_at || new Date().toISOString(),
    };
  }

  function buildExperimentRecord(input = {}) {
    return {
      id: input.id || "thesis-experiment-" + idFrom(String(input.hypothesis || input.prediction || "experiment"), "thesis-experiment"),
      type: "thesis_experiment",
      hypothesis: input.hypothesis || input.title || "thesis experiment",
      belief: input.belief || input.title || "thesis experiment",
      belief_key: input.belief_key || input.key || idFrom(input.belief || input.title || input.hypothesis || "experiment", "experiment"),
      prediction: clone(input.prediction || {}),
      expected_outcome: clone(input.expected_outcome || {}),
      confidence: clamp01(Number(input.confidence != null ? input.confidence : 0.5)),
      actual_outcome: input.actual_outcome != null ? clone(input.actual_outcome) : null,
      pass_fail: input.pass_fail || input.status || "open",
      evidence_produced: safeArray(input.evidence_produced),
      confidence_delta: input.confidence_delta != null ? Number(input.confidence_delta) : 0,
      trust_delta: input.trust_delta != null ? Number(input.trust_delta) : 0,
      information_gain: input.information_gain != null ? Number(input.information_gain) : 0,
      status: input.status || "open",
      created_at: input.created_at || new Date().toISOString(),
      updated_at: input.updated_at || new Date().toISOString(),
    };
  }

  function buildLoopRecord(input = {}) {
    return {
      id: input.id || "thesis-loop-" + idFrom(String(input.belief || input.observation || "loop"), "thesis-loop"),
      type: "thesis_loop",
      belief: input.belief || input.title || "thesis loop",
      observation: clone(input.observation || {}),
      prediction: clone(input.prediction || {}),
      expected_outcome: clone(input.expected_outcome || {}),
      actual_outcome: clone(input.actual_outcome || {}),
      error: input.error != null ? Number(input.error) : 0,
      learning: clone(input.learning || {}),
      calibration: clone(input.calibration || {}),
      trust_update: clone(input.trust_update || {}),
      cir_update: clone(input.cir_update || {}),
      confidence: clamp01(Number(input.confidence != null ? input.confidence : 0.5)),
      created_at: input.created_at || new Date().toISOString(),
      updated_at: input.updated_at || new Date().toISOString(),
    };
  }

  function collectRealityEvidence(state) {
    return compact([
      maybeEvidence("observations", (state.observations || []).length, 0.9, "Reality observations recorded"),
      maybeEvidence("outcomes", (state.outcomes || []).length, 0.85, "Measured outcomes recorded"),
      maybeEvidence("significance", (state.significanceRecords || []).length, 0.8, "Significance can be scored"),
      maybeEvidence("proof", (state.proof_ledger || []).length, 0.7, "Repository proof exists"),
    ]);
  }

  function collectRealityContradictions(state) {
    return compact([
      maybeEvidence("missing_observations", (state.observations || []).length === 0 ? 1 : 0, 1, "No observations yet"),
      maybeEvidence("missing_outcomes", (state.outcomes || []).length === 0 ? 1 : 0, 1, "No outcomes yet"),
    ]);
  }

  function collectPredictionEvidence(state) {
    return compact([
      maybeEvidence("simulations", (state.simulations || []).length, 0.75, "Simulations generate predictions"),
      maybeEvidence("decisions", (state.decisions || []).length, 0.72, "Decisions encode expected outcomes"),
      maybeEvidence("thesis_predictions", (state.thesisPredictions || []).length, 0.9, "Prediction ledger records exist"),
    ]);
  }

  function collectPredictionContradictions(state) {
    return compact([
      maybeEvidence("high_prediction_error", averageOutcomeError(state) > 0.3 ? 1 : 0, 1, "Prediction error is high"),
    ]);
  }

  function collectCalibrationEvidence(state) {
    return compact([
      maybeEvidence("trust_records", (state.trusts || []).length, 0.78, "Trust records encode calibration"),
      maybeEvidence("knowledge_records", (state.knowledgeRecords || []).length, 0.82, "Learning records capture error correction"),
      maybeEvidence("closed_predictions", (state.thesisPredictions || []).filter((item) => String(item.status || "").toLowerCase() === "closed").length, 0.9, "Prediction closures exist"),
    ]);
  }

  function collectCalibrationContradictions(state) {
    return compact([
      maybeEvidence("drift", averageRealityDrift(state) > 0.35 ? 1 : 0, 1, "Calibration drift remains high"),
    ]);
  }

  function collectTrustEvidence(state) {
    return compact([
      maybeEvidence("trust_records", (state.trusts || []).length, 0.85, "Trust updates exist"),
      maybeEvidence("outcomes", (state.outcomes || []).length, 0.8, "Outcomes anchor trust"),
      maybeEvidence("confidence_history", (state.decisions || []).reduce((sum, item) => sum + (Array.isArray(item.confidence_history) ? item.confidence_history.length : 0), 0), 0.65, "Decisions retain confidence history"),
    ]);
  }

  function collectTrustContradictions(state) {
    return compact([
      maybeEvidence("unexplained_trust", (state.trusts || []).some((item) => Number(item.trust_score || 0) > 0.8 && !item.trust_history?.length) ? 1 : 0, 1, "Trust lacks linked evidence"),
    ]);
  }

  function collectValueEvidence(state) {
    return compact([
      maybeEvidence("positive_roi", countPositiveRoi(state), 0.86, "Completed loops show positive ROI"),
      maybeEvidence("reports", (state.reports || []).length, 0.7, "Reports capture decision value"),
      maybeEvidence("capabilities", (state.capabilities || []).length, 0.65, "Capability creation suggests value creation"),
    ]);
  }

  function collectValueContradictions(state) {
    return compact([
      maybeEvidence("negative_roi", countNegativeRoi(state), 0.9, "Negative ROI outcomes exist"),
    ]);
  }

  function collectGeneralizationEvidence(state) {
    const domains = new Set();
    for (const mission of state.missions || []) {
      if (mission.domain) domains.add(String(mission.domain).toLowerCase());
      if (mission.scenario) domains.add(String(mission.scenario).toLowerCase());
    }
    return compact([
      maybeEvidence("domains", domains.size, 0.7, "Multiple domains are represented"),
      maybeEvidence("missions", (state.missions || []).length, 0.78, "Kernel runs across missions"),
      maybeEvidence("workflows", (state.workflows || []).length, 0.72, "Workflow execution exists"),
    ]);
  }

  function collectGeneralizationContradictions(state) {
    const domains = new Set();
    for (const mission of state.missions || []) {
      if (mission.domain) domains.add(String(mission.domain).toLowerCase());
    }
    return compact([
      maybeEvidence("single_domain", domains.size <= 1 && (state.missions || []).length > 0 ? 1 : 0, 1, "Only one domain is represented"),
    ]);
  }

  function collectExtensionEvidence(state) {
    return compact([
      maybeEvidence("plugins", (state.workflows || []).length + (state.events || []).length, 0.7, "Extensions attach through events and workflows"),
      maybeEvidence("api_routes", 1, 0.8, "API surface is already extensible"),
      maybeEvidence("dashboard", 1, 0.75, "Dashboard can display new evidence surfaces"),
    ]);
  }

  function collectExtensionContradictions(state) {
    return compact([
      maybeEvidence("architectural_rewrite", 0, 1, "No extension pathway exists"),
    ]);
  }

  function averageOutcomeError(state) {
    const outcomes = state.outcomes || [];
    if (!outcomes.length) return 0;
    return round3(outcomes.reduce((sum, item) => sum + Number(item.prediction_error || 0), 0) / outcomes.length / 1000);
  }

  function averageRealityDrift(state) {
    const observations = state.observations || [];
    if (!observations.length) return 0;
    return round3(observations.reduce((sum, item) => sum + Number(item.confidence != null ? 1 - Number(item.confidence) : 0.5), 0) / observations.length);
  }

  function countPositiveRoi(state) {
    return (state.outcomes || []).filter((item) => Number(item.economic_impact && item.economic_impact.roi || item.roi || 0) > 1).length;
  }

  function countNegativeRoi(state) {
    return (state.outcomes || []).filter((item) => Number(item.economic_impact && item.economic_impact.roi || item.roi || 0) <= 1).length;
  }

  function buildMissingEvidence(key, evidence, contradictions) {
    const map = {
      reality: ["more independent observations", "repeated outcome measurement"],
      prediction: ["closed predictions with ground truth", "forecast error history"],
      calibration: ["day/week/month calibration trends", "confidence drift over time"],
      trust: ["trust series linked to outcomes", "trust recovery after failures"],
      value: ["loop cost accounting", "measured outcome uplift"],
      generalization: ["multiple independent domains", "cross-domain comparison"],
      extension: ["plugin attachment evidence", "extension outcomes without rewrites"],
    };
    const baseline = map[key] || ["additional measured evidence"];
    return baseline.slice(Math.min(baseline.length, evidence.length + contradictions.length));
  }

  function passCriteriaFor(key) {
    return {
      reality: "At least three independent observation sources and one measured outcome stream.",
      prediction: "Prediction records exist with measurable error against actual outcomes.",
      calibration: "Calibration drift decreases over successive report windows.",
      trust: "Trust updates correspond to outcome quality rather than self-evaluation.",
      value: "Measured outcomes demonstrate positive loop value over cost.",
      generalization: "Same kernel produces evidence across more than one domain.",
      extension: "New evidence surfaces attach without architectural rewrites.",
    }[key] || "Evidence threshold reached.";
  }

  function failCriteriaFor(key) {
    return {
      reality: "Observations cannot be persisted or matched to outcomes.",
      prediction: "Predictions do not map to actual outcomes.",
      calibration: "Prediction error stays flat or worsens over time.",
      trust: "Trust changes without outcome evidence.",
      value: "Loop cost exceeds measured value.",
      generalization: "Only one domain can be supported without rewrites.",
      extension: "Extensions require architectural replacement.",
    }[key] || "Evidence remains insufficient.";
  }

  function latestTimestamp(state, key, evidence, contradictions) {
    const timestamps = []
      .concat((evidence || []).map((item) => item.created_at || item.updated_at))
      .concat((contradictions || []).map((item) => item.created_at || item.updated_at))
      .concat((state.thesisExperiments || []).filter((item) => item.belief_key === key).map((item) => item.updated_at || item.created_at));
    return timestamps.filter(Boolean).sort().slice(-1)[0] || new Date().toISOString();
  }

  function chooseNextExperiment(engine) {
    const target = engine.top_uncertainties[0] || engine.highest_remaining_uncertainty;
    if (!target) return null;
    return {
      hypothesis: "Increase confidence in " + target.belief,
      belief: target.belief,
      belief_key: target.key,
      expected_outcome: "Additional evidence should reduce uncertainty and improve calibration.",
      information_gain_expected: round3(target.uncertainty),
      recommended_action: target.missing_evidence[0] || "collect additional evidence",
      status: "proposed",
    };
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

  function appendThesisEvent(state, eventType, subjectId, summary, payload) {
    const event = createEvent({
      event_type: eventType,
      subject_id: subjectId,
      summary: summary,
      payload: payload || {},
      source: "thesis",
      related_entity_ids: [],
    });
    state.events = Array.isArray(state.events) ? state.events : [];
    state.events.unshift(event);
    return event;
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function maybeEvidence(id, count, score, title) {
    if (!count && count !== 0) return null;
    return {
      id: id,
      title: title,
      count: Number(count || 0),
      score: clamp01(Number(score != null ? score : 0.5)),
    };
  }

  function compact(items) {
    return items.filter(Boolean);
  }

  function averageScore(items, key) {
    if (!items.length) return 0;
    return round3(items.reduce((sum, item) => sum + Number(item[key] != null ? item[key] : item.score || 0), 0) / items.length);
  }

  function buildUncertaintyValue(confidence, contradictionCount) {
    return round3(Math.max(0, 1 - confidence + Math.min(0.35, contradictionCount * 0.05)));
  }

  function buildBeliefSummary(definition, state) {
    const evidence = safeArray(definition.evidence(state));
    const contradictions = safeArray(definition.contradictions(state));
    return buildBeliefState(state, definition);
  }

  function buildBeliefState(state, definition) {
    const evidence = safeArray(definition.evidence(state));
    const contradictions = safeArray(definition.contradictions(state));
    const startingConfidence = clamp01(definition.baseline);
    const evidenceStrength = round3(Math.min(1, evidence.length / 8 + averageScore(evidence, "score") * 0.15));
    const contradictionStrength = round3(Math.min(1, contradictions.length / 6 + averageScore(contradictions, "score") * 0.15));
    const confidence = clamp01(startingConfidence + evidenceStrength * 0.55 - contradictionStrength * 0.5);
    const evidenceQuality = round3(averageScore(evidence, "score"));
    const evidenceGap = round3(Math.max(0, 1 - evidenceStrength));
    const uncertainty = buildUncertaintyValue(confidence, contradictions.length);
    const status = confidence >= 0.72 && evidence.length >= 3
      ? "Supported"
      : confidence >= 0.52 && evidence.length >= 1
        ? "Partially Supported"
        : contradictions.length > evidence.length && confidence <= 0.4
          ? "Contradicted"
          : "Unknown";
    return {
      belief: definition.title,
      key: definition.key,
      status: status,
      starting_confidence: round3(startingConfidence),
      confidence: round3(confidence),
      confidence_change: round3(confidence - startingConfidence),
      evidence_count: evidence.length,
      contradictions_count: contradictions.length,
      evidence_quality: evidenceQuality,
      evidence: evidence.slice(0, 12),
      contradictions: contradictions.slice(0, 12),
      missing_evidence: buildMissingEvidence(definition.key, evidence, contradictions),
      open_experiments: (state.thesisExperiments || []).filter((item) => item.belief_key === definition.key && (item.status || "open") !== "closed").slice(0, 10),
      pass_criteria: passCriteriaFor(definition.key),
      fail_criteria: failCriteriaFor(definition.key),
      last_updated: latestTimestamp(state, definition.key, evidence, contradictions),
      evidence_strength: evidenceStrength,
      evidence_gap: evidenceGap,
      uncertainty: uncertainty,
      information_gain: round3(evidenceStrength * (1 - contradictionStrength)),
    };
  }

  function round3(value) {
    return Number(Number(value || 0).toFixed(3));
  }

  function clamp01(value) {
    return Math.max(0, Math.min(1, Number(value || 0)));
  }
}

module.exports = { augmentThesisPlatform };
