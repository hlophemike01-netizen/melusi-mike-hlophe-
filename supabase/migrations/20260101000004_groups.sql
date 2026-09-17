-- ============================================================================
-- Mwhite SafeCircle 0004 — community groups and membership
-- ============================================================================

-- Resolve PostGIS/pgcrypto wherever they are installed for the duration of
-- this migration script.
set search_path = public, extensions;

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  activity_type public.activity_type not null default 'other',

  -- Coarse label only ("Sea Point, Cape Town"). Groups do not store a precise
  -- meeting point; a group's geography is advisory, not navigational.
  approximate_area text,

  owner_id uuid not null references public.profiles (id) on delete restrict,
  visibility public.group_visibility not null default 'private',
  status public.group_status not null default 'active',

  -- When true a join request must be approved by an owner/admin.
  requires_approval boolean not null default true,
  member_count integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint groups_name_length check (char_length(name) between 3 and 80),
  constraint groups_description_length check (description is null or char_length(description) <= 1000),
  constraint groups_area_length check (approximate_area is null or char_length(approximate_area) <= 120),
  constraint groups_member_count_non_negative check (member_count >= 0)
);

comment on table public.groups is
  'Community groups. `public` groups are discoverable by any signed-in user; `private` and `invite_only` are visible only to members.';

create index groups_owner_idx on public.groups (owner_id);
create index groups_status_visibility_idx on public.groups (status, visibility) where status = 'active';
create index groups_activity_type_idx on public.groups (activity_type) where status = 'active';
create index groups_created_at_idx on public.groups (created_at desc);

create trigger groups_set_updated_at
  before update on public.groups
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------------

create table public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.group_member_role not null default 'member',
  status public.group_member_status not null default 'pending',

  invited_by uuid references public.profiles (id) on delete set null,
  approved_by uuid references public.profiles (id) on delete set null,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint group_members_unique unique (group_id, user_id)
);

comment on table public.group_members is
  'Membership edge. Only rows with status = approved confer any read access to group content or group-visibility location.';

create index group_members_group_status_idx on public.group_members (group_id, status);
create index group_members_user_status_idx on public.group_members (user_id, status);
create index group_members_pending_idx on public.group_members (group_id) where status = 'pending';

create trigger group_members_set_updated_at
  before update on public.group_members
  for each row execute function public.tg_set_updated_at();

-- Keep groups.member_count honest without a subquery on every read.
create or replace function public.tg_group_members_sync_count()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  target uuid := coalesce(new.group_id, old.group_id);
begin
  update public.groups g
  set member_count = (
    select count(*) from public.group_members m
    where m.group_id = target and m.status = 'approved'
  )
  where g.id = target;
  return coalesce(new, old);
end;
$$;

create trigger group_members_sync_count
  after insert or update of status or delete on public.group_members
  for each row execute function public.tg_group_members_sync_count();

-- Stamp joined_at the moment a membership becomes approved.
create or replace function public.tg_group_members_stamp_joined()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'approved' and new.joined_at is null then
    new.joined_at := now();
  end if;
  return new;
end;
$$;

create trigger group_members_stamp_joined
  before insert or update on public.group_members
  for each row execute function public.tg_group_members_stamp_joined();

-- ---------------------------------------------------------------------------
-- Membership helpers (SECURITY DEFINER to avoid RLS recursion on group_members)
-- ---------------------------------------------------------------------------

create or replace function public.is_group_member(gid uuid, uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select exists (
    select 1 from public.group_members m
    where m.group_id = gid and m.user_id = uid and m.status = 'approved'
  );
$$;

create or replace function public.is_group_admin(gid uuid, uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select exists (
    select 1 from public.group_members m
    where m.group_id = gid
      and m.user_id = uid
      and m.status = 'approved'
      and m.role in ('owner', 'admin')
  );
$$;

-- Used by the public_profiles view: two users may see each other's limited
-- profile only if they share at least one group.
create or replace function public.shares_group_with(other_user uuid, uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select exists (
    select 1
    from public.group_members a
    join public.group_members b on a.group_id = b.group_id
    where a.user_id = uid and a.status = 'approved'
      and b.user_id = other_user and b.status = 'approved'
  );
$$;

-- Owner is seeded as an approved owner-role member on group creation.
create or replace function public.tg_groups_seed_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  insert into public.group_members (group_id, user_id, role, status, joined_at)
  values (new.id, new.owner_id, 'owner', 'approved', now())
  on conflict (group_id, user_id) do update
    set role = 'owner', status = 'approved';
  return new;
end;
$$;

create trigger groups_seed_owner_membership
  after insert on public.groups
  for each row execute function public.tg_groups_seed_owner_membership();
