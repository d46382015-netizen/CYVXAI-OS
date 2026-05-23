// © 2026 Dakota Lee Jonsgaard
"use strict";

const { response, signReport } = require("../shared/attribution");

class CarbonIntelligenceEconomy {
  constructor(options = {}) {
    this.decisions = [];
    this.certificates = [];
    this.registry = options.registry || ["Gold Standard", "Verra"];
  }

  registerDecision(decision) {
    const record = {
      id: decision.id || `carbon_${this.decisions.length + 1}`,
      workloadId: decision.workloadId,
      region: decision.region,
      carbonIntensity: Number(decision.carbonIntensity || 0),
      computeUnits: Number(decision.computeUnits || 0),
      savedKg: Number(decision.savedKg || 0),
      score: scoreDecision(decision),
      recordedAt: new Date().toISOString(),
    };
    this.decisions.push(record);
    return response("carbon-decision", { decision: record });
  }

  generateCertificate(decisionId) {
    const decision = this.decisions.find((item) => item.id === decisionId);
    if (!decision) {
      return response("carbon-certificate", { issued: false, reason: "decision-not-found" });
    }
    const certificate = {
      id: `cert_${this.certificates.length + 1}`,
      decisionId,
      registry: this.registry[0],
      verifiedKgCO2e: decision.savedKg,
      issuedAt: new Date().toISOString(),
      status: "verified",
    };
    this.certificates.push(certificate);
    return signReport("Carbon Credit Certificate", certificate, {
      type: "carbon-certificate",
      issued: true,
    });
  }

  portfolioSummary() {
    const totalSaved = this.decisions.reduce((sum, decision) => sum + decision.savedKg, 0);
    return response("carbon-summary", {
      decisions: this.decisions.length,
      certificates: this.certificates.length,
      totalSavedKgCO2e: roundToTwo(totalSaved),
      registryPartners: [...this.registry],
    });
  }
}

function scoreDecision(decision) {
  const intensity = Number(decision.carbonIntensity || 0);
  const computeUnits = Number(decision.computeUnits || 0);
  const savedKg = Number(decision.savedKg || 0);
  return roundToTwo((savedKg * 10) - (intensity * computeUnits * 0.1));
}

function roundToTwo(value) {
  return Math.round(value * 100) / 100;
}

module.exports = {
  CarbonIntelligenceEconomy,
};
