-- ============================================================================
-- SafeCircle 0013 — activity, share and emergency RPCs
--
-- Multi-step, security-sensitive operations live here rather than in the
-- client, so that "end the activity AND expire its location rows" cannot be
-- half-completed by a client that closes the tab.
-- ============================================================================

-- Resolve PostGIS/pgcrypto wherever they are installed for the duration of
-- this migration script.
set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- Latest authorised position for an activity.
--
-- Deliberately returns ONE point, not a history. Exposing the full row set
-- would hand a viewer a movement trail, which the product rules forbid.
-- ---------------------------------------------------------------------------
create or replace function public.latest_activity_location(act_id uuid)
returns table (
  activity_id uuid,
  lng double precision,
  lat double precision,
  accuracy double precision,
  recorded_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  viewer uuid := auth.uid();
begin
  if viewer is null or not public.can_view_activity_location(act_id, viewer) then
    raise exception 'not_authorised';
  end if;

  return query
  select
    l.activity_id,
    st_x(l.location::geometry),
    st_y(l.location::geometry),
    l.accuracy,
    l.recorded_at
  from public.activity_locations l
  where l.activity_id = act_id
    and l.expires_at > now()
  order by l.recorded_at desc
  limit 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- End an activity and immediately expire its precise points.
--
-- "Expire" here means the rows stop being readable by anyone (including the
-- owner's viewers) the moment the activity ends; the purge job then deletes
-- them. We do not wait for the purge to enforce the privacy promise.
-- ---------------------------------------------------------------------------
create or replace function public.end_activity(
  act_id uuid,
  new_status public.activity_status default 'completed'
)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  actor uuid := auth.uid();
  owner uuid;
begin
  select a.user_id into owner from public.activities a where a.id = act_id;

  if owner is null then
    raise exception 'activity_not_found';
  end if;
  if owner <> actor then
    raise exception 'not_authorised';
  end if;
  if new_status not in ('completed', 'cancelled') then
    raise exception 'invalid_status';
  end if;

  update public.activities
  set status = new_status, ended_at = now()
  where id = act_id;

  -- Revoke every outstanding share for this activity.
  update public.trusted_location_shares
  set revoked_at = now()
  where activity_id = act_id and revoked_at is null;

  -- Cancel any outstanding check-in prompt.
  update public.check_ins
  set status = 'cancelled'
  where activity_id = act_id and status = 'scheduled';

  -- Expiry cannot be done with an UPDATE (the table is append-only), so the
  -- rows are deleted outright. Nothing else references them.
  delete from public.activity_locations where activity_id = act_id;
end;
$$;

comment on function public.end_activity is
  'Ends an activity, revokes its shares, cancels its check-in and deletes its precise points in one transaction.';

-- ---------------------------------------------------------------------------
-- Open share sessions with the caller's trusted contacts.
--
-- `p_contact_ids` narrows the set; null means "every contact whose permission
-- level covers this reason". Contacts without a SafeCircle account get a
-- link token, returned to the OWNER once so they can send it themselves.
-- ---------------------------------------------------------------------------
create or replace function public.open_trusted_shares(
  p_activity_id uuid default null,
  p_emergency_event_id uuid default null,
  p_reason public.share_reason default 'activity',
  p_contact_ids uuid[] default null,
  p_duration_minutes integer default 120
)
returns table (
  share_id uuid,
  contact_id uuid,
  contact_name text,
  recipient_user_id uuid,
  share_token text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  actor uuid := auth.uid();
  window_minutes integer := least(greatest(coalesce(p_duration_minutes, 120), 5), 1440);
  deadline timestamptz;
  rec record;
  raw_token text;
begin
  if actor is null then
    raise exception 'not_authorised';
  end if;

  if (p_activity_id is null) = (p_emergency_event_id is null) then
    raise exception 'exactly_one_scope_required';
  end if;

  if p_activity_id is not null
     and not exists (select 1 from public.activities a where a.id = p_activity_id and a.user_id = actor) then
    raise exception 'not_authorised';
  end if;

  if p_emergency_event_id is not null
     and not exists (select 1 from public.emergency_events e where e.id = p_emergency_event_id and e.user_id = actor) then
    raise exception 'not_authorised';
  end if;

  deadline := now() + make_interval(mins => window_minutes);

  for rec in
    select c.id, c.name, c.contact_user_id, c.permission_level
    from public.emergency_contacts c
    where c.owner_id = actor
      and c.is_active
      and (p_contact_ids is null or c.id = any (p_contact_ids))
      and (
        c.permission_level = 'always_when_enabled'
        or (p_reason = 'activity' and c.permission_level = 'activity_only')
        or (p_reason in ('emergency', 'check_in_missed') and c.permission_level = 'emergency_only')
      )
      and (c.contact_user_id is null or not public.is_blocked_between(actor, c.contact_user_id))
  loop
    -- A 32-byte URL-safe token. Only its SHA-256 is stored.
    raw_token := case
      when rec.contact_user_id is null
        then encode(gen_random_bytes(32), 'hex')
      else null
    end;

    insert into public.trusted_location_shares (
      owner_id, contact_id, activity_id, emergency_event_id,
      recipient_user_id, reason, expires_at, token_hash
    )
    values (
      actor, rec.id, p_activity_id, p_emergency_event_id,
      rec.contact_user_id, p_reason, deadline,
      case when raw_token is null then null else encode(digest(raw_token, 'sha256'), 'hex') end
    )
    returning id into share_id;

    contact_id := rec.id;
    contact_name := rec.name;
    recipient_user_id := rec.contact_user_id;
    share_token := raw_token;
    expires_at := deadline;
    return next;
  end loop;
end;
$$;

comment on function public.open_trusted_shares is
  'Creates time-boxed share grants. Raw link tokens are returned to the owner once and never persisted.';

-- ---------------------------------------------------------------------------
-- Link-token read path, for contacts who do not have a SafeCircle account.
--
-- Returns a single coarse-to-precise point plus the sharer's display name.
-- The token is matched by hash; an expired or revoked grant yields nothing.
-- ---------------------------------------------------------------------------
create or replace function public.location_by_share_token(p_token text)
returns table (
  sharer_name text,
  reason public.share_reason,
  lng double precision,
  lat double precision,
  accuracy double precision,
  recorded_at timestamptz,
  expires_at timestamptz,
  emergency_active boolean
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  share record;
  target_activity uuid;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_token';
  end if;

  select s.* into share
  from public.trusted_location_shares s
  where s.token_hash = encode(digest(p_token, 'sha256'), 'hex')
    and s.revoked_at is null
    and s.expires_at > now();

  if share.id is null then
    raise exception 'share_unavailable'
      using hint = 'This link has expired or was turned off by the person who shared it.';
  end if;

  update public.trusted_location_shares set last_viewed_at = now() where id = share.id;

  target_activity := coalesce(
    share.activity_id,
    (select e.activity_id from public.emergency_events e where e.id = share.emergency_event_id)
  );

  return query
  select
    p.display_name,
    share.reason,
    st_x(l.location::geometry),
    st_y(l.location::geometry),
    l.accuracy,
    l.recorded_at,
    share.expires_at,
    exists (
      select 1 from public.emergency_events e
      where e.user_id = share.owner_id and e.status = 'active'
    )
  from public.profiles p
  left join lateral (
    select al.* from public.activity_locations al
    where al.activity_id = target_activity and al.expires_at > now()
    order by al.recorded_at desc
    limit 1
  ) l on true
  where p.id = share.owner_id;
end;
$$;

-- The token itself is the credential, so this is the one function `anon` may
-- call. It returns exactly one point and nothing enumerable.
revoke all on function public.location_by_share_token(text) from public;
grant execute on function public.location_by_share_token(text) to anon, authenticated;

revoke all on function public.latest_activity_location(uuid) from public, anon;
revoke all on function public.end_activity(uuid, public.activity_status) from public, anon;
revoke all on function public.open_trusted_shares(uuid, uuid, public.share_reason, uuid[], integer) from public, anon;

grant execute on function public.latest_activity_location(uuid) to authenticated;
grant execute on function public.end_activity(uuid, public.activity_status) to authenticated;
grant execute on function public.open_trusted_shares(uuid, uuid, public.share_reason, uuid[], integer) to authenticated;
