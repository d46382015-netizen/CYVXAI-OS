-- CYVX Mission Workflow Schema
-- © 2026 Dakota Lee Jonsgaard. All rights reserved.
--
-- Complete schema for mission lifecycle, approvals, evidence, outcomes, and learning

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- Organizations for multi-tenant isolation
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Agents that execute missions
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  capabilities TEXT NOT NULL, -- JSON array
  status TEXT NOT NULL, -- idle, assigned, executing, error
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  INDEX idx_agents_org (organization_id),
  INDEX idx_agents_status (status)
);

-- Missions in various states
CREATE TABLE IF NOT EXISTS missions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  title TEXT NOT NULL,
  objective TEXT NOT NULL,
  context TEXT,
  status TEXT NOT NULL, -- draft, validated, planned, awaiting_approval, approved, queued, running, completed, failed, cancelled, evaluated, learned
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  assigned_agent_id TEXT,
  assigned_approver_id TEXT,
  approval_record_id TEXT,
  approval_required BOOLEAN DEFAULT 1,
  expected_completion TEXT,
  risk_level TEXT DEFAULT 'medium', -- low, medium, high
  priority INTEGER DEFAULT 50,
  constraints TEXT, -- JSON array
  opportunities TEXT, -- JSON array
  success_metrics TEXT, -- JSON array
  outcome_ids TEXT, -- JSON array of outcome IDs
  evidence_ids TEXT, -- JSON array of evidence IDs
  audit_trail TEXT NOT NULL, -- JSON array of audit entries
  evaluation TEXT, -- JSON object with evaluation details
  learned_capability_id TEXT,
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (assigned_agent_id) REFERENCES agents(id),
  INDEX idx_missions_org (organization_id),
  INDEX idx_missions_status (status),
  INDEX idx_missions_created (created_at),
  INDEX idx_missions_agent (assigned_agent_id)
);

-- Approval records for mission gates
CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  mission_id TEXT NOT NULL,
  status TEXT NOT NULL, -- pending, approved, rejected
  requested_by TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  reason TEXT,
  approval_deadline TEXT,
  decision TEXT, -- approved, rejected, or null if pending
  decided_by TEXT,
  decided_at TEXT,
  decision_reason TEXT,
  audit_trail TEXT NOT NULL, -- JSON array
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (mission_id) REFERENCES missions(id),
  INDEX idx_approvals_org (organization_id),
  INDEX idx_approvals_mission (mission_id),
  INDEX idx_approvals_status (status),
  INDEX idx_approvals_deadline (approval_deadline)
);

-- Agent-mission assignments
CREATE TABLE IF NOT EXISTS assignments (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  mission_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  status TEXT NOT NULL, -- assigned, executing, completed, failed
  assigned_at TEXT NOT NULL,
  assigned_by TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  error_message TEXT,
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (mission_id) REFERENCES missions(id),
  FOREIGN KEY (agent_id) REFERENCES agents(id),
  INDEX idx_assignments_org (organization_id),
  INDEX idx_assignments_mission (mission_id),
  INDEX idx_assignments_agent (agent_id),
  INDEX idx_assignments_status (status)
);

-- Tamper-evident evidence ledger
CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  mission_id TEXT NOT NULL,
  type TEXT NOT NULL, -- artifact, log, metric, proof, etc.
  title TEXT NOT NULL,
  source TEXT,
  sha256 TEXT NOT NULL UNIQUE, -- Content hash
  chain_hash TEXT NOT NULL, -- Chained hash for tamper detection
  bytes INTEGER DEFAULT 0,
  verified BOOLEAN DEFAULT 0,
  verification_timestamp TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (mission_id) REFERENCES missions(id),
  INDEX idx_evidence_org (organization_id),
  INDEX idx_evidence_mission (mission_id),
  INDEX idx_evidence_sha256 (sha256),
  INDEX idx_evidence_verified (verified),
  INDEX idx_evidence_type (type)
);

-- Mission outcomes and results
CREATE TABLE IF NOT EXISTS outcomes (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  mission_id TEXT NOT NULL,
  status TEXT NOT NULL, -- completed, failed
  completed_at TEXT NOT NULL,
  completed_by TEXT NOT NULL,
  result_summary TEXT,
  metrics TEXT, -- JSON object with outcome metrics
  verified BOOLEAN DEFAULT 0,
  evidence_ids TEXT, -- JSON array of supporting evidence IDs
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (mission_id) REFERENCES missions(id),
  INDEX idx_outcomes_org (organization_id),
  INDEX idx_outcomes_mission (mission_id),
  INDEX idx_outcomes_status (status),
  INDEX idx_outcomes_verified (verified)
);

-- Learned capabilities from completed missions
CREATE TABLE IF NOT EXISTS capabilities (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  source_mission_id TEXT NOT NULL,
  inputs TEXT, -- JSON array
  outputs TEXT, -- JSON array
  permissions_required TEXT, -- JSON array
  tests TEXT, -- JSON array of test cases
  cost_basis TEXT, -- JSON object with cost info
  risk_level TEXT DEFAULT 'medium', -- low, medium, high
  owned_by TEXT NOT NULL,
  is_reusable BOOLEAN DEFAULT 1,
  created_at TEXT NOT NULL,
  usage_count INTEGER DEFAULT 0,
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (source_mission_id) REFERENCES missions(id),
  INDEX idx_capabilities_org (organization_id),
  INDEX idx_capabilities_reusable (is_reusable),
  INDEX idx_capabilities_risk (risk_level)
);

-- Events for event sourcing
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  type TEXT NOT NULL, -- mission.created, approval.approved, evidence.recorded, etc.
  correlation_id TEXT NOT NULL,
  causation_id TEXT,
  timestamp TEXT NOT NULL,
  actor TEXT NOT NULL,
  data TEXT NOT NULL, -- JSON payload
  INDEX idx_events_org (organization_id),
  INDEX idx_events_type (type),
  INDEX idx_events_correlation (correlation_id),
  INDEX idx_events_timestamp (timestamp),
  INDEX idx_events_actor (actor)
);

-- Audit trail for all state changes
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  resource_type TEXT NOT NULL, -- mission, approval, evidence, outcome, etc.
  resource_id TEXT NOT NULL,
  action TEXT NOT NULL, -- created, updated, transitioned, approved, etc.
  actor TEXT NOT NULL,
  reason TEXT,
  changes TEXT, -- JSON object with before/after
  timestamp TEXT NOT NULL,
  INDEX idx_audit_org (organization_id),
  INDEX idx_audit_resource (resource_type, resource_id),
  INDEX idx_audit_actor (actor),
  INDEX idx_audit_timestamp (timestamp)
);

-- Mission learning records
CREATE TABLE IF NOT EXISTS learning_records (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  mission_id TEXT NOT NULL,
  success BOOLEAN,
  lessons_learned TEXT, -- JSON array
  improvements TEXT, -- JSON array
  capability_delta TEXT, -- JSON with {created, protected, improved}
  created_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (mission_id) REFERENCES missions(id),
  INDEX idx_learning_org (organization_id),
  INDEX idx_learning_mission (mission_id)
);

-- Authorization roles and permissions
CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  permissions TEXT NOT NULL, -- JSON array
  created_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  INDEX idx_roles_org (organization_id),
  UNIQUE (organization_id, name)
);

-- User role assignments
CREATE TABLE IF NOT EXISTS user_roles (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  assigned_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (role_id) REFERENCES roles(id),
  INDEX idx_user_roles_org (organization_id),
  INDEX idx_user_roles_user (user_id),
  UNIQUE (organization_id, user_id, role_id)
);

-- Mission templates for reuse
CREATE TABLE IF NOT EXISTS mission_templates (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  objective_template TEXT,
  success_metrics_template TEXT, -- JSON
  constraints_template TEXT, -- JSON
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  INDEX idx_templates_org (organization_id)
);

-- Create default organization if it doesn't exist
INSERT OR IGNORE INTO organizations (id, name, created_at, updated_at)
VALUES ('default', 'Default Organization', datetime('now'), datetime('now'));

-- Create basic roles
INSERT OR IGNORE INTO roles (id, organization_id, name, permissions, created_at)
VALUES 
  ('role_admin', 'default', 'admin', '["*"]', datetime('now')),
  ('role_approver', 'default', 'approver', '["mission:view", "mission:approve", "approval:decide", "evidence:view", "outcome:view"]', datetime('now')),
  ('role_agent', 'default', 'agent', '["mission:view", "mission:execute", "evidence:record", "outcome:record"]', datetime('now')),
  ('role_viewer', 'default', 'viewer', '["mission:view", "approval:view", "evidence:view", "outcome:view"]', datetime('now'));
