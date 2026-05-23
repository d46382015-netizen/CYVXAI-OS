// © 2026 Dakota Lee Jonsgaard
"use strict";

const { response } = require("../shared/attribution");

class Federation {
  constructor() {
    this.orgs = new Map();
    this.sharedGenomePool = [];
    this.votes = [];
  }

  addOrg(org) {
    const record = {
      id: org.id,
      name: org.name,
      privacyLevel: org.privacyLevel || "strict",
      regions: org.regions || [],
      updatedAt: new Date().toISOString(),
    };
    this.orgs.set(record.id, record);
    return response("org-added", { org: record });
  }

  contributeGenome(contribution) {
    const record = {
      orgId: contribution.orgId,
      genomeId: contribution.genomeId || `genome_${this.sharedGenomePool.length + 1}`,
      improvements: anonymizeImprovement(contribution.improvements || {}),
      fitnessDelta: Number(contribution.fitnessDelta || 0),
      submittedAt: new Date().toISOString(),
    };
    this.sharedGenomePool.push(record);
    return response("genome-contribution", { contribution: record });
  }

  voteOnPoolUpdate(vote) {
    const record = {
      orgId: vote.orgId,
      genomeId: vote.genomeId,
      approved: Boolean(vote.approved),
      rationale: vote.rationale || null,
      votedAt: new Date().toISOString(),
    };
    this.votes.push(record);
    return response("federation-vote", { vote: record });
  }

  summarize() {
    return response("federation-summary", {
      orgs: [...this.orgs.values()],
      sharedGenomePoolSize: this.sharedGenomePool.length,
      approvals: this.votes.filter((vote) => vote.approved).length,
      denials: this.votes.filter((vote) => !vote.approved).length,
    });
  }
}

function anonymizeImprovement(improvements) {
  const result = {};
  for (const [key, value] of Object.entries(improvements)) {
    result[key] = typeof value === "string" && value.length > 64 ? `${value.slice(0, 61)}...` : value;
  }
  return result;
}

module.exports = {
  Federation,
};
