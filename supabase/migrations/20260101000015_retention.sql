-- ============================================================================
-- Mwhite SafeCircle 0015 — retention and scheduled maintenance
--
-- Expiry is enforced twice: RLS refuses expired rows on read, and these jobs
-- physically delete them. Belt and braces, because "we filtered it out on
-- read" is not a data-retention answer.
-- ============================================================================

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- Hard-delete expired precise location points and dead share grants.
-- service_role only: this is called from the scheduled endpoint, never a user.
-- ---------------------------------------------------------------------------
create or replace function public.purge_expired_location_data()
returns table (
  deleted_locations bigint,
  deleted_shares bigint,
  closed_activities bigint
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_locations bigint := 0;
  v_shares bigint := 0;
  v_activities bigint := 0;
begin
  -- Activities that ran past their expected end with no response are marked
  -- overdue first (the check-in sweep escalates them), then finally closed.
  with closed as (
    update public.activities a
    set status = 'completed', ended_at = now()
    where a.status in ('active', 'overdue')
      and a.expected_end_time < now() - interval '2 hours'
    returning 1
  )
  select count(*) into v_activities from closed;

  with gone as (
    delete from public.activity_locations l
    where l.expires_at <= now()
       or not exists (
         select 1 from public.activities a
         where a.id = l.activity_id and a.status in ('active', 'emergency', 'overdue')
       )
    returning 1
  )
  select count(*) into v_locations from gone;

  with revoked as (
    delete from public.trusted_location_shares s
    where s.expires_at <= now() - interval '7 days'
       or (s.revoked_at is not null and s.revoked_at <= now() - interval '7 days')
    returning 1
  )
  select count(*) into v_shares from revoked;

  perform public.record_audit_event(
    'system.location_purge', 'activity_location', null, null,
    jsonb_build_object(
      'deleted_locations', v_locations,
      'deleted_shares', v_shares,
      'closed_activities', v_activities
    )
  );

  deleted_locations := v_locations;
  deleted_shares := v_shares;
  closed_activities := v_activities;
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- Missed check-in sweep.
--
-- Marks overdue prompts as missed, flips the activity to `overdue`, and opens
-- share grants for contacts whose permission level covers an escalation.
--
-- This notifies TRUSTED CONTACTS. It does not contact emergency services, and
-- no wording anywhere in the product may imply that it does.
-- ---------------------------------------------------------------------------
create or replace function public.sweep_missed_check_ins(p_grace_minutes integer default 5)
returns table (missed_count bigint, escalated_count bigint)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  grace integer := least(greatest(coalesce(p_grace_minutes, 5), 0), 60);
  rec record;
  v_missed bigint := 0;
  v_escalated bigint := 0;
  v_shares integer;
begin
  for rec in
    select c.id, c.activity_id, c.user_id
    from public.check_ins c
    where c.status = 'scheduled'
      and c.due_at < now() - make_interval(mins => grace)
    for update skip locked
  loop
    update public.check_ins set status = 'missed', escalated_at = now() where id = rec.id;
    update public.activities set status = 'overdue'
      where id = rec.activity_id and status = 'active';
    v_missed := v_missed + 1;

    -- Open escalation shares directly (open_trusted_shares is auth.uid()-bound
    -- and this runs without a user session).
    insert into public.trusted_location_shares (
      owner_id, contact_id, activity_id, recipient_user_id, reason, expires_at, token_hash
    )
    select
      rec.user_id, ct.id, rec.activity_id, ct.contact_user_id, 'check_in_missed',
      now() + interval '2 hours',
      case when ct.contact_user_id is null then encode(digest(gen_random_uuid()::text || rec.id::text, 'sha256'), 'hex') else null end
    from public.emergency_contacts ct
    where ct.owner_id = rec.user_id
      and ct.is_active
      and ct.permission_level in ('emergency_only', 'always_when_enabled')
      and (ct.contact_user_id is null or not public.is_blocked_between(rec.user_id, ct.contact_user_id));

    get diagnostics v_shares = row_count;
    if v_shares > 0 then
      v_escalated := v_escalated + 1;
    end if;
  end loop;

  if v_missed > 0 then
    perform public.record_audit_event(
      'system.check_in_sweep', 'check_in', null, null,
      jsonb_build_object('missed', v_missed, 'escalated', v_escalated)
    );
  end if;

  missed_count := v_missed;
  escalated_count := v_escalated;
  return next;
end;
$$;

-- Neither job is reachable from a browser session.
revoke all on function public.purge_expired_location_data() from public, anon, authenticated;
revoke all on function public.sweep_missed_check_ins(integer) from public, anon, authenticated;
grant execute on function public.purge_expired_location_data() to service_role;
grant execute on function public.sweep_missed_check_ins(integer) to service_role;

comment on function public.purge_expired_location_data is
  'service_role only. Physically deletes expired precise points. Run at least every 15 minutes in production.';
comment on function public.sweep_missed_check_ins is
  'service_role only. Escalates missed check-ins to trusted contacts. Never contacts emergency services.';
