-- ============================================================================
-- Mwhite SafeCircle 0012 — community map RPCs
--
-- These are the ONLY functions that expose anything geographic to a user who
-- is not personally authorised. They read `activities.approx_location` (already
-- snapped to ~1.1km) and never touch `activity_locations`.
--
-- Three layers of protection:
--   1. Precision  — the source column is grid-snapped, not precise.
--   2. Aggregation— results are counts per cell, never individual rows. No id,
--                   no user_id, no timestamp that could identify a person.
--   3. k-anonymity— a cell with fewer than MIN_CELL_COUNT activities is
--                   suppressed entirely, so "one runner" never becomes "that
--                   runner".
-- ============================================================================

-- Resolve PostGIS/pgcrypto wherever they are installed for the duration of
-- this migration script.
set search_path = public, extensions;

-- Suppress any cell representing fewer than this many activities.
create or replace function public.community_min_cell_count()
returns integer language sql immutable as $$ select 3 $$;

-- ---------------------------------------------------------------------------
-- Density cells for the map viewport.
-- ---------------------------------------------------------------------------
create or replace function public.community_activity_density(
  min_lng double precision,
  min_lat double precision,
  max_lng double precision,
  max_lat double precision,
  types public.activity_type[] default null
)
returns table (
  cell_lng double precision,
  cell_lat double precision,
  activity_type public.activity_type,
  activity_count bigint
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  viewer uuid := auth.uid();
  max_span constant double precision := 1.5; -- degrees; ~165km. Stops bulk scraping.
begin
  if viewer is null or not public.is_active_account(viewer) then
    raise exception 'not_authorised';
  end if;

  if min_lng is null or min_lat is null or max_lng is null or max_lat is null then
    raise exception 'invalid_bounds';
  end if;

  if max_lng <= min_lng or max_lat <= min_lat then
    raise exception 'invalid_bounds';
  end if;

  if (max_lng - min_lng) > max_span or (max_lat - min_lat) > max_span then
    raise exception 'bounds_too_large'
      using hint = 'Zoom in to see community activity.';
  end if;

  return query
  select
    st_x(a.approx_location::geometry) as cell_lng,
    st_y(a.approx_location::geometry) as cell_lat,
    a.activity_type,
    count(*) as activity_count
  from public.activities a
  where a.status in ('active', 'emergency', 'overdue')
    and a.contributes_to_density
    and a.approx_location is not null
    -- A stale point means the person stopped sending updates; drop it rather
    -- than imply they are still there.
    and a.approx_location_updated_at > now() - interval '30 minutes'
    and a.expected_end_time > now()
    and (types is null or a.activity_type = any (types))
    and st_intersects(
      a.approx_location,
      st_makeenvelope(min_lng, min_lat, max_lng, max_lat, 4326)::geography
    )
    -- Never surface an activity belonging to someone either party has blocked.
    and not public.is_blocked_between(a.user_id, viewer)
  group by 1, 2, 3
  having count(*) >= public.community_min_cell_count()
  limit 500;
end;
$$;

comment on function public.community_activity_density is
  'Aggregate-only map feed. Returns grid cells with counts; suppresses cells below the k-anonymity threshold.';

-- ---------------------------------------------------------------------------
-- Headline counts: "14 runners nearby".
--
-- Returns a total per activity type within a radius. Same k-anonymity rule
-- applies to the whole result — a total below the threshold is reported as 0
-- so that a single nearby person cannot be inferred.
-- ---------------------------------------------------------------------------
create or replace function public.community_activity_summary(
  centre_lng double precision,
  centre_lat double precision,
  radius_metres integer default 5000
)
returns table (
  activity_type public.activity_type,
  activity_count bigint
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  viewer uuid := auth.uid();
  radius integer := least(greatest(coalesce(radius_metres, 5000), 500), 25000);
begin
  if viewer is null or not public.is_active_account(viewer) then
    raise exception 'not_authorised';
  end if;

  if centre_lng is null or centre_lat is null
     or centre_lng < -180 or centre_lng > 180
     or centre_lat < -90 or centre_lat > 90 then
    raise exception 'invalid_bounds';
  end if;

  return query
  select t.activity_type, t.activity_count
  from (
    select
      a.activity_type,
      count(*) as activity_count
    from public.activities a
    where a.status in ('active', 'emergency', 'overdue')
      and a.contributes_to_density
      and a.approx_location is not null
      and a.approx_location_updated_at > now() - interval '30 minutes'
      and a.expected_end_time > now()
      and st_dwithin(
        a.approx_location,
        st_setsrid(st_point(centre_lng, centre_lat), 4326)::geography,
        radius
      )
      and not public.is_blocked_between(a.user_id, viewer)
    group by a.activity_type
  ) t
  where t.activity_count >= public.community_min_cell_count();
end;
$$;

-- ---------------------------------------------------------------------------
-- Active group count in an area — used for the "3 groups active" tile.
-- ---------------------------------------------------------------------------
create or replace function public.community_active_group_count()
returns bigint
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select count(distinct a.group_id)
  from public.activities a
  where a.status in ('active', 'emergency', 'overdue')
    and a.visibility = 'group'
    and a.group_id is not null
    and a.expected_end_time > now()
    and public.is_group_member(a.group_id, auth.uid());
$$;

revoke all on function public.community_activity_density(double precision, double precision, double precision, double precision, public.activity_type[]) from public, anon;
revoke all on function public.community_activity_summary(double precision, double precision, integer) from public, anon;
revoke all on function public.community_active_group_count() from public, anon;

grant execute on function public.community_activity_density(double precision, double precision, double precision, double precision, public.activity_type[]) to authenticated;
grant execute on function public.community_activity_summary(double precision, double precision, integer) to authenticated;
grant execute on function public.community_active_group_count() to authenticated;
