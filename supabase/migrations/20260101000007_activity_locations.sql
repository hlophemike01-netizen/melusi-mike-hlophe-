-- ============================================================================
-- SafeCircle 0007 — precise location points
--
-- This is the most sensitive table in the system. Everything about it is
-- defensive:
--   * every row carries its own expires_at and is unreadable after it passes;
--   * reads are gated by can_view_activity_location(), never by a raw join;
--   * a completed activity's points become unreadable immediately;
--   * a scheduled job hard-deletes expired rows (0012);
--   * there is no API that returns the table unfiltered.
-- ============================================================================

-- Resolve PostGIS/pgcrypto wherever they are installed for the duration of
-- this migration script.
set search_path = public, extensions;

create table public.activity_locations (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete cascade,

  -- Denormalised for RLS: lets a policy check ownership without joining
  -- activities (which would itself be RLS-filtered).
  user_id uuid not null references public.profiles (id) on delete cascade,

  location geography(Point, 4326) not null,
  accuracy double precision,
  heading double precision,
  speed double precision,

  recorded_at timestamptz not null default now(),
  expires_at timestamptz not null,

  constraint activity_locations_expiry_after_record check (expires_at > recorded_at),
  constraint activity_locations_accuracy_sane
    check (accuracy is null or (accuracy >= 0 and accuracy <= 100000)),
  constraint activity_locations_heading_sane
    check (heading is null or (heading >= 0 and heading < 360)),
  constraint activity_locations_speed_sane
    check (speed is null or (speed >= 0 and speed <= 1000))
);

comment on table public.activity_locations is
  'Precise GPS points. Short-lived by construction: every row expires, and expired rows are both unreadable and purged.';
comment on column public.activity_locations.expires_at is
  'Hard read cutoff. RLS refuses rows past this time even for the owner of the activity.';

create index activity_locations_activity_recent_idx
  on public.activity_locations (activity_id, recorded_at desc);
create index activity_locations_user_idx on public.activity_locations (user_id);
-- Drives the purge job.
create index activity_locations_expiry_idx on public.activity_locations (expires_at);
create index activity_locations_gix on public.activity_locations using gist (location);

-- ---------------------------------------------------------------------------
-- Write guard: a point may only be recorded when *all* of these hold.
-- ---------------------------------------------------------------------------
create or replace function public.tg_activity_locations_guard()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  act record;
  sharing_enabled boolean;
begin
  select a.id, a.user_id, a.status, a.visibility, a.expected_end_time, a.contributes_to_density
    into act
  from public.activities a
  where a.id = new.activity_id;

  if act.id is null then
    raise exception 'activity_not_found';
  end if;

  -- The row's user_id is derived, never trusted from the client.
  new.user_id := act.user_id;

  if act.status not in ('active', 'emergency', 'overdue') then
    raise exception 'activity_not_active'
      using hint = 'Location can only be recorded while an activity is running.';
  end if;

  select p.location_sharing_enabled into sharing_enabled
  from public.profiles p where p.id = act.user_id;

  if not coalesce(sharing_enabled, false) then
    raise exception 'location_sharing_disabled';
  end if;

  -- Clamp expiry: never past the activity's expected end + a 1 hour grace,
  -- and never more than 24h out regardless of what the client asked for.
  new.recorded_at := coalesce(new.recorded_at, now());
  new.expires_at := least(
    coalesce(new.expires_at, new.recorded_at + interval '2 hours'),
    act.expected_end_time + interval '1 hour',
    new.recorded_at + interval '24 hours'
  );

  if new.expires_at <= new.recorded_at then
    new.expires_at := new.recorded_at + interval '5 minutes';
  end if;

  -- Maintain the coarse community point. This is the ONLY place a location
  -- ever escapes the precise table, and it is snapped to a ~1km grid first.
  if act.contributes_to_density then
    update public.activities a
    set approx_location = public.coarsen_point(new.location),
        approx_location_updated_at = now()
    where a.id = act.id;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Precision reduction. Snapping to a grid (rather than adding random noise per
-- read) means repeated samples cannot be averaged back to the true position.
-- 0.01 degrees is roughly 1.1 km of latitude.
-- ---------------------------------------------------------------------------
create or replace function public.coarsen_point(pt geography, grid double precision default 0.01)
returns geography
language sql
immutable
as $$
  select st_setsrid(
    st_point(
      round(st_x(pt::geometry) / grid) * grid,
      round(st_y(pt::geometry) / grid) * grid
    ),
    4326
  )::geography;
$$;

comment on function public.coarsen_point is
  'Snaps a point to a ~1.1km grid. Deterministic on purpose: resampling cannot average the noise away.';

create trigger activity_locations_guard
  before insert on public.activity_locations
  for each row execute function public.tg_activity_locations_guard();

-- Location points are append-only. Rewriting history would let a user forge a
-- route, and would break the expiry guarantee.
create or replace function public.tg_activity_locations_no_update()
returns trigger
language plpgsql
as $$
begin
  raise exception 'activity_locations_are_append_only';
end;
$$;

create trigger activity_locations_no_update
  before update on public.activity_locations
  for each row execute function public.tg_activity_locations_no_update();

-- ---------------------------------------------------------------------------
-- THE location authorisation function.
--
-- Every read path for precise coordinates goes through this one predicate.
-- If a rule is not expressed here, it does not exist.
-- ---------------------------------------------------------------------------
create or replace function public.can_view_activity_location(act_id uuid, viewer uuid default auth.uid())
returns boolean
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  act record;
begin
  if viewer is null then
    return false;
  end if;

  select a.id, a.user_id, a.visibility, a.status, a.group_id, a.expected_end_time
    into act
  from public.activities a
  where a.id = act_id;

  if act.id is null then
    return false;
  end if;

  -- 1. The owner may always read their own points (subject to row expiry,
  --    which is enforced separately in the policy).
  if act.user_id = viewer then
    return true;
  end if;

  -- 2. A suspended or deleted viewer gets nothing.
  if not public.is_active_account(viewer) then
    return false;
  end if;

  -- 3. A block in either direction ends the conversation.
  if public.is_blocked_between(act.user_id, viewer) then
    return false;
  end if;

  -- 4. Precise location is only ever live. A finished activity's points are
  --    not readable by anyone but the owner, regardless of visibility.
  if act.status not in ('active', 'emergency', 'overdue') then
    return false;
  end if;

  -- 5. Visibility rules.
  case act.visibility
    when 'private' then
      return false;
    when 'nearby' then
      -- 'nearby' shares an aggregate count, never a coordinate.
      return false;
    when 'group' then
      return act.group_id is not null and public.is_group_member(act.group_id, viewer);
    when 'trusted_contacts' then
      return public.has_active_trusted_share(act.id, viewer);
    else
      return false;
  end case;
end;
$$;

comment on function public.can_view_activity_location is
  'Single authorisation predicate for precise location. Admins are deliberately NOT granted access here.';

-- Emergency escalation: an emergency event may widen the audience to the
-- user''s trusted contacts even when the activity was private. Handled by
-- inserting trusted_location_shares rows (see 0008), not by weakening this
-- function.
