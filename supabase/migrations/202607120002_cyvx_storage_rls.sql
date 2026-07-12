begin;

create or replace function public.cyvx_storage_org_id(object_name text)
returns uuid
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare value text;
begin
  value := split_part(object_name, '/', 1);
  if value is null or value = '' then return null; end if;
  return value::uuid;
exception when others then
  return null;
end;
$$;

create or replace function public.cyvx_storage_mission_id(object_name text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select nullif(split_part(object_name, '/', 2), '')
$$;

insert into storage.buckets(id, name, public, file_size_limit)
values ('cyvx-artifacts', 'cyvx-artifacts', false, 52428800)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit;

drop policy if exists cyvx_artifacts_select on storage.objects;
create policy cyvx_artifacts_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'cyvx-artifacts'
  and (
    public.cyvx_is_org_member(public.cyvx_storage_org_id(name))
    or public.cyvx_agent_assigned(
      public.cyvx_storage_org_id(name),
      public.cyvx_storage_mission_id(name)
    )
  )
);

drop policy if exists cyvx_artifacts_insert on storage.objects;
create policy cyvx_artifacts_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'cyvx-artifacts'
  and (
    public.cyvx_has_org_role(
      public.cyvx_storage_org_id(name),
      array['owner','admin','operator']
    )
    or public.cyvx_agent_assigned(
      public.cyvx_storage_org_id(name),
      public.cyvx_storage_mission_id(name)
    )
  )
);

-- No authenticated UPDATE or DELETE policy exists. Artifact bytes are immutable;
-- retention and legal deletion require a governed server-side maintenance action.

insert into public.cyvx_schema_migrations(version, name, checksum)
values (202607120002, 'cyvx_artifact_storage_rls', 'cyvx-artifact-storage-rls-v1')
on conflict (version) do update set name = excluded.name, checksum = excluded.checksum;

commit;
