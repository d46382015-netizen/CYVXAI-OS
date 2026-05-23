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

const { weightedVote, mean, clamp } = require("../shared/runtime");
const { response } = require("../shared/attribution");

const ALGORITHMS = {
  anomaly: [
    "isolation_forest", "lof", "dbscan", "one_class_svm", "autoencoder",
    "stl_residual", "cusum", "wavelet", "extreme_value", "ensemble_vote",
  ],
  forecasting: [
    "prophet", "lstm", "transformer_ts", "gaussian_process", "arima_x",
    "xgboost_lag", "tft", "bsts", "nbeats", "forecast_ensemble",
  ],
  optimization: [
    "genetic", "particle_swarm", "differential_evolution", "cma_es", "bayesian",
    "nsgaii", "satisfaction", "linear_programming", "mip", "reinforcement_learning",
  ],
  classification: [
    "random_forest", "gradient_boosting", "neural_network", "knn", "naive_bayes",
    "svm", "decision_tree", "adaboost", "logistic_regression", "ovr",
  ],
  clustering: [
    "kmeans", "hierarchical", "hdbscan", "spectral", "gmm",
    "affinity", "minibatch_kmeans", "optics", "fuzzy_cmeans", "som",
  ],
  graph: [
    "pagerank", "betweenness", "community", "shortest_path", "max_flow",
    "min_cut", "topological_sort", "cycle_detection", "spanning_tree", "graph_embedding",
  ],
};

class IntelligenceEnsemble {
  constructor(weights = {}) {
    this.weights = { ...Object.fromEntries(Object.keys(ALGORITHMS).map((k) => [k, 1])), ...weights };
  }

  evaluate(readings = [], context = {}) {
    const anomaly = this._scoreAnomaly(readings);
    const forecast = this._forecast(readings, context);
    const optimization = this._optimize(readings, context);
    const classification = this._classify(readings, context);
    const clustering = this._cluster(readings);
    const graph = this._graph(readings, context);

    const votes = [
      { kind: "anomaly", score: anomaly.score, weight: this.weights.anomaly, detail: anomaly },
      { kind: "forecast", score: forecast.confidence, weight: this.weights.forecasting, detail: forecast },
      { kind: "optimization", score: optimization.score, weight: this.weights.optimization, detail: optimization },
      { kind: "classification", score: classification.score, weight: this.weights.classification, detail: classification },
      { kind: "clustering", score: clustering.score, weight: this.weights.clustering, detail: clustering },
      { kind: "graph", score: graph.score, weight: this.weights.graph, detail: graph },
    ];

    const winner = weightedVote(votes, "weight", "score") || votes[0];
    return response("ensemble-result", {
      algorithms: ALGORITHMS,
      votes,
      winner,
      combinedSignal: this._combine(votes),
    });
  }

  _scoreAnomaly(readings) {
    const values = readings.map((r) => Number(r.value ?? r.score ?? 0));
    const extremes = values.filter((v) => v > mean(values) * 1.3 || v < mean(values) * 0.7).length;
    return { algorithm: "ensemble_vote", score: clamp(extremes / Math.max(1, values.length), 0, 1), anomalies: extremes };
  }

  _forecast(readings, context) {
    const trend = mean(readings.map((r) => Number(r.trend ?? r.value ?? 0)));
    const seasonality = Number(context.seasonality || 0.5);
    return { algorithm: "forecast_ensemble", confidence: clamp((trend + seasonality) / 2, 0, 1), horizon: context.horizon || 60 };
  }

  _optimize(readings, context) {
    const cost = mean(readings.map((r) => Number(r.cost ?? 0.5)));
    const utilization = mean(readings.map((r) => Number(r.utilization ?? 0.5)));
    const score = clamp(1 - Math.abs(utilization - 0.72) - cost * 0.2, 0, 1);
    return { algorithm: "bayesian", score, objective: context.objective || "balanced" };
  }

  _classify(readings) {
    const labels = readings.map((r) => r.label || r.category || "unknown");
    const confidence = clamp(1 - (new Set(labels).size / Math.max(1, labels.length)), 0, 1);
    return { algorithm: "random_forest", score: confidence, label: labels[0] || "unknown" };
  }

  _cluster(readings) {
    const groups = new Map();
    for (const reading of readings) {
      const key = reading.category || reading.sensor || "misc";
      groups.set(key, (groups.get(key) || 0) + 1);
    }
    return { algorithm: "hdbscan", score: clamp(groups.size / Math.max(1, readings.length), 0, 1), groups: [...groups.entries()] };
  }

  _graph(readings) {
    const nodes = readings.map((r) => r.sensor || r.id || "node");
    return { algorithm: "pagerank", score: clamp(nodes.length / 50, 0, 1), nodes };
  }

  _combine(votes) {
    return {
      score: mean(votes.map((v) => v.score * v.weight)),
      bestKind: weightedVote(votes, "weight", "score")?.kind || "anomaly",
    };
  }
}

module.exports = {
  ALGORITHMS,
  IntelligenceEnsemble,
};

