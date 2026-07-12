begin;

create or replace function public.cyvx_validate_foundry_grant_binding()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare expected_capability text;
declare requested_cost numeric;
declare matching boolean;
declare record jsonb;
begin
  record := to_jsonb(new);
  if tg_table_name = 'foundry_action_runs' then
    expected_capability := record ->> 'action';
    requested_cost := coalesce(nullif(record ->> 'actual_cost_usd', '')::numeric, 0);
  elsif tg_table_name = 'foundry_deployments' then
    expected_capability := case when record ->> 'environment' = 'production' then 'deploy_production' else 'deploy_staging' end;
    requested_cost := 0;
  elsif tg_table_name = 'foundry_spend_receipts' then
    expected_capability := 'spend_budget';
    requested_cost := coalesce(nullif(record ->> 'amount_usd', '')::numeric, 0);
  else
    raise exception 'unsupported grant-bound table %', tg_table_name;
  end if;

  select exists (
    select 1 from public.governance_capability_grants g
    where g.organization_id = new.organization_id
      and g.id = new.grant_id
      and g.mission_id = new.mission_id
      and g.grantee_id = new.worker_id
      and g.capability = expected_capability
      and g.status in ('active','consumed')
      and g.maximum_cost_usd >= requested_cost
  ) into matching;

  if not matching then
    raise exception 'Foundry action is not bound to a matching governed capability grant' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.cyvx_schema_status()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with required_tables(name) as (
    values
      ('organizations'),('organization_members'),('agents'),('missions'),('mission_assignments'),
      ('mission_events'),('artifacts'),('evidence_records'),('governance_packages'),
      ('governance_reviews'),('governance_capability_grants'),('governance_budget_ledger'),
      ('governance_events'),('foundry_action_runs'),('foundry_deployments'),
      ('foundry_spend_receipts'),('outcomes')
  ), table_checks as (
    select r.name,
      to_regclass('public.' || r.name) is not null as exists,
      coalesce(c.relrowsecurity, false) as rls_enabled,
      coalesce(c.relforcerowsecurity, false) as rls_forced,
      (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = r.name) as policy_count
    from required_tables r
    left join pg_class c on c.oid = to_regclass('public.' || r.name)
  ), required_constraints(name) as (
    values
      ('agents_parent_same_org_fk'),('agents_creation_grant_same_org_fk'),
      ('assignments_mission_same_org_fk'),('assignments_agent_same_org_fk'),
      ('artifacts_mission_same_org_fk'),('evidence_artifact_same_org_fk'),
      ('packages_worker_same_org_fk'),('grants_agent_same_org_fk'),
      ('runs_grant_same_org_fk'),('deployments_grant_same_org_fk'),('spend_grant_same_org_fk')
  ), constraint_checks as (
    select r.name, exists(select 1 from pg_constraint c where c.conname = r.name) as exists
    from required_constraints r
  ), required_triggers(name) as (
    values
      ('organization_members_last_owner'),('agents_creation_grant'),
      ('foundry_runs_grant_binding'),('deployments_grant_binding'),('spend_grant_binding'),
      ('artifacts_append_only'),('evidence_append_only'),('governance_events_append_only')
  ), trigger_checks as (
    select r.name, exists(select 1 from pg_trigger t where t.tgname = r.name and not t.tgisinternal) as exists
    from required_triggers r
  ), migration_state as (
    select coalesce(max(version), 0) as version from public.cyvx_schema_migrations
  ), aggregate_state as (
    select
      (select bool_and(exists and rls_enabled and rls_forced and policy_count > 0) from table_checks) as tables_ready,
      (select bool_and(exists) from constraint_checks) as constraints_ready,
      (select bool_and(exists) from trigger_checks) as triggers_ready,
      exists(select 1 from storage.buckets where id = 'cyvx-artifacts' and not public) as storage_bucket_ready,
      exists(select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'cyvx_artifacts_select')
        and exists(select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'cyvx_artifacts_insert') as storage_policies_ready
  )
  select jsonb_build_object(
    'schema', 'cyvx-production',
    'expected_version', 202607120004,
    'applied_version', migration_state.version,
    'ready', migration_state.version >= 202607120004
      and aggregate_state.tables_ready
      and aggregate_state.constraints_ready
      and aggregate_state.triggers_ready
      and aggregate_state.storage_bucket_ready
      and aggregate_state.storage_policies_ready,
    'tables_ready', aggregate_state.tables_ready,
    'constraints_ready', aggregate_state.constraints_ready,
    'triggers_ready', aggregate_state.triggers_ready,
    'storage_bucket_ready', aggregate_state.storage_bucket_ready,
    'storage_policies_ready', aggregate_state.storage_policies_ready,
    'tables', (select jsonb_agg(to_jsonb(table_checks) order by name) from table_checks),
    'constraints', (select jsonb_agg(to_jsonb(constraint_checks) order by name) from constraint_checks),
    'triggers', (select jsonb_agg(to_jsonb(trigger_checks) order by name) from trigger_checks)
  )
  from migration_state cross join aggregate_state
$$;

revoke all on function public.cyvx_set_updated_at() from public, anon, authenticated;
revoke all on function public.cyvx_reject_mutation() from public, anon, authenticated;
revoke all on function public.cyvx_preserve_organization_id() from public, anon, authenticated;
revoke all on function public.cyvx_protect_last_owner() from public, anon, authenticated;
revoke all on function public.cyvx_validate_agent_creation_grant() from public, anon, authenticated;
revoke all on function public.cyvx_validate_foundry_grant_binding() from public, anon, authenticated;
revoke all on function public.cyvx_current_org_claim() from public;
revoke all on function public.cyvx_current_agent_id() from public;
revoke all on function public.cyvx_current_agent_token_version() from public;
revoke all on function public.cyvx_is_org_member(uuid) from public;
revoke all on function public.cyvx_has_org_role(uuid, text[]) from public;
revoke all on function public.cyvx_is_active_agent(uuid) from public;
revoke all on function public.cyvx_agent_assigned(uuid, text) from public;
grant execute on function public.cyvx_current_org_claim() to authenticated;
grant execute on function public.cyvx_current_agent_id() to authenticated;
grant execute on function public.cyvx_current_agent_token_version() to authenticated;
grant execute on function public.cyvx_is_org_member(uuid) to authenticated;
grant execute on function public.cyvx_has_org_role(uuid, text[]) to authenticated;
grant execute on function public.cyvx_is_active_agent(uuid) to authenticated;
grant execute on function public.cyvx_agent_assigned(uuid, text) to authenticated;
revoke all on function public.cyvx_schema_status() from public;
grant execute on function public.cyvx_schema_status() to anon, authenticated;

insert into public.cyvx_schema_migrations(version, name, checksum)
values (202607120004, 'cyvx_schema_readiness', 'cyvx-schema-readiness-v1')
on conflict (version) do update set name = excluded.name, checksum = excluded.checksum;

commit;
