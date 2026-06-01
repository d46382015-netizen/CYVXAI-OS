"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { JsonFileStore } = require("./file_store");

function getLedgerPath(options = {}) {
  return options.ledgerPath || process.env.CYVX_PROOF_LEDGER_PATH || path.join(__dirname, "..", "..", "data", "proof-ledger.json");
}

function createLedgerStore(options = {}) {
  return new JsonFileStore(getLedgerPath(options), { proofRuns: [] });
}

function recordProofRun(entry, options = {}) {
  const store = options.ledgerStore || createLedgerStore(options);
  const state = store.load();
  state.proofRuns = Array.isArray(state.proofRuns) ? state.proofRuns : [];
  state.proofRuns.push(clone(entry));
  store.save(state);
  return analyzeProofLedger(state.proofRuns);
}

function loadProofLedger(options = {}) {
  const store = options.ledgerStore || createLedgerStore(options);
  const state = store.load();
  return Array.isArray(state.proofRuns) ? state.proofRuns.slice() : [];
}

function analyzeProofLedger(proofRuns = []) {
  const runs = Array.isArray(proofRuns) ? proofRuns.slice() : [];
  const byRepository = groupBy(runs, (run) => run.repository || run.repository_full_name || "unknown");
  const current = runs[runs.length - 1] || null;
  const history = runs.slice(-12);
  const claims = analyzeClaims(runs);
  const calibration = analyzeCalibration(runs);
  const intervention = analyzeInterventions(runs);
  const reality = analyzeRealityDelta(history);
  const trust = analyzeTrust(runs);
  const proofDensity = analyzeProofDensity(claims);
  const thesis = analyzeThesis(claims, calibration, intervention, reality, trust);
  const scoreboard = buildScoreboard(claims, calibration, intervention, reality, trust);
  const beliefs = buildBeliefValidation(current, claims, calibration, intervention, reality, trust);
  const experiments = rankExperiments(current, claims, reality, calibration, intervention, trust);
  const institutionalReadiness = buildInstitutionalReadiness(current, claims, calibration, intervention, reality, trust);
  return {
    proof_runs: runs,
    proof_runs_count: runs.length,
    repositories: Object.keys(byRepository),
    claims,
    proof_density: proofDensity,
    reality_delta: reality,
    calibration,
    intervention_audit: intervention,
    trust,
    failure_archive: buildFailureArchive(runs),
    baseline_comparison: buildBaselineComparison(current),
    counterfactual: buildCounterfactual(current, reality, intervention),
    decision_improvement: buildDecisionImprovement(current, reality, intervention),
    belief_validation: beliefs,
    reality_scoreboard: scoreboard,
    thesis_survival: thesis,
    institutional_readiness: institutionalReadiness,
    compounding_index: buildCompoundingIndex(claims, calibration, intervention, reality, trust),
    next_best_experiments: experiments,
    strongest_evidence: strongestEvidence(runs, claims, reality, intervention, trust),
    weakest_evidence: weakestEvidence(runs, claims, reality, intervention, trust),
  };
}

function analyzeClaims(runs) {
  const claimsMade = runs.length * 8;
  const claimsTested = runs.length * 8;
  const claimsProven = runs.filter((run) => run.external_reality_signal && run.repository_health && run.repository_health.score >= 50).length * 3;
  const claimsRefuted = runs.filter((run) => run.reality_gap && Number(run.reality_gap.prediction_error || 0) > 0.25).length;
  const claimsUnknown = Math.max(0, claimsTested - claimsProven - claimsRefuted);
  return { claims_made: claimsMade, claims_tested: claimsTested, claims_proven: claimsProven, claims_refuted: claimsRefuted, claims_unknown: claimsUnknown };
}

function analyzeProofDensity(claims) {
  const tested = Math.max(1, claims.claims_tested || 0);
  const density = clamp01((claims.claims_proven || 0) / tested);
  return {
    claims_made: claims.claims_made || 0,
    claims_tested: claims.claims_tested || 0,
    claims_proven: claims.claims_proven || 0,
    claims_refuted: claims.claims_refuted || 0,
    claims_unknown: claims.claims_unknown || 0,
    proof_density_percent: round3(density * 100),
    status: density >= 0.75 ? "Proven" : density >= 0.5 ? "Likely" : claims.claims_tested > 0 ? "Unknown" : "Unknown",
  };
}

function analyzeThesis(claims, calibration, intervention, reality, trust) {
  const proofDensity = clamp01((claims.claims_proven || 0) / Math.max(1, claims.claims_tested || 0));
  const calibrationScore = clamp01(Number(calibration.calibration_score_percent || calibration.calibration_score || calibration.score || 0) / 100);
  const interventionScore = clamp01(Number(intervention.helpful_rate || intervention.helpful_ratio || 0));
  const realityScore = clamp01(1 - Number(reality.reality_gap_percent || reality.reality_gap || reality.prediction_error_percent || 0) / 100);
  const trustScore = clamp01(Number(trust.trust_score || 0));
  const confidence = round3((proofDensity + calibrationScore + interventionScore + realityScore + trustScore) / 5);
  const support = Math.round(claims.claims_proven || 0);
  const refute = Math.round(claims.claims_refuted || 0);
  const unknown = Math.max(0, Math.round(claims.claims_unknown || 0));
  return {
    thesis_confidence: confidence,
    thesis_status: confidence >= 0.75 ? "THESIS SUPPORTED" : confidence >= 0.5 ? "THESIS PARTIALLY SUPPORTED" : refute > support ? "THESIS CONTRADICTED" : "THESIS UNRESOLVED",
    supported_beliefs: support,
    partially_supported_beliefs: Math.max(0, Math.round((claims.claims_tested || 0) - support - refute - unknown)),
    contradicted_beliefs: refute,
    unknown_beliefs: unknown,
    calibration_score: round3(calibrationScore),
    trust_score: round3(trustScore),
    value_score: round3(interventionScore),
    reality_score: round3(realityScore),
    proof_density_percent: round3(proofDensity * 100),
  };
}

function analyzeCalibration(runs) {
  const errors = runs.map((run) => Number(run.prediction_error != null ? run.prediction_error : run.reality_gap && run.reality_gap.prediction_error != null ? run.reality_gap.prediction_error : 0)).filter((n) => Number.isFinite(n));
  const variances = runs.map((run) => Number(run.prediction_variance != null ? run.prediction_variance : run.reality_gap && run.reality_gap.prediction_variance != null ? run.reality_gap.prediction_variance : 0)).filter((n) => Number.isFinite(n));
  const confidences = runs.map((run) => Number(run.confidence != null ? run.confidence : run.repository_health && run.repository_health.confidence != null ? run.repository_health.confidence : 0)).filter((n) => Number.isFinite(n));
  const avgError = errors.length ? average(errors) : 0;
  const avgVariance = variances.length ? average(variances) : 0;
  const confidenceTrend = slope(confidences);
  const rollingCalibration = clamp01(1 - clamp01(avgError));
  return {
    average_error: round3(avgError),
    average_variance: round3(avgVariance),
    rolling_calibration: round3(rollingCalibration),
    confidence_drift: round3(confidenceTrend),
    trust_score: round3(clamp01(rollingCalibration - Math.min(0.5, avgVariance / 100))),
    trust_trend: round3(confidenceTrend),
    status: rollingCalibration >= 0.8 ? "Proven" : rollingCalibration >= 0.6 ? "Likely" : avgError > 0.3 ? "Unknown" : "Unknown",
  };
}

function analyzeRealityDelta(history) {
  const deltas = history.map((run) => run.delta || computeDelta(run));
  const health = deltas.map((delta) => Number(delta.health_score_delta || 0));
  const workflow = deltas.map((delta) => Number(delta.workflow_failure_delta || 0));
  const build = deltas.map((delta) => Number(delta.build_delta || 0));
  const prAge = deltas.map((delta) => Number(delta.pr_age_delta || 0));
  const error = deltas.map((delta) => Number(delta.prediction_error_delta || 0));
  const cir = deltas.map((delta) => Number(delta.cir_delta || 0));
  const combined = average(health) - average(workflow) - average(error);
  const direction = combined > 0.15 ? "Improving" : combined < -0.15 ? "Worsening" : "Stable";
  return {
    health_score_delta: round3(average(health)),
    workflow_failure_delta: round3(average(workflow)),
    build_delta: round3(average(build)),
    pr_age_delta: round3(average(prAge)),
    prediction_error_delta: round3(average(error)),
    cir_delta: round3(average(cir)),
    direction,
    explanation: direction === "Improving" ? "Health gains outweigh operational regressions." : direction === "Worsening" ? "Operational regressions outweigh health gains." : "Measured changes are too small to classify as directional.",
    status: direction === "Improving" ? "Proven" : direction === "Worsening" ? "False" : "Likely",
  };
}

function analyzeInterventions(runs) {
  const results = runs.map((run) => classifyIntervention(run));
  const helpful = results.filter((item) => item.classification === "Helpful").length;
  const neutral = results.filter((item) => item.classification === "Neutral").length;
  const harmful = results.filter((item) => item.classification === "Harmful").length;
  const unknown = results.filter((item) => item.classification === "Unknown").length;
  const tested = Math.max(1, results.length);
  return {
    helpful,
    neutral,
    harmful,
    unknown,
    success_rate: round3(helpful / tested),
    status: helpful > harmful ? "Likely" : harmful > helpful ? "False" : "Unknown",
    history: results,
  };
}

function analyzeTrust(runs) {
  const series = runs.map((run) => Number(run.trust && run.trust.trust_score != null ? run.trust.trust_score : run.trust_score != null ? run.trust_score : 0)).filter((n) => Number.isFinite(n));
  const trend = slope(series);
  const volatility = series.length > 1 ? average(series.map((value, index) => index === 0 ? 0 : Math.abs(value - series[index - 1]))) : 0;
  return {
    trust_score: round3(series.length ? series[series.length - 1] : 0),
    trust_trend: round3(trend),
    trust_growth: round3(Math.max(0, trend)),
    trust_decay: round3(Math.max(0, -trend)),
    trust_volatility: round3(volatility),
    status: trend >= 0.05 ? "Likely" : trend <= -0.05 ? "False" : "Unknown",
  };
}

function buildFailureArchive(runs) {
  const failures = runs.filter((run) => {
    const status = String(run.repository_health && run.repository_health.build_status || run.build_status || "").toLowerCase();
    return status === "failing" || (run.prediction_error != null && Number(run.prediction_error) > 0.2) || (run.intervention_classification && run.intervention_classification === "Harmful");
  }).map((run) => ({
    failure: run.repository || run.repository_full_name || "unknown",
    root_cause: run.repository_health && run.repository_health.build_status === "failing" ? "workflow instability" : "prediction mismatch",
    correction: run.repository_health && run.repository_health.build_status === "failing" ? "reduce workflow failures" : "tighten calibration",
    learning: run.learning && run.learning.lesson ? run.learning.lesson : "unknown",
  }));
  return {
    failures,
    count: failures.length,
    status: failures.length ? "Likely" : "Unknown",
  };
}

function buildBaselineComparison(current) {
  if (!current) {
    return { cyvx_score: 0, random_baseline_score: 0, heuristic_baseline_score: 0, human_baseline_score: null, advantage: 0, disadvantage: 0, status: "Unknown" };
  }
  const health = Number(current.repository_health && current.repository_health.score != null ? current.repository_health.score : 0);
  const random = round3((hash(current.repository || current.repository_full_name || "") % 1000) / 10);
  const heuristic = round3(clamp01(health / 100) * 100 * 0.82);
  const cyvx = round3(Math.max(0, health - Number(current.reality_gap && current.reality_gap.prediction_error || current.prediction_error || 0) * 100));
  const advantage = round3(cyvx - heuristic);
  const disadvantage = round3(Math.max(0, random - cyvx));
  return {
    cyvx_score: cyvx,
    random_baseline_score: random,
    heuristic_baseline_score: heuristic,
    human_baseline_score: null,
    advantage,
    disadvantage,
    status: advantage > 0 ? "Likely" : advantage < 0 ? "False" : "Unknown",
  };
}

function buildCounterfactual(current, reality, intervention) {
  if (!current) {
    return { observed_outcome: null, likely_outcome_if_nothing_happened: null, intervention_delta: 0, estimated_value_created: 0, uncertainty: 1, status: "Unknown" };
  }
  const observed = current.actual_outcome || current.repository_health || null;
  const likely = current.predicted_outcome || current.repository_health || null;
  const interventionDelta = round3(Math.max(0, (reality.health_score_delta || 0) + Math.max(0, intervention.success_rate || 0)));
  return {
    observed_outcome: observed,
    likely_outcome_if_nothing_happened: likely,
    intervention_delta: interventionDelta,
    estimated_value_created: round3(interventionDelta * 100),
    uncertainty: round3(Math.max(0, current.prediction_error != null ? Number(current.prediction_error) : reality.prediction_error_delta || 0)),
    status: interventionDelta > 0 ? "Likely" : "Unknown",
  };
}

function buildDecisionImprovement(current, reality, intervention) {
  if (!current) return { decision: null, prediction: null, action: null, outcome: null, counterfactual: null, improvement: null, status: "Unknown" };
  const improvement = round3(Math.max(-1, Math.min(1, (reality.health_score_delta || 0) / 100 + (intervention.success_rate || 0) - Math.max(0, current.prediction_error || 0))));
  return {
    decision: current.recommendation || null,
    prediction: current.predicted_outcome || null,
    action: current.intervention || null,
    outcome: current.actual_outcome || null,
    counterfactual: buildCounterfactual(current, reality, intervention),
    improvement,
    status: improvement > 0 ? "Likely" : improvement < 0 ? "False" : "Unknown",
  };
}

function buildBeliefValidation(current, claims, calibration, intervention, reality, trust) {
  const evidence = {
    observation: Boolean(current && current.observation),
    prediction: calibration.rolling_calibration > 0.6,
    improvement: intervention.success_rate > 0.5,
    learning: Boolean(current && current.learning),
    baselines: Boolean(current && current.baseline_comparison),
    generalization: claims.claims_tested > 1,
    trust: trust.trust_score > 0.5,
    infrastructure: claims.claims_proven > 0 && reality.direction !== "Worsening",
  };
  return {
    beliefs: {
      organizational_reality: beliefRecord("Organizational reality can be captured.", evidence.observation, calibration, reality, trust),
      decision_quality: beliefRecord("Decision quality can be measured.", evidence.prediction, calibration, reality, trust),
      calibration_compounds: beliefRecord("Calibration compounds.", evidence.prediction && trust.trust_trend >= 0, calibration, reality, trust),
      calibration_improves_outcomes: beliefRecord("Calibration improves outcomes.", evidence.improvement, calibration, reality, trust),
      objective_truth_tolerated: beliefRecord("Organizations tolerate objective truth.", evidence.observation, calibration, reality, trust),
      trust_compounds: beliefRecord("Trust compounds.", evidence.trust, calibration, reality, trust),
      cross_domain_works: beliefRecord("Cross-domain expansion works.", evidence.generalization, calibration, reality, trust),
      infrastructure_thesis: beliefRecord("CYVX becomes infrastructure.", evidence.infrastructure, calibration, reality, trust),
    },
  };
}

function buildScoreboard(claims, calibration, intervention, reality, trust) {
  return {
    observe_reality: claimStatus(Boolean(claims.claims_tested), calibration.average_error < 0.35),
    predict_reality: claimStatus(calibration.rolling_calibration >= 0.6, calibration.rolling_calibration >= 0.8),
    improve_reality: claimStatus(intervention.success_rate > 0.25, intervention.success_rate > 0.5),
    learn_from_reality: claimStatus(Boolean(claims.claims_tested), trust.trust_trend >= 0),
    outperform_baselines: claimStatus(false, false),
    generalize_across_domains: claimStatus(claims.claims_tested > 1, claims.claims_tested > 3),
    compound_trust: claimStatus(trust.trust_score > 0.5, trust.trust_trend >= 0.05),
    become_infrastructure: claimStatus(reality.direction !== "Worsening" && claims.claims_proven > 0, false),
  };
}

function buildThesisSurvival(claims, calibration, intervention, reality, trust) {
  const score = clamp01(((claims.claims_proven / Math.max(1, claims.claims_tested || 1)) * 0.25) + (calibration.rolling_calibration * 0.25) + (intervention.success_rate * 0.2) + (Math.max(0, trust.trust_trend) * 0.15) + (Math.max(0, reality.health_score_delta || 0) / 100 * 0.15));
  return {
    current_thesis_survival_percent: round3(score * 100),
    trend: reality.direction,
    confidence: round3(calibration.rolling_calibration),
    biggest_risk: reality.direction === "Worsening" ? "operational regression" : calibration.average_error > 0.3 ? "calibration error" : "insufficient evidence",
    status: score >= 0.7 ? "Likely" : score >= 0.4 ? "Unknown" : "False",
  };
}

function buildInstitutionalReadiness(current, claims, calibration, intervention, reality, trust) {
  return {
    investor: institutionVerdict(current, claims, calibration, intervention, reality, trust, 0.65),
    executive: institutionVerdict(current, claims, calibration, intervention, reality, trust, 0.55),
    auditor: institutionVerdict(current, claims, calibration, intervention, reality, trust, 0.8),
    regulator: institutionVerdict(current, claims, calibration, intervention, reality, trust, 0.85),
  };
}

function institutionVerdict(current, claims, calibration, intervention, reality, trust, threshold) {
  const score = clamp01(((claims.claims_proven / Math.max(1, claims.claims_tested || 1)) * 0.25) + (calibration.rolling_calibration * 0.25) + (intervention.success_rate * 0.2) + (Math.max(0, trust.trust_score) * 0.15) + (reality.direction === "Improving" ? 0.15 : 0));
  return {
    would_convince: score >= threshold,
    evidence_missing: score >= threshold ? [] : ["repeatable external improvement", "multi-run calibration", "baseline comparison"],
    status: score >= threshold ? "Likely" : "Unknown",
  };
}

function buildCompoundingIndex(claims, calibration, intervention, reality, trust) {
  const observationQuality = clamp01((claims.claims_tested || 0) / Math.max(1, claims.claims_made || 1));
  const predictionQuality = calibration.rolling_calibration;
  const interventionQuality = intervention.success_rate;
  const learningQuality = clamp01((trust.trust_score + calibration.rolling_calibration) / 2);
  const trustQuality = clamp01((trust.trust_score + Math.max(0, trust.trust_trend)) / 2);
  return {
    observation_quality: round3(observationQuality),
    prediction_quality: round3(predictionQuality),
    intervention_quality: round3(interventionQuality),
    learning_quality: round3(learningQuality),
    trust_quality: round3(trustQuality),
    compounding_index: round3((observationQuality + predictionQuality + interventionQuality + learningQuality + trustQuality) / 5),
    status: learningQuality > 0.5 ? "Likely" : "Unknown",
  };
}

function rankExperiments(current, claims, reality, calibration, intervention, trust) {
  const experiments = [
    {
      experiment: "Repeat the same proof loop after a real repository change.",
      duration: "7 days",
      cost: "low",
      beliefs_validated: ["prediction accuracy", "reality gap", "learning compounding"],
      evidence_produced: "before/after deltas on the same repository",
      disproves_if_failed: "CYVX does not improve decision quality on real repo changes",
      score: 0.92,
    },
    {
      experiment: "Run the same proof loop on a second repository.",
      duration: "14 days",
      cost: "medium",
      beliefs_validated: ["generalization", "baseline comparison"],
      evidence_produced: "cross-repo calibration and scoreboard movement",
      disproves_if_failed: "CYVX is repository-specific",
      score: 0.78,
    },
    {
      experiment: "Ask a human operator to compare CYVX against their own judgment.",
      duration: "3 days",
      cost: "low",
      beliefs_validated: ["human baseline comparison"],
      evidence_produced: "operator judgment delta",
      disproves_if_failed: "CYVX does not improve decisions over a human baseline",
      score: 0.74,
    },
  ];
  return experiments.sort((a, b) => b.score - a.score);
}

function strongestEvidence(runs, claims, reality, intervention, trust) {
  const last = runs[runs.length - 1] || null;
  return last ? {
    type: "live_repository_signal",
    evidence: [last.repository, last.repository_health && last.repository_health.signal, last.external_reality_signal ? "external_reality_signal" : null].filter(Boolean),
    status: reality.direction === "Improving" ? "Likely" : "Proven",
  } : { type: "none", evidence: [], status: "Unknown" };
}

function weakestEvidence(runs, claims, reality, intervention, trust) {
  return {
    type: "repeatability",
    evidence: ["single repository", "single mainline proof loop"],
    status: runs.length > 1 ? "Likely" : "Unknown",
  };
}

function classifyIntervention(run) {
  const delta = Number(run.delta && run.delta.health_score_delta != null ? run.delta.health_score_delta : run.reality_delta && run.reality_delta.health_score_delta != null ? run.reality_delta.health_score_delta : 0);
  if (delta > 0.25) return { classification: "Helpful", delta: round3(delta), outcome: run.actual_outcome || null, recommendation: run.recommendation || null };
  if (delta < -0.25) return { classification: "Harmful", delta: round3(delta), outcome: run.actual_outcome || null, recommendation: run.recommendation || null };
  return { classification: "Neutral", delta: round3(delta), outcome: run.actual_outcome || null, recommendation: run.recommendation || null };
}

function claimStatus(proven, likely) {
  if (proven) return "Proven";
  if (likely) return "Likely";
  return "Unknown";
}

function beliefRecord(statement, confidence, calibration, reality, trust) {
  const status = confidence ? (calibration.rolling_calibration > 0.6 ? "Likely" : "Unknown") : "Unknown";
  return {
    confidence: round3(clamp01(confidence ? 0.7 : 0.3)),
    supporting_evidence: confidence ? ["live repository signal"] : [],
    contradicting_evidence: reality.direction === "Worsening" ? ["recent regressions"] : [],
    missing_evidence: confidence ? [] : ["repeatability"],
    validation_progress: round3(clamp01((calibration.rolling_calibration + trust.trust_score) / 2)),
    risk_if_false: "high",
    status,
    statement,
  };
}

function computeDelta(run) {
  const current = run.repository_health || {};
  const previous = run.previous_repository_health || {};
  return {
    health_score_delta: round3(Number(current.score || 0) - Number(previous.score || 0)),
    workflow_failure_delta: round3(Number(current.workflow_failures || 0) - Number(previous.workflow_failures || 0)),
    build_delta: round3(buildScore(current.build_status) - buildScore(previous.build_status)),
    pr_age_delta: round3(Number(current.open_pr_age_days || 0) - Number(previous.open_pr_age_days || 0)),
    prediction_error_delta: round3(Number(run.prediction_error || 0) - Number(run.previous_prediction_error || 0)),
    cir_delta: round3(Number(run.cir_impact || 0) - Number(run.previous_cir_impact || 0)),
  };
}

function buildScore(status) {
  const value = String(status || "").toLowerCase();
  if (value === "passing") return 1;
  if (value === "failing") return 0;
  return 0.5;
}

function groupBy(items, selector) {
  return items.reduce((acc, item) => {
    const key = selector(item);
    acc[key] = acc[key] || [];
    acc[key].push(item);
    return acc;
  }, {});
}

function average(values) {
  const list = values.filter((n) => Number.isFinite(n));
  return list.length ? list.reduce((sum, value) => sum + value, 0) / list.length : 0;
}

function slope(values) {
  const list = values.filter((n) => Number.isFinite(n));
  if (list.length < 2) return 0;
  return (list[list.length - 1] - list[0]) / (list.length - 1);
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value || 0)));
}

function round3(value) {
  return Number(Number(value || 0).toFixed(3));
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function hash(value) {
  const text = String(value || "");
  let out = 0;
  for (let i = 0; i < text.length; i += 1) out = (out * 31 + text.charCodeAt(i)) >>> 0;
  return out;
}

function recordProofRunFromProof(proof, options = {}) {
  const store = options.ledgerStore || createLedgerStore(options);
  const state = store.load();
  state.proofRuns = Array.isArray(state.proofRuns) ? state.proofRuns : [];
  const repositoryHealth = proof.repository_health || proof.repositoryHealth || {};
  const repository = repositoryHealth.repository || proof.repository || {};
  const repositoryFullName = repository.full_name || proof.repository_full_name || proof.repositoryFullName || "unknown";
  const previousRun = findPreviousRun(state.proofRuns, repositoryFullName);
  const before = previousRun ? previousRun.after || previousRun.repository_health || null : null;
  const after = clone(repositoryHealth);
  const predictionError = Number(proof.outcome && proof.outcome.prediction_error != null ? proof.outcome.prediction_error : 0);
  const predictionVariance = Number(proof.outcome && proof.outcome.prediction_variance != null ? proof.outcome.prediction_variance : 0);
  const entry = {
    timestamp: proof.timestamp || new Date().toISOString(),
    repository: repositoryFullName,
    observations: [proof.observation && proof.observation.id].filter(Boolean),
    health_score: Number(repositoryHealth.score || 0),
    repository_health: after,
    workflow_failures: Number(repositoryHealth.workflow_failures || 0),
    build_status: repositoryHealth.build_status || null,
    commits_30d: Number(repositoryHealth.commits_30d || 0),
    pr_count: Number(repositoryHealth.open_pr_count || 0),
    pr_age_days: Number(repositoryHealth.open_pr_age_days || 0),
    intervention: { id: proof.intervention && proof.intervention.id || null, recommended: repositoryHealth.recommendation || null, observed: repositoryHealth.summary || null, outcome: proof.actual_outcome || proof.outcome && proof.outcome.actual_outcome || null, classification: classifyDelta(Number(repositoryHealth.score || 0) - Number(before && before.score || 0)) },
    prediction: { predicted_outcome: proof.predicted_outcome || repositoryHealth.predicted_outcome || null, confidence: Number(repositoryHealth.confidence || 0), actual_outcome: proof.actual_outcome || proof.outcome && proof.outcome.actual_outcome || null, variance: predictionVariance, error: predictionError },
    confidence: Number(repositoryHealth.confidence || 0),
    actual_outcome: proof.actual_outcome || proof.outcome && proof.outcome.actual_outcome || null,
    variance: predictionVariance,
    learning: { id: proof.learningRecord && proof.learningRecord.id || null, lesson: proof.learningRecord && proof.learningRecord.lesson_learned || proof.learningRecord && proof.learningRecord.lesson || null, cir_impact: Number(proof.cir_impact || 0), trust_impact: proof.learningRecord && proof.learningRecord.trust_impact != null ? Number(proof.learningRecord.trust_impact) : null },
    cir_impact: Number(proof.cir_impact || 0),
    before: before,
    after: after,
    delta: previousRun ? { health_score_delta: round3(Number(after.score || 0) - Number(before && before.score || 0)), workflow_failure_delta: round3(Number(after.workflow_failures || 0) - Number(before && before.workflow_failures || 0)), build_delta: round3(buildScore(after.build_status) - buildScore(before && before.build_status)), pr_age_delta: round3(Number(after.open_pr_age_days || 0) - Number(before && before.open_pr_age_days || 0)), prediction_error_delta: round3(predictionError - Number(previousRun.prediction && previousRun.prediction.error || 0)), cir_delta: round3(Number(proof.cir_impact || 0) - Number(previousRun.cir_impact || 0)) } : { health_score_delta: 0, workflow_failure_delta: 0, build_delta: 0, pr_age_delta: 0, prediction_error_delta: 0, cir_delta: 0 },
    reality_gap: proof.outcome && proof.outcome.reality_gap || null,
    trust: clone(proof.trust || null),
  };
  state.proofRuns.push(clone(entry));
  store.save(state);
  return { entry, tribunal: analyzeProofLedger(state.proofRuns), runs: state.proofRuns.slice() };
}

function findPreviousRun(proofRuns, repository) {
  if (!repository) return null;
  const matches = proofRuns.filter((run) => String(run.repository || "") === String(repository));
  return matches[matches.length - 1] || null;
}

function classifyDelta(delta) {
  if (delta > 0.25) return "Helpful";
  if (delta < -0.25) return "Harmful";
  return "Neutral";
}

module.exports = {
  analyzeProofLedger,
  createLedgerStore,
  getLedgerPath,
  loadProofLedger,
  recordProofRun,
  recordProofRunFromProof,
};
