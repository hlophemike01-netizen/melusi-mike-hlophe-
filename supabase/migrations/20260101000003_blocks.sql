-- ============================================================================
-- Mwhite SafeCircle 0003 — user blocks
--
-- A block is directional in storage but bidirectional in effect: if A blocks
-- B, neither may see or interact with the other. Blocks are evaluated by
-- `is_blocked_between()` and referenced from almost every read policy.
-- ============================================================================

-- Resolve PostGIS/pgcrypto wherever they are installed for the duration of
-- this migration script.
set search_path = public, extensions;

create table public.user_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),

  constraint user_blocks_unique unique (blocker_id, blocked_id),
  constraint user_blocks_no_self check (blocker_id <> blocked_id),
  constraint user_blocks_reason_length check (reason is null or char_length(reason) <= 500)
);

comment on table public.user_blocks is
  'Directional storage, bidirectional effect. Checked by is_blocked_between() in every relationship-scoped policy.';

create index user_blocks_blocker_idx on public.user_blocks (blocker_id);
create index user_blocks_blocked_idx on public.user_blocks (blocked_id);

-- ---------------------------------------------------------------------------
-- Shared authorisation helpers.
--
-- These are SECURITY DEFINER on purpose: they are called from inside RLS
-- policies, so if they ran as the caller they would re-trigger the very
-- policies that invoke them and recurse. `search_path` is pinned so a caller
-- cannot shadow a table name and redirect the lookup.
-- ---------------------------------------------------------------------------

create or replace function public.is_blocked_between(user_a uuid, user_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = user_a and b.blocked_id = user_b)
       or (b.blocker_id = user_b and b.blocked_id = user_a)
  );
$$;

create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid
      and p.role = 'admin'
      and p.account_status = 'active'
  );
$$;

create or replace function public.is_moderator_or_admin(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid
      and p.role in ('admin', 'moderator')
      and p.account_status = 'active'
  );
$$;

create or replace function public.is_active_account(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and p.account_status = 'active'
  );
$$;

comment on function public.is_admin is
  'True only for an active account with role = admin. Used as the sole gate for every admin-only policy.';
