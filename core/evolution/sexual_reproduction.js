/**
 * CYVX — Autonomous Infrastructure Intelligence
 * © 2026 Dakota Lee Jonsgaard. All rights reserved.
 * Creator & Architect: Dakota Lee Jonsgaard
 * https://cyvx.ai | dakota@cyvx.ai
 *
 * This software is the exclusive intellectual property
 * of Dakota Lee Jonsgaard. Unauthorized use prohibited.
 */
import attribution from "../shared/attribution.js";

const { response } = attribution;

export function crossoverGenomes(parentA, parentB, options = {}) {
  const genesA = normalizeGenome(parentA);
  const genesB = normalizeGenome(parentB);
  const loci = uniqueGeneKeys(genesA, genesB);
  const crossoverPoints = options.crossoverPoints || 1;
  const offspring = {};
  const crossoverHistory = [];

  for (const gene of loci) {
    const source = pickSource(gene, genesA, genesB, options);
    offspring[gene] = source.value;
    crossoverHistory.push({ gene, inheritedFrom: source.parent });
  }

  const diversity = calculateDiversity(genesA, genesB);
  const speciationHint = diversity > 0.4 ? "high-diversity" : "convergent";

  return response("genetic-offspring", {
    genome: offspring,
    crossoverPoints,
    crossoverHistory,
    diversity,
    speciationHint,
    parents: [
      { id: parentA.id, fitness: parentA.fitness ?? null },
      { id: parentB.id, fitness: parentB.fitness ?? null },
    ],
  });
}

export function reproduce(population, options = {}) {
  if (!Array.isArray(population) || population.length === 0) {
    return response("reproduction", { offspring: [] });
  }

  const sorted = [...population].sort((a, b) => (b.fitness || 0) - (a.fitness || 0));
  const top = sorted.slice(0, Math.max(2, options.matingPoolSize || 2));
  const offspring = [];

  for (let i = 0; i < top.length - 1; i += 2) {
    offspring.push(crossoverGenomes(top[i], top[i + 1], options).data);
  }

  return response("reproduction", {
    offspring,
    matingPoolSize: top.length,
    diversityPolicy: options.diversityPolicy || "preserve-mix",
  });
}

function normalizeGenome(agent) {
  if (agent && agent.genome && typeof agent.genome === "object") return agent.genome;
  return agent && typeof agent === "object" ? agent : {};
}

function uniqueGeneKeys(a, b) {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])];
}

function pickSource(gene, genesA, genesB, options) {
  const a = genesA[gene];
  const b = genesB[gene];
  if (a === undefined) return { parent: "B", value: b };
  if (b === undefined) return { parent: "A", value: a };

  if (options.preferParent === "A") return { parent: "A", value: a };
  if (options.preferParent === "B") return { parent: "B", value: b };

  if (typeof a === "number" && typeof b === "number") {
    return Math.random() < 0.5 ? { parent: "A", value: a } : { parent: "B", value: b };
  }

  return Math.random() < 0.5 ? { parent: "A", value: a } : { parent: "B", value: b };
}

function calculateDiversity(a, b) {
  const keys = uniqueGeneKeys(a, b);
  if (keys.length === 0) return 0;
  let diff = 0;
  for (const key of keys) {
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) diff += 1;
  }
  return diff / keys.length;
}
