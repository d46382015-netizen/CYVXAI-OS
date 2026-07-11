-- CYVXAI-OS critical runtime completion
-- Durable job execution, trusted users, worker health, idempotency, and recovery.

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','approver','agent','viewer')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, id),
  FOREIGN KEY (organization_id) REFERENCES organizations(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_global_id ON users(id);
CREATE INDEX IF NOT EXISTS idx_users_org_role ON users(organization_id, role);

CREATE TRIGGER IF NOT EXISTS trg_users_agent_insert
AFTER INSERT ON users
WHEN NEW.role = 'agent'
BEGIN
  INSERT INTO agents(id,organization_id,name,role,capabilities,status,created_at,updated_at)
  VALUES(NEW.id,NEW.organization_id,NEW.id,'agent','["deterministic.local.v1"]',CASE WHEN NEW.active=1 THEN 'idle' ELSE 'disabled' END,NEW.created_at,NEW.updated_at)
  ON CONFLICT(id) DO UPDATE SET
    organization_id=excluded.organization_id,
    name=excluded.name,
    role=excluded.role,
    capabilities=excluded.capabilities,
    status=excluded.status,
    updated_at=excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_users_agent_update
AFTER UPDATE OF role,active,updated_at ON users
WHEN NEW.role = 'agent'
BEGIN
  INSERT INTO agents(id,organization_id,name,role,capabilities,status,created_at,updated_at)
  VALUES(NEW.id,NEW.organization_id,NEW.id,'agent','["deterministic.local.v1"]',CASE WHEN NEW.active=1 THEN 'idle' ELSE 'disabled' END,NEW.created_at,NEW.updated_at)
  ON CONFLICT(id) DO UPDATE SET
    organization_id=excluded.organization_id,
    name=excluded.name,
    role=excluded.role,
    capabilities=excluded.capabilities,
    status=excluded.status,
    updated_at=excluded.updated_at;
END;

INSERT OR IGNORE INTO agents(id,organization_id,name,role,capabilities,status,created_at,updated_at)
SELECT id,organization_id,id,'agent','["deterministic.local.v1"]',CASE WHEN active=1 THEN 'idle' ELSE 'disabled' END,created_at,updated_at
FROM users WHERE role='agent';

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  mission_id TEXT NOT NULL,
  job_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued','leased','running','completed','retryable','failed','cancelled')),
  idempotency_key TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  available_at TEXT NOT NULL,
  lease_owner TEXT,
  lease_expires_at TEXT,
  correlation_id TEXT NOT NULL,
  causation_id TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL,
  result_hash TEXT,
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (mission_id) REFERENCES missions(id),
  UNIQUE (organization_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_jobs_claim ON jobs(status, available_at, lease_expires_at);
CREATE INDEX IF NOT EXISTS idx_jobs_org_mission ON jobs(organization_id, mission_id);
CREATE INDEX IF NOT EXISTS idx_jobs_lease_owner ON jobs(lease_owner, status);

CREATE TRIGGER IF NOT EXISTS trg_jobs_safe_requeue
AFTER UPDATE OF status ON jobs
WHEN NEW.status = 'queued' AND OLD.status IN ('failed','retryable')
BEGIN
  UPDATE jobs
  SET attempts=0,started_at=NULL,completed_at=NULL,result_hash=NULL,last_error=NULL,
      lease_owner=NULL,lease_expires_at=NULL
  WHERE id=NEW.id;

  UPDATE missions
  SET status=CASE WHEN status='failed' THEN 'queued' ELSE status END,
      updated_at=NEW.updated_at,
      payload=json_set(COALESCE(payload,'{}'),'$.status',CASE WHEN status='failed' THEN 'queued' ELSE status END,'$.updated_at',NEW.updated_at)
  WHERE id=NEW.mission_id AND organization_id=NEW.organization_id;

  INSERT INTO events(id,organization_id,type,correlation_id,causation_id,timestamp,actor,data,payload)
  VALUES(
    'event_' || lower(hex(randomblob(16))),NEW.organization_id,'job.requeue_checkpoint',NEW.correlation_id,NEW.id,
    NEW.updated_at,'system:requeue',
    json_object('mission_id',NEW.mission_id,'job_id',NEW.id,'attempts_reset',1),
    json_object('organization_id',NEW.organization_id,'type','job.requeue_checkpoint','correlation_id',NEW.correlation_id,'causation_id',NEW.id,'timestamp',NEW.updated_at,'actor','system:requeue','data',json_object('mission_id',NEW.mission_id,'job_id',NEW.id,'attempts_reset',1))
  );

  INSERT INTO audit_log(id,organization_id,resource_type,resource_id,action,actor,reason,changes,timestamp)
  VALUES(
    'audit_' || lower(hex(randomblob(16))),NEW.organization_id,'job',NEW.id,'requeue_checkpoint','system:requeue',
    'Reset durable job attempts and synchronized mission state for safe requeue',
    json_object('mission_id',NEW.mission_id,'previous_status',OLD.status,'status','queued','attempts_reset',1),NEW.updated_at
  );
END;

CREATE TABLE IF NOT EXISTS worker_heartbeats (
  worker_id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  heartbeat_at TEXT NOT NULL,
  current_job_id TEXT,
  metadata TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_worker_heartbeat_at ON worker_heartbeats(heartbeat_at);

CREATE TABLE IF NOT EXISTS execution_effects (
  job_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  mission_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  effect_hash TEXT NOT NULL,
  evidence_id TEXT NOT NULL,
  artifact_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (job_id) REFERENCES jobs(id),
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (mission_id) REFERENCES missions(id),
  UNIQUE (organization_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_effects_org_mission ON execution_effects(organization_id, mission_id);

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket_key TEXT PRIMARY KEY,
  window_started_at INTEGER NOT NULL,
  request_count INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS runtime_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_outcomes_one_completed_per_mission
  ON outcomes(organization_id, mission_id, status)
  WHERE status = 'completed';
CREATE INDEX IF NOT EXISTS idx_audit_org_resource_time
  ON audit_log(organization_id, resource_type, resource_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_events_org_mission_time
  ON events(organization_id, timestamp);
