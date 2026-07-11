BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  BEGIN
    EXECUTE 'CREATE EXTENSION IF NOT EXISTS pgmq';
  EXCEPTION WHEN insufficient_privilege OR undefined_file OR feature_not_supported THEN
    RAISE NOTICE 'pgmq extension is unavailable; CYVX will use the durable fallback queue table';
  END;
  BEGIN
    EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_cron';
  EXCEPTION WHEN insufficient_privilege OR undefined_file OR feature_not_supported THEN
    RAISE NOTICE 'pg_cron extension is unavailable; external scheduling remains required';
  END;
END;
$$;

CREATE TABLE IF NOT EXISTS cyvx_tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{2,62}$'),
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 160),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cyvx_tenant_memberships (
  tenant_id uuid NOT NULL REFERENCES cyvx_tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'operator', 'developer', 'viewer')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('invited', 'active', 'suspended', 'revoked')),
  mfa_required boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS cyvx_tenant_memberships_user_idx
  ON cyvx_tenant_memberships (user_id, status, tenant_id);

CREATE TABLE IF NOT EXISTS cyvx_feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key text NOT NULL CHECK (flag_key ~ '^[a-z][a-z0-9._-]{2,127}$'),
  flag_type text NOT NULL CHECK (flag_type IN ('boolean', 'string', 'number', 'object')),
  flag_value jsonb NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  tenant_id uuid REFERENCES cyvx_tenants(id) ON DELETE CASCADE,
  environment text NOT NULL DEFAULT 'global' CHECK (length(environment) BETWEEN 1 AND 64),
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cyvx_feature_flags_target_unique UNIQUE NULLS NOT DISTINCT (flag_key, environment, tenant_id)
);

CREATE INDEX IF NOT EXISTS cyvx_feature_flags_lookup_idx
  ON cyvx_feature_flags (environment, flag_key, tenant_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS cyvx_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider ~ '^[a-z][a-z0-9_-]{1,63}$'),
  event_id text NOT NULL,
  event_type text NOT NULL,
  tenant_id uuid REFERENCES cyvx_tenants(id) ON DELETE SET NULL,
  payload_sha256 text NOT NULL CHECK (length(payload_sha256) = 64),
  payload_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'queued', 'processed', 'ignored', 'failed')),
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  error jsonb,
  UNIQUE (provider, event_id)
);

CREATE INDEX IF NOT EXISTS cyvx_webhook_events_status_idx
  ON cyvx_webhook_events (provider, status, received_at DESC);

CREATE TABLE IF NOT EXISTS cyvx_billing_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_customer_id text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES cyvx_tenants(id) ON DELETE CASCADE,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_customer_id),
  UNIQUE (provider, tenant_id)
);

CREATE TABLE IF NOT EXISTS cyvx_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_subscription_id text NOT NULL,
  provider_customer_id text,
  tenant_id uuid NOT NULL REFERENCES cyvx_tenants(id) ON DELETE CASCADE,
  status text NOT NULL,
  plan_key text NOT NULL,
  price_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_subscription_id)
);

CREATE INDEX IF NOT EXISTS cyvx_subscriptions_tenant_idx
  ON cyvx_subscriptions (tenant_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS cyvx_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES cyvx_tenants(id) ON DELETE CASCADE,
  entitlement_key text NOT NULL,
  entitlement_value text,
  active boolean NOT NULL DEFAULT true,
  source text NOT NULL,
  source_reference text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, entitlement_key)
);

CREATE TABLE IF NOT EXISTS cyvx_integration_audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid REFERENCES cyvx_tenants(id) ON DELETE SET NULL,
  actor_id uuid,
  actor_kind text NOT NULL DEFAULT 'system',
  provider text,
  action text NOT NULL,
  target_type text,
  target_id text,
  trace_id text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cyvx_integration_audit_tenant_time_idx
  ON cyvx_integration_audit_events (tenant_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS cyvx_queue_fallback (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  queue_name text NOT NULL,
  message jsonb NOT NULL,
  visible_at timestamptz NOT NULL DEFAULT now(),
  read_count integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  archived_at timestamptz,
  dead_lettered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cyvx_queue_fallback_claim_idx
  ON cyvx_queue_fallback (queue_name, visible_at, id)
  WHERE archived_at IS NULL AND dead_lettered_at IS NULL;

CREATE OR REPLACE FUNCTION cyvx_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cyvx_tenants_updated_at ON cyvx_tenants;
CREATE TRIGGER cyvx_tenants_updated_at BEFORE UPDATE ON cyvx_tenants
FOR EACH ROW EXECUTE FUNCTION cyvx_set_updated_at();
DROP TRIGGER IF EXISTS cyvx_tenant_memberships_updated_at ON cyvx_tenant_memberships;
CREATE TRIGGER cyvx_tenant_memberships_updated_at BEFORE UPDATE ON cyvx_tenant_memberships
FOR EACH ROW EXECUTE FUNCTION cyvx_set_updated_at();
DROP TRIGGER IF EXISTS cyvx_feature_flags_updated_at ON cyvx_feature_flags;
CREATE TRIGGER cyvx_feature_flags_updated_at BEFORE UPDATE ON cyvx_feature_flags
FOR EACH ROW EXECUTE FUNCTION cyvx_set_updated_at();
DROP TRIGGER IF EXISTS cyvx_billing_customers_updated_at ON cyvx_billing_customers;
CREATE TRIGGER cyvx_billing_customers_updated_at BEFORE UPDATE ON cyvx_billing_customers
FOR EACH ROW EXECUTE FUNCTION cyvx_set_updated_at();
DROP TRIGGER IF EXISTS cyvx_subscriptions_updated_at ON cyvx_subscriptions;
CREATE TRIGGER cyvx_subscriptions_updated_at BEFORE UPDATE ON cyvx_subscriptions
FOR EACH ROW EXECUTE FUNCTION cyvx_set_updated_at();
DROP TRIGGER IF EXISTS cyvx_entitlements_updated_at ON cyvx_entitlements;
CREATE TRIGGER cyvx_entitlements_updated_at BEFORE UPDATE ON cyvx_entitlements
FOR EACH ROW EXECUTE FUNCTION cyvx_set_updated_at();

CREATE OR REPLACE FUNCTION cyvx_current_tenant_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  value text;
BEGIN
  value := COALESCE(auth.jwt()->>'tenant_id', auth.jwt()->'app_metadata'->>'tenant_id');
  RETURN NULLIF(value, '')::uuid;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION cyvx_current_role()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  value text;
BEGIN
  value := COALESCE(auth.jwt()->'app_metadata'->>'role', auth.jwt()->>'cyvx_role');
  RETURN COALESCE(NULLIF(value, ''), 'viewer');
EXCEPTION WHEN OTHERS THEN
  RETURN 'viewer';
END;
$$;

CREATE OR REPLACE FUNCTION cyvx_is_aal2()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  RETURN COALESCE(auth.jwt()->>'aal', 'aal1') = 'aal2';
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION cyvx_is_tenant_member(p_tenant_id uuid, p_roles text[] DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM cyvx_tenant_memberships membership
    WHERE membership.tenant_id = p_tenant_id
      AND membership.user_id = auth.uid()
      AND membership.status = 'active'
      AND (p_roles IS NULL OR membership.role = ANY(p_roles))
  );
$$;

ALTER TABLE cyvx_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE cyvx_tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE cyvx_feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE cyvx_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE cyvx_billing_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE cyvx_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cyvx_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE cyvx_integration_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE cyvx_queue_fallback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cyvx_tenants_member_select ON cyvx_tenants;
CREATE POLICY cyvx_tenants_member_select ON cyvx_tenants
FOR SELECT TO authenticated USING (cyvx_is_tenant_member(id));

DROP POLICY IF EXISTS cyvx_memberships_member_select ON cyvx_tenant_memberships;
CREATE POLICY cyvx_memberships_member_select ON cyvx_tenant_memberships
FOR SELECT TO authenticated USING (cyvx_is_tenant_member(tenant_id));

DROP POLICY IF EXISTS cyvx_memberships_admin_insert ON cyvx_tenant_memberships;
CREATE POLICY cyvx_memberships_admin_insert ON cyvx_tenant_memberships
FOR INSERT TO authenticated WITH CHECK (cyvx_is_aal2() AND cyvx_is_tenant_member(tenant_id, ARRAY['owner','admin']));
DROP POLICY IF EXISTS cyvx_memberships_admin_update ON cyvx_tenant_memberships;
CREATE POLICY cyvx_memberships_admin_update ON cyvx_tenant_memberships
FOR UPDATE TO authenticated USING (cyvx_is_aal2() AND cyvx_is_tenant_member(tenant_id, ARRAY['owner','admin']))
WITH CHECK (cyvx_is_aal2() AND cyvx_is_tenant_member(tenant_id, ARRAY['owner','admin']));
DROP POLICY IF EXISTS cyvx_memberships_owner_delete ON cyvx_tenant_memberships;
CREATE POLICY cyvx_memberships_owner_delete ON cyvx_tenant_memberships
FOR DELETE TO authenticated USING (cyvx_is_aal2() AND cyvx_is_tenant_member(tenant_id, ARRAY['owner']));

DROP POLICY IF EXISTS cyvx_flags_member_select ON cyvx_feature_flags;
CREATE POLICY cyvx_flags_member_select ON cyvx_feature_flags
FOR SELECT TO authenticated USING (tenant_id IS NULL OR cyvx_is_tenant_member(tenant_id));
DROP POLICY IF EXISTS cyvx_flags_admin_insert ON cyvx_feature_flags;
CREATE POLICY cyvx_flags_admin_insert ON cyvx_feature_flags
FOR INSERT TO authenticated WITH CHECK (tenant_id IS NOT NULL AND cyvx_is_aal2() AND cyvx_is_tenant_member(tenant_id, ARRAY['owner','admin']));
DROP POLICY IF EXISTS cyvx_flags_admin_update ON cyvx_feature_flags;
CREATE POLICY cyvx_flags_admin_update ON cyvx_feature_flags
FOR UPDATE TO authenticated USING (tenant_id IS NOT NULL AND cyvx_is_aal2() AND cyvx_is_tenant_member(tenant_id, ARRAY['owner','admin']))
WITH CHECK (tenant_id IS NOT NULL AND cyvx_is_aal2() AND cyvx_is_tenant_member(tenant_id, ARRAY['owner','admin']));

DROP POLICY IF EXISTS cyvx_billing_customers_member_select ON cyvx_billing_customers;
CREATE POLICY cyvx_billing_customers_member_select ON cyvx_billing_customers
FOR SELECT TO authenticated USING (cyvx_is_tenant_member(tenant_id));
DROP POLICY IF EXISTS cyvx_subscriptions_member_select ON cyvx_subscriptions;
CREATE POLICY cyvx_subscriptions_member_select ON cyvx_subscriptions
FOR SELECT TO authenticated USING (cyvx_is_tenant_member(tenant_id));
DROP POLICY IF EXISTS cyvx_entitlements_member_select ON cyvx_entitlements;
CREATE POLICY cyvx_entitlements_member_select ON cyvx_entitlements
FOR SELECT TO authenticated USING (cyvx_is_tenant_member(tenant_id));
DROP POLICY IF EXISTS cyvx_integration_audit_member_select ON cyvx_integration_audit_events;
CREATE POLICY cyvx_integration_audit_member_select ON cyvx_integration_audit_events
FOR SELECT TO authenticated USING (tenant_id IS NOT NULL AND cyvx_is_tenant_member(tenant_id, ARRAY['owner','admin','operator']));

CREATE OR REPLACE FUNCTION cyvx_queue_allowed(p_queue_name text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT p_queue_name IN ('cyvx_jobs', 'cyvx_dead_letter');
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgmq') THEN
    BEGIN PERFORM pgmq.create('cyvx_jobs'); EXCEPTION WHEN duplicate_table OR unique_violation THEN NULL; END;
    BEGIN PERFORM pgmq.create('cyvx_dead_letter'); EXCEPTION WHEN duplicate_table OR unique_violation THEN NULL; END;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION cyvx_enqueue_job(p_queue_name text, p_message jsonb, p_delay_seconds integer DEFAULT 0)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $$
DECLARE
  result bigint;
BEGIN
  IF NOT cyvx_queue_allowed(p_queue_name) THEN RAISE EXCEPTION 'queue is not allowed'; END IF;
  IF jsonb_typeof(p_message) <> 'object' THEN RAISE EXCEPTION 'message must be an object'; END IF;
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgmq') THEN
    EXECUTE 'SELECT pgmq.send($1, $2, $3)' INTO result USING p_queue_name, p_message, GREATEST(0, p_delay_seconds);
  ELSE
    INSERT INTO cyvx_queue_fallback(queue_name, message, visible_at)
    VALUES (p_queue_name, p_message, now() + make_interval(secs => GREATEST(0, p_delay_seconds)))
    RETURNING id INTO result;
  END IF;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION cyvx_claim_jobs(p_queue_name text, p_visibility_seconds integer DEFAULT 60, p_limit integer DEFAULT 10)
RETURNS TABLE(job_id bigint, read_count integer, message jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $$
BEGIN
  IF NOT cyvx_queue_allowed(p_queue_name) THEN RAISE EXCEPTION 'queue is not allowed'; END IF;
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgmq') THEN
    RETURN QUERY EXECUTE
      'SELECT msg_id::bigint, read_ct::integer, message::jsonb FROM pgmq.read($1, $2, $3)'
      USING p_queue_name, GREATEST(1, p_visibility_seconds), LEAST(100, GREATEST(1, p_limit));
  ELSE
    RETURN QUERY
    WITH picked AS (
      SELECT id
      FROM cyvx_queue_fallback
      WHERE queue_name = p_queue_name
        AND archived_at IS NULL
        AND dead_lettered_at IS NULL
        AND visible_at <= now()
        AND (locked_until IS NULL OR locked_until <= now())
      ORDER BY id
      FOR UPDATE SKIP LOCKED
      LIMIT LEAST(100, GREATEST(1, p_limit))
    )
    UPDATE cyvx_queue_fallback q
       SET read_count = q.read_count + 1,
           locked_until = now() + make_interval(secs => GREATEST(1, p_visibility_seconds))
      FROM picked
     WHERE q.id = picked.id
    RETURNING q.id, q.read_count, q.message;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION cyvx_ack_job(p_queue_name text, p_job_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $$
DECLARE result boolean;
BEGIN
  IF NOT cyvx_queue_allowed(p_queue_name) THEN RAISE EXCEPTION 'queue is not allowed'; END IF;
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgmq') THEN
    EXECUTE 'SELECT pgmq.archive($1, $2)' INTO result USING p_queue_name, p_job_id;
  ELSE
    UPDATE cyvx_queue_fallback SET archived_at = now() WHERE queue_name = p_queue_name AND id = p_job_id AND archived_at IS NULL;
    result := FOUND;
  END IF;
  RETURN COALESCE(result, false);
END;
$$;

CREATE OR REPLACE FUNCTION cyvx_fail_job(p_queue_name text, p_job_id bigint, p_message jsonb, p_error jsonb, p_terminal boolean DEFAULT false)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $$
DECLARE result boolean := true;
BEGIN
  IF NOT cyvx_queue_allowed(p_queue_name) THEN RAISE EXCEPTION 'queue is not allowed'; END IF;
  IF NOT p_terminal THEN RETURN true; END IF;
  PERFORM cyvx_enqueue_job('cyvx_dead_letter', jsonb_build_object(
    'type', 'dead_letter',
    'source_queue', p_queue_name,
    'source_job_id', p_job_id,
    'message', p_message,
    'error', p_error,
    'failed_at', now()
  ), 0);
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgmq') THEN
    EXECUTE 'SELECT pgmq.archive($1, $2)' INTO result USING p_queue_name, p_job_id;
  ELSE
    UPDATE cyvx_queue_fallback SET dead_lettered_at = now(), archived_at = now()
     WHERE queue_name = p_queue_name AND id = p_job_id;
    result := FOUND;
  END IF;
  RETURN COALESCE(result, false);
END;
$$;

CREATE OR REPLACE FUNCTION cyvx_schedule_integrations()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
DECLARE scheduled boolean := false;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('cyvx-integrations-housekeeping', '*/15 * * * *',
      $job$SELECT cyvx_enqueue_job('cyvx_jobs', jsonb_build_object('type','housekeeping.integrations','payload',jsonb_build_object(),'created_at',now()), 0);$job$);
    PERFORM cron.schedule('cyvx-feature-flags-refresh', '*/5 * * * *',
      $job$SELECT cyvx_enqueue_job('cyvx_jobs', jsonb_build_object('type','feature_flags.refresh','payload',jsonb_build_object(),'created_at',now()), 0);$job$);
    scheduled := true;
  END IF;
  RETURN jsonb_build_object('scheduled', scheduled, 'checked_at', now());
END;
$$;

SELECT cyvx_schedule_integrations();

REVOKE ALL ON FUNCTION cyvx_enqueue_job(text, jsonb, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION cyvx_claim_jobs(text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION cyvx_ack_job(text, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION cyvx_fail_job(text, bigint, jsonb, jsonb, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION cyvx_schedule_integrations() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT ON cyvx_tenants, cyvx_tenant_memberships, cyvx_feature_flags, cyvx_billing_customers, cyvx_subscriptions, cyvx_entitlements, cyvx_integration_audit_events TO authenticated;
    GRANT INSERT, UPDATE, DELETE ON cyvx_tenant_memberships, cyvx_feature_flags TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT ALL ON cyvx_tenants, cyvx_tenant_memberships, cyvx_feature_flags, cyvx_webhook_events, cyvx_billing_customers, cyvx_subscriptions, cyvx_entitlements, cyvx_integration_audit_events, cyvx_queue_fallback TO service_role;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
    GRANT EXECUTE ON FUNCTION cyvx_enqueue_job(text, jsonb, integer), cyvx_claim_jobs(text, integer, integer), cyvx_ack_job(text, bigint), cyvx_fail_job(text, bigint, jsonb, jsonb, boolean), cyvx_schedule_integrations() TO service_role;
  END IF;
END;
$$;

INSERT INTO cyvx_schema_migrations (version, checksum)
VALUES ('002_integrations', 'tenants-rls-pgmq-cron-flags-billing-entitlements-audit-v1')
ON CONFLICT (version) DO NOTHING;

COMMIT;
