"use strict";

const { MissionEngine, MissionError } = require("../core/missions");

function createMissionAPI(store, options = {}) {
  const engine = new MissionEngine(store);
  const queue = options.queue;
  const evidence = options.evidence;
  const db = options.db;

  function invoke(req, res, operation, status = 200) {
    try {
      if (!req.auth) throw typed("AUTH_REQUIRED", "Authentication is required", 401);
      const result = store.withContext({
        organization_id: req.auth.organization_id,
        actor: req.auth.user_id,
        correlation_id: req.correlation_id,
        causation_id: req.causation_id || null,
      }, operation);
      return send(res, status, result, req.correlation_id);
    } catch (error) {
      return handleError(res, error, req.correlation_id);
    }
  }

  return {
    engine,

    createMission(req, res, input = {}) {
      return invoke(req, res, () => ({ mission: engine.createMission({
        organization_id: req.auth.organization_id,
        title: input.title,
        objective: input.objective,
        context: input.context,
        constraints: input.constraints,
        opportunities: input.opportunities,
        success_metrics: input.success_metrics,
        approval_required: input.approval_required,
        risk_level: input.risk_level,
        priority: input.priority,
        created_by: req.auth.user_id,
      }) }), 201);
    },

    getMission(req, res, missionId) {
      return invoke(req, res, () => ({ graph: engine.getMissionGraph(missionId) }));
    },

    validateMission(req, res, missionId, input = {}) {
      return invoke(req, res, () => ({ mission: engine.validateMission(missionId, {
        feasible: input.feasible,
        blockers: input.blockers,
        assumptions: input.assumptions,
        validated_by: req.auth.user_id,
      }) }));
    },

    planMission(req, res, missionId, input = {}) {
      return invoke(req, res, () => ({ mission: engine.planMission(missionId, {
        actions: input.actions,
        dependencies: input.dependencies,
        estimated_duration_minutes: input.estimated_duration_minutes,
        resource_requirements: input.resource_requirements,
        planned_by: req.auth.user_id,
      }) }));
    },

    requestApproval(req, res, missionId, input = {}) {
      return invoke(req, res, () => engine.requestApproval(missionId, {
        reason: input.reason,
        requested_by: req.auth.user_id,
        approval_deadline: input.approval_deadline,
      }), 201);
    },

    decideApproval(req, res, approvalId, input = {}) {
      return invoke(req, res, () => engine.decideApproval(approvalId, {
        decision: input.decision,
        decided_by: req.auth.user_id,
        decision_reason: input.decision_reason,
      }));
    },

    assignAgent(req, res, missionId, input = {}) {
      return invoke(req, res, () => {
        const agentId = String(input.agent_id || "").trim();
        if (!agentId) throw typed("VALIDATION_ERROR", "agent_id is required", 422);
        if (db) {
          const agent = db.prepare("SELECT id FROM users WHERE organization_id=? AND id=? AND role='agent' AND active=1")
            .get(req.auth.organization_id, agentId);
          if (!agent) throw typed("AGENT_NOT_FOUND", "Active agent not found in this organization", 404);
        }
        return engine.assignAgent(missionId, { agent_id: agentId, assigned_by: req.auth.user_id });
      });
    },

    executeMission(req, res, missionId, input = {}) {
      return invoke(req, res, () => {
        if (!queue) throw typed("WORKER_RUNTIME_UNAVAILABLE", "Persistent job runtime is unavailable", 503);
        const graph = engine.getMissionGraph(missionId);
        if (graph.mission.status !== "queued") throw typed("INVALID_STATE", `Mission must be queued before execution; current state: ${graph.mission.status}`, 409);
        if (req.auth.role === "agent" && graph.mission.assigned_agent_id !== req.auth.user_id) {
          throw typed("PERMISSION_DENIED", "Agent is not assigned to this mission", 403);
        }
        const job = queue.enqueue({
          organizationId: req.auth.organization_id,
          missionId,
          payload: { steps: input.steps || graph.mission.plan && graph.mission.plan.actions || [] },
          idempotencyKey: req.idempotency_key || input.idempotency_key || `mission.execute:${missionId}`,
          correlationId: req.correlation_id,
          causationId: req.causation_id,
          maxAttempts: input.max_attempts,
          actor: req.auth.user_id,
        });
        return { mission: graph.mission, job };
      }, 202);
    },

    completeMission(req, res, missionId, input = {}) {
      return invoke(req, res, () => engine.complete(missionId, {
        result_summary: input.result_summary,
        metrics: input.metrics,
        evidence_ids: input.evidence_ids,
        verified: input.verified,
        completed_by: req.auth.user_id,
      }));
    },

    failMission(req, res, missionId, input = {}) {
      return invoke(req, res, () => ({ mission: engine.fail(missionId, {
        error_code: input.error_code,
        error_message: input.error_message,
        recovery_action: input.recovery_action,
        failed_by: req.auth.user_id,
      }) }));
    },

    evaluateMission(req, res, missionId, input = {}) {
      return invoke(req, res, () => ({ mission: engine.evaluate(missionId, {
        success: input.success,
        lessons_learned: input.lessons_learned,
        improvements: input.improvements,
        capability_delta: input.capability_delta,
        evaluated_by: req.auth.user_id,
      }) }));
    },

    learnCapability(req, res, missionId, input = {}) {
      return invoke(req, res, () => engine.learnCapability(missionId, {
        title: input.title,
        description: input.description,
        inputs: input.inputs,
        outputs: input.outputs,
        permissions_required: input.permissions_required,
        tests: input.tests,
        cost_basis: input.cost_basis,
        risk_level: input.risk_level,
        owned_by: req.auth.organization_id,
        learned_by: req.auth.user_id,
        is_reusable: input.is_reusable,
      }), 201);
    },

    recordEvidence(req, res, missionId, input = {}) {
      return invoke(req, res, () => {
        if (!evidence) throw typed("EVIDENCE_RUNTIME_UNAVAILABLE", "Evidence runtime is unavailable", 503);
        return { evidence: evidence.record({
          auth: req.auth,
          missionId,
          content: input.content,
          type: input.type,
          title: input.title,
          source: input.source,
          correlationId: req.correlation_id,
          causationId: req.causation_id,
        }) };
      }, 201);
    },
  };
}

function typed(code, message, status, details) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.details = details;
  return error;
}

function statusFor(error) {
  if (Number(error.status)) return Number(error.status);
  if (error.code === "NOT_FOUND") return 404;
  if (["INVALID_STATE", "INVALID_TRANSITION", "INVALID_DECISION"].includes(error.code)) return 409;
  if (["VALIDATION_FAILED", "INVALID_AGENT"].includes(error.code)) return 422;
  return error instanceof MissionError ? 400 : 500;
}

function send(res, status, payload, correlationId) {
  const body = Buffer.from(`${JSON.stringify({ ok: true, ...payload, correlation_id: correlationId })}\n`);
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("content-length", body.length);
  res.end(body);
}

function handleError(res, error, correlationId) {
  const status = statusFor(error);
  const payload = {
    ok: false,
    error: status === 500 ? "INTERNAL_ERROR" : error.code || "REQUEST_FAILED",
    message: status === 500 ? "An internal error occurred" : error.message,
    correlation_id: correlationId,
  };
  if (status !== 500 && error.details !== undefined) payload.details = error.details;
  const body = Buffer.from(`${JSON.stringify(payload)}\n`);
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("content-length", body.length);
  res.end(body);
}

module.exports = { createMissionAPI, handleError };
