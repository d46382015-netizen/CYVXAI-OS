"use strict";

function createCompanyScheduler(companyRuntime, options = {}) {
  if (!companyRuntime?.listCompanies || !companyRuntime?.runTick) throw new Error("AutonomousCompanyRuntime is required");
  const enabled = options.enabled !== undefined ? Boolean(options.enabled) : process.env.CYVX_COMPANY_RUNTIME_AUTO_TICK !== "false";
  const intervalMs = Math.max(5000, Number(options.intervalMs || process.env.CYVX_COMPANY_RUNTIME_TICK_INTERVAL_MS || 15000));
  const auth = options.auth || {
    user_id: process.env.CYVX_COMPANY_RUNTIME_USER || "company-runtime-scheduler",
    organization_id: process.env.CYVX_ORGANIZATION_ID || "default",
    role: "admin",
    correlation_id: "company-runtime-scheduler",
  };
  const logger = options.logger || companyRuntime.runtime?.logger || companyRuntime.missionRuntime?.logger || null;
  let ticking = false;
  let stopped = false;

  async function tick() {
    if (!enabled || stopped || ticking) return { ok: true, skipped: true };
    ticking = true;
    const results = [];
    try {
      const companies = companyRuntime.listCompanies(auth).filter((company) => company.status === "active");
      for (const company of companies) {
        try {
          results.push({ company_id: company.company_id, tick: await companyRuntime.runTick(company.company_id, auth) });
        } catch (error) {
          results.push({ company_id: company.company_id, error: error.message });
          logger?.write?.("error", "company_runtime.scheduler_company_failed", { company_id: company.company_id, error: error.message });
        }
      }
      return { ok: results.every((result) => !result.error), companies: results.length, results };
    } finally {
      ticking = false;
    }
  }

  const timer = enabled ? setInterval(() => tick().catch((error) => {
    logger?.write?.("error", "company_runtime.scheduler_failed", { error: error.message });
  }), intervalMs) : null;
  if (timer) timer.unref();

  return {
    enabled,
    intervalMs,
    auth,
    tick,
    close() {
      stopped = true;
      if (timer) clearInterval(timer);
    },
  };
}

module.exports = { createCompanyScheduler };
