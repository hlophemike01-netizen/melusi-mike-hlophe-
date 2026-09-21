-- ============================================================================
-- Mwhite SafeCircle 0016 — Web Push
--
-- Until now a missed check-in only surfaced inside the app, so the escalation
-- reached nobody who was not already looking at it. That made the single most
-- safety-critical feature in the product close to useless.
--
-- Two tables:
--   push_subscriptions  the browser endpoints a user has opted in from
--   notification_outbox what needs sending, written by the database, drained
--                       by a server job
--
-- The outbox exists because the two things that raise an alert happen in
-- different places — a missed check-in in a scheduled job with no user
-- session, an emergency in the browser — and both need the same delivery
-- path with retries.
-- ============================================================================

set search_path = public, extensions;

create type public.notification_kind as enum (
  'check_in_missed',
  'emergency_raised',
  'emergency_resolved'
);

-- ---------------------------------------------------------------------------
-- push_subscriptions
--
-- One row per browser a user has enabled alerts on. The keys are the browser's
-- own public encryption material: payloads are sealed to them, so the push
-- service relaying the message cannot read it.
-- ---------------------------------------------------------------------------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,

  -- The push service URL. Unique because re-subscribing in the same browser
  -- returns the same endpoint, and a duplicate would send twice.
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,

  -- Cleared when a push service reports the subscription is gone (404/410).
  is_active boolean not null default true,
  failure_count integer not null default 0,
  last_success_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint push_subscriptions_endpoint_https check (endpoint ~ '^https://'),
  constraint push_subscriptions_keys_present check (
    char_length(p256dh) between 1 and 255 and char_length(auth) between 1 and 255
  )
);

comment on table public.push_subscriptions is
  'Browser push endpoints. Owner-only: nobody can enumerate who has alerts enabled.';

create index push_subscriptions_user_idx on public.push_subscriptions (user_id) where is_active;

create trigger push_subscriptions_set_updated_at
  before update on public.push_subscriptions
  for each row execute function public.tg_set_updated_at();

-- The owner is always derived from the session, never from the request body.
create or replace function public.tg_push_subscriptions_owner()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if auth.uid() is not null then
    new.user_id := auth.uid();
  end if;
  return new;
end;
$$;

create trigger push_subscriptions_owner
  before insert on public.push_subscriptions
  for each row execute function public.tg_push_subscriptions_owner();

-- ---------------------------------------------------------------------------
-- notification_outbox
--
-- `payload` carries ONLY what the notification text needs: who it is about and
-- what happened. Never a coordinate, never a share token. A push payload
-- travels through Google's or Mozilla's servers; it is encrypted, but there is
-- no reason to put a location in it, so the constraint forbids one.
-- ---------------------------------------------------------------------------
create table public.notification_outbox (
  id bigint generated always as identity primary key,
  recipient_user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.notification_kind not null,

  -- Ties an alert back to what raised it, so a resolution can supersede it.
  activity_id uuid references public.activities (id) on delete cascade,
  emergency_event_id uuid references public.emergency_events (id) on delete cascade,

  payload jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  sent_at timestamptz,
  attempts integer not null default 0,
  last_error text,

  constraint notification_outbox_payload_is_object check (jsonb_typeof(payload) = 'object'),
  constraint notification_outbox_payload_size check (pg_column_size(payload) <= 2048),
  -- Same rule as the audit log: no location, no credentials, in a payload that
  -- leaves our infrastructure.
  constraint notification_outbox_no_location check (
    not (payload ?| array['latitude','longitude','location','coordinates','lat','lng','token','share_token'])
  )
);

comment on table public.notification_outbox is
  'Pending alerts. Written by the database, drained by a service-role job. Never contains a location.';

create index notification_outbox_pending_idx on public.notification_outbox (created_at)
  where sent_at is null;
create index notification_outbox_recipient_idx on public.notification_outbox (recipient_user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS
--
-- A user manages their own subscriptions and nothing else. The outbox has no
-- client policy at all: it is written by SECURITY DEFINER functions and read
-- only by the service-role drain job. A recipient learns about an alert
-- through the activity and emergency tables they already have access to.
-- ---------------------------------------------------------------------------
alter table public.push_subscriptions enable row level security;
alter table public.notification_outbox enable row level security;

revoke all on public.push_subscriptions, public.notification_outbox from anon;

-- The outbox is service-role only. RLS with no policy would already return
-- zero rows, but revoking the grant makes it a hard permission error rather
-- than a silent empty result — the difference between "you saw nothing" and
-- "you cannot look".
revoke all on public.notification_outbox from authenticated;

create policy push_subscriptions_all_own on public.push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Queue an alert. SECURITY DEFINER so the check-in sweep (no session) and the
-- emergency flow (a user session) can both write, without either being able to
-- address an alert to an arbitrary person: the recipient must be an active
-- trusted contact of the subject, which is the same relationship that already
-- governs location sharing.
-- ---------------------------------------------------------------------------
create or replace function public.queue_contact_notifications(
  p_subject_id uuid,
  p_kind public.notification_kind,
  p_activity_id uuid default null,
  p_emergency_event_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_name text;
  v_count integer;
begin
  select display_name into v_name from public.profiles where id = p_subject_id;
  if v_name is null then
    return 0;
  end if;

  insert into public.notification_outbox (
    recipient_user_id, kind, activity_id, emergency_event_id, payload
  )
  select
    c.contact_user_id,
    p_kind,
    p_activity_id,
    p_emergency_event_id,
    jsonb_build_object('name', v_name, 'subject', p_subject_id::text)
  from public.emergency_contacts c
  where c.owner_id = p_subject_id
    and c.is_active
    and c.contact_user_id is not null
    -- Blocking cuts alerts the same way it cuts location.
    and not public.is_blocked_between(p_subject_id, c.contact_user_id)
    -- Emergencies reach every contact; a missed check-in only reaches those
    -- whose permission level covers an escalation.
    and (
      p_kind = 'emergency_raised'
      or p_kind = 'emergency_resolved'
      or c.permission_level in ('emergency_only', 'always_when_enabled')
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.queue_contact_notifications(uuid, public.notification_kind, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.queue_contact_notifications(uuid, public.notification_kind, uuid, uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- The emergency flow runs in a user session, so it needs a caller-safe
-- wrapper that can only ever queue alerts about the caller themselves.
-- ---------------------------------------------------------------------------
create or replace function public.notify_my_contacts(
  p_kind public.notification_kind,
  p_emergency_event_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then
    raise exception 'not_authorised';
  end if;
  if p_kind not in ('emergency_raised', 'emergency_resolved') then
    raise exception 'not_authorised';
  end if;
  -- The event must be the caller's own.
  if p_emergency_event_id is not null and not exists (
    select 1 from public.emergency_events e
    where e.id = p_emergency_event_id and e.user_id = actor
  ) then
    raise exception 'not_authorised';
  end if;

  return public.queue_contact_notifications(actor, p_kind, null, p_emergency_event_id);
end;
$$;

revoke all on function public.notify_my_contacts(public.notification_kind, uuid) from public, anon;
grant execute on function public.notify_my_contacts(public.notification_kind, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Hook the missed check-in sweep up to the outbox.
--
-- The signature gains a third column, and PostgreSQL will not let CREATE OR
-- REPLACE change a return type, so the old one is dropped first. Nothing holds
-- a reference to it: only the scheduled endpoint calls it, by name.
-- ---------------------------------------------------------------------------
drop function if exists public.sweep_missed_check_ins(integer);

create function public.sweep_missed_check_ins(p_grace_minutes integer default 5)
returns table (missed_count bigint, escalated_count bigint, queued_count bigint)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  grace integer := least(greatest(coalesce(p_grace_minutes, 5), 0), 60);
  rec record;
  v_missed bigint := 0;
  v_escalated bigint := 0;
  v_queued bigint := 0;
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

    insert into public.trusted_location_shares (
      owner_id, contact_id, activity_id, recipient_user_id, reason, expires_at, token_hash
    )
    select
      rec.user_id, ct.id, rec.activity_id, ct.contact_user_id, 'check_in_missed',
      now() + interval '2 hours',
      case when ct.contact_user_id is null
        then encode(digest(gen_random_uuid()::text || rec.id::text, 'sha256'), 'hex') else null end
    from public.emergency_contacts ct
    where ct.owner_id = rec.user_id
      and ct.is_active
      and ct.permission_level in ('emergency_only', 'always_when_enabled')
      and (ct.contact_user_id is null or not public.is_blocked_between(rec.user_id, ct.contact_user_id));

    get diagnostics v_shares = row_count;
    if v_shares > 0 then
      v_escalated := v_escalated + 1;
    end if;

    v_queued := v_queued + public.queue_contact_notifications(
      rec.user_id, 'check_in_missed', rec.activity_id, null
    );
  end loop;

  if v_missed > 0 then
    perform public.record_audit_event(
      'system.check_in_sweep', 'check_in', null, null,
      jsonb_build_object('missed', v_missed, 'escalated', v_escalated, 'queued', v_queued)
    );
  end if;

  missed_count := v_missed;
  escalated_count := v_escalated;
  queued_count := v_queued;
  return next;
end;
$$;

revoke all on function public.sweep_missed_check_ins(integer) from public, anon, authenticated;
grant execute on function public.sweep_missed_check_ins(integer) to service_role;
