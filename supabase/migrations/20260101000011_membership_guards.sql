-- ============================================================================
-- Mwhite SafeCircle 0011 — membership integrity guards
--
-- RLS decides *whether* a row may be written. These triggers decide *what* the
-- row is allowed to say, which is where privilege escalation would otherwise
-- slip through (a user approving their own join request, or promoting
-- themselves to group owner).
-- ============================================================================

-- Resolve PostGIS/pgcrypto wherever they are installed for the duration of
-- this migration script.
set search_path = public, extensions;

create or replace function public.tg_group_members_guard()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  actor uuid := auth.uid();
  grp record;
  acting_as_admin boolean;
begin
  if actor is null then
    return new; -- service role / migrations
  end if;

  select g.id, g.owner_id, g.visibility, g.requires_approval, g.status
    into grp
  from public.groups g
  where g.id = coalesce(new.group_id, old.group_id);

  if grp.id is null then
    raise exception 'group_not_found';
  end if;

  acting_as_admin := public.is_group_admin(grp.id, actor) or public.is_moderator_or_admin(actor);

  if tg_op = 'INSERT' then
    if new.user_id = actor and not acting_as_admin then
      -- Self-service join request.
      if public.is_blocked_between(grp.owner_id, actor) then
        raise exception 'group_unavailable';
      end if;
      if grp.status <> 'active' then
        raise exception 'group_not_active';
      end if;
      if grp.visibility = 'invite_only' then
        raise exception 'group_is_invite_only'
          using hint = 'This group only accepts members who have been invited.';
      end if;

      new.role := 'member';
      new.status := case
        when grp.requires_approval or grp.visibility = 'private' then 'pending'
        else 'approved'
      end;
      new.approved_by := null;
      new.invited_by := null;
    else
      -- Invite issued by a group admin.
      if not acting_as_admin then
        raise exception 'insufficient_group_permission';
      end if;
      if new.role = 'owner' then
        raise exception 'owner_role_is_not_assignable';
      end if;
      new.invited_by := actor;
      if new.status = 'approved' then
        new.approved_by := actor;
      end if;
    end if;

    return new;
  end if;

  -- UPDATE ------------------------------------------------------------------
  -- Immutable identity columns.
  new.group_id := old.group_id;
  new.user_id := old.user_id;

  if old.role = 'owner' then
    -- The owner's membership row is not editable through this path. Transfer
    -- of ownership happens by updating groups.owner_id.
    new.role := old.role;
    if new.status <> old.status then
      raise exception 'cannot_change_owner_membership';
    end if;
    return new;
  end if;

  if acting_as_admin then
    if new.role = 'owner' then
      raise exception 'owner_role_is_not_assignable';
    end if;
    if new.status = 'approved' and old.status <> 'approved' then
      new.approved_by := actor;
    end if;
    return new;
  end if;

  -- A plain member may only leave. They may not approve themselves or change
  -- their own role.
  if old.user_id <> actor then
    raise exception 'insufficient_group_permission';
  end if;

  new.role := old.role;
  new.approved_by := old.approved_by;

  if new.status not in (old.status, 'left') then
    raise exception 'members_may_only_leave'
      using hint = 'You can leave a group, but only a group admin can change your membership status.';
  end if;

  return new;
end;
$$;

create trigger group_members_guard
  before insert or update on public.group_members
  for each row execute function public.tg_group_members_guard();

-- ---------------------------------------------------------------------------
-- Ownership transfer keeps the membership table consistent.
-- ---------------------------------------------------------------------------
create or replace function public.tg_groups_transfer_owner()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    update public.group_members set role = 'admin'
      where group_id = new.id and user_id = old.owner_id;

    insert into public.group_members (group_id, user_id, role, status, joined_at)
    values (new.id, new.owner_id, 'owner', 'approved', now())
    on conflict (group_id, user_id) do update
      set role = 'owner', status = 'approved';
  end if;
  return new;
end;
$$;

create trigger groups_transfer_owner
  after update of owner_id on public.groups
  for each row execute function public.tg_groups_transfer_owner();

-- ---------------------------------------------------------------------------
-- Blocking someone removes the interaction surface immediately: any live
-- location share between the two parties is revoked on the spot.
-- ---------------------------------------------------------------------------
create or replace function public.tg_user_blocks_revoke_shares()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  update public.trusted_location_shares s
  set revoked_at = now()
  where s.revoked_at is null
    and (
      (s.owner_id = new.blocker_id and s.recipient_user_id = new.blocked_id)
      or (s.owner_id = new.blocked_id and s.recipient_user_id = new.blocker_id)
    );

  -- Unlink the contact record so no future share can be created either way.
  update public.emergency_contacts c
  set contact_user_id = null, is_active = false
  where (c.owner_id = new.blocker_id and c.contact_user_id = new.blocked_id)
     or (c.owner_id = new.blocked_id and c.contact_user_id = new.blocker_id);

  return new;
end;
$$;

create trigger user_blocks_revoke_shares
  after insert on public.user_blocks
  for each row execute function public.tg_user_blocks_revoke_shares();
