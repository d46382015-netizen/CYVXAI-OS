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

const { response } = require("../shared/attribution");

class PatternMemory {
  constructor() {
    this.episodes = [];
  }

  store(episode) {
    const record = {
      id: episode.id || `episode_${this.episodes.length + 1}`,
      time: episode.time || new Date().toISOString(),
      clusterState: episode.clusterState || null,
      actionTaken: episode.actionTaken || null,
      outcome: episode.outcome || null,
      tags: episode.tags || [],
    };
    this.episodes.push(record);
    return response("episode-stored", { episode: record });
  }

  query(pattern) {
    const matches = this.episodes.filter((episode) => matchesPattern(episode, pattern));
    return response("episode-query", {
      pattern,
      matches,
      count: matches.length,
    });
  }

  consolidate() {
    const buckets = new Map();
    for (const episode of this.episodes) {
      const key = JSON.stringify({
        clusterState: episode.clusterState,
        actionTaken: episode.actionTaken,
        outcome: episode.outcome,
      });
      const bucket = buckets.get(key) || { pattern: JSON.parse(key), count: 0, examples: [] };
      bucket.count += 1;
      bucket.examples.push(episode.id);
      buckets.set(key, bucket);
    }

    const rules = [...buckets.values()].map((bucket) => ({
      ...bucket.pattern,
      count: bucket.count,
      examples: bucket.examples.slice(0, 5),
    }));

    return response("memory-consolidation", {
      rules,
      totalEpisodes: this.episodes.length,
    });
  }
}

function matchesPattern(episode, pattern) {
  if (!pattern || typeof pattern !== "object") return true;
  return Object.entries(pattern).every(([key, value]) => {
    if (value === undefined || value === null) return true;
    return JSON.stringify(episode[key]) === JSON.stringify(value);
  });
}

module.exports = {
  PatternMemory,
};
