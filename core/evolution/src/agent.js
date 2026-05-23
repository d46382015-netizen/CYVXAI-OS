import { createGenome, inferSpecialization, inferStrategy, mutateGenome } from "./genome.js";

export class Agent {
  constructor(id, seed = {}) {
    this.id = id;
    this.genome = createGenome(seed.genome || {});
    this.credits = seed.credits ?? 0;
    this.age = seed.age ?? 0;
    this.wins = seed.wins ?? 0;
    this.losses = seed.losses ?? 0;
    this.history = [];
    this.specialization = this.genome.specialization;
  }

  observe(cluster) {
    const nodes = cluster.nodes || [];
    const workloads = cluster.workloads || [];
    const nodeCapacity = nodes.reduce((sum, node) => sum + (node.cpu_capacity || node.CPUCapacity || 0), 0);
    const cpuUsed = nodes.reduce((sum, node) => sum + (node.cpu_used || node.CPUUsed || 0), 0);
    const avgUtilization = nodeCapacity > 0 ? cpuUsed / nodeCapacity : 0;
    const hottestWorkload = workloads
      .map((workload) => ({
        workload,
        pressure: ((workload.replicas || workload.Replicas || 1) * (workload.cpu_request || workload.CPURequest || 0))
          / Math.max(1, workload.target_latency_ms || workload.TargetLatencyMS || 1)
      }))
      .sort((a, b) => b.pressure - a.pressure)[0]?.workload || null;

    return {
      avgUtilization,
      cpuUsed,
      nodeCapacity,
      hottestWorkload,
      cost: nodes.reduce((sum, node) => sum + (node.cost_per_hour || node.CostPerHour || 0), 0),
      unhealthyNodes: nodes.filter((node) => !readBool(node.healthy, node.Healthy)).length
    };
  }

  propose(cluster) {
    const obs = this.observe(cluster);
    const workload = obs.hottestWorkload || cluster.workloads?.[0] || null;
    const proposal = this.buildProposal(cluster, obs, workload);
    proposal.agentId = this.id;
    proposal.genome = { ...this.genome };
    proposal.specialization = this.specialization;
    proposal.vote = this.scoreProposal(proposal, obs);
    return proposal;
  }

  buildProposal(cluster, obs, workload) {
    const overloaded = obs.avgUtilization > 0.8 || obs.unhealthyNodes > 0;
    const underutilized = obs.avgUtilization < 0.35;
    const costPressure = this.genome.costWeight > this.genome.performanceWeight;
    const performancePressure = this.genome.performanceWeight >= this.genome.costWeight;

    if (workload && overloaded && performancePressure) {
      return {
        type: "migrate",
        workloadId: workload.id || workload.ID,
        reason: "high utilization demands re-placement toward healthier capacity"
      };
    }

    if (workload && overloaded && costPressure) {
      return {
        type: "scale_up",
        workloadId: workload.id || workload.ID,
        replicas: Math.max(1, (workload.replicas || workload.Replicas || 1) + 1),
        reason: "high utilization needs extra replicas to protect SLA"
      };
    }

    if (workload && underutilized && costPressure) {
      const current = workload.replicas || workload.Replicas || 1;
      return {
        type: "scale_down",
        workloadId: workload.id || workload.ID,
        replicas: Math.max(1, current - 1),
        reason: "cluster is underutilized and should reduce spend"
      };
    }

    return {
      type: "noop",
      reason: "cluster is within expected operating envelope"
    };
  }

  scoreProposal(proposal, obs) {
    let score = 0;
    if (proposal.type === "scale_up") {
      score += this.genome.performanceWeight * 2;
      score -= this.genome.costWeight * 0.5;
    } else if (proposal.type === "scale_down") {
      score += this.genome.costWeight * 2;
      score -= this.genome.performanceWeight * 0.4;
    } else if (proposal.type === "migrate") {
      score += this.genome.riskTolerance * 1.5;
      score += this.genome.performanceWeight;
    } else {
      score += (1 - obs.avgUtilization) * this.genome.costWeight;
    }
    score += this.credits / 100;
    return score;
  }

  learn(outcome) {
    this.age += 1;
    this.history.push(outcome);
    if (this.history.length > 48) {
      this.history.shift();
    }
    if (outcome.reward > 0) {
      this.credits += outcome.reward;
      this.wins += 1;
    } else {
      this.credits += outcome.reward;
      this.losses += 1;
    }
    if (outcome.reward >= 5) {
      this.genome = mutateGenome(this.genome, { drift: 0.03, wins: this.wins, losses: this.losses, score: outcome.reward, avgUtilization: outcome.avgUtilization });
    } else if (outcome.reward < 0) {
      this.genome = mutateGenome(this.genome, { drift: 0.12, wins: this.wins, losses: this.losses, score: outcome.reward, avgUtilization: outcome.avgUtilization });
    }
    this.genome.strategy = inferStrategy(this.genome);
    this.specialization = inferSpecialization(this.genome, {
      wins: this.wins,
      losses: this.losses,
      score: this.credits,
      avgUtilization: outcome.avgUtilization
    });
  }

  toJSON() {
    return {
      id: this.id,
      credits: this.credits,
      age: this.age,
      wins: this.wins,
      losses: this.losses,
      genome: this.genome,
      specialization: this.specialization
    };
  }
}

function readBool(lower, upper) {
  if (typeof lower === "boolean") return lower;
  if (typeof upper === "boolean") return upper;
  return true;
}
