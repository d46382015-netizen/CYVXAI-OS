// © 2026 Dakota Lee Jonsgaard
"use strict";

const { response, signReport } = require("../shared/attribution");

class InfrastructureInsurance {
  constructor(options = {}) {
    this.premiums = [];
    this.claims = [];
    this.poolBalance = Number(options.poolBalance || 0);
    this.underwritingThreshold = options.underwritingThreshold ?? 0.7;
  }

  collectPremium(premium) {
    const record = {
      id: premium.id || `premium_${this.premiums.length + 1}`,
      orgId: premium.orgId,
      amount: Number(premium.amount || 0),
      coverageType: premium.coverageType || "uptime-sla",
      riskScore: clamp(premium.riskScore ?? 0.5, 0, 1),
      collectedAt: new Date().toISOString(),
    };
    this.premiums.push(record);
    this.poolBalance += record.amount;
    return response("premium-collected", { premium: record, poolBalance: this.poolBalance });
  }

  predictIncident(signal) {
    const confidence = clamp(signal.confidence ?? 0.5, 0, 1);
    const predictedLoss = Number(signal.predictedLoss || 0);
    const record = {
      id: signal.id || `incident_${this.claims.length + 1}`,
      orgId: signal.orgId,
      incidentType: signal.incidentType || "availability",
      predictedAt: new Date().toISOString(),
      confidence,
      predictedLoss,
      shouldUnderwrite: confidence >= this.underwritingThreshold,
    };
    return response("incident-prediction", { prediction: record });
  }

  fileClaim(claim) {
    const record = {
      id: claim.id || `claim_${this.claims.length + 1}`,
      orgId: claim.orgId,
      incidentId: claim.incidentId,
      amount: Number(claim.amount || 0),
      approved: Boolean(claim.approved),
      filedAt: new Date().toISOString(),
    };
    this.claims.push(record);
    if (record.approved) {
      this.poolBalance = Math.max(0, this.poolBalance - record.amount);
    }
    return response("claim-filed", { claim: record, poolBalance: this.poolBalance });
  }

  issueCreditForMissedPrediction(prediction) {
    const creditAmount = Number(prediction.creditAmount || 0);
    const report = signReport("Infrastructure Insurance Adjustment", {
      orgId: prediction.orgId,
      incidentId: prediction.incidentId,
      creditAmount,
      reason: "CYVX predicted the incident but did not prevent it fully",
      issuedAt: new Date().toISOString(),
    }, {
      type: "insurance-credit",
      creator: "Dakota Lee Jonsgaard",
    });
    this.poolBalance = Math.max(0, this.poolBalance - creditAmount);
    return report;
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

module.exports = {
  InfrastructureInsurance,
};
