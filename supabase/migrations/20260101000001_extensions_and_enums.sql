-- ============================================================================
-- SafeCircle 0001 — extensions, enums and shared helpers
--
-- Design note: every geographic column uses PostGIS `geography(Point, 4326)`
-- so distance maths are metres on the spheroid without per-query casting.
-- ============================================================================

-- Resolve PostGIS/pgcrypto wherever they are installed for the duration of
-- this migration script.
set search_path = public, extensions;

-- Supabase installs extensions into a dedicated `extensions` schema. Creating
-- it here keeps the migrations runnable against a plain PostgreSQL instance
-- too. Every SECURITY DEFINER function below pins
-- `search_path = public, extensions, pg_temp` so PostGIS and pgcrypto resolve
-- regardless of where they landed, and so a caller cannot shadow them.
create schema if not exists extensions;

create extension if not exists "postgis" with schema extensions;
create extension if not exists "pgcrypto" with schema extensions;

grant usage on schema extensions to authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- Enumerated domains. Enums (rather than free text + CHECK) so that the
-- application, the generated TypeScript types and the database cannot drift.
-- ---------------------------------------------------------------------------

create type public.app_role as enum ('user', 'moderator', 'admin');

create type public.account_status as enum ('active', 'suspended', 'deleted');

create type public.verification_status as enum ('unverified', 'email_verified', 'phone_verified', 'fully_verified');

create type public.activity_type as enum ('running', 'walking', 'cycling', 'travelling', 'group_activity', 'other');

-- Visibility is the single most important privacy control in the product.
--   private          - nothing is shared with anyone, ever.
--   nearby           - contributes an APPROXIMATE, aggregated point to the
--                      community density map. Precise coordinates are never
--                      released to anyone but the owner.
--   group            - approved members of the linked group may read precise
--                      location while the activity is active.
--   trusted_contacts - only trusted contacts with an active share session may
--                      read precise location while the activity is active.
create type public.activity_visibility as enum ('private', 'nearby', 'group', 'trusted_contacts');

create type public.activity_status as enum ('active', 'completed', 'cancelled', 'overdue', 'emergency');

create type public.group_visibility as enum ('public', 'private', 'invite_only');

create type public.group_status as enum ('active', 'archived', 'suspended');

create type public.group_member_role as enum ('owner', 'admin', 'member');

create type public.group_member_status as enum ('pending', 'approved', 'rejected', 'removed', 'left');

-- What a trusted contact is permitted to receive.
--   emergency_only      - location only during an active emergency event.
--   activity_only       - location during an activity the user explicitly
--                         shared with them.
--   always_when_enabled - both of the above, without per-activity selection.
-- No option grants continuous background tracking.
create type public.contact_permission_level as enum ('emergency_only', 'activity_only', 'always_when_enabled');

create type public.share_reason as enum ('activity', 'emergency', 'check_in_missed');

create type public.check_in_status as enum ('scheduled', 'responded_safe', 'responded_help', 'missed', 'cancelled');

create type public.emergency_status as enum ('active', 'resolved_safe', 'resolved_false_alarm', 'cancelled');

create type public.report_category as enum ('harassment', 'threatening_behaviour', 'fake_profile', 'abuse', 'spam', 'suspicious_behaviour', 'other');

create type public.report_status as enum ('open', 'under_review', 'actioned', 'dismissed');

create type public.report_subject_type as enum ('user', 'group', 'activity');

-- ---------------------------------------------------------------------------
-- updated_at trigger helper
-- ---------------------------------------------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.tg_set_updated_at is
  'Generic BEFORE UPDATE trigger that stamps updated_at. Never trusts a client-supplied value.';
