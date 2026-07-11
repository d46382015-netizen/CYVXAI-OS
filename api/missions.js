/**
 * Mission API endpoints
 * © 2026 Dakota Lee Jonsgaard. All rights reserved.
 */
"use strict";

const crypto = require('node:crypto');
const { MissionEngine, MissionError } = require('../core/missions/index.js');

function createMissionAPI(store) {
  const engine = new MissionEngine(store);

  return {
    // POST /api/v1/missions
    createMission: (req, res, input) => {
      try {
        const organization_id = req.organization_id || 'default';
        const mission = engine.createMission({
          organization_id,
          title: input.title,
          objective: input.objective,
          context: input.context,
          constraints: input.constraints,
          opportunities: input.opportunities,
          success_metrics: input.success_metrics,
          approval_required: input.approval_required,
          created_by: req.user_id || 'system',
        });
        res.statusCode = 201;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ok: true, mission }));
      } catch (error) {
        handleError(res, error);
      }
    },

    // GET /api/v1/missions/:id
    getMission: (req, res, missionId) => {
      try {
        const graph = engine.getMissionGraph(missionId);
        res.statusCode = 200;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ok: true, graph }));
      } catch (error) {
        handleError(res, error);
      }
    },

    // POST /api/v1/missions/:id/validate
    validateMission: (req, res, missionId, input) => {
      try {
        const mission = engine.validateMission(missionId, {
          feasible: input.feasible,
          blockers: input.blockers,
          assumptions: input.assumptions,
          validated_by: req.user_id || 'system',
        });
        res.statusCode = 200;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ok: true, mission }));
      } catch (error) {
        handleError(res, error);
      }
    },

    // POST /api/v1/missions/:id/plan
    planMission: (req, res, missionId, input) => {
      try {
        const mission = engine.planMission(missionId, {
          actions: input.actions,
          dependencies: input.dependencies,
          estimated_duration_minutes: input.estimated_duration_minutes,
          resource_requirements: input.resource_requirements,
          planned_by: req.user_id || 'system',
        });
        res.statusCode = 200;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ok: true, mission }));
      } catch (error) {
        handleError(res, error);
      }
    },

    // POST /api/v1/missions/:id/approval-request
    requestApproval: (req, res, missionId, input) => {
      try {
        const result = engine.requestApproval(missionId, {
          reason: input.reason,
          requested_by: req.user_id || 'system',
          approval_deadline: input.approval_deadline,
        });
        res.statusCode = 201;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ok: true, mission: result.mission, approval: result.approval }));
      } catch (error) {
        handleError(res, error);
      }
    },

    // POST /api/v1/approvals/:id/decide
    decideApproval: (req, res, approvalId, input) => {
      try {
        const result = engine.decideApproval(approvalId, {
          decision: input.decision,
          decided_by: req.user_id || 'system',
          decision_reason: input.decision_reason,
        });
        res.statusCode = 200;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ok: true, approval: result.approval, mission: result.mission }));
      } catch (error) {
        handleError(res, error);
      }
    },

    // POST /api/v1/missions/:id/assign-agent
    assignAgent: (req, res, missionId, input) => {
      try {
        const result = engine.assignAgent(missionId, {
          agent_id: input.agent_id,
          assigned_by: req.user_id || 'system',
        });
        res.statusCode = 200;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ok: true, mission: result.mission, assignment: result.assignment }));
      } catch (error) {
        handleError(res, error);
      }
    },

    // POST /api/v1/missions/:id/execute
    executeMission: (req, res, missionId, input) => {
      try {
        const mission = engine.execute(missionId, {
          steps: input.steps,
          started_by: req.user_id || 'system',
        });
        res.statusCode = 200;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ok: true, mission }));
      } catch (error) {
        handleError(res, error);
      }
    },

    // POST /api/v1/missions/:id/complete
    completeMission: (req, res, missionId, input) => {
      try {
        const result = engine.complete(missionId, {
          result_summary: input.result_summary,
          metrics: input.metrics,
          evidence_ids: input.evidence_ids,
          verified: input.verified,
          completed_by: req.user_id || 'system',
        });
        res.statusCode = 200;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ok: true, mission: result.mission, outcome: result.outcome }));
      } catch (error) {
        handleError(res, error);
      }
    },

    // POST /api/v1/missions/:id/fail
    failMission: (req, res, missionId, input) => {
      try {
        const mission = engine.fail(missionId, {
          error_code: input.error_code,
          error_message: input.error_message,
          recovery_action: input.recovery_action,
          failed_by: req.user_id || 'system',
        });
        res.statusCode = 200;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ok: true, mission }));
      } catch (error) {
        handleError(res, error);
      }
    },

    // POST /api/v1/missions/:id/evaluate
    evaluateMission: (req, res, missionId, input) => {
      try {
        const mission = engine.evaluate(missionId, {
          success: input.success,
          lessons_learned: input.lessons_learned,
          improvements: input.improvements,
          capability_delta: input.capability_delta,
          evaluated_by: req.user_id || 'system',
        });
        res.statusCode = 200;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ok: true, mission }));
      } catch (error) {
        handleError(res, error);
      }
    },

    // POST /api/v1/missions/:id/learn-capability
    learnCapability: (req, res, missionId, input) => {
      try {
        const result = engine.learnCapability(missionId, {
          title: input.title,
          description: input.description,
          inputs: input.inputs,
          outputs: input.outputs,
          permissions_required: input.permissions_required,
          tests: input.tests,
          cost_basis: input.cost_basis,
          risk_level: input.risk_level,
          owned_by: input.owned_by || 'system',
          is_reusable: input.is_reusable,
        });
        res.statusCode = 201;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ok: true, mission: result.mission, capability: result.capability }));
      } catch (error) {
        handleError(res, error);
      }
    },

    // POST /api/v1/missions/:id/evidence
    recordEvidence: (req, res, missionId, input) => {
      try {
        const evidence = engine.recordEvidence(missionId, {
          type: input.type,
          title: input.title,
          source: input.source,
          sha256: input.sha256,
          bytes: input.bytes,
          verified: input.verified,
          created_by: req.user_id || 'system',
        });
        res.statusCode = 201;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ok: true, evidence }));
      } catch (error) {
        handleError(res, error);
      }
    },
  };
}

function handleError(res, error) {
  if (error instanceof MissionError) {
    res.statusCode = 400;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({
      ok: false,
      error: error.code,
      message: error.message,
      details: error.details,
    }));
  } else {
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({
      ok: false,
      error: 'INTERNAL_ERROR',
      message: error.message,
    }));
  }
}

module.exports = { createMissionAPI };
