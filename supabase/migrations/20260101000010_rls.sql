-- ============================================================================
-- Mwhite SafeCircle 0010 — Row Level Security
--
-- Every table below is RLS-enabled with an explicit deny-by-default posture:
-- if no policy matches, the row is invisible. Operations with no policy at all
-- (e.g. DELETE on audit_logs) are impossible for every non-superuser role.
--
-- `anon` is stripped of access to every table. Unauthenticated users have no
-- read surface whatsoever.
-- ============================================================================

-- Resolve PostGIS/pgcrypto wherever they are installed for the duration of
-- this migration script.
set search_path = public, extensions;

alter table public.profiles                enable row level security;
alter table public.user_blocks             enable row level security;
alter table public.groups                  enable row level security;
alter table public.group_members           enable row level security;
alter table public.activities              enable row level security;
alter table public.activity_locations      enable row level security;
alter table public.emergency_contacts      enable row level security;
alter table public.trusted_location_shares enable row level security;
alter table public.check_ins               enable row level security;
alter table public.emergency_events        enable row level security;
alter table public.reports                 enable row level security;
alter table public.audit_logs              enable row level security;

revoke all on public.profiles, public.user_blocks, public.groups, public.group_members,
  public.activities, public.activity_locations, public.emergency_contacts,
  public.trusted_location_shares, public.check_ins, public.emergency_events,
  public.reports, public.audit_logs
  from anon;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

-- A user reads their own full profile (including email/phone). Nobody else
-- reaches this table directly; other users go through `public_profiles`.
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

-- Moderators and admins may read profiles for moderation. This is a privileged
-- action and every use in the app writes an audit entry.
create policy profiles_select_moderator on public.profiles
  for select to authenticated
  using (public.is_moderator_or_admin((select auth.uid())));

create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

-- Column-level protection (role, account_status, verification_status) is
-- enforced by tg_profiles_guard_privileged_columns, not by this policy.
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (public.is_admin((select auth.uid())))
  with check (public.is_admin((select auth.uid())));

-- ---------------------------------------------------------------------------
-- public_profiles — the ONLY way one user sees another user's details.
--
-- A security-definer (non-invoker) view, so the WHERE clause below is the
-- entire gate. security_barrier stops a cheap user-supplied function from
-- being pushed down ahead of it and leaking rows through side effects.
-- ---------------------------------------------------------------------------
create view public.public_profiles
  with (security_barrier = true)
as
select
  p.id,
  p.display_name,
  p.avatar_url,
  p.verification_status,
  p.approximate_area,
  p.created_at
from public.profiles p
where
  p.account_status = 'active'
  and auth.uid() is not null
  and not public.is_blocked_between(p.id, auth.uid())
  and (
    p.id = auth.uid()
    -- Discoverable only to people you actually share a group with. There is
    -- deliberately no "search all users" surface — that is user enumeration.
    or (p.discoverable_in_groups and public.shares_group_with(p.id, auth.uid()))
    or public.is_moderator_or_admin(auth.uid())
  );

comment on view public.public_profiles is
  'Safe projection of profiles: no email, no phone, no role. Visible only between users who share a group.';

revoke all on public.public_profiles from anon;
grant select on public.public_profiles to authenticated;

-- ---------------------------------------------------------------------------
-- user_blocks
--
-- Only the blocker can see the block. Telling someone they have been blocked
-- invites retaliation.
-- ---------------------------------------------------------------------------
create policy user_blocks_select_own on public.user_blocks
  for select to authenticated
  using (blocker_id = (select auth.uid()) or public.is_moderator_or_admin((select auth.uid())));

create policy user_blocks_insert_own on public.user_blocks
  for insert to authenticated
  with check (blocker_id = (select auth.uid()) and blocker_id <> blocked_id);

create policy user_blocks_delete_own on public.user_blocks
  for delete to authenticated
  using (blocker_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- groups
-- ---------------------------------------------------------------------------
create policy groups_select_visible on public.groups
  for select to authenticated
  using (
    public.is_moderator_or_admin((select auth.uid()))
    or (
      not public.is_blocked_between(owner_id, (select auth.uid()))
      and (
        owner_id = (select auth.uid())
        or public.is_group_member(id, (select auth.uid()))
        or (visibility = 'public' and status = 'active')
      )
    )
  );

create policy groups_insert_own on public.groups
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and public.is_active_account((select auth.uid()))
  );

create policy groups_update_admin on public.groups
  for update to authenticated
  using (
    public.is_group_admin(id, (select auth.uid()))
    or public.is_moderator_or_admin((select auth.uid()))
  )
  with check (
    public.is_group_admin(id, (select auth.uid()))
    or public.is_moderator_or_admin((select auth.uid()))
  );

create policy groups_delete_owner on public.groups
  for delete to authenticated
  using (owner_id = (select auth.uid()) or public.is_admin((select auth.uid())));

-- ---------------------------------------------------------------------------
-- group_members
-- ---------------------------------------------------------------------------
create policy group_members_select on public.group_members
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_group_admin(group_id, (select auth.uid()))
    or (
      status = 'approved'
      and public.is_group_member(group_id, (select auth.uid()))
      and not public.is_blocked_between(user_id, (select auth.uid()))
    )
    or public.is_moderator_or_admin((select auth.uid()))
  );

-- Self-service join request, or an invite issued by a group admin. The
-- resulting role/status is normalised by tg_group_members_guard.
create policy group_members_insert on public.group_members
  for insert to authenticated
  with check (
    public.is_active_account((select auth.uid()))
    and (
      user_id = (select auth.uid())
      or public.is_group_admin(group_id, (select auth.uid()))
    )
  );

create policy group_members_update on public.group_members
  for update to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_group_admin(group_id, (select auth.uid()))
    or public.is_moderator_or_admin((select auth.uid()))
  )
  with check (
    user_id = (select auth.uid())
    or public.is_group_admin(group_id, (select auth.uid()))
    or public.is_moderator_or_admin((select auth.uid()))
  );

create policy group_members_delete on public.group_members
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_group_admin(group_id, (select auth.uid()))
    or public.is_moderator_or_admin((select auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- activities
--
-- Note what is NOT here: there is no admin read policy. An administrator
-- cannot browse who is currently out running. Admin dashboards read aggregate
-- counts through dedicated RPCs instead.
-- ---------------------------------------------------------------------------
create policy activities_select_own on public.activities
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Group members see that a group activity exists (type, times, owner) — the
-- precise coordinates remain governed by activity_locations' own policy.
create policy activities_select_group on public.activities
  for select to authenticated
  using (
    visibility = 'group'
    and group_id is not null
    and status in ('active', 'emergency', 'overdue')
    and public.is_group_member(group_id, (select auth.uid()))
    and not public.is_blocked_between(user_id, (select auth.uid()))
  );

create policy activities_select_trusted on public.activities
  for select to authenticated
  using (
    visibility = 'trusted_contacts'
    and status in ('active', 'emergency', 'overdue')
    and public.has_active_trusted_share(id, (select auth.uid()))
  );

create policy activities_insert_own on public.activities
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_active_account((select auth.uid()))
  );

create policy activities_update_own on public.activities
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy activities_delete_own on public.activities
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- activity_locations — the strictest policy in the schema.
--
-- Reads require BOTH an authorisation decision from
-- can_view_activity_location() AND an unexpired row. There is no admin
-- override and no service-role-free escape hatch.
-- ---------------------------------------------------------------------------
create policy activity_locations_select_authorised on public.activity_locations
  for select to authenticated
  using (
    expires_at > now()
    and public.can_view_activity_location(activity_id, (select auth.uid()))
  );

-- Only the owner of the activity may append points, and only for their own
-- activity. user_id/expires_at are overwritten by the guard trigger anyway.
create policy activity_locations_insert_own on public.activity_locations
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.activities a
      where a.id = activity_id and a.user_id = (select auth.uid())
    )
  );

-- Users may erase their own location history at any time. There is no UPDATE
-- policy: the table is append-only.
create policy activity_locations_delete_own on public.activity_locations
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- emergency_contacts — strictly owner-only. Not even admins read these; they
-- are third parties' phone numbers, not the account holder's data.
-- ---------------------------------------------------------------------------
create policy emergency_contacts_all_own on public.emergency_contacts
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- trusted_location_shares
-- ---------------------------------------------------------------------------
create policy trusted_shares_select on public.trusted_location_shares
  for select to authenticated
  using (
    owner_id = (select auth.uid())
    or (recipient_user_id = (select auth.uid()) and revoked_at is null and expires_at > now())
  );

create policy trusted_shares_insert_own on public.trusted_location_shares
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

-- Revocation is an update by the owner only. A recipient cannot extend or
-- alter their own grant.
create policy trusted_shares_update_own on public.trusted_location_shares
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy trusted_shares_delete_own on public.trusted_location_shares
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- check_ins
-- ---------------------------------------------------------------------------
create policy check_ins_all_own on public.check_ins
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- emergency_events
--
-- Again: no blanket admin SELECT. `triggered_location` is a precise coordinate
-- at a person's worst moment. Admin dashboards use admin_emergency_overview().
-- ---------------------------------------------------------------------------
create policy emergency_events_select_own on public.emergency_events
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy emergency_events_select_recipient on public.emergency_events
  for select to authenticated
  using (
    exists (
      select 1 from public.trusted_location_shares s
      where s.emergency_event_id = emergency_events.id
        and s.recipient_user_id = (select auth.uid())
        and s.revoked_at is null
        and s.expires_at > now()
    )
  );

create policy emergency_events_insert_own on public.emergency_events
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy emergency_events_update_own on public.emergency_events
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- reports
-- ---------------------------------------------------------------------------
create policy reports_select_own_or_moderator on public.reports
  for select to authenticated
  using (
    reporter_id = (select auth.uid())
    or public.is_moderator_or_admin((select auth.uid()))
  );

create policy reports_insert_own on public.reports
  for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and public.is_active_account((select auth.uid()))
  );

-- Only moderators may progress a report. No DELETE policy exists at all —
-- reports are a moderation record and cannot be erased from the client.
create policy reports_update_moderator on public.reports
  for update to authenticated
  using (public.is_moderator_or_admin((select auth.uid())))
  with check (public.is_moderator_or_admin((select auth.uid())));

-- ---------------------------------------------------------------------------
-- audit_logs
--
-- Readable by admins, plus each user may read entries about themselves
-- (transparency). Writes only ever happen through record_audit_event(); there
-- is no INSERT, UPDATE or DELETE policy for any client role.
-- ---------------------------------------------------------------------------
create policy audit_logs_select_admin on public.audit_logs
  for select to authenticated
  using (public.is_admin((select auth.uid())));

create policy audit_logs_select_self on public.audit_logs
  for select to authenticated
  using (
    target_user_id = (select auth.uid())
    or actor_id = (select auth.uid())
  );
