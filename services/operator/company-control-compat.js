"use strict";

const core = require("./company-control-plane");
const { RuntimeError, now, id } = require("../../runtime/missions/base");

function parseJson(value, fallback = {}) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function finiteNumber(value, name, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  const output = Number(value);
  if (!Number.isFinite(output) || output < minimum || output > maximum) {
    throw new RuntimeError("VALIDATION_ERROR", `${name} must be between ${minimum} and ${maximum}`, 422);
  }
  return output;
}

function integer(value, name, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  const output = Number(value);
  if (!Number.isInteger(output) || output < minimum || output > maximum) {
    throw new RuntimeError("VALIDATION_ERROR", `${name} must be an integer between ${minimum} and ${maximum}`, 422);
  }
  return output;
}

function boundedText(value, name, maximum = 2000) {
  const output = String(value ?? "").trim();
  if (output.length > maximum) throw new RuntimeError("VALIDATION_ERROR", `${name} exceeds ${maximum} characters`, 422);
  return output;
}

function installCompanyControlCompatibility() {
  const prototype = core.CompanyControlPlane.prototype;
  if (prototype.__cyvxCompanyControlCompatibilityV1) return core;

  const compileMission = prototype.compileMission;
  prototype.compileMission = function compileMissionWithVentureContract(entityId, input = {}, auth) {
    const entity = this.db.prepare("SELECT * FROM operator_entities WHERE id=? AND organization_id=?")
      .get(entityId, auth && auth.organization_id);
    if (entity && entity.adapter_type === "venture") {
      const canonicalContract = this.db.prepare("SELECT id FROM operator_entity_contracts WHERE entity_id=? AND organization_id=?")
        .get(entity.id, auth.organization_id);
      if (!canonicalContract) {
        const legacy = this.db.prepare("SELECT * FROM operator_contracts WHERE company_id=? AND organization_id=?")
          .get(entity.adapter_record_id, auth.organization_id);
        if (legacy) {
          const payload = parseJson(legacy.payload, {});
          const targetUnit = String(payload.target_unit || (String(legacy.target_metric).endsWith("_cents") ? "cents" : "count"));
          this.db.prepare(`INSERT OR IGNORE INTO operator_entity_contracts(
            id,organization_id,entity_id,objective,target_metric,comparator,target_value,target_unit,
            max_budget_cents,approval_threshold_cents,deadline,risk_level,status,payload,created_at,updated_at
          ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
            legacy.id, legacy.organization_id, entity.id, legacy.objective, legacy.target_metric,
            legacy.comparator, legacy.target_value, targetUnit, legacy.max_budget_cents,
            legacy.approval_threshold_cents, legacy.deadline, legacy.risk_level, legacy.status,
            legacy.payload, legacy.created_at, legacy.updated_at,
          );
        }
      }
    }
    return compileMission.call(this, entityId, input, auth);
  };

  prototype.observeExperiment = function observeExperimentCorrected(experimentId, input = {}, auth) {
    this.assertRole(auth);
    const experiment = this.requireExperiment(experimentId, auth);
    if (!["planned", "running"].includes(experiment.status)) {
      throw new RuntimeError("INVALID_STATE", "Experiment is not accepting observations", 409);
    }
    const sampleCount = integer(input.sample_count ?? 1, "sample_count", 1, 1_000_000);
    const costCents = integer(input.cost_cents ?? 0, "cost_cents");
    if (Number(experiment.spent_cents) + costCents > Number(experiment.budget_ceiling_cents)) {
      throw new RuntimeError("BUDGET_EXCEEDED", "Observation would exceed experiment budget ceiling", 409);
    }
    if (input.evidence_id) this.runtime.evidence.get(auth, input.evidence_id);
    const observation = {
      id: id("experiment_observation"),
      organization_id: auth.organization_id,
      experiment_id: experimentId,
      metric_value: finiteNumber(input.metric_value, "metric_value"),
      sample_count: sampleCount,
      cost_cents: costCents,
      evidence_id: input.evidence_id || null,
      notes: boundedText(input.notes || "", "notes"),
      observed_at: now(),
      created_by: auth.user_id,
    };
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare(`INSERT INTO company_experiment_observations(
        id,organization_id,experiment_id,metric_value,sample_count,cost_cents,evidence_id,notes,observed_at,created_by
      ) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(
        observation.id, observation.organization_id, observation.experiment_id, observation.metric_value,
        observation.sample_count, observation.cost_cents, observation.evidence_id, observation.notes,
        observation.observed_at, observation.created_by,
      );
      this.db.prepare(`UPDATE company_experiments SET status='running',started_at=COALESCE(started_at,?),
        sample_size=sample_size+?,spent_cents=spent_cents+? WHERE id=? AND organization_id=?`)
        .run(observation.observed_at, sampleCount, costCents, experimentId, auth.organization_id);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return { observation, experiment: this.requireExperiment(experimentId, auth) };
  };

  Object.defineProperty(prototype, "__cyvxCompanyControlCompatibilityV1", {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  });
  return core;
}

module.exports = installCompanyControlCompatibility();
