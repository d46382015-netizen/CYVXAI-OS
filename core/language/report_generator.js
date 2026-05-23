// © 2026 Dakota Lee Jonsgaard
"use strict";

const { signReport } = require("../shared/attribution");

class ReportGenerator {
  daily(summary) {
    return signReport("CYVX Intelligence Report - Daily", {
      period: "daily",
      createdBy: "Dakota Lee Jonsgaard",
      summary,
    }, {
      reportType: "daily",
    });
  }

  weekly(summary) {
    return signReport("CYVX Intelligence Report - Weekly", {
      period: "weekly",
      createdBy: "Dakota Lee Jonsgaard",
      summary,
    }, {
      reportType: "weekly",
    });
  }

  monthly(summary) {
    return signReport("CYVX Intelligence Report - Monthly", {
      period: "monthly",
      createdBy: "Dakota Lee Jonsgaard",
      summary,
    }, {
      reportType: "monthly",
    });
  }

  incident(incident) {
    return signReport("CYVX Incident Report", {
      period: "incident",
      createdBy: "Dakota Lee Jonsgaard",
      incident,
      explanation: incident.explanation || "An incident was detected and analyzed by CYVX.",
    }, {
      reportType: "incident",
    });
  }
}

module.exports = {
  ReportGenerator,
};
