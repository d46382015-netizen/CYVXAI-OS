"use strict";

const crypto = require("node:crypto");
const { RuntimeError, now, id, parseJson } = require("./base");

function rowPayload(row) {
  if (!row) return null;
  const payload = parseJson(row.payload, null);
  if (payload) return payload;
  const copy = { ...row };
  delete copy.payload;
  return copy;
}

function requireMission(db, auth, missionId) {
  const row = db.prepare("SELECT * FROM missions WHERE id=? AND organization_id=?").get(missionId, auth.organization_id);
  if (!row) throw new RuntimeError("NOT_FOUND", "Mission not found", 404);
  return rowPayload(row);
}

function requireApproval(db, auth, approvalId) {
  const row = db.prepare("SELECT * FROM approvals WHERE id=? AND organization_id=?").get(approvalId, auth.organization_id);
  if (!row) throw new RuntimeError("NOT_FOUND", "Approval not found", 404);
  return rowPayload(row);
}

function requireAssignedAgent(auth, mission) {
  if (auth.role === "admin") return;
  if (auth.role !== "agent" || mission.assigned_agent_id !== auth.user_id) {
    throw new RuntimeError("PERMISSION_DENIED", "Agent is not assigned to this mission", 403);
  }
}

class SqliteMissionStore {
  constructor(db, logger) {
    this.db = db;
    this.logger = logger;
    this.context = { organization_id: "default", actor: "system", correlation_id: crypto.randomUUID(), causation_id: null };
  }

  withContext(context, operation) {
    const previous = this.context;
    this.context = { ...previous, ...context };
    try { return operation(); }
    finally { this.context = previous; }
  }

  load() {
    const organizationId = this.context.organization_id;
    const load = (table, order) => this.db.prepare(`SELECT * FROM ${table} WHERE organization_id=? ORDER BY ${order}`)
      .all(organizationId).map(rowPayload);
    return {
      missions: load("missions", "created_at"),
      approvals: load("approvals", "requested_at"),
      assignments: load("assignments", "assigned_at"),
      evidence: load("evidence", "mission_id,sequence,created_at"),
      outcomes: load("outcomes", "completed_at"),
      capabilities: load("capabilities", "created_at"),
      events: load("events", "timestamp"),
    };
  }

  transaction(mutator) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const state = this.load();
      const before = structuredClone(state);
      const result = mutator(state);
      this.normalize(state, before);
      this.persist(state);
      this.persistAudits(before, state);
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  normalize(state, before) {
    const priorEvents = new Set(before.events.map((event) => event.id));
    for (const event of state.events) {
      if (priorEvents.has(event.id)) continue;
      event.organization_id = this.context.organization_id;
      event.correlation_id = this.context.correlation_id;
      event.causation_id = event.causation_id || this.context.causation_id;
      event.actor = this.context.actor;
      event.timestamp ||= now();
      event.data = { ...(event.data || {}), organization_id: this.context.organization_id, actor: this.context.actor };
    }
    for (const assignment of state.assignments) assignment.organization_id ||= this.context.organization_id;
  }

  persist(state) {
    const mission = this.db.prepare(`INSERT INTO missions(
      id,organization_id,title,objective,context,status,created_at,updated_at,created_by,assigned_agent_id,
      assigned_approver_id,approval_record_id,approval_required,expected_completion,risk_level,priority,
      constraints,opportunities,success_metrics,outcome_ids,evidence_ids,audit_trail,evaluation,learned_capability_id,payload
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET title=excluded.title,objective=excluded.objective,context=excluded.context,
      status=excluded.status,updated_at=excluded.updated_at,assigned_agent_id=excluded.assigned_agent_id,
      assigned_approver_id=excluded.assigned_approver_id,approval_record_id=excluded.approval_record_id,
      risk_level=excluded.risk_level,priority=excluded.priority,constraints=excluded.constraints,
      opportunities=excluded.opportunities,success_metrics=excluded.success_metrics,outcome_ids=excluded.outcome_ids,
      evidence_ids=excluded.evidence_ids,audit_trail=excluded.audit_trail,evaluation=excluded.evaluation,
      learned_capability_id=excluded.learned_capability_id,payload=excluded.payload`);
    for (const item of state.missions) mission.run(
      item.id, item.organization_id, item.title, item.objective, item.context || null, item.status, item.created_at,
      item.updated_at, item.created_by, item.assigned_agent_id || null, item.assigned_approver_id || null,
      item.approval_record_id || null, item.approval_required === false ? 0 : 1, item.expected_completion || null,
      item.risk_level || "medium", Number(item.priority) || 50, JSON.stringify(item.constraints || []),
      JSON.stringify(item.opportunities || []), JSON.stringify(item.success_metrics || []),
      JSON.stringify(item.outcome_ids || []), JSON.stringify(item.evidence_ids || []),
      JSON.stringify(item.audit_trail || []), item.evaluation ? JSON.stringify(item.evaluation) : null,
      item.learned_capability_id || null, JSON.stringify(item),
    );

    const approval = this.db.prepare(`INSERT INTO approvals(
      id,organization_id,mission_id,status,requested_by,requested_at,reason,approval_deadline,decision,
      decided_by,decided_at,decision_reason,audit_trail,payload
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,
      decision=excluded.decision,decided_by=excluded.decided_by,decided_at=excluded.decided_at,
      decision_reason=excluded.decision_reason,audit_trail=excluded.audit_trail,payload=excluded.payload`);
    for (const item of state.approvals) approval.run(
      item.id, item.organization_id, item.mission_id, item.status, item.requested_by, item.requested_at,
      item.reason || null, item.approval_deadline || null, item.decision || null, item.decided_by || null,
      item.decided_at || null, item.decision_reason || null, JSON.stringify(item.audit_trail || []), JSON.stringify(item),
    );

    const assignment = this.db.prepare(`INSERT INTO assignments(
      id,organization_id,mission_id,agent_id,status,assigned_at,assigned_by,started_at,completed_at,error_message,payload
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,
      started_at=excluded.started_at,completed_at=excluded.completed_at,error_message=excluded.error_message,payload=excluded.payload`);
    for (const item of state.assignments) assignment.run(
      item.id, item.organization_id || this.context.organization_id, item.mission_id, item.agent_id,
      item.status, item.assigned_at, item.assigned_by, item.started_at || null, item.completed_at || null,
      item.error_message || null, JSON.stringify(item),
    );

    const evidence = this.db.prepare(`INSERT INTO evidence(
      id,organization_id,mission_id,type,title,source,sha256,chain_hash,bytes,verified,verification_timestamp,
      created_at,created_by,sequence,artifact_path,artifact_sha256,record_sha256,previous_chain_hash,job_id,record_json,payload
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,
      source=excluded.source,sha256=excluded.sha256,chain_hash=excluded.chain_hash,bytes=excluded.bytes,
      verified=excluded.verified,verification_timestamp=excluded.verification_timestamp,sequence=excluded.sequence,
      artifact_path=excluded.artifact_path,artifact_sha256=excluded.artifact_sha256,
      record_sha256=excluded.record_sha256,previous_chain_hash=excluded.previous_chain_hash,
      job_id=excluded.job_id,record_json=excluded.record_json,payload=excluded.payload`);
    for (const item of state.evidence) evidence.run(
      item.id, item.organization_id, item.mission_id, item.type, item.title, item.source || null,
      item.sha256 || item.artifact_sha256, item.chain_hash, Number(item.bytes) || 0, item.verified ? 1 : 0,
      item.verification_timestamp || null, item.created_at, item.created_by, item.sequence || null,
      item.artifact_path || null, item.artifact_sha256 || item.sha256 || null, item.record_sha256 || null,
      item.previous_chain_hash || null, item.job_id || null, item.record_json || null, JSON.stringify(item),
    );

    const outcome = this.db.prepare(`INSERT INTO outcomes(
      id,organization_id,mission_id,status,completed_at,completed_by,result_summary,metrics,verified,evidence_ids,job_id,payload
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,
      result_summary=excluded.result_summary,metrics=excluded.metrics,verified=excluded.verified,
      evidence_ids=excluded.evidence_ids,job_id=excluded.job_id,payload=excluded.payload`);
    for (const item of state.outcomes) outcome.run(
      item.id, item.organization_id, item.mission_id, item.status, item.completed_at, item.completed_by,
      item.result_summary || null, JSON.stringify(item.metrics || {}), item.verified ? 1 : 0,
      JSON.stringify(item.evidence_ids || []), item.job_id || null, JSON.stringify(item),
    );

    const capability = this.db.prepare(`INSERT INTO capabilities(
      id,organization_id,title,description,source_mission_id,inputs,outputs,permissions_required,tests,cost_basis,
      risk_level,owned_by,is_reusable,created_at,usage_count,payload
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,
      description=excluded.description,inputs=excluded.inputs,outputs=excluded.outputs,
      permissions_required=excluded.permissions_required,tests=excluded.tests,cost_basis=excluded.cost_basis,
      risk_level=excluded.risk_level,owned_by=excluded.owned_by,is_reusable=excluded.is_reusable,payload=excluded.payload`);
    for (const item of state.capabilities) capability.run(
      item.id, item.organization_id, item.title, item.description || null, item.source_mission_id,
      JSON.stringify(item.inputs || []), JSON.stringify(item.outputs || []), JSON.stringify(item.permissions_required || []),
      JSON.stringify(item.tests || []), JSON.stringify(item.cost_basis || {}), item.risk_level || "medium",
      item.owned_by, item.is_reusable === false ? 0 : 1, item.created_at, Number(item.usage_count) || 0, JSON.stringify(item),
    );

    const event = this.db.prepare(`INSERT OR IGNORE INTO events(
      id,organization_id,type,correlation_id,causation_id,timestamp,actor,data,payload
    ) VALUES(?,?,?,?,?,?,?,?,?)`);
    for (const item of state.events) event.run(
      item.id, item.organization_id, item.type, item.correlation_id, item.causation_id || null,
      item.timestamp, item.actor, JSON.stringify(item.data || {}), JSON.stringify(item),
    );
  }

  persistAudits(before, after) {
    const previousMissions = new Map(before.missions.map((mission) => [mission.id, mission]));
    for (const mission of after.missions) {
      const old = previousMissions.get(mission.id);
      if (!old) this.audit("mission", mission.id, "created", "Mission created", { after: mission.status });
      else if (old.status !== mission.status) {
        this.audit("mission", mission.id, "transitioned", `${old.status} -> ${mission.status}`, { before: old.status, after: mission.status });
      }
    }
    for (const [key, resourceType] of [["approvals", "approval"], ["assignments", "assignment"], ["outcomes", "outcome"], ["capabilities", "capability"]]) {
      const known = new Set(before[key].map((item) => item.id));
      for (const item of after[key]) {
        if (!known.has(item.id)) this.audit(resourceType, item.id, "created", `${resourceType} created`, { mission_id: item.mission_id || item.source_mission_id });
      }
    }
  }

  audit(resourceType, resourceId, action, reason, changes = {}) {
    this.db.prepare(`INSERT INTO audit_log(
      id,organization_id,resource_type,resource_id,action,actor,reason,changes,timestamp
    ) VALUES(?,?,?,?,?,?,?,?,?)`).run(
      id("audit"), this.context.organization_id, resourceType, resourceId, action,
      this.context.actor, reason, JSON.stringify(changes), now(),
    );
  }
}

module.exports = { SqliteMissionStore, rowPayload, requireMission, requireApproval, requireAssignedAgent };
