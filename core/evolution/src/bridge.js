import { Agent } from "./agent.js";

export class CyvxBridge {
  constructor(config, emitter) {
    this.config = config;
    this.emit = emitter;
    this.agents = this.buildPopulation(config.populationSize);
    this.decisions = [];
    this.lastCluster = null;
    this.tickInFlight = false;
  }

  buildPopulation(size) {
    const roles = ["Cost Optimizer", "Performance Guardian", "Reliability Engineer", "Capacity Planner"];
    return Array.from({ length: size }, (_, index) => {
      const role = roles[index % roles.length];
      return new Agent(`agent-${index + 1}`, {
        credits: 20 - index,
        genome: {
          costWeight: role === "Cost Optimizer" ? 0.78 : 0.45,
          performanceWeight: role === "Performance Guardian" ? 0.8 : 0.5,
          riskTolerance: role === "Reliability Engineer" ? 0.25 : 0.5,
          specialization: role,
          strategy: role.toLowerCase().replace(/\s+/g, "-")
        }
      });
    });
  }

  async tick() {
    if (this.tickInFlight) return null;
    this.tickInFlight = true;
    try {
      const cluster = await this.fetchCluster();
      this.lastCluster = cluster;
      const proposals = this.agents.map((agent) => agent.propose(cluster));
      const consensus = this.runDebate(cluster, proposals);
      const outcome = await this.executeConsensus(consensus, cluster);
      this.applyLearning(consensus, outcome, cluster);
      this.evolvePopulation();
      const payload = {
        timestamp: new Date().toISOString(),
        consensus,
        outcome,
        agents: this.agents.map((agent) => agent.toJSON())
      };
      this.decisions.unshift(payload);
      this.decisions = this.decisions.slice(0, 200);
      this.emit("decision", payload);
      return payload;
    } finally {
      this.tickInFlight = false;
    }
  }

  runDebate(cluster, proposals) {
    const votes = proposals.map((proposal) => ({
      ...proposal,
      debateScore: proposal.vote + this.environmentPressure(cluster, proposal) + this.specializationBias(proposal)
    }));
    votes.sort((a, b) => b.debateScore - a.debateScore);
    const top = votes[0] || { type: "noop", reason: "no proposals" };
    return {
      action: top.type,
      workloadId: top.workloadId,
      replicas: top.replicas,
      reason: top.reason,
      agentId: top.agentId,
      vote: top.debateScore,
      proposals: votes.slice(0, 5)
    };
  }

  environmentPressure(cluster, proposal) {
    const nodes = cluster.nodes || [];
    const cpuCapacity = nodes.reduce((sum, node) => sum + (node.cpu_capacity || node.CPUCapacity || 0), 0);
    const cpuUsed = nodes.reduce((sum, node) => sum + (node.cpu_used || node.CPUUsed || 0), 0);
    const utilization = cpuCapacity > 0 ? cpuUsed / cpuCapacity : 0;
    if (proposal.type === "scale_up" && utilization > 0.75) return 2.5;
    if (proposal.type === "scale_down" && utilization < 0.45) return 2.0;
    if (proposal.type === "migrate" && cluster.nodes?.length > 1) return 1.5;
    return 0;
  }

  specializationBias(proposal) {
    const role = proposal.specialization || "";
    if (role.includes("Cost") && proposal.type === "scale_down") return 1.4;
    if (role.includes("Performance") && (proposal.type === "scale_up" || proposal.type === "migrate")) return 1.2;
    if (role.includes("Reliability") && proposal.type === "migrate") return 1.1;
    if (role.includes("Capacity") && proposal.type === "scale_up") return 0.9;
    return 0;
  }

  async executeConsensus(consensus, cluster) {
    const before = healthScore(cluster);
    const body = {
      type: consensus.action,
      workload_id: consensus.workloadId,
      replicas: consensus.replicas,
      reason: consensus.reason,
      source: `cyvx-bridge:${consensus.agentId}`
    };
    const response = await fetch(`${this.config.apiBaseUrl}/api/v1/actions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    const after = data.after || before;
    const reward = computeReward(before, healthScore(after), consensus, data.accepted);
    return {
      accepted: Boolean(data.accepted),
      message: data.message || "executed",
      reward,
      before,
      after: healthScore(after),
      raw: data
    };
  }

  applyLearning(consensus, outcome, cluster) {
    const pressure = clusterPressure(cluster);
    for (const agent of this.agents) {
      const aligned = agent.id === consensus.agentId;
      const reward = aligned ? outcome.reward : Math.sign(outcome.reward) * 0.5;
      agent.learn({
        reward,
        avgUtilization: pressure
      });
    }
  }

  evolvePopulation() {
    const sorted = [...this.agents].sort((a, b) => b.credits - a.credits);
    const survivors = sorted.slice(0, Math.max(2, Math.ceil(sorted.length / 2)));
    const next = [...survivors];
    while (next.length < this.config.populationSize) {
      const parent = survivors[next.length % survivors.length];
      const child = new Agent(`${parent.id}-r${next.length}`, {
        credits: Math.max(0, Math.floor(parent.credits / 2)),
        genome: { ...parent.genome }
      });
      child.genome.riskTolerance = clamp01(child.genome.riskTolerance + jitter());
      child.genome.costWeight = clamp01(child.genome.costWeight + jitter());
      child.genome.performanceWeight = clamp01(child.genome.performanceWeight + jitter());
      child.specialization = parent.specialization;
      next.push(child);
    }
    this.agents = next;
  }

  async fetchCluster() {
    const response = await fetch(`${this.config.apiBaseUrl}/api/v1/cluster`);
    if (!response.ok) {
      throw new Error(`cluster fetch failed with ${response.status}`);
    }
    return response.json();
  }
}

function clusterPressure(cluster) {
  const nodes = cluster.nodes || [];
  const cpuCapacity = nodes.reduce((sum, node) => sum + (node.cpu_capacity || node.CPUCapacity || 0), 0);
  const cpuUsed = nodes.reduce((sum, node) => sum + (node.cpu_used || node.CPUUsed || 0), 0);
  return cpuCapacity > 0 ? cpuUsed / cpuCapacity : 0;
}

function healthScore(cluster) {
  const nodes = cluster.nodes || [];
  const workloads = cluster.workloads || [];
  const healthyNodes = nodes.filter((node) => Boolean(node.healthy ?? node.Healthy)).length;
  const cpuCapacity = nodes.reduce((sum, node) => sum + (node.cpu_capacity || node.CPUCapacity || 0), 0);
  const cpuUsed = nodes.reduce((sum, node) => sum + (node.cpu_used || node.CPUUsed || 0), 0);
  const utilization = cpuCapacity > 0 ? cpuUsed / cpuCapacity : 0;
  const avgLatency = workloads.reduce((sum, workload) => sum + (workload.target_latency_ms || workload.TargetLatencyMS || 0), 0) / Math.max(1, workloads.length);
  return healthyNodes * 10 - Math.abs(utilization - 0.65) * 8 - avgLatency / 200;
}

function computeReward(before, after, consensus, accepted) {
  if (!accepted) return -8;
  const delta = after - before;
  if (consensus.action === "noop") {
    return delta >= -0.25 ? 1 : -3;
  }
  return Math.round(delta * 4) || (consensus.action === "scale_down" ? 2 : 1);
}

function jitter() {
  return (Math.random() - 0.5) * 0.06;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

