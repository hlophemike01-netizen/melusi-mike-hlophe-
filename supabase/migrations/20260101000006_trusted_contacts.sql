-- ============================================================================
-- Mwhite SafeCircle 0006 — trusted contacts and location share sessions
--
-- `emergency_contacts` holds the user's trusted contacts. `trusted_location_
-- shares` is the *session* record: a time-boxed, revocable grant that is the
-- only thing which makes a precise coordinate readable by someone else.
-- ============================================================================

-- Resolve PostGIS/pgcrypto wherever they are installed for the duration of
-- this migration script.
set search_path = public, extensions;

create table public.emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,

  name text not null,
  phone text not null,
  relationship text,
  permission_level public.contact_permission_level not null default 'emergency_only',

  -- Set when the contact's phone number matches an existing Mwhite SafeCircle
  -- account, which lets them receive shares in-app rather than by link.
  -- Resolved server-side only; never exposed to the contact.
  contact_user_id uuid references public.profiles (id) on delete set null,

  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint emergency_contacts_name_length check (char_length(name) between 1 and 80),
  constraint emergency_contacts_phone_format check (phone ~ '^\+[1-9][0-9]{6,14}$'),
  constraint emergency_contacts_relationship_length
    check (relationship is null or char_length(relationship) <= 60),
  constraint emergency_contacts_unique_per_owner unique (owner_id, phone),
  constraint emergency_contacts_not_self check (contact_user_id is null or contact_user_id <> owner_id)
);

comment on table public.emergency_contacts is
  'Trusted contacts. Rows are private to their owner — a contact cannot see that they were added, or by whom.';

create index emergency_contacts_owner_idx on public.emergency_contacts (owner_id) where is_active;
create index emergency_contacts_contact_user_idx on public.emergency_contacts (contact_user_id)
  where contact_user_id is not null;

create trigger emergency_contacts_set_updated_at
  before update on public.emergency_contacts
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------------

create table public.trusted_location_shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  contact_id uuid references public.emergency_contacts (id) on delete cascade,

  -- Exactly one scope: an activity or an emergency event (set in 0008).
  activity_id uuid references public.activities (id) on delete cascade,
  emergency_event_id uuid,

  -- Populated when the contact is itself a Mwhite SafeCircle account. This is the
  -- column RLS matches on.
  recipient_user_id uuid references public.profiles (id) on delete cascade,

  reason public.share_reason not null default 'activity',

  granted_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,

  -- SHA-256 of a one-time link token, for contacts who do not have an account.
  -- The raw token is returned to the owner exactly once and never stored.
  token_hash text,
  last_viewed_at timestamptz,

  created_at timestamptz not null default now(),

  constraint trusted_shares_expiry_after_grant check (expires_at > granted_at),
  -- Absolute ceiling on any single share session.
  constraint trusted_shares_max_window check (expires_at <= granted_at + interval '24 hours'),
  constraint trusted_shares_has_scope
    check (activity_id is not null or emergency_event_id is not null),
  constraint trusted_shares_has_recipient
    check (recipient_user_id is not null or token_hash is not null),
  constraint trusted_shares_token_hash_format
    check (token_hash is null or token_hash ~ '^[a-f0-9]{64}$')
);

comment on table public.trusted_location_shares is
  'Time-boxed, revocable grants. A precise coordinate is readable by a contact only while a matching row is active.';
comment on column public.trusted_location_shares.token_hash is
  'SHA-256 of the link token. The raw token is shown to the owner once and never persisted.';

create index trusted_shares_recipient_active_idx
  on public.trusted_location_shares (recipient_user_id, expires_at)
  where revoked_at is null and recipient_user_id is not null;
create index trusted_shares_activity_idx on public.trusted_location_shares (activity_id)
  where activity_id is not null;
create index trusted_shares_owner_idx on public.trusted_location_shares (owner_id);
create unique index trusted_shares_token_hash_idx on public.trusted_location_shares (token_hash)
  where token_hash is not null;
create index trusted_shares_expiry_sweep_idx on public.trusted_location_shares (expires_at)
  where revoked_at is null;

-- ---------------------------------------------------------------------------
-- Is there a live grant from `owner` to `viewer` for this activity?
-- ---------------------------------------------------------------------------
create or replace function public.has_active_trusted_share(act_id uuid, viewer uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select exists (
    select 1
    from public.trusted_location_shares s
    where s.activity_id = act_id
      and s.recipient_user_id = viewer
      and s.revoked_at is null
      and s.granted_at <= now()
      and s.expires_at > now()
  );
$$;

comment on function public.has_active_trusted_share is
  'The single source of truth for trusted-contact location access. Expiry and revocation are both checked here.';
