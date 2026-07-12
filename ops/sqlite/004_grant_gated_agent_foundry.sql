CREATE TABLE IF NOT EXISTS foundry_action_runs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  grant_id TEXT NOT NULL,
  package_id TEXT NOT NULL,
  mission_id TEXT NOT NULL,
  worker_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('create_agent','deploy_staging','deploy_production','spend_budget')),
  status TEXT NOT NULL CHECK (status IN ('running','succeeded','failed','reconciliation_required')),
  attempts INTEGER NOT NULL DEFAULT 1,
  input_hash TEXT NOT NULL,
  result_hash TEXT,
  actual_cost_usd REAL NOT NULL DEFAULT 0,
  external_reference TEXT,
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, grant_id)
);
CREATE INDEX IF NOT EXISTS idx_foundry_runs_org_status
  ON foundry_action_runs(organization_id, status, created_at);

CREATE TABLE IF NOT EXISTS foundry_agents (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  parent_agent_id TEXT NOT NULL,
  mission_id TEXT NOT NULL,
  grant_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','paused','retired','quarantined')),
  lineage_depth INTEGER NOT NULL DEFAULT 0,
  genome_json TEXT NOT NULL,
  capabilities_json TEXT NOT NULL,
  permissions_json TEXT NOT NULL,
  budget_json TEXT NOT NULL,
  spec_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_foundry_agents_parent
  ON foundry_agents(organization_id, parent_agent_id, created_at);
CREATE INDEX IF NOT EXISTS idx_foundry_agents_status
  ON foundry_agents(organization_id, status, created_at);

CREATE TABLE IF NOT EXISTS foundry_deployments (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  mission_id TEXT NOT NULL,
  grant_id TEXT NOT NULL UNIQUE,
  worker_id TEXT NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('staging','production')),
  app_id TEXT NOT NULL,
  release_id TEXT NOT NULL,
  source_path TEXT NOT NULL,
  release_path TEXT NOT NULL,
  artifact_sha256 TEXT NOT NULL,
  previous_release_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('active','rolled_back','failed')),
  manifest_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  UNIQUE (organization_id, environment, app_id, release_id)
);
CREATE INDEX IF NOT EXISTS idx_foundry_deployments_current
  ON foundry_deployments(organization_id, environment, app_id, status, created_at);

CREATE TABLE IF NOT EXISTS foundry_spend_receipts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  mission_id TEXT NOT NULL,
  grant_id TEXT NOT NULL UNIQUE,
  worker_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  vendor TEXT NOT NULL,
  purpose TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  amount_usd REAL NOT NULL,
  external_reference TEXT NOT NULL,
  provider_status TEXT NOT NULL,
  provider_metadata_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  UNIQUE (organization_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_foundry_spend_org_created
  ON foundry_spend_receipts(organization_id, created_at);
