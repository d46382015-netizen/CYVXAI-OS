"use strict";

function grade(score) {
  if (score >= 90) return "production";
  if (score >= 75) return "ready";
  if (score >= 50) return "degraded";
  return "blocked";
}

function readiness(checks) {
  const score = checks.reduce((sum, item) => sum + (item.ok ? item.weight : 0), 0);
  return { score, grade: grade(score), checks };
}

module.exports = { grade, readiness };
