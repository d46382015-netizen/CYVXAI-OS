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

const { EventEmitter } = require("node:events");
const { response, attribution } = require("./attribution");

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function sum(values) {
  return values.reduce((total, value) => total + Number(value || 0), 0);
}

function mean(values) {
  return values.length ? sum(values) / values.length : 0;
}

function quantile(values, q) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * q)));
  return sorted[index];
}

function entropy(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  const total = values.length || 1;
  let result = 0;
  for (const count of counts.values()) {
    const p = count / total;
    result -= p * Math.log2(p);
  }
  return result;
}

function zScore(value, values) {
  const avg = mean(values);
  const variance = mean(values.map((v) => (v - avg) ** 2));
  const sd = Math.sqrt(variance);
  if (!sd) return 0;
  return (value - avg) / sd;
}

function weightedVote(items, weightKey = "weight", scoreKey = "score") {
  return items.reduce((best, item) => {
    const score = Number(item[scoreKey] || 0) * Number(item[weightKey] || 1);
    if (!best || score > best.weightedScore) return { item, weightedScore: score };
    return best;
  }, null)?.item || null;
}

function createEmitter() {
  return new EventEmitter();
}

function createState(name, extra = {}) {
  return response("state", { name, ...extra, creator: attribution.creator });
}

module.exports = {
  clamp,
  sum,
  mean,
  quantile,
  entropy,
  zScore,
  weightedVote,
  createEmitter,
  createState,
};
