begin;

create unique index if not exists artifacts_org_id_uidx on public.artifacts(organization_id, id);
create unique index if not exists evidence_org_id_uidx on public.evidence_records(organization_id, id);
create unique index if not exists packages_org_id_uidx on public.governance_packages(organization_id, id);
create unique index if not exists grants_org_id_uidx on public.governance_capability_grants(organization_id, id);

alter table public.agents add column if not exists creation_grant_id text;
alter table public.agents add column if not exists creation_mission_id text;
create unique index if not exists agents_creation_grant_uidx
  on public.agents(creation_grant_id) where creation_grant_id is not null;

create or replace function public.cyvx_add_constraint(table_name text, constraint_name text, definition text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class r on r.oid = c.conrelid
    join pg_namespace n on n.oid = r.relnamespace
    where n.nspname = 'public'
      and r.relname = table_name
      and c.conname = constraint_name
  ) then
    execute format('alter table public.%I add constraint %I %s', table_name, constraint_name, definition);
  end if;
end;
$$;

select public.cyvx_add_constraint('agents', 'agents_parent_same_org_fk',
  'foreign key (organization_id, parent_agent_id) references public.agents(organization_id, id) on delete restrict');
select public.cyvx_add_constraint('agents', 'agents_creation_mission_same_org_fk',
  'foreign key (organization_id, creation_mission_id) references public.missions(organization_id, id) on delete restrict');
select public.cyvx_add_constraint('agents', 'agents_creation_grant_same_org_fk',
  'foreign key (organization_id, creation_grant_id) references public.governance_capability_grants(organization_id, id) on delete restrict');
select public.cyvx_add_constraint('missions', 'missions_owner_agent_same_org_fk',
  'foreign key (organization_id, owner_agent_id) references public.agents(organization_id, id) on delete restrict');
select public.cyvx_add_constraint('mission_assignments', 'assignments_mission_same_org_fk',
  'foreign key (organization_id, mission_id) references public.missions(organization_id, id) on delete cascade');
select public.cyvx_add_constraint('mission_assignments', 'assignments_agent_same_org_fk',
  'foreign key (organization_id, agent_id) references public.agents(organization_id, id) on delete cascade');
select public.cyvx_add_constraint('mission_events', 'mission_events_mission_same_org_fk',
  'foreign key (organization_id, mission_id) references public.missions(organization_id, id) on delete cascade');
select public.cyvx_add_constraint('mission_events', 'mission_events_agent_same_org_fk',
  'foreign key (organization_id, agent_id) references public.agents(organization_id, id) on delete restrict');
select public.cyvx_add_constraint('artifacts', 'artifacts_mission_same_org_fk',
  'foreign key (organization_id, mission_id) references public.missions(organization_id, id) on delete cascade');
select public.cyvx_add_constraint('artifacts', 'artifacts_agent_same_org_fk',
  'foreign key (organization_id, agent_id) references public.agents(organization_id, id) on delete restrict');
select public.cyvx_add_constraint('evidence_records', 'evidence_mission_same_org_fk',
  'foreign key (organization_id, mission_id) references public.missions(organization_id, id) on delete cascade');
select public.cyvx_add_constraint('evidence_records', 'evidence_agent_same_org_fk',
  'foreign key (organization_id, agent_id) references public.agents(organization_id, id) on delete restrict');
select public.cyvx_add_constraint('evidence_records', 'evidence_artifact_same_org_fk',
  'foreign key (organization_id, artifact_id) references public.artifacts(organization_id, id) on delete restrict');
select public.cyvx_add_constraint('governance_packages', 'packages_mission_same_org_fk',
  'foreign key (organization_id, mission_id) references public.missions(organization_id, id) on delete restrict');
select public.cyvx_add_constraint('governance_packages', 'packages_worker_same_org_fk',
  'foreign key (organization_id, worker_id) references public.agents(organization_id, id) on delete restrict');
select public.cyvx_add_constraint('governance_reviews', 'reviews_package_same_org_fk',
  'foreign key (organization_id, package_id) references public.governance_packages(organization_id, id) on delete cascade');
select public.cyvx_add_constraint('governance_capability_grants', 'grants_package_same_org_fk',
  'foreign key (organization_id, package_id) references public.governance_packages(organization_id, id) on delete cascade');
select public.cyvx_add_constraint('governance_capability_grants', 'grants_mission_same_org_fk',
  'foreign key (organization_id, mission_id) references public.missions(organization_id, id) on delete restrict');
select public.cyvx_add_constraint('governance_capability_grants', 'grants_agent_same_org_fk',
  'foreign key (organization_id, grantee_id) references public.agents(organization_id, id) on delete restrict');
select public.cyvx_add_constraint('governance_budget_ledger', 'budget_package_same_org_fk',
  'foreign key (organization_id, package_id) references public.governance_packages(organization_id, id) on delete restrict');
select public.cyvx_add_constraint('governance_budget_ledger', 'budget_grant_same_org_fk',
  'foreign key (organization_id, grant_id) references public.governance_capability_grants(organization_id, id) on delete restrict');
select public.cyvx_add_constraint('governance_events', 'events_package_same_org_fk',
  'foreign key (organization_id, package_id) references public.governance_packages(organization_id, id) on delete restrict');
select public.cyvx_add_constraint('governance_events', 'events_mission_same_org_fk',
  'foreign key (organization_id, mission_id) references public.missions(organization_id, id) on delete restrict');
select public.cyvx_add_constraint('foundry_action_runs', 'runs_grant_same_org_fk',
  'foreign key (organization_id, grant_id) references public.governance_capability_grants(organization_id, id) on delete restrict');
select public.cyvx_add_constraint('foundry_action_runs', 'runs_package_same_org_fk',
  'foreign key (organization_id, package_id) references public.governance_packages(organization_id, id) on delete restrict');
select public.cyvx_add_constraint('foundry_action_runs', 'runs_mission_same_org_fk',
  'foreign key (organization_id, mission_id) references public.missions(organization_id, id) on delete restrict');
select public.cyvx_add_constraint('foundry_action_runs', 'runs_worker_same_org_fk',
  'foreign key (organization_id, worker_id) references public.agents(organization_id, id) on delete restrict');
select public.cyvx_add_constraint('foundry_deployments', 'deployments_grant_same_org_fk',
  'foreign key (organization_id, grant_id) references public.governance_capability_grants(organization_id, id) on delete restrict');
select public.cyvx_add_constraint('foundry_deployments', 'deployments_mission_same_org_fk',
  'foreign key (organization_id, mission_id) references public.missions(organization_id, id) on delete restrict');
select public.cyvx_add_constraint('foundry_deployments', 'deployments_worker_same_org_fk',
  'foreign key (organization_id, worker_id) references public.agents(organization_id, id) on delete restrict');
select public.cyvx_add_constraint('foundry_spend_receipts', 'spend_grant_same_org_fk',
  'foreign key (organization_id, grant_id) references public.governance_capability_grants(organization_id, id) on delete restrict');
select public.cyvx_add_constraint('foundry_spend_receipts', 'spend_mission_same_org_fk',
  'foreign key (organization_id, mission_id) references public.missions(organization_id, id) on delete restrict');
select public.cyvx_add_constraint('foundry_spend_receipts', 'spend_worker_same_org_fk',
  'foreign key (organization_id, worker_id) references public.agents(organization_id, id) on delete restrict');
select public.cyvx_add_constraint('outcomes', 'outcomes_mission_same_org_fk',
  'foreign key (organization_id, mission_id) references public.missions(organization_id, id) on delete cascade');
select public.cyvx_add_constraint('outcomes', 'outcomes_agent_same_org_fk',
  'foreign key (organization_id, agent_id) references public.agents(organization_id, id) on delete restrict');
select public.cyvx_add_constraint('outcomes', 'outcomes_evidence_same_org_fk',
  'foreign key (organization_id, evidence_id) references public.evidence_records(organization_id, id) on delete restrict');

create or replace function public.cyvx_preserve_organization_id()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'organization_id is immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.cyvx_protect_last_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare removing_owner boolean;
declare remaining integer;
begin
  removing_owner := old.role = 'owner' and old.active and (
    tg_op = 'DELETE' or new.role <> 'owner' or not new.active
  );
  if removing_owner then
    select count(*) into remaining
    from public.organization_members m
    where m.organization_id = old.organization_id
      and m.user_id <> old.user_id
      and m.role = 'owner'
      and m.active;
    if remaining = 0 then
      raise exception 'an organization must retain at least one active owner' using errcode = '23514';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.cyvx_validate_agent_creation_grant()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare matching boolean;
begin
  if new.parent_agent_id is null then
    return new;
  end if;
  if new.creation_grant_id is null or new.creation_mission_id is null then
    raise exception 'child agents require creation_grant_id and creation_mission_id' using errcode = '23514';
  end if;
  select exists (
    select 1 from public.governance_capability_grants g
    where g.organization_id = new.organization_id
      and g.id = new.creation_grant_id
      and g.mission_id = new.creation_mission_id
      and g.grantee_id = new.parent_agent_id
      and g.capability = 'create_agent'
      and g.status in ('active','consumed')
      and g.expires_at > now() - interval '15 minutes'
  ) into matching;
  if not matching then
    raise exception 'child-agent creation grant is missing, expired, or mismatched' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.cyvx_validate_foundry_grant_binding()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare expected_capability text;
declare matching boolean;
begin
  if tg_table_name = 'foundry_action_runs' then
    expected_capability := new.action;
  elsif tg_table_name = 'foundry_deployments' then
    expected_capability := case when new.environment = 'production' then 'deploy_production' else 'deploy_staging' end;
  elsif tg_table_name = 'foundry_spend_receipts' then
    expected_capability := 'spend_budget';
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
      and g.maximum_cost_usd >= coalesce(new.actual_cost_usd, new.amount_usd, 0)
  ) into matching;

  if not matching then
    raise exception 'Foundry action is not bound to a matching governed capability grant' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger organization_members_last_owner
before update or delete on public.organization_members
for each row execute function public.cyvx_protect_last_owner();

create trigger agents_org_immutable before update on public.agents for each row execute function public.cyvx_preserve_organization_id();
create trigger missions_org_immutable before update on public.missions for each row execute function public.cyvx_preserve_organization_id();
create trigger assignments_org_immutable before update on public.mission_assignments for each row execute function public.cyvx_preserve_organization_id();
create trigger principals_org_immutable before update on public.governance_principals for each row execute function public.cyvx_preserve_organization_id();
create trigger constitutions_org_immutable before update on public.governance_constitutions for each row execute function public.cyvx_preserve_organization_id();
create trigger packages_org_immutable before update on public.governance_packages for each row execute function public.cyvx_preserve_organization_id();
create trigger grants_org_immutable before update on public.governance_capability_grants for each row execute function public.cyvx_preserve_organization_id();
create trigger runs_org_immutable before update on public.foundry_action_runs for each row execute function public.cyvx_preserve_organization_id();
create trigger deployments_org_immutable before update on public.foundry_deployments for each row execute function public.cyvx_preserve_organization_id();

create trigger agents_creation_grant
before insert or update of parent_agent_id, creation_grant_id, creation_mission_id on public.agents
for each row execute function public.cyvx_validate_agent_creation_grant();
create trigger foundry_runs_grant_binding
before insert or update of grant_id, mission_id, worker_id, action, actual_cost_usd on public.foundry_action_runs
for each row execute function public.cyvx_validate_foundry_grant_binding();
create trigger deployments_grant_binding
before insert or update of grant_id, mission_id, worker_id, environment on public.foundry_deployments
for each row execute function public.cyvx_validate_foundry_grant_binding();
create trigger spend_grant_binding
before insert or update of grant_id, mission_id, worker_id, amount_usd on public.foundry_spend_receipts
for each row execute function public.cyvx_validate_foundry_grant_binding();

revoke all on function public.cyvx_add_constraint(text, text, text) from public, anon, authenticated;

insert into public.cyvx_schema_migrations(version, name, checksum)
values (202607120003, 'cyvx_tenant_and_grant_invariants', 'cyvx-tenant-grant-invariants-v1')
on conflict (version) do update set name = excluded.name, checksum = excluded.checksum;

commit;
