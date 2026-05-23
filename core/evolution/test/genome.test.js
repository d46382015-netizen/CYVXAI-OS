import test from "node:test";
import assert from "node:assert/strict";
import { Agent } from "../src/agent.js";
import { createGenome, mutateGenome } from "../src/genome.js";

test("genome mutation stays bounded", () => {
  const genome = createGenome();
  const mutated = mutateGenome(genome, { drift: 0.2 });
  assert.ok(mutated.riskTolerance >= 0 && mutated.riskTolerance <= 1);
  assert.ok(mutated.costWeight >= 0 && mutated.costWeight <= 1);
  assert.ok(mutated.performanceWeight >= 0 && mutated.performanceWeight <= 1);
});

test("agent proposes an action for hot clusters", () => {
  const agent = new Agent("agent-1", {
    genome: { costWeight: 0.3, performanceWeight: 0.9, riskTolerance: 0.5 }
  });
  const proposal = agent.propose({
    nodes: [
      { cpu_capacity: 10, cpu_used: 9, cost_per_hour: 1.5, healthy: true }
    ],
    workloads: [
      { id: "w1", replicas: 2, target_latency_ms: 200 }
    ]
  });
  assert.ok(["migrate", "scale_up", "noop", "scale_down"].includes(proposal.type));
});

