-- ============================================================================
-- Mwhite SafeCircle 0008 — check-ins and emergency events
-- ============================================================================

-- Resolve PostGIS/pgcrypto wherever they are installed for the duration of
-- this migration script.
set search_path = public, extensions;

create table public.check_ins (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,

  interval_minutes integer not null,
  due_at timestamptz not null,
  responded_at timestamptz,
  status public.check_in_status not null default 'scheduled',

  -- Set once trusted contacts have been notified about a missed check-in, so
  -- the escalation cannot fire twice for the same prompt.
  escalated_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint check_ins_interval_range check (interval_minutes between 1 and 720)
);

comment on table public.check_ins is
  'One row per scheduled "Are you safe?" prompt. A missed prompt escalates to trusted contacts — never to emergency services.';

create index check_ins_activity_idx on public.check_ins (activity_id, due_at desc);
create index check_ins_user_idx on public.check_ins (user_id, status);
-- Drives the missed-check-in sweep.
create index check_ins_due_idx on public.check_ins (due_at) where status = 'scheduled';

create trigger check_ins_set_updated_at
  before update on public.check_ins
  for each row execute function public.tg_set_updated_at();

create or replace function public.tg_check_ins_derive_user()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  select a.user_id into new.user_id from public.activities a where a.id = new.activity_id;
  if new.user_id is null then
    raise exception 'activity_not_found';
  end if;
  if tg_op = 'INSERT' then
    new.due_at := coalesce(new.due_at, now() + make_interval(mins => new.interval_minutes));
  end if;
  if new.status in ('responded_safe', 'responded_help') and new.responded_at is null then
    new.responded_at := now();
  end if;
  return new;
end;
$$;

create trigger check_ins_derive_user
  before insert or update on public.check_ins
  for each row execute function public.tg_check_ins_derive_user();

-- Only one prompt may be outstanding per activity at a time.
create unique index check_ins_one_scheduled_per_activity
  on public.check_ins (activity_id)
  where status = 'scheduled';

-- ---------------------------------------------------------------------------
-- Emergency events
-- ---------------------------------------------------------------------------

create table public.emergency_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  activity_id uuid references public.activities (id) on delete set null,

  status public.emergency_status not null default 'active',

  -- Captured once, at activation, and only if location permission was already
  -- granted. Null is a completely normal value here.
  triggered_location geography(Point, 4326),
  triggered_location_accuracy double precision,
  location_available boolean not null default false,

  note text,

  -- How many trusted contacts received an in-app alert or share link. This is
  -- an alert to CONTACTS. It is not, and must never be described as,
  -- contacting emergency services.
  contacts_notified_count integer not null default 0,

  -- Set only by a real, verified emergency-services integration. There is no
  -- such integration in V1, so this stays false and the UI says so.
  emergency_services_contacted boolean not null default false,

  triggered_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null,
  resolution_note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint emergency_note_length check (note is null or char_length(note) <= 1000),
  constraint emergency_resolution_note_length
    check (resolution_note is null or char_length(resolution_note) <= 1000),
  constraint emergency_contacts_notified_non_negative check (contacts_notified_count >= 0)
);

comment on table public.emergency_events is
  'User-activated emergency state. `emergency_services_contacted` is false in V1 — Mwhite SafeCircle has no verified dispatch integration.';
comment on column public.emergency_events.emergency_services_contacted is
  'Only a verified emergency-services integration may set this true. Never set it from the client.';

create index emergency_events_user_idx on public.emergency_events (user_id, triggered_at desc);
create index emergency_events_active_idx on public.emergency_events (status) where status = 'active';
create index emergency_events_triggered_idx on public.emergency_events (triggered_at desc);
create index emergency_events_activity_idx on public.emergency_events (activity_id)
  where activity_id is not null;

create trigger emergency_events_set_updated_at
  before update on public.emergency_events
  for each row execute function public.tg_set_updated_at();

-- Now that the table exists, wire the deferred FK from 0006.
alter table public.trusted_location_shares
  add constraint trusted_shares_emergency_fk
  foreign key (emergency_event_id) references public.emergency_events (id) on delete cascade;

create index trusted_shares_emergency_idx on public.trusted_location_shares (emergency_event_id)
  where emergency_event_id is not null;

-- One active emergency per user.
create unique index emergency_events_one_active_per_user
  on public.emergency_events (user_id)
  where status = 'active';

create or replace function public.tg_emergency_events_guard()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if auth.uid() is not null then
    -- A client may never assert that emergency services were contacted, nor
    -- forge the owner of an event, nor inflate the notified count.
    if tg_op = 'INSERT' then
      new.emergency_services_contacted := false;
      new.user_id := auth.uid();
      new.contacts_notified_count := 0;
    else
      new.emergency_services_contacted := old.emergency_services_contacted;
      new.user_id := old.user_id;
      new.contacts_notified_count := old.contacts_notified_count;
    end if;
  end if;

  new.location_available := new.triggered_location is not null;

  if tg_op = 'UPDATE' and new.status <> 'active' and old.status = 'active' then
    new.resolved_at := coalesce(new.resolved_at, now());
    new.resolved_by := coalesce(new.resolved_by, auth.uid());
  end if;

  return new;
end;
$$;

create trigger emergency_events_guard
  before insert or update on public.emergency_events
  for each row execute function public.tg_emergency_events_guard();
