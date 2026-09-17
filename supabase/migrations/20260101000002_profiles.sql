-- ============================================================================
-- SafeCircle 0002 — profiles
--
-- A profile row is created automatically for every auth user. Private columns
-- (email, phone) are NEVER exposed to other users: readers outside the owner
-- go through the `public_profiles` view, which selects a safe subset.
-- ============================================================================

-- Resolve PostGIS/pgcrypto wherever they are installed for the duration of
-- this migration script.
set search_path = public, extensions;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  email text,
  phone text,
  avatar_url text,

  -- Deliberately COARSE. A free-text neighbourhood/suburb label ("Melville,
  -- Johannesburg"), never a street address, never coordinates. Used only to
  -- give context in group listings.
  approximate_area text,

  verification_status public.verification_status not null default 'unverified',
  role public.app_role not null default 'user',
  account_status public.account_status not null default 'active',

  -- Privacy defaults. All three default to the most private setting.
  -- `location_sharing_enabled` is a hard master switch: while false no
  -- activity_locations row may be written for this user (enforced by trigger).
  location_sharing_enabled boolean not null default false,
  discoverable_in_groups boolean not null default true,
  default_activity_visibility public.activity_visibility not null default 'private',

  suspended_at timestamptz,
  suspended_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profiles_display_name_length check (char_length(display_name) between 2 and 60),
  constraint profiles_area_length check (approximate_area is null or char_length(approximate_area) <= 120),
  constraint profiles_phone_format check (phone is null or phone ~ '^\+[1-9][0-9]{6,14}$'),
  constraint profiles_avatar_https check (avatar_url is null or avatar_url ~ '^https://')
);

comment on table public.profiles is
  'One row per auth user. email/phone are private to the owner and admins; other users read the public_profiles view.';
comment on column public.profiles.location_sharing_enabled is
  'Master opt-in. While false, no location may be recorded for this user under any visibility mode.';
comment on column public.profiles.approximate_area is
  'Coarse free-text area label only. Storing a street address here is a privacy violation.';

create index profiles_role_idx on public.profiles (role) where role <> 'user';
create index profiles_account_status_idx on public.profiles (account_status) where account_status <> 'active';
create index profiles_created_at_idx on public.profiles (created_at desc);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- Privilege-escalation guard.
--
-- RLS lets a user UPDATE their own profile row. Without this trigger they
-- could set role = 'admin' or lift their own suspension. Those columns are
-- writable only by a superuser/service-role connection (where auth.uid() is
-- null) or by an existing admin.
-- ---------------------------------------------------------------------------
create or replace function public.tg_profiles_guard_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  actor uuid := auth.uid();
  actor_is_admin boolean := false;
begin
  if actor is null then
    -- service_role / migrations / scheduled jobs
    return new;
  end if;

  select p.role in ('admin', 'moderator') into actor_is_admin
  from public.profiles p where p.id = actor;

  if coalesce(actor_is_admin, false) then
    return new;
  end if;

  new.role := old.role;
  new.account_status := old.account_status;
  new.suspended_at := old.suspended_at;
  new.suspended_reason := old.suspended_reason;
  new.verification_status := old.verification_status;
  new.id := old.id;
  new.created_at := old.created_at;
  return new;
end;
$$;

create trigger profiles_guard_privileged_columns
  before update on public.profiles
  for each row execute function public.tg_profiles_guard_privileged_columns();

-- ---------------------------------------------------------------------------
-- Auto-provision a profile when an auth user is created.
-- ---------------------------------------------------------------------------
create or replace function public.tg_handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  insert into public.profiles (id, display_name, email, phone, verification_status)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(coalesce(new.email, 'member'), '@', 1)
    ),
    new.email,
    new.phone,
    case
      when new.email_confirmed_at is not null and new.phone_confirmed_at is not null then 'fully_verified'
      when new.phone_confirmed_at is not null then 'phone_verified'
      when new.email_confirmed_at is not null then 'email_verified'
      else 'unverified'
    end::public.verification_status
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.tg_handle_new_auth_user();

-- Keep verification_status in step with Supabase Auth confirmations.
create or replace function public.tg_sync_auth_verification()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  update public.profiles p
  set
    email = new.email,
    phone = new.phone,
    verification_status = case
      when new.email_confirmed_at is not null and new.phone_confirmed_at is not null then 'fully_verified'
      when new.phone_confirmed_at is not null then 'phone_verified'
      when new.email_confirmed_at is not null then 'email_verified'
      else 'unverified'
    end::public.verification_status
  where p.id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_verification_changed
  after update of email_confirmed_at, phone_confirmed_at, email, phone on auth.users
  for each row execute function public.tg_sync_auth_verification();
