CREATE TABLE IF NOT EXISTS governance_schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS governance_principals (
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  governance_role TEXT NOT NULL CHECK (governance_role IN ('supervisor','boss')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, user_id, governance_role)
);

CREATE TABLE IF NOT EXISTS governance_constitutions (
  organization_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 0,
  policy_json TEXT NOT NULL,
  policy_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  PRIMARY KEY (organization_id, version)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_governance_constitution_active
  ON governance_constitutions(organization_id) WHERE active = 1;

CREATE TABLE IF NOT EXISTS governance_controls (
  organization_id TEXT PRIMARY KEY,
  global_stop INTEGER NOT NULL DEFAULT 0,
  spending_frozen INTEGER NOT NULL DEFAULT 0,
  agent_creation_disabled INTEGER NOT NULL DEFAULT 0,
  external_actions_disabled INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS governance_packages (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  mission_id TEXT NOT NULL,
  worker_id TEXT NOT NULL,
  status TEXT NOT NULL,
  requested_action TEXT NOT NULL,
  risk_tier INTEGER NOT NULL CHECK (risk_tier BETWEEN 0 AND 3),
  artifact_sha256 TEXT NOT NULL,
  evidence_ids TEXT NOT NULL,
  tests_json TEXT NOT NULL,
  rollback_plan_json TEXT,
  declared_risks_json TEXT NOT NULL,
  estimated_cost_usd REAL NOT NULL DEFAULT 0,
  supervisor_review_id TEXT,
  boss_review_id TEXT,
  capability_grant_id TEXT,
  policy_decision_json TEXT,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_governance_packages_org_status
  ON governance_packages(organization_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_governance_packages_mission
  ON governance_packages(organization_id, mission_id, created_at);

CREATE TABLE IF NOT EXISTS governance_reviews (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  package_id TEXT NOT NULL,
  review_type TEXT NOT NULL CHECK (review_type IN ('supervisor','boss')),
  reviewer_id TEXT NOT NULL,
  decision TEXT NOT NULL,
  reason TEXT NOT NULL,
  findings_json TEXT NOT NULL,
  signature TEXT NOT NULL,
  signed_payload_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_governance_reviews_package
  ON governance_reviews(organization_id, package_id, created_at);

CREATE TABLE IF NOT EXISTS governance_capability_grants (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  package_id TEXT NOT NULL,
  mission_id TEXT NOT NULL,
  grantee_id TEXT NOT NULL,
  capability TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','consumed','revoked','expired')),
  maximum_cost_usd REAL NOT NULL DEFAULT 0,
  actual_cost_usd REAL,
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  consumed_by TEXT,
  receipt_json TEXT,
  signature TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_governance_grants_org_status
  ON governance_capability_grants(organization_id, status, expires_at);

CREATE TABLE IF NOT EXISTS governance_budget_ledger (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  package_id TEXT,
  grant_id TEXT,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('reserve','spend','release','credit')),
  amount_usd REAL NOT NULL,
  metadata_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_governance_budget_month
  ON governance_budget_ledger(organization_id, created_at);

CREATE TABLE IF NOT EXISTS governance_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL,
  package_id TEXT,
  mission_id TEXT,
  payload_json TEXT NOT NULL,
  previous_hash TEXT,
  record_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (organization_id, sequence)
);
CREATE INDEX IF NOT EXISTS idx_governance_events_org_sequence
  ON governance_events(organization_id, sequence);
