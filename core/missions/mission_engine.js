/**
 * CYVX Mission Engine
 * © 2026 Dakota Lee Jonsgaard. All rights reserved.
 *
 * Complete mission lifecycle: draft → awaiting_approval → approved → queued → running → completed | failed | cancelled → evaluated → learned
 *
 * Each transition:
 * - Validates state and permissions
 * - Records actor and reason in audit trail
 * - Emits typed event with correlation/causation IDs
 * - Creates audit record
 * - Persists to storage
 */
"use strict";

const crypto = require("node:crypto");

const MISSION_STATES = {
  DRAFT: "draft",
  VALIDATED: "validated",
  PLANNED: "planned",
  AWAITING_APPROVAL: "awaiting_approval",
  APPROVED: "approved",
  QUEUED: "queued",
  RUNNING: "running",
  PAUSED: "paused",
  BLOCKED: "blocked",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
  EVALUATED: "evaluated",
  LEARNED: "learned",
};

const VALID_TRANSITIONS = {
  [MISSION_STATES.DRAFT]: [MISSION_STATES.VALIDATED, MISSION_STATES.CANCELLED],
  [MISSION_STATES.VALIDATED]: [MISSION_STATES.PLANNED, MISSION_STATES.CANCELLED],
  [MISSION_STATES.PLANNED]: [MISSION_STATES.AWAITING_APPROVAL, MISSION_STATES.CANCELLED],
  [MISSION_STATES.AWAITING_APPROVAL]: [MISSION_STATES.APPROVED, MISSION_STATES.CANCELLED],
  [MISSION_STATES.APPROVED]: [MISSION_STATES.QUEUED, MISSION_STATES.CANCELLED],
  [MISSION_STATES.QUEUED]: [MISSION_STATES.RUNNING, MISSION_STATES.BLOCKED, MISSION_STATES.CANCELLED],
  [MISSION_STATES.RUNNING]: [MISSION_STATES.COMPLETED, MISSION_STATES.FAILED, MISSION_STATES.PAUSED, MISSION_STATES.BLOCKED],
  [MISSION_STATES.PAUSED]: [MISSION_STATES.RUNNING, MISSION_STATES.CANCELLED],
  [MISSION_STATES.BLOCKED]: [MISSION_STATES.RUNNING, MISSION_STATES.CANCELLED],
  [MISSION_STATES.COMPLETED]: [MISSION_STATES.EVALUATED],
  [MISSION_STATES.FAILED]: [MISSION_STATES.CANCELLED, MISSION_STATES.EVALUATED],
  [MISSION_STATES.CANCELLED]: [MISSION_STATES.EVALUATED],
  [MISSION_STATES.EVALUATED]: [MISSION_STATES.LEARNED],
  [MISSION_STATES.LEARNED]: [],
};

class MissionError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "MissionError";
    this.code = code;
    this.details = details;
  }
}

class MissionEngine {
  constructor(store) {
    this.store = store;
  }

  /**
   * Create a new mission in draft state
   */
  createMission(input = {}) {
    const mission = {
      id: `mission_${crypto.randomUUID().replace(/-/g, "")}`,
      organization_id: input.organization_id || "default",
      title: String(input.title || "Untitled mission").slice(0, 200),
      objective: String(input.objective || "").slice(0, 2000),
      context: String(input.context || "").slice(0, 2000),
      constraints: Array.isArray(input.constraints) ? input.constraints.slice(0, 20) : [],
      opportunities: Array.isArray(input.opportunities) ? input.opportunities.slice(0, 20) : [],
      success_metrics: Array.isArray(input.success_metrics) ? input.success_metrics.slice(0, 10) : [],
      status: MISSION_STATES.DRAFT,
      approval_required: Boolean(input.approval_required !== false),
      assigned_agent_id: null,
      assigned_approver_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: input.created_by || "system",
      expected_completion: input.expected_completion || null,
      risk_level: input.risk_level || "medium",
      priority: Number(input.priority) || 50,
      evidence_ids: [],
      outcome_ids: [],
      approval_record_id: null,
      audit_trail: [
        {
          timestamp: new Date().toISOString(),
          state: MISSION_STATES.DRAFT,
          actor: input.created_by || "system",
          reason: "Mission created",
        },
      ],
    };

    return this.store.transaction((state) => {
      state.missions = state.missions || [];
      state.missions.push(mission);
      this._recordEvent(state, "mission.created", {
        mission_id: mission.id,
        organization_id: mission.organization_id,
        title: mission.title,
      });
      return mission;
    });
  }

  /**
   * Validate mission constraints and feasibility
   */
  validateMission(missionId, input = {}) {
    return this.store.transaction((state) => {
      const mission = this._findMission(state, missionId);
      if (!this._canTransition(mission.status, MISSION_STATES.VALIDATED)) {
        throw new MissionError("INVALID_TRANSITION", `Cannot validate mission in state ${mission.status}`);
      }

      mission.validation = {
        feasible: input.feasible !== false,
        blockers: input.blockers || [],
        assumptions: input.assumptions || [],
        validated_at: new Date().toISOString(),
        validated_by: input.validated_by || "system",
      };

      if (!mission.validation.feasible) {
        throw new MissionError("VALIDATION_FAILED", "Mission failed feasibility validation", {
          mission_id: missionId,
          blockers: mission.validation.blockers,
        });
      }

      this._transitionMission(mission, MISSION_STATES.VALIDATED, input.validated_by || "system", "Mission validation passed");
      this._recordEvent(state, "mission.validated", {
        mission_id: mission.id,
        validation: mission.validation,
      });
      return mission;
    });
  }

  /**
   * Plan mission execution
   */
  planMission(missionId, input = {}) {
    return this.store.transaction((state) => {
      const mission = this._findMission(state, missionId);
      if (!this._canTransition(mission.status, MISSION_STATES.PLANNED)) {
        throw new MissionError("INVALID_TRANSITION", `Cannot plan mission in state ${mission.status}`);
      }

      mission.plan = {
        actions: input.actions || [],
        dependencies: input.dependencies || [],
        estimated_duration_minutes: Number(input.estimated_duration_minutes) || 60,
        resource_requirements: input.resource_requirements || {},
        planned_at: new Date().toISOString(),
        planned_by: input.planned_by || "system",
      };

      this._transitionMission(mission, MISSION_STATES.PLANNED, input.planned_by || "system", "Mission plan created");
      this._recordEvent(state, "mission.planned", {
        mission_id: mission.id,
        plan_summary: {
          action_count: mission.plan.actions.length,
          dependency_count: mission.plan.dependencies.length,
          estimated_duration: mission.plan.estimated_duration_minutes,
        },
      });
      return mission;
    });
  }

  /**
   * Create approval record for mission
   */
  requestApproval(missionId, input = {}) {
    return this.store.transaction((state) => {
      const mission = this._findMission(state, missionId);
      if (!this._canTransition(mission.status, MISSION_STATES.AWAITING_APPROVAL)) {
        throw new MissionError("INVALID_TRANSITION", `Cannot request approval for mission in state ${mission.status}`);
      }

      const approval = {
        id: `approval_${crypto.randomUUID().replace(/-/g, "")}`,
        mission_id: missionId,
        organization_id: mission.organization_id,
        status: "pending",
        requested_by: input.requested_by || "system",
        requested_at: new Date().toISOString(),
        reason: String(input.reason || "").slice(0, 500),
        approval_deadline: input.approval_deadline || null,
        decision: null,
        decided_by: null,
        decided_at: null,
        decision_reason: null,
        audit_trail: [
          {
            timestamp: new Date().toISOString(),
            event: "created",
            actor: input.requested_by || "system",
          },
        ],
      };

      state.approvals = state.approvals || [];
      state.approvals.push(approval);

      mission.approval_record_id = approval.id;
      this._transitionMission(mission, MISSION_STATES.AWAITING_APPROVAL, input.requested_by || "system", "Approval requested");

      this._recordEvent(state, "approval.requested", {
        approval_id: approval.id,
        mission_id: missionId,
        reason: approval.reason,
      });

      return { mission, approval };
    });
  }

  /**
   * Approve or reject a mission
   */
  decideApproval(approvalId, input = {}) {
    if (!["approved", "rejected"].includes(input.decision)) {
      throw new MissionError("INVALID_DECISION", "Decision must be approved or rejected");
    }

    return this.store.transaction((state) => {
      const approval = this._findApproval(state, approvalId);
      const mission = this._findMission(state, approval.mission_id);

      approval.status = input.decision;
      approval.decision = input.decision;
      approval.decided_by = input.decided_by || "system";
      approval.decided_at = new Date().toISOString();
      approval.decision_reason = String(input.decision_reason || "").slice(0, 500);
      approval.audit_trail.push({
        timestamp: new Date().toISOString(),
        event: "decided",
        actor: input.decided_by || "system",
        decision: input.decision,
      });

      if (input.decision === "approved") {
        this._transitionMission(mission, MISSION_STATES.APPROVED, input.decided_by || "system", `Approved by ${input.decided_by || "system"}`);
        this._recordEvent(state, "approval.approved", {
          approval_id: approvalId,
          mission_id: mission.id,
        });
      } else {
        this._transitionMission(mission, MISSION_STATES.CANCELLED, input.decided_by || "system", `Rejected by ${input.decided_by || "system"}: ${approval.decision_reason}`);
        this._recordEvent(state, "approval.rejected", {
          approval_id: approvalId,
          mission_id: mission.id,
          reason: approval.decision_reason,
        });
      }

      return { approval, mission };
    });
  }

  /**
   * Assign mission to an agent
   */
  assignAgent(missionId, input = {}) {
    const agentId = String(input.agent_id || input.assigned_agent_id || "").trim();
    if (!agentId) {
      throw new MissionError("INVALID_AGENT", "agent_id is required");
    }

    return this.store.transaction((state) => {
      const mission = this._findMission(state, missionId);
      if (mission.status !== MISSION_STATES.APPROVED) {
        throw new MissionError("INVALID_STATE", `Mission must be approved before agent assignment; current state: ${mission.status}`);
      }

      mission.assigned_agent_id = agentId;
      mission.assignment_timestamp = new Date().toISOString();

      const assignment = {
        id: `assignment_${crypto.randomUUID().replace(/-/g, "")}`,
        mission_id: missionId,
        agent_id: agentId,
        status: "assigned",
        assigned_at: mission.assignment_timestamp,
        assigned_by: input.assigned_by || "system",
      };

      state.assignments = state.assignments || [];
      state.assignments.push(assignment);

      this._transitionMission(mission, MISSION_STATES.QUEUED, input.assigned_by || "system", `Assigned to agent ${agentId}`);

      this._recordEvent(state, "mission.assigned", {
        mission_id: missionId,
        agent_id: agentId,
        assignment_id: assignment.id,
      });

      return { mission, assignment };
    });
  }

  /**
   * Start mission execution
   */
  execute(missionId, input = {}) {
    return this.store.transaction((state) => {
      const mission = this._findMission(state, missionId);
      if (mission.status !== MISSION_STATES.QUEUED) {
        throw new MissionError("INVALID_STATE", `Mission must be queued before execution; current state: ${mission.status}`);
      }

      mission.execution = {
        started_at: new Date().toISOString(),
        started_by: input.started_by || "system",
        steps: input.steps || [],
        current_step_index: 0,
      };

      this._transitionMission(mission, MISSION_STATES.RUNNING, input.started_by || "system", "Execution started");

      this._recordEvent(state, "mission.running", {
        mission_id: missionId,
        step_count: mission.execution.steps.length,
      });

      return mission;
    });
  }

  /**
   * Record mission completion with outcome
   */
  complete(missionId, input = {}) {
    return this.store.transaction((state) => {
      const mission = this._findMission(state, missionId);
      if (!new Set([MISSION_STATES.RUNNING, MISSION_STATES.PAUSED]).has(mission.status)) {
        throw new MissionError("INVALID_STATE", `Cannot complete mission in state ${mission.status}`);
      }

      const outcome = {
        id: `outcome_${crypto.randomUUID().replace(/-/g, "")}`,
        mission_id: missionId,
        organization_id: mission.organization_id,
        status: "completed",
        completed_at: new Date().toISOString(),
        completed_by: input.completed_by || "system",
        result_summary: String(input.result_summary || "").slice(0, 2000),
        metrics: input.metrics || {},
        evidence_ids: input.evidence_ids || [],
        verified: Boolean(input.verified),
      };

      state.outcomes = state.outcomes || [];
      state.outcomes.push(outcome);

      mission.outcome_ids.push(outcome.id);
      this._transitionMission(mission, MISSION_STATES.COMPLETED, input.completed_by || "system", "Mission completed");

      this._recordEvent(state, "mission.completed", {
        mission_id: missionId,
        outcome_id: outcome.id,
        verified: outcome.verified,
      });

      return { mission, outcome };
    });
  }

  /**
   * Fail mission with error details
   */
  fail(missionId, input = {}) {
    return this.store.transaction((state) => {
      const mission = this._findMission(state, missionId);
      if (!new Set([MISSION_STATES.RUNNING, MISSION_STATES.QUEUED]).has(mission.status)) {
        throw new MissionError("INVALID_STATE", `Cannot fail mission in state ${mission.status}`);
      }

      mission.failure = {
        failed_at: new Date().toISOString(),
        failed_by: input.failed_by || "system",
        error_code: String(input.error_code || "UNKNOWN").slice(0, 100),
        error_message: String(input.error_message || "").slice(0, 1000),
        recovery_action: String(input.recovery_action || "").slice(0, 500),
      };

      this._transitionMission(mission, MISSION_STATES.FAILED, input.failed_by || "system", mission.failure.error_message);

      this._recordEvent(state, "mission.failed", {
        mission_id: missionId,
        error_code: mission.failure.error_code,
      });

      return mission;
    });
  }

  /**
   * Evaluate mission and record lessons learned
   */
  evaluate(missionId, input = {}) {
    return this.store.transaction((state) => {
      const mission = this._findMission(state, missionId);
      if (!new Set([MISSION_STATES.COMPLETED, MISSION_STATES.FAILED, MISSION_STATES.CANCELLED]).has(mission.status)) {
        throw new MissionError("INVALID_STATE", `Cannot evaluate mission in state ${mission.status}`);
      }

      const evaluation = {
        evaluated_at: new Date().toISOString(),
        evaluated_by: input.evaluated_by || "system",
        success: input.success !== false,
        lessons_learned: input.lessons_learned || [],
        improvements: input.improvements || [],
        capability_delta: input.capability_delta || { created: 0, protected: 0, improved: 0 },
      };

      mission.evaluation = evaluation;
      this._transitionMission(mission, MISSION_STATES.EVALUATED, input.evaluated_by || "system", "Evaluation complete");

      this._recordEvent(state, "mission.evaluated", {
        mission_id: missionId,
        success: evaluation.success,
        lesson_count: evaluation.lessons_learned.length,
      });

      return mission;
    });
  }

  /**
   * Convert evaluation into capability for future use
   */
  learnCapability(missionId, input = {}) {
    return this.store.transaction((state) => {
      const mission = this._findMission(state, missionId);
      if (mission.status !== MISSION_STATES.EVALUATED) {
        throw new MissionError("INVALID_STATE", `Mission must be evaluated before learning; current state: ${mission.status}`);
      }

      const capability = {
        id: `capability_${crypto.randomUUID().replace(/-/g, "")}`,
        organization_id: mission.organization_id,
        title: String(input.title || `Capability from ${mission.title}`).slice(0, 200),
        description: String(input.description || "").slice(0, 2000),
        source_mission_id: missionId,
        inputs: input.inputs || [],
        outputs: input.outputs || [],
        permissions_required: input.permissions_required || [],
        tests: input.tests || [],
        cost_basis: input.cost_basis || {},
        performance_history: [],
        risk_level: input.risk_level || "medium",
        owned_by: input.owned_by || "system",
        created_at: new Date().toISOString(),
        is_reusable: input.is_reusable !== false,
      };

      state.capabilities = state.capabilities || [];
      state.capabilities.push(capability);

      mission.status = MISSION_STATES.LEARNED;
      mission.learned_capability_id = capability.id;
      mission.updated_at = new Date().toISOString();
      mission.audit_trail.push({
        timestamp: new Date().toISOString(),
        state: MISSION_STATES.LEARNED,
        actor: input.learned_by || "system",
        reason: "Capability learned and registered",
      });

      this._recordEvent(state, "capability.learned", {
        mission_id: missionId,
        capability_id: capability.id,
        capability_title: capability.title,
      });

      return { mission, capability };
    });
  }

  /**
   * Capture evidence artifact
   */
  recordEvidence(missionId, input = {}) {
    return this.store.transaction((state) => {
      const mission = this._findMission(state, missionId);

      const evidence = {
        id: `evidence_${crypto.randomUUID().replace(/-/g, "")}`,
        mission_id: missionId,
        organization_id: mission.organization_id,
        type: String(input.type || "artifact").slice(0, 100),
        title: String(input.title || "Evidence").slice(0, 200),
        source: String(input.source || "").slice(0, 500),
        sha256: input.sha256 || crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex"),
        bytes: Number(input.bytes) || 0,
        verified: Boolean(input.verified),
        verification_timestamp: input.verified ? new Date().toISOString() : null,
        chain_hash: input.chain_hash || this._computeChainHash(state),
        created_at: new Date().toISOString(),
        created_by: input.created_by || "system",
      };

      state.evidence = state.evidence || [];
      state.evidence.push(evidence);

      mission.evidence_ids.push(evidence.id);

      this._recordEvent(state, "evidence.recorded", {
        mission_id: missionId,
        evidence_id: evidence.id,
        evidence_type: evidence.type,
        verified: evidence.verified,
      });

      return evidence;
    });
  }

  /**
   * Get mission with all related records
   */
  getMissionGraph(missionId) {
    const state = this.store.load();
    const mission = this._findMission(state, missionId);
    const approval = mission.approval_record_id ? state.approvals?.find((a) => a.id === mission.approval_record_id) : null;
    const outcomes = mission.outcome_ids.map((id) => state.outcomes?.find((o) => o.id === id)).filter(Boolean);
    const evidences = mission.evidence_ids.map((id) => state.evidence?.find((e) => e.id === id)).filter(Boolean);

    return {
      mission,
      approval,
      outcomes,
      evidence: evidences,
      events: (state.events || []).filter((e) => e.data?.mission_id === missionId).slice(-50),
    };
  }

  // === Private Helpers ===

  _findMission(state, missionId) {
    state.missions = state.missions || [];
    const mission = state.missions.find((m) => m.id === missionId);
    if (!mission) throw new MissionError("NOT_FOUND", `Mission ${missionId} not found`);
    return mission;
  }

  _findApproval(state, approvalId) {
    state.approvals = state.approvals || [];
    const approval = state.approvals.find((a) => a.id === approvalId);
    if (!approval) throw new MissionError("NOT_FOUND", `Approval ${approvalId} not found`);
    return approval;
  }

  _canTransition(currentState, nextState) {
    const valid = VALID_TRANSITIONS[currentState];
    return valid && valid.includes(nextState);
  }

  _transitionMission(mission, nextState, actor, reason) {
    if (!this._canTransition(mission.status, nextState)) {
      throw new MissionError("INVALID_TRANSITION", `Cannot transition from ${mission.status} to ${nextState}`);
    }
    mission.status = nextState;
    mission.updated_at = new Date().toISOString();
    mission.audit_trail.push({
      timestamp: new Date().toISOString(),
      state: nextState,
      actor,
      reason,
    });
  }

  _recordEvent(state, type, data = {}) {
    state.events = state.events || [];
    const event = {
      id: `event_${crypto.randomUUID().replace(/-/g, "")}`,
      type,
      organization_id: data.organization_id || "default",
      correlation_id: data.correlation_id || crypto.randomUUID(),
      causation_id: data.causation_id || null,
      timestamp: new Date().toISOString(),
      data,
    };
    state.events.push(event);
    // Keep only last 10000 events
    if (state.events.length > 10000) {
      state.events = state.events.slice(-10000);
    }
  }

  _computeChainHash(state) {
    const lastEvidence = (state.evidence || []).slice(-1)[0];
    if (!lastEvidence || !lastEvidence.sha256) return crypto.randomUUID();
    return crypto.createHash("sha256").update(lastEvidence.sha256 + lastEvidence.created_at).digest("hex");
  }
}

module.exports = {
  MissionEngine,
  MissionError,
  MISSION_STATES,
  VALID_TRANSITIONS,
};
