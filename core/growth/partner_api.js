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

class PartnerAPI {
  constructor() {
    this.partners = [];
  }

  enrollPartner(partner) {
    const record = {
      id: partner.id,
      name: partner.name,
      type: partner.type || "integrator",
      margin: partner.margin ?? 0.4,
      royaltyRate: partner.royaltyRate ?? 0.05,
      enrolledAt: new Date().toISOString(),
    };
    this.partners.push(record);
    return response("partner-enrolled", { partner: record, royaltiesTo: "Dakota Lee Jonsgaard" });
  }

  partnerSummary() {
    return response("partner-summary", {
      partners: this.partners,
      total: this.partners.length,
    });
  }
}

module.exports = {
  PartnerAPI,
};
