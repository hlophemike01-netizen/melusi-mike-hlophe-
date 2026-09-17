-- ============================================================================
-- SafeCircle 0014 — administrative RPCs
--
-- Administrators get COUNTS and MODERATION CONTROLS. They do not get a
-- location browser. Nothing in this file returns a coordinate, and every
-- state-changing function writes an audit entry before it returns.
-- ============================================================================

set search_path = public, extensions;

create or replace function public.admin_dashboard_metrics()
returns table (
  total_users bigint,
  active_users bigint,
  suspended_users bigint,
  active_activities bigint,
  total_groups bigint,
  active_groups bigint,
  open_reports bigint,
  total_reports bigint,
  active_emergencies bigint,
  emergencies_last_7d bigint
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if not public.is_moderator_or_admin(auth.uid()) then
    raise exception 'not_authorised';
  end if;

  return query
  select
    (select count(*) from public.profiles),
    (select count(*) from public.profiles where account_status = 'active'),
    (select count(*) from public.profiles where account_status = 'suspended'),
    (select count(*) from public.activities where status in ('active', 'emergency', 'overdue')),
    (select count(*) from public.groups),
    (select count(*) from public.groups where status = 'active'),
    (select count(*) from public.reports where status in ('open', 'under_review')),
    (select count(*) from public.reports),
    (select count(*) from public.emergency_events where status = 'active'),
    (select count(*) from public.emergency_events where triggered_at > now() - interval '7 days');
end;
$$;

-- ---------------------------------------------------------------------------
-- Emergency oversight WITHOUT coordinates.
--
-- An administrator needs to know that an emergency is open and unresolved so
-- the team can follow up. They do not need to know where the person is, and
-- giving them that would rebuild the surveillance system this product refuses
-- to be. The columns below are the complete, deliberate list.
-- ---------------------------------------------------------------------------
create or replace function public.admin_emergency_overview(p_limit integer default 50)
returns table (
  id uuid,
  user_id uuid,
  display_name text,
  status public.emergency_status,
  location_available boolean,
  contacts_notified_count integer,
  triggered_at timestamptz,
  resolved_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if not public.is_moderator_or_admin(auth.uid()) then
    raise exception 'not_authorised';
  end if;

  return query
  select e.id, e.user_id, p.display_name, e.status,
         e.location_available, e.contacts_notified_count,
         e.triggered_at, e.resolved_at
  from public.emergency_events e
  join public.profiles p on p.id = e.user_id
  order by (e.status = 'active') desc, e.triggered_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

-- ---------------------------------------------------------------------------
-- Moderation actions. Each one audits itself.
-- ---------------------------------------------------------------------------
create or replace function public.admin_suspend_user(
  p_user_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  actor uuid := auth.uid();
begin
  if not public.is_admin(actor) then
    raise exception 'not_authorised';
  end if;
  if p_user_id = actor then
    raise exception 'cannot_suspend_self';
  end if;
  if p_reason is null or char_length(trim(p_reason)) < 5 then
    raise exception 'reason_required';
  end if;

  update public.profiles
  set account_status = 'suspended',
      suspended_at = now(),
      suspended_reason = left(p_reason, 500)
  where id = p_user_id;

  if not found then
    raise exception 'user_not_found';
  end if;

  -- A suspended account's live sessions stop immediately.
  update public.activities
  set status = 'cancelled', ended_at = now()
  where user_id = p_user_id and status in ('active', 'overdue');

  update public.trusted_location_shares
  set revoked_at = now()
  where owner_id = p_user_id and revoked_at is null;

  delete from public.activity_locations where user_id = p_user_id;

  perform public.record_audit_event(
    'admin.user_suspended', 'profile', p_user_id::text, p_user_id,
    jsonb_build_object('reason_length', char_length(p_reason))
  );
end;
$$;

create or replace function public.admin_restore_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'not_authorised';
  end if;

  update public.profiles
  set account_status = 'active', suspended_at = null, suspended_reason = null
  where id = p_user_id;

  if not found then
    raise exception 'user_not_found';
  end if;

  perform public.record_audit_event('admin.user_restored', 'profile', p_user_id::text, p_user_id);
end;
$$;

create or replace function public.admin_review_report(
  p_report_id uuid,
  p_status public.report_status,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  actor uuid := auth.uid();
  subject uuid;
begin
  if not public.is_moderator_or_admin(actor) then
    raise exception 'not_authorised';
  end if;
  if p_status not in ('under_review', 'actioned', 'dismissed') then
    raise exception 'invalid_status';
  end if;

  update public.reports
  set status = p_status,
      reviewed_by = actor,
      reviewed_at = now(),
      resolution_note = left(coalesce(p_note, resolution_note), 2000)
  where id = p_report_id
  returning reported_user_id into subject;

  if not found then
    raise exception 'report_not_found';
  end if;

  perform public.record_audit_event(
    'admin.report_reviewed', 'report', p_report_id::text, subject,
    jsonb_build_object('new_status', p_status)
  );
end;
$$;

create or replace function public.admin_set_group_status(
  p_group_id uuid,
  p_status public.group_status,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if not public.is_moderator_or_admin(auth.uid()) then
    raise exception 'not_authorised';
  end if;

  update public.groups set status = p_status where id = p_group_id;
  if not found then
    raise exception 'group_not_found';
  end if;

  perform public.record_audit_event(
    'admin.group_status_changed', 'group', p_group_id::text, null,
    jsonb_build_object('new_status', p_status, 'has_reason', p_reason is not null)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Report queue with reporter/subject display names (no contact details).
-- ---------------------------------------------------------------------------
create or replace function public.admin_report_queue(
  p_status public.report_status default null,
  p_limit integer default 50
)
returns table (
  id uuid,
  category public.report_category,
  subject_type public.report_subject_type,
  status public.report_status,
  description text,
  reporter_name text,
  reported_name text,
  reported_user_id uuid,
  reported_group_id uuid,
  created_at timestamptz,
  reviewed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if not public.is_moderator_or_admin(auth.uid()) then
    raise exception 'not_authorised';
  end if;

  return query
  select r.id, r.category, r.subject_type, r.status, r.description,
         rp.display_name, tp.display_name, r.reported_user_id, r.reported_group_id,
         r.created_at, r.reviewed_at
  from public.reports r
  join public.profiles rp on rp.id = r.reporter_id
  left join public.profiles tp on tp.id = r.reported_user_id
  where (p_status is null or r.status = p_status)
  order by (r.status in ('open', 'under_review')) desc, r.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

revoke all on function public.admin_dashboard_metrics() from public, anon;
revoke all on function public.admin_emergency_overview(integer) from public, anon;
revoke all on function public.admin_suspend_user(uuid, text) from public, anon;
revoke all on function public.admin_restore_user(uuid) from public, anon;
revoke all on function public.admin_review_report(uuid, public.report_status, text) from public, anon;
revoke all on function public.admin_set_group_status(uuid, public.group_status, text) from public, anon;
revoke all on function public.admin_report_queue(public.report_status, integer) from public, anon;

grant execute on function public.admin_dashboard_metrics() to authenticated;
grant execute on function public.admin_emergency_overview(integer) to authenticated;
grant execute on function public.admin_suspend_user(uuid, text) to authenticated;
grant execute on function public.admin_restore_user(uuid) to authenticated;
grant execute on function public.admin_review_report(uuid, public.report_status, text) to authenticated;
grant execute on function public.admin_set_group_status(uuid, public.group_status, text) to authenticated;
grant execute on function public.admin_report_queue(public.report_status, integer) to authenticated;
