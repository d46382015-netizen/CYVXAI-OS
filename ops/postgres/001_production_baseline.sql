BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS cyvx_schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now(),
  checksum text NOT NULL
);

CREATE TABLE IF NOT EXISTS cyvx_runtime_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment text NOT NULL CHECK (length(environment) BETWEEN 1 AND 64),
  instance_id text NOT NULL CHECK (length(instance_id) BETWEEN 1 AND 128),
  service_version text NOT NULL,
  readiness_score numeric(6,2) NOT NULL DEFAULT 0 CHECK (readiness_score BETWEEN 0 AND 100),
  operating_state text NOT NULL DEFAULT 'unknown',
  snapshot jsonb NOT NULL,
  observed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (environment, instance_id)
);

CREATE INDEX IF NOT EXISTS cyvx_runtime_snapshots_environment_observed_idx
  ON cyvx_runtime_snapshots (environment, observed_at DESC);

CREATE TABLE IF NOT EXISTS cyvx_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment text NOT NULL,
  incident_key text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  status text NOT NULL CHECK (status IN ('open', 'monitoring', 'resolved')),
  title text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (environment, incident_key),
  CHECK (resolved_at IS NULL OR resolved_at >= started_at)
);

CREATE INDEX IF NOT EXISTS cyvx_incidents_environment_status_idx
  ON cyvx_incidents (environment, status, started_at DESC);

CREATE TABLE IF NOT EXISTS cyvx_backup_manifests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment text NOT NULL,
  backup_id uuid NOT NULL UNIQUE,
  object_key text NOT NULL UNIQUE,
  ciphertext_sha256 text NOT NULL CHECK (length(ciphertext_sha256) = 64),
  source_bytes bigint NOT NULL CHECK (source_bytes >= 0),
  backup_bytes bigint NOT NULL CHECK (backup_bytes > 0),
  file_count integer NOT NULL CHECK (file_count >= 0),
  verified_at timestamptz,
  restore_tested_at timestamptz,
  created_at timestamptz NOT NULL,
  retention_until timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS cyvx_backup_manifests_environment_created_idx
  ON cyvx_backup_manifests (environment, created_at DESC);

CREATE TABLE IF NOT EXISTS cyvx_audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  environment text NOT NULL,
  event_type text NOT NULL,
  actor_type text NOT NULL DEFAULT 'system',
  actor_id text,
  correlation_id text,
  trace_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload_sha256 text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cyvx_audit_events_environment_time_idx
  ON cyvx_audit_events (environment, occurred_at DESC);
CREATE INDEX IF NOT EXISTS cyvx_audit_events_correlation_idx
  ON cyvx_audit_events (correlation_id) WHERE correlation_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS cyvx_slo_measurements (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  environment text NOT NULL,
  service text NOT NULL,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  availability_ratio numeric(9,8) NOT NULL CHECK (availability_ratio BETWEEN 0 AND 1),
  request_count bigint NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  error_count bigint NOT NULL DEFAULT 0 CHECK (error_count >= 0),
  latency_p95_ms numeric(12,3),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (environment, service, window_start, window_end),
  CHECK (window_end > window_start)
);

CREATE OR REPLACE FUNCTION cyvx_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cyvx_runtime_snapshots_updated_at ON cyvx_runtime_snapshots;
CREATE TRIGGER cyvx_runtime_snapshots_updated_at
BEFORE UPDATE ON cyvx_runtime_snapshots
FOR EACH ROW EXECUTE FUNCTION cyvx_set_updated_at();

DROP TRIGGER IF EXISTS cyvx_incidents_updated_at ON cyvx_incidents;
CREATE TRIGGER cyvx_incidents_updated_at
BEFORE UPDATE ON cyvx_incidents
FOR EACH ROW EXECUTE FUNCTION cyvx_set_updated_at();

CREATE OR REPLACE FUNCTION cyvx_health()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'ok', true,
    'database_time', now(),
    'runtime_snapshots', (SELECT count(*) FROM cyvx_runtime_snapshots),
    'open_incidents', (SELECT count(*) FROM cyvx_incidents WHERE status <> 'resolved'),
    'verified_backups', (SELECT count(*) FROM cyvx_backup_manifests WHERE verified_at IS NOT NULL)
  );
$$;

ALTER TABLE cyvx_runtime_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE cyvx_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE cyvx_backup_manifests ENABLE ROW LEVEL SECURITY;
ALTER TABLE cyvx_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE cyvx_slo_measurements ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON cyvx_runtime_snapshots, cyvx_incidents, cyvx_backup_manifests, cyvx_audit_events, cyvx_slo_measurements FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON cyvx_runtime_snapshots, cyvx_incidents, cyvx_backup_manifests, cyvx_audit_events, cyvx_slo_measurements FROM authenticated;
  END IF;
END;
$$;

INSERT INTO cyvx_schema_migrations (version, checksum)
VALUES ('001_production_baseline', 'runtime-snapshots-incidents-backups-audit-slo-v1')
ON CONFLICT (version) DO NOTHING;

COMMIT;
