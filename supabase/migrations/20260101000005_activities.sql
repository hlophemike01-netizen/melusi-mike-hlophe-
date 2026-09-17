-- ============================================================================
-- Mwhite SafeCircle 0005 — activities
--
-- An activity is a TEMPORARY, user-initiated safety session. It is the unit of
-- consent: location may only ever be recorded in the context of an activity
-- the user started, and only for as long as that activity is active.
-- ============================================================================

-- Resolve PostGIS/pgcrypto wherever they are installed for the duration of
-- this migration script.
set search_path = public, extensions;

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  activity_type public.activity_type not null,
  visibility public.activity_visibility not null default 'private',
  status public.activity_status not null default 'active',

  -- Optional group scope. Required when visibility = 'group'.
  group_id uuid references public.groups (id) on delete set null,

  title text,

  -- Free-text destination label only (e.g. "Home via Main Road"). We do NOT
  -- store destination coordinates: a saved destination is a de-facto home
  -- address and a standing privacy risk.
  destination text,

  start_time timestamptz not null default now(),
  expected_end_time timestamptz not null,
  ended_at timestamptz,

  -- Community density opt-in. When true this activity contributes ONE coarse,
  -- grid-snapped point to the aggregate map. Never a precise coordinate, and
  -- never a trail. Forced to false if the owner's master location switch is off.
  contributes_to_density boolean not null default false,

  -- Coarse, grid-snapped point maintained by the location trigger. This is the
  -- ONLY geography the community map ever reads. `activity_locations` is not
  -- reachable from the map code path at all.
  approx_location geography(Point, 4326),
  approx_location_updated_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint activities_title_length check (title is null or char_length(title) <= 120),
  constraint activities_destination_length check (destination is null or char_length(destination) <= 200),
  constraint activities_end_after_start check (expected_end_time > start_time),
  -- Hard ceiling on a single session. Prevents an "always on" activity that
  -- would quietly become continuous tracking.
  constraint activities_max_duration check (expected_end_time <= start_time + interval '24 hours'),
  constraint activities_group_required_for_group_visibility
    check (visibility <> 'group' or group_id is not null)
);

comment on table public.activities is
  'Temporary, consent-scoped safety sessions. Deleting/ending one expires all of its precise location rows.';
comment on column public.activities.approx_location is
  'Grid-snapped coarse point (~1km). The community map reads only this column, never activity_locations.';
comment on column public.activities.destination is
  'Free-text label only. Destination coordinates are deliberately not stored.';

create index activities_user_status_idx on public.activities (user_id, status);
create index activities_status_idx on public.activities (status) where status = 'active';
create index activities_type_idx on public.activities (activity_type);
create index activities_group_idx on public.activities (group_id) where group_id is not null;
create index activities_expected_end_idx on public.activities (expected_end_time) where status = 'active';
create index activities_started_idx on public.activities (start_time desc);

-- The community-map query: active + opted-in + spatially filtered.
create index activities_density_gix on public.activities
  using gist (approx_location)
  where status = 'active' and contributes_to_density = true;

create trigger activities_set_updated_at
  before update on public.activities
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- Consent guards on write.
-- ---------------------------------------------------------------------------
create or replace function public.tg_activities_enforce_consent()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  sharing_enabled boolean;
begin
  select p.location_sharing_enabled into sharing_enabled
  from public.profiles p where p.id = new.user_id;

  -- Master switch off => the activity cannot share anything, in any mode.
  if not coalesce(sharing_enabled, false) then
    new.contributes_to_density := false;
    if new.visibility <> 'private' then
      raise exception 'location_sharing_disabled'
        using hint = 'Enable location sharing in Privacy settings before choosing a sharing visibility.';
    end if;
  end if;

  -- A private activity never contributes to the community map.
  if new.visibility = 'private' then
    new.contributes_to_density := false;
  end if;

  -- group visibility requires the owner to actually be an approved member.
  if new.visibility = 'group' then
    if new.group_id is null or not public.is_group_member(new.group_id, new.user_id) then
      raise exception 'not_a_group_member'
        using hint = 'You must be an approved member of the group to share with it.';
    end if;
  end if;

  -- Ending an activity stamps ended_at and drops it off the community map.
  if tg_op = 'UPDATE' and new.status <> 'active' and old.status = 'active' then
    new.ended_at := coalesce(new.ended_at, now());
    new.approx_location := null;
    new.approx_location_updated_at := null;
    new.contributes_to_density := false;
  end if;

  return new;
end;
$$;

create trigger activities_enforce_consent
  before insert or update on public.activities
  for each row execute function public.tg_activities_enforce_consent();

-- ---------------------------------------------------------------------------
-- One active activity per user. Two concurrent sessions would double-count on
-- the density map and make check-in state ambiguous.
-- ---------------------------------------------------------------------------
create unique index activities_one_active_per_user
  on public.activities (user_id)
  where status in ('active', 'emergency', 'overdue');
