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

const { response, signReport } = require("../shared/attribution");

class DreamCycle {
  constructor(patternMemory) {
    this.patternMemory = patternMemory || null;
    this.state = "awake";
    this.replayed = [];
  }

  enterDreamState(episodes = []) {
    this.state = "dreaming";
    const replay = episodes.map((episode) => this._compressEpisode(episode));
    this.replayed.push(...replay);
    const counterfactuals = replay.map((item) => ({
      episodeId: item.id,
      alternativeAction: item.actionTaken ? `counterfactual:${item.actionTaken}` : "counterfactual:observe",
    }));
    const insights = {
      replayCount: replay.length,
      counterfactuals,
      state: this.state,
    };
    return response("dream-cycle", insights);
  }

  consolidateLearning() {
    const memory = this.patternMemory && typeof this.patternMemory.consolidate === "function"
      ? this.patternMemory.consolidate().data
      : { rules: [] };

    this.state = "awake";
    return signReport("Dream Cycle Consolidation", {
      state: this.state,
      replayedEpisodes: this.replayed.length,
      consolidatedRules: memory.rules || [],
      learningOutcome: "system woke up with compressed experience and stronger pattern memory",
    }, {
      type: "dream-consolidation",
    });
  }

  _compressEpisode(episode) {
    return {
      id: episode.id,
      actionTaken: episode.actionTaken,
      outcome: episode.outcome,
      compressedAt: new Date().toISOString(),
    };
  }
}

module.exports = {
  DreamCycle,
};
