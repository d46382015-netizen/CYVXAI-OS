const STRATEGIES = ["balanced", "cost-optimizer", "performance-guardian", "reliability-engineer", "capacity-planner"];

export function createGenome(seed = {}) {
  return {
    riskTolerance: clamp(seed.riskTolerance ?? 0.45, 0, 1),
    costWeight: clamp(seed.costWeight ?? 0.45, 0, 1),
    performanceWeight: clamp(seed.performanceWeight ?? 0.55, 0, 1),
    strategy: seed.strategy ?? "balanced",
    mutationRate: clamp(seed.mutationRate ?? 0.08, 0.01, 0.3),
    specialization: seed.specialization ?? "generalist"
  };
}

export function mutateGenome(genome, signal = {}) {
  const drift = signal.drift ?? genome.mutationRate;
  const next = {
    ...genome,
    riskTolerance: clamp(genome.riskTolerance + randomShift(drift), 0, 1),
    costWeight: clamp(genome.costWeight + randomShift(drift), 0, 1),
    performanceWeight: clamp(genome.performanceWeight + randomShift(drift), 0, 1),
    mutationRate: clamp(genome.mutationRate + randomShift(drift / 2), 0.01, 0.3)
  };
  next.strategy = inferStrategy(next);
  next.specialization = inferSpecialization(next, signal);
  return next;
}

export function inferStrategy(genome) {
  if (genome.costWeight > 0.7 && genome.performanceWeight < 0.55) {
    return "cost-optimizer";
  }
  if (genome.performanceWeight > 0.72) {
    return "performance-guardian";
  }
  if (genome.riskTolerance < 0.35) {
    return "reliability-engineer";
  }
  if (genome.costWeight < 0.35 && genome.performanceWeight < 0.45) {
    return "capacity-planner";
  }
  return "balanced";
}

export function inferSpecialization(genome, signal = {}) {
  const wins = signal.wins ?? 0;
  const losses = signal.losses ?? 0;
  const score = signal.score ?? 0;
  if (genome.costWeight >= genome.performanceWeight + 0.2 && wins > losses) {
    return "Cost Optimizer";
  }
  if (genome.performanceWeight > genome.costWeight && score > 0) {
    return "Performance Guardian";
  }
  if (genome.riskTolerance < 0.4) {
    return "Reliability Engineer";
  }
  if ((signal.avgUtilization ?? 0) > 0.72) {
    return "Capacity Planner";
  }
  return "Generalist";
}

function randomShift(scale) {
  return (Math.random() - 0.5) * scale * 2;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export { STRATEGIES };

