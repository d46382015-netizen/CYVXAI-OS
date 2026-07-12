begin;

create extension if not exists pgcrypto;

create table if not exists public.cyvx_schema_migrations (
  version bigint primary key,
  name text not null,
  checksum text not null,
  applied_at timestamptz not null default now()
);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  name text not null check (char_length(name) between 2 and 160),
  status text not null default 'active' check (status in ('active','suspended','closed')),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','supervisor','boss','operator','viewer')),
  active boolean not null default true,
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index if not exists organization_members_user_active_idx
  on public.organization_members(user_id, active, organization_id);

create table if not exists public.agents (
  id text primary key check (id ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{2,127}$'),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  parent_agent_id text references public.agents(id) on delete set null,
  name text not null check (char_length(name) between 2 and 160),
  agent_role text not null default 'worker',
  status text not null default 'active' check (status in ('candidate','active','paused','retired','quarantined')),
  lineage_depth integer not null default 0 check (lineage_depth between 0 and 32),
  genome jsonb not null default '{}'::jsonb check (jsonb_typeof(genome) = 'object'),
  capabilities jsonb not null default '[]'::jsonb check (jsonb_typeof(capabilities) = 'array'),
  permissions jsonb not null default '{}'::jsonb check (jsonb_typeof(permissions) = 'object'),
  budget jsonb not null default '{}'::jsonb check (jsonb_typeof(budget) = 'object'),
  spec_hash text not null check (spec_hash ~ '^[a-f0-9]{64}$'),
  token_version integer not null default 1 check (token_version > 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);
create index if not exists agents_org_status_idx on public.agents(organization_id, status, created_at desc);
create index if not exists agents_org_parent_idx on public.agents(organization_id, parent_agent_id, created_at desc);

create table if not exists public.missions (
  id text primary key check (id ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{2,127}$'),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 240),
  objective text not null check (char_length(objective) between 2 and 10000),
  state text not null default 'draft' check (state in ('draft','validated','planned','awaiting_approval','approved','queued','running','completed','failed','cancelled','evaluated','learned')),
  risk_tier smallint not null default 1 check (risk_tier between 0 and 3),
  owner_agent_id text references public.agents(id) on delete set null,
  inputs jsonb not null default '{}'::jsonb,
  expected_outputs jsonb not null default '[]'::jsonb,
  acceptance_tests jsonb not null default '[]'::jsonb,
  required_evidence jsonb not null default '[]'::jsonb,
  budget jsonb not null default '{}'::jsonb,
  deadline timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (organization_id, id)
);
create index if not exists missions_org_state_idx on public.missions(organization_id, state, created_at desc);

create table if not exists public.mission_assignments (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  mission_id text not null references public.missions(id) on delete cascade,
  agent_id text not null references public.agents(id) on delete cascade,
  assignment_role text not null default 'worker',
  status text not null default 'active' check (status in ('active','completed','revoked')),
  permissions jsonb not null default '{}'::jsonb,
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, mission_id, agent_id)
);
create index if not exists mission_assignments_agent_idx on public.mission_assignments(organization_id, agent_id, status);

create table if not exists public.mission_events (
  id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  mission_id text not null references public.missions(id) on delete cascade,
  agent_id text references public.agents(id) on delete set null,
  event_type text not null,
  correlation_id text,
  causation_id text,
  payload jsonb not null default '{}'::jsonb,
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists mission_events_org_mission_idx on public.mission_events(organization_id, mission_id, created_at);

create table if not exists public.artifacts (
  id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  mission_id text not null references public.missions(id) on delete cascade,
  agent_id text references public.agents(id) on delete set null,
  kind text not null,
  storage_bucket text not null default 'cyvx-artifacts',
  storage_path text not null,
  content_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, storage_bucket, storage_path)
);
create index if not exists artifacts_org_mission_idx on public.artifacts(organization_id, mission_id, created_at desc);

create table if not exists public.evidence_records (
  id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  mission_id text not null references public.missions(id) on delete cascade,
  agent_id text references public.agents(id) on delete set null,
  artifact_id text references public.artifacts(id) on delete set null,
  evidence_type text not null,
  claim text,
  payload jsonb not null default '{}'::jsonb,
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  previous_hash text check (previous_hash is null or previous_hash ~ '^[a-f0-9]{64}$'),
  record_hash text not null check (record_hash ~ '^[a-f0-9]{64}$'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists evidence_org_mission_idx on public.evidence_records(organization_id, mission_id, created_at);

create table if not exists public.governance_principals (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  governance_role text not null check (governance_role in ('supervisor','boss')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id, governance_role)
);

create table if not exists public.governance_constitutions (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  version integer not null check (version > 0),
  active boolean not null default false,
  policy jsonb not null check (jsonb_typeof(policy) = 'object'),
  policy_hash text not null check (policy_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  primary key (organization_id, version)
);
create unique index if not exists governance_constitution_active_idx
  on public.governance_constitutions(organization_id) where active;

create table if not exists public.governance_controls (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  global_stop boolean not null default false,
  spending_frozen boolean not null default false,
  agent_creation_disabled boolean not null default false,
  external_actions_disabled boolean not null default false,
  reason text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.governance_packages (
  id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  mission_id text not null references public.missions(id) on delete restrict,
  worker_id text not null references public.agents(id) on delete restrict,
  status text not null,
  requested_action text not null,
  risk_tier smallint not null check (risk_tier between 0 and 3),
  artifact_sha256 text not null check (artifact_sha256 ~ '^[a-f0-9]{64}$'),
  evidence_ids jsonb not null default '[]'::jsonb,
  tests jsonb not null default '[]'::jsonb,
  rollback_plan jsonb,
  declared_risks jsonb not null default '[]'::jsonb,
  estimated_cost_usd numeric(14,2) not null default 0 check (estimated_cost_usd >= 0),
  supervisor_review_id text,
  boss_review_id text,
  capability_grant_id text,
  policy_decision jsonb,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists governance_packages_org_status_idx on public.governance_packages(organization_id, status, created_at desc);

create table if not exists public.governance_reviews (
  id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  package_id text not null references public.governance_packages(id) on delete cascade,
  review_type text not null check (review_type in ('supervisor','boss')),
  reviewer_id uuid not null references auth.users(id) on delete restrict,
  decision text not null,
  reason text not null,
  findings jsonb not null default '[]'::jsonb,
  signature text not null,
  signed_payload_hash text not null check (signed_payload_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now()
);
create index if not exists governance_reviews_package_idx on public.governance_reviews(organization_id, package_id, created_at);

create table if not exists public.governance_capability_grants (
  id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  package_id text not null references public.governance_packages(id) on delete cascade,
  mission_id text not null references public.missions(id) on delete restrict,
  grantee_id text not null references public.agents(id) on delete restrict,
  capability text not null,
  status text not null check (status in ('active','consumed','revoked','expired')),
  maximum_cost_usd numeric(14,2) not null default 0 check (maximum_cost_usd >= 0),
  actual_cost_usd numeric(14,2) check (actual_cost_usd is null or actual_cost_usd >= 0),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by text,
  receipt jsonb,
  signature text not null,
  check (expires_at > issued_at)
);
create index if not exists governance_grants_org_status_idx on public.governance_capability_grants(organization_id, status, expires_at);

create table if not exists public.governance_budget_ledger (
  id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  package_id text references public.governance_packages(id) on delete restrict,
  grant_id text references public.governance_capability_grants(id) on delete restrict,
  entry_type text not null check (entry_type in ('reserve','spend','release','credit')),
  amount_usd numeric(14,2) not null check (amount_usd >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);
create index if not exists governance_budget_org_created_idx on public.governance_budget_ledger(organization_id, created_at);

create table if not exists public.governance_events (
  id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sequence bigint not null check (sequence > 0),
  event_type text not null,
  actor text not null,
  package_id text references public.governance_packages(id) on delete set null,
  mission_id text references public.missions(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  previous_hash text check (previous_hash is null or previous_hash ~ '^[a-f0-9]{64}$'),
  record_hash text not null check (record_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  unique (organization_id, sequence)
);

create table if not exists public.foundry_action_runs (
  id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  grant_id text not null unique references public.governance_capability_grants(id) on delete restrict,
  package_id text not null references public.governance_packages(id) on delete restrict,
  mission_id text not null references public.missions(id) on delete restrict,
  worker_id text not null references public.agents(id) on delete restrict,
  action text not null check (action in ('create_agent','deploy_staging','deploy_production','spend_budget')),
  status text not null check (status in ('running','succeeded','failed','reconciliation_required')),
  attempts integer not null default 1 check (attempts > 0),
  input_hash text not null check (input_hash ~ '^[a-f0-9]{64}$'),
  result_hash text check (result_hash is null or result_hash ~ '^[a-f0-9]{64}$'),
  actual_cost_usd numeric(14,2) not null default 0 check (actual_cost_usd >= 0),
  external_reference text,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.foundry_deployments (
  id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  mission_id text not null references public.missions(id) on delete restrict,
  grant_id text not null unique references public.governance_capability_grants(id) on delete restrict,
  worker_id text not null references public.agents(id) on delete restrict,
  environment text not null check (environment in ('staging','production')),
  app_id text not null,
  release_id text not null,
  source_path text not null,
  release_path text not null,
  artifact_sha256 text not null check (artifact_sha256 ~ '^[a-f0-9]{64}$'),
  previous_release_id text,
  status text not null check (status in ('active','rolled_back','failed')),
  manifest jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (organization_id, environment, app_id, release_id)
);
create index if not exists foundry_deployments_current_idx on public.foundry_deployments(organization_id, environment, app_id, status, created_at desc);

create table if not exists public.foundry_spend_receipts (
  id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  mission_id text not null references public.missions(id) on delete restrict,
  grant_id text not null unique references public.governance_capability_grants(id) on delete restrict,
  worker_id text not null references public.agents(id) on delete restrict,
  idempotency_key text not null,
  vendor text not null,
  purpose text not null,
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  amount_usd numeric(14,2) not null check (amount_usd >= 0),
  external_reference text not null,
  provider_status text not null,
  provider_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (organization_id, idempotency_key)
);

create table if not exists public.outcomes (
  id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  mission_id text not null references public.missions(id) on delete cascade,
  agent_id text references public.agents(id) on delete set null,
  outcome_type text not null,
  value_numeric numeric,
  value_text text,
  unit text,
  evidence_id text references public.evidence_records(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  measured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists outcomes_org_mission_idx on public.outcomes(organization_id, mission_id, measured_at desc);

create or replace function public.cyvx_set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.cyvx_reject_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '55000';
end;
$$;

create or replace function public.cyvx_current_org_claim()
returns uuid
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare value text;
begin
  value := nullif(auth.jwt() -> 'app_metadata' ->> 'organization_id', '');
  if value is null then return null; end if;
  return value::uuid;
exception when others then
  return null;
end;
$$;

create or replace function public.cyvx_current_agent_id()
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'agent_id', '')
$$;

create or replace function public.cyvx_current_agent_token_version()
returns integer
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare value text;
begin
  value := nullif(auth.jwt() -> 'app_metadata' ->> 'agent_token_version', '');
  if value is null then return null; end if;
  return value::integer;
exception when others then
  return null;
end;
$$;

create or replace function public.cyvx_is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = target_org
      and m.user_id = auth.uid()
      and m.active
  )
$$;

create or replace function public.cyvx_has_org_role(target_org uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = target_org
      and m.user_id = auth.uid()
      and m.active
      and m.role = any(allowed_roles)
  )
$$;

create or replace function public.cyvx_is_active_agent(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.cyvx_current_org_claim() = target_org
    and exists (
      select 1 from public.agents a
      where a.organization_id = target_org
        and a.id = public.cyvx_current_agent_id()
        and a.status = 'active'
        and a.token_version = public.cyvx_current_agent_token_version()
    )
$$;

create or replace function public.cyvx_agent_assigned(target_org uuid, target_mission text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.cyvx_is_active_agent(target_org)
    and exists (
      select 1 from public.mission_assignments ma
      where ma.organization_id = target_org
        and ma.mission_id = target_mission
        and ma.agent_id = public.cyvx_current_agent_id()
        and ma.status = 'active'
    )
$$;

create or replace function public.cyvx_create_organization(org_name text, org_slug text)
returns public.organizations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare created public.organizations;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  insert into public.organizations(name, slug, created_by)
  values (trim(org_name), lower(trim(org_slug)), auth.uid())
  returning * into created;
  insert into public.organization_members(organization_id, user_id, role, active, invited_by)
  values (created.id, auth.uid(), 'owner', true, auth.uid());
  insert into public.governance_controls(organization_id, updated_by)
  values (created.id, auth.uid());
  return created;
end;
$$;

create or replace function public.cyvx_schema_status()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with required(name) as (
    values
      ('organizations'),('organization_members'),('agents'),('missions'),('mission_assignments'),
      ('mission_events'),('artifacts'),('evidence_records'),('governance_packages'),
      ('governance_reviews'),('governance_capability_grants'),('governance_budget_ledger'),
      ('governance_events'),('foundry_action_runs'),('foundry_deployments'),
      ('foundry_spend_receipts'),('outcomes')
  ), checks as (
    select r.name,
      to_regclass('public.' || r.name) is not null as exists,
      coalesce(c.relrowsecurity, false) as rls_enabled,
      (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = r.name) as policy_count
    from required r
    left join pg_class c on c.oid = to_regclass('public.' || r.name)
  )
  select jsonb_build_object(
    'schema', 'cyvx-production',
    'version', 202607120001,
    'ready', bool_and(exists and rls_enabled and policy_count > 0),
    'tables', jsonb_agg(jsonb_build_object('name', name, 'exists', exists, 'rls_enabled', rls_enabled, 'policy_count', policy_count) order by name)
  )
  from checks
$$;

revoke all on function public.cyvx_create_organization(text, text) from public;
grant execute on function public.cyvx_create_organization(text, text) to authenticated;
revoke all on function public.cyvx_schema_status() from public;
grant execute on function public.cyvx_schema_status() to anon, authenticated;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'organizations','organization_members','agents','missions','mission_assignments','mission_events',
    'artifacts','evidence_records','governance_principals','governance_constitutions','governance_controls',
    'governance_packages','governance_reviews','governance_capability_grants','governance_budget_ledger',
    'governance_events','foundry_action_runs','foundry_deployments','foundry_spend_receipts','outcomes'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
  end loop;
end $$;

create policy organizations_select on public.organizations for select to authenticated
  using (public.cyvx_is_org_member(id));
create policy organizations_update on public.organizations for update to authenticated
  using (public.cyvx_has_org_role(id, array['owner','admin']))
  with check (public.cyvx_has_org_role(id, array['owner','admin']));

create policy organization_members_select on public.organization_members for select to authenticated
  using (public.cyvx_is_org_member(organization_id));
create policy organization_members_insert on public.organization_members for insert to authenticated
  with check (public.cyvx_has_org_role(organization_id, array['owner','admin']));
create policy organization_members_update on public.organization_members for update to authenticated
  using (public.cyvx_has_org_role(organization_id, array['owner','admin']))
  with check (public.cyvx_has_org_role(organization_id, array['owner','admin']));
create policy organization_members_delete on public.organization_members for delete to authenticated
  using (public.cyvx_has_org_role(organization_id, array['owner']));

create policy agents_select on public.agents for select to authenticated
  using (public.cyvx_is_org_member(organization_id) or (public.cyvx_is_active_agent(organization_id) and id = public.cyvx_current_agent_id()));
create policy agents_insert on public.agents for insert to authenticated
  with check (public.cyvx_has_org_role(organization_id, array['owner','admin','operator']));
create policy agents_update on public.agents for update to authenticated
  using (public.cyvx_has_org_role(organization_id, array['owner','admin','operator']))
  with check (public.cyvx_has_org_role(organization_id, array['owner','admin','operator']));

create policy missions_select on public.missions for select to authenticated
  using (public.cyvx_is_org_member(organization_id) or public.cyvx_agent_assigned(organization_id, id));
create policy missions_insert on public.missions for insert to authenticated
  with check (public.cyvx_has_org_role(organization_id, array['owner','admin','operator']));
create policy missions_update on public.missions for update to authenticated
  using (public.cyvx_has_org_role(organization_id, array['owner','admin','operator']))
  with check (public.cyvx_has_org_role(organization_id, array['owner','admin','operator']));

create policy assignments_select on public.mission_assignments for select to authenticated
  using (public.cyvx_is_org_member(organization_id) or (public.cyvx_is_active_agent(organization_id) and agent_id = public.cyvx_current_agent_id()));
create policy assignments_insert on public.mission_assignments for insert to authenticated
  with check (public.cyvx_has_org_role(organization_id, array['owner','admin','operator']));
create policy assignments_update on public.mission_assignments for update to authenticated
  using (public.cyvx_has_org_role(organization_id, array['owner','admin','operator']))
  with check (public.cyvx_has_org_role(organization_id, array['owner','admin','operator']));
create policy assignments_delete on public.mission_assignments for delete to authenticated
  using (public.cyvx_has_org_role(organization_id, array['owner','admin']));

create policy mission_events_select on public.mission_events for select to authenticated
  using (public.cyvx_is_org_member(organization_id) or public.cyvx_agent_assigned(organization_id, mission_id));
create policy mission_events_insert on public.mission_events for insert to authenticated
  with check (
    public.cyvx_has_org_role(organization_id, array['owner','admin','operator'])
    or (public.cyvx_agent_assigned(organization_id, mission_id) and agent_id = public.cyvx_current_agent_id())
  );

create policy artifacts_select on public.artifacts for select to authenticated
  using (public.cyvx_is_org_member(organization_id) or public.cyvx_agent_assigned(organization_id, mission_id));
create policy artifacts_insert on public.artifacts for insert to authenticated
  with check (
    public.cyvx_has_org_role(organization_id, array['owner','admin','operator'])
    or (public.cyvx_agent_assigned(organization_id, mission_id) and agent_id = public.cyvx_current_agent_id())
  );

create policy evidence_select on public.evidence_records for select to authenticated
  using (public.cyvx_is_org_member(organization_id) or public.cyvx_agent_assigned(organization_id, mission_id));
create policy evidence_insert on public.evidence_records for insert to authenticated
  with check (
    public.cyvx_has_org_role(organization_id, array['owner','admin','operator','supervisor','boss'])
    or (public.cyvx_agent_assigned(organization_id, mission_id) and agent_id = public.cyvx_current_agent_id())
  );

create policy governance_principals_select on public.governance_principals for select to authenticated
  using (public.cyvx_has_org_role(organization_id, array['owner','admin','supervisor','boss']));
create policy governance_principals_manage on public.governance_principals for all to authenticated
  using (public.cyvx_has_org_role(organization_id, array['owner','admin']))
  with check (public.cyvx_has_org_role(organization_id, array['owner','admin']));

create policy constitutions_select on public.governance_constitutions for select to authenticated
  using (public.cyvx_is_org_member(organization_id));
create policy constitutions_insert on public.governance_constitutions for insert to authenticated
  with check (public.cyvx_has_org_role(organization_id, array['owner','admin']));
create policy constitutions_update on public.governance_constitutions for update to authenticated
  using (public.cyvx_has_org_role(organization_id, array['owner','admin']))
  with check (public.cyvx_has_org_role(organization_id, array['owner','admin']));

create policy controls_select on public.governance_controls for select to authenticated
  using (public.cyvx_is_org_member(organization_id));
create policy controls_update on public.governance_controls for update to authenticated
  using (public.cyvx_has_org_role(organization_id, array['owner','admin','boss']))
  with check (public.cyvx_has_org_role(organization_id, array['owner','admin','boss']));

create policy packages_select on public.governance_packages for select to authenticated
  using (public.cyvx_has_org_role(organization_id, array['owner','admin','supervisor','boss','operator']) or (public.cyvx_is_active_agent(organization_id) and worker_id = public.cyvx_current_agent_id()));
create policy reviews_select on public.governance_reviews for select to authenticated
  using (public.cyvx_has_org_role(organization_id, array['owner','admin','supervisor','boss']));
create policy grants_select on public.governance_capability_grants for select to authenticated
  using (public.cyvx_has_org_role(organization_id, array['owner','admin','supervisor','boss','operator']) or (public.cyvx_is_active_agent(organization_id) and grantee_id = public.cyvx_current_agent_id()));
create policy budget_select on public.governance_budget_ledger for select to authenticated
  using (public.cyvx_has_org_role(organization_id, array['owner','admin','boss','operator']));
create policy governance_events_select on public.governance_events for select to authenticated
  using (public.cyvx_has_org_role(organization_id, array['owner','admin','supervisor','boss','operator','viewer']));

create policy foundry_runs_select on public.foundry_action_runs for select to authenticated
  using (public.cyvx_has_org_role(organization_id, array['owner','admin','supervisor','boss','operator']) or (public.cyvx_is_active_agent(organization_id) and worker_id = public.cyvx_current_agent_id()));
create policy deployments_select on public.foundry_deployments for select to authenticated
  using (public.cyvx_has_org_role(organization_id, array['owner','admin','supervisor','boss','operator']) or (public.cyvx_is_active_agent(organization_id) and worker_id = public.cyvx_current_agent_id()));
create policy spend_select on public.foundry_spend_receipts for select to authenticated
  using (public.cyvx_has_org_role(organization_id, array['owner','admin','boss','operator']) or (public.cyvx_is_active_agent(organization_id) and worker_id = public.cyvx_current_agent_id()));

create policy outcomes_select on public.outcomes for select to authenticated
  using (public.cyvx_is_org_member(organization_id) or public.cyvx_agent_assigned(organization_id, mission_id));
create policy outcomes_insert on public.outcomes for insert to authenticated
  with check (
    public.cyvx_has_org_role(organization_id, array['owner','admin','operator'])
    or (public.cyvx_agent_assigned(organization_id, mission_id) and agent_id = public.cyvx_current_agent_id())
  );

create trigger organizations_updated_at before update on public.organizations for each row execute function public.cyvx_set_updated_at();
create trigger organization_members_updated_at before update on public.organization_members for each row execute function public.cyvx_set_updated_at();
create trigger agents_updated_at before update on public.agents for each row execute function public.cyvx_set_updated_at();
create trigger missions_updated_at before update on public.missions for each row execute function public.cyvx_set_updated_at();
create trigger assignments_updated_at before update on public.mission_assignments for each row execute function public.cyvx_set_updated_at();
create trigger principals_updated_at before update on public.governance_principals for each row execute function public.cyvx_set_updated_at();
create trigger packages_updated_at before update on public.governance_packages for each row execute function public.cyvx_set_updated_at();
create trigger foundry_runs_updated_at before update on public.foundry_action_runs for each row execute function public.cyvx_set_updated_at();

create trigger mission_events_append_only before update or delete on public.mission_events for each row execute function public.cyvx_reject_mutation();
create trigger artifacts_append_only before update or delete on public.artifacts for each row execute function public.cyvx_reject_mutation();
create trigger evidence_append_only before update or delete on public.evidence_records for each row execute function public.cyvx_reject_mutation();
create trigger reviews_append_only before update or delete on public.governance_reviews for each row execute function public.cyvx_reject_mutation();
create trigger budget_append_only before update or delete on public.governance_budget_ledger for each row execute function public.cyvx_reject_mutation();
create trigger governance_events_append_only before update or delete on public.governance_events for each row execute function public.cyvx_reject_mutation();
create trigger spend_receipts_append_only before update or delete on public.foundry_spend_receipts for each row execute function public.cyvx_reject_mutation();
create trigger outcomes_append_only before update or delete on public.outcomes for each row execute function public.cyvx_reject_mutation();

revoke all on public.cyvx_schema_migrations, public.organizations, public.organization_members,
  public.agents, public.missions, public.mission_assignments, public.mission_events,
  public.artifacts, public.evidence_records, public.governance_principals,
  public.governance_constitutions, public.governance_controls, public.governance_packages,
  public.governance_reviews, public.governance_capability_grants, public.governance_budget_ledger,
  public.governance_events, public.foundry_action_runs, public.foundry_deployments,
  public.foundry_spend_receipts, public.outcomes from anon, authenticated;
grant select on public.organizations, public.organization_members, public.agents, public.missions,
  public.mission_assignments, public.mission_events, public.artifacts, public.evidence_records,
  public.governance_principals, public.governance_constitutions, public.governance_controls,
  public.governance_packages, public.governance_reviews, public.governance_capability_grants,
  public.governance_budget_ledger, public.governance_events, public.foundry_action_runs,
  public.foundry_deployments, public.foundry_spend_receipts, public.outcomes to authenticated;
grant insert, update on public.organizations to authenticated;
grant insert, update, delete on public.organization_members to authenticated;
grant insert, update on public.agents, public.missions, public.mission_assignments to authenticated;
grant delete on public.mission_assignments to authenticated;
grant insert on public.mission_events, public.artifacts, public.evidence_records, public.outcomes to authenticated;
grant insert, update, delete on public.governance_principals to authenticated;
grant insert, update on public.governance_constitutions, public.governance_controls to authenticated;

insert into public.cyvx_schema_migrations(version, name, checksum)
values (202607120001, 'cyvx_production_schema', 'cyvx-production-schema-v1')
on conflict (version) do update set name = excluded.name, checksum = excluded.checksum;

commit;
