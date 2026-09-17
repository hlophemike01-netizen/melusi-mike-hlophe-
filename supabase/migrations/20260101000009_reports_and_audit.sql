-- ============================================================================
-- Mwhite SafeCircle 0009 — reports and audit log
-- ============================================================================

-- Resolve PostGIS/pgcrypto wherever they are installed for the duration of
-- this migration script.
set search_path = public, extensions;

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,

  subject_type public.report_subject_type not null default 'user',
  reported_user_id uuid references public.profiles (id) on delete cascade,
  reported_group_id uuid references public.groups (id) on delete cascade,
  reported_activity_id uuid references public.activities (id) on delete set null,

  category public.report_category not null,
  description text not null,
  status public.report_status not null default 'open',

  -- Moderation fields. Writable only by moderators/admins (RLS + trigger).
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  resolution_note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint reports_description_length check (char_length(description) between 10 and 2000),
  constraint reports_resolution_note_length
    check (resolution_note is null or char_length(resolution_note) <= 2000),
  constraint reports_no_self_report check (reported_user_id is null or reported_user_id <> reporter_id),
  constraint reports_subject_matches_type check (
    (subject_type = 'user' and reported_user_id is not null)
    or (subject_type = 'group' and reported_group_id is not null)
    or (subject_type = 'activity' and reported_activity_id is not null)
  )
);

comment on table public.reports is
  'Abuse reports. A reporter sees only their own reports; the reported party is never told who reported them.';

create index reports_status_idx on public.reports (status, created_at desc);
create index reports_reporter_idx on public.reports (reporter_id, created_at desc);
create index reports_reported_user_idx on public.reports (reported_user_id) where reported_user_id is not null;
create index reports_reported_group_idx on public.reports (reported_group_id) where reported_group_id is not null;
create index reports_open_idx on public.reports (created_at desc) where status in ('open', 'under_review');

create trigger reports_set_updated_at
  before update on public.reports
  for each row execute function public.tg_set_updated_at();

-- Rate limit: a reporter may not file more than 10 reports in an hour, and not
-- more than one open report against the same subject.
create or replace function public.tg_reports_guard()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  recent_count integer;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.reporter_id := auth.uid();
      -- Moderation columns are not client-writable.
      new.status := 'open';
      new.reviewed_by := null;
      new.reviewed_at := null;
      new.resolution_note := null;
    end if;

    select count(*) into recent_count
    from public.reports r
    where r.reporter_id = new.reporter_id
      and r.created_at > now() - interval '1 hour';

    if recent_count >= 10 then
      raise exception 'report_rate_limit_exceeded'
        using hint = 'Too many reports submitted in a short period. Please try again later.';
    end if;

    if exists (
      select 1 from public.reports r
      where r.reporter_id = new.reporter_id
        and r.status in ('open', 'under_review')
        and r.subject_type = new.subject_type
        and r.reported_user_id is not distinct from new.reported_user_id
        and r.reported_group_id is not distinct from new.reported_group_id
    ) then
      raise exception 'duplicate_open_report'
        using hint = 'You already have an open report about this. Our team is reviewing it.';
    end if;
  else
    -- Only moderators may change moderation state.
    if auth.uid() is not null and not public.is_moderator_or_admin(auth.uid()) then
      new.status := old.status;
      new.reviewed_by := old.reviewed_by;
      new.reviewed_at := old.reviewed_at;
      new.resolution_note := old.resolution_note;
      new.reporter_id := old.reporter_id;
    elsif new.status <> old.status then
      new.reviewed_by := coalesce(new.reviewed_by, auth.uid());
      new.reviewed_at := now();
    end if;
  end if;

  return new;
end;
$$;

create trigger reports_guard
  before insert or update on public.reports
  for each row execute function public.tg_reports_guard();

-- ---------------------------------------------------------------------------
-- Audit log
--
-- Append-only. No UPDATE or DELETE policy exists for anyone, including admins.
-- `metadata` must never carry coordinates, tokens, passwords or full contact
-- details — see the check constraint and docs/SECURITY.md.
-- ---------------------------------------------------------------------------

create table public.audit_logs (
  id bigint generated always as identity primary key,

  -- Nullable: some events (a scheduled purge) have no human actor.
  actor_id uuid references public.profiles (id) on delete set null,
  actor_role public.app_role,

  action text not null,
  entity_type text not null,
  entity_id text,

  -- Who/what the action was performed against, when different from the actor.
  target_user_id uuid references public.profiles (id) on delete set null,

  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),

  constraint audit_logs_action_format check (action ~ '^[a-z][a-z0-9_.]{2,63}$'),
  constraint audit_logs_entity_type_format check (entity_type ~ '^[a-z][a-z0-9_]{2,63}$'),
  constraint audit_logs_metadata_is_object check (jsonb_typeof(metadata) = 'object'),
  constraint audit_logs_metadata_size check (pg_column_size(metadata) <= 8192),
  -- Belt and braces against accidentally logging sensitive values.
  constraint audit_logs_metadata_no_secrets check (
    not (metadata ?| array['password', 'token', 'access_token', 'refresh_token',
                           'service_role_key', 'latitude', 'longitude', 'location',
                           'coordinates', 'email', 'phone'])
  )
);

comment on table public.audit_logs is
  'Append-only privileged-action log. Never store coordinates, contact details or credentials in metadata.';

create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);
create index audit_logs_action_idx on public.audit_logs (action, created_at desc);
create index audit_logs_target_idx on public.audit_logs (target_user_id, created_at desc)
  where target_user_id is not null;
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);

create or replace function public.tg_audit_logs_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_logs_are_append_only';
end;
$$;

create trigger audit_logs_no_update
  before update or delete on public.audit_logs
  for each row execute function public.tg_audit_logs_append_only();

-- ---------------------------------------------------------------------------
-- The only sanctioned way to write an audit entry. SECURITY DEFINER so that
-- the actor cannot forge `actor_id` — it is taken from the session, not the
-- argument list.
-- ---------------------------------------------------------------------------
create or replace function public.record_audit_event(
  p_action text,
  p_entity_type text,
  p_entity_id text default null,
  p_target_user_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role public.app_role;
begin
  select p.role into v_role from public.profiles p where p.id = v_actor;

  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, target_user_id, metadata)
  values (v_actor, v_role, p_action, p_entity_type, p_entity_id, p_target_user_id, coalesce(p_metadata, '{}'::jsonb));
end;
$$;

revoke all on function public.record_audit_event(text, text, text, uuid, jsonb) from public;
grant execute on function public.record_audit_event(text, text, text, uuid, jsonb) to authenticated;
