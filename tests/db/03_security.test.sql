-- ============================================================================
-- Mwhite SafeCircle — database security suite
--
-- Every assertion runs as the `authenticated` PostgREST role with a forged
-- JWT claim, i.e. exactly what a browser client can do. If a policy is wrong,
-- these fail.
--
-- Run with: npm run test:db
-- ============================================================================
\set ON_ERROR_STOP on
set search_path = public, extensions;

\echo '== Location privacy =================================================='

-- Alice starts a trusted-contacts activity and records a precise point.
select test.act_as('11111111-1111-1111-1111-111111111111');
set role authenticated;

insert into public.activities (id, user_id, activity_type, visibility, expected_end_time, contributes_to_density)
values ('7e510000-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111',
        'running', 'trusted_contacts', now() + interval '1 hour', true);

insert into public.activity_locations (activity_id, user_id, location, accuracy)
values ('7e510000-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111',
        st_setsrid(st_point(18.4241, -33.9249), 4326)::geography, 12.5);

do $$ begin
  perform test.assert(
    (select count(*) from public.activity_locations
     where activity_id = '7e510000-0000-0000-0000-00000000000a') = 1,
    'owner can read their own precise location');
end $$;

-- User A cannot access User B's private location.
reset role; select test.act_as('22222222-2222-2222-2222-222222222222'); set role authenticated;

do $$ begin
  perform test.assert(
    (select count(*) from public.activity_locations) = 0,
    'stranger sees zero rows in activity_locations');
  perform test.assert(
    (select count(*) from public.activities
     where id = '7e510000-0000-0000-0000-00000000000a') = 0,
    'stranger cannot see the activity row either');
  perform test.assert(
    public.can_view_activity_location('7e510000-0000-0000-0000-00000000000a',
                                      '22222222-2222-2222-2222-222222222222') = false,
    'can_view_activity_location denies a stranger');
  perform test.assert_raises(
    $q$ select * from public.latest_activity_location('7e510000-0000-0000-0000-00000000000a') $q$,
    'latest_activity_location refuses a stranger', 'not_authorised');
end $$;

-- A trusted contact with NO active share still sees nothing.
reset role; select test.act_as('33333333-3333-3333-3333-333333333333'); set role authenticated;
do $$ begin
  perform test.assert(
    (select count(*) from public.activity_locations) = 0,
    'trusted contact without an open share sees nothing');
end $$;

-- Alice opens shares.
reset role; select test.act_as('11111111-1111-1111-1111-111111111111'); set role authenticated;
select count(*) as shares_opened from public.open_trusted_shares(
  p_activity_id => '7e510000-0000-0000-0000-00000000000a',
  p_reason => 'activity',
  p_duration_minutes => 60
) \gset

-- Now Carol can see exactly one point.
reset role; select test.act_as('33333333-3333-3333-3333-333333333333'); set role authenticated;
do $$ begin
  perform test.assert(
    (select count(*) from public.activity_locations) = 1,
    'trusted contact WITH an open share sees the point');
  perform test.assert(
    (select count(*) from public.latest_activity_location('7e510000-0000-0000-0000-00000000000a')) = 1,
    'trusted contact can call latest_activity_location');
end $$;

-- ...but Bob still cannot, and cannot borrow Carol's grant.
reset role; select test.act_as('22222222-2222-2222-2222-222222222222'); set role authenticated;
do $$ begin
  perform test.assert(
    (select count(*) from public.activity_locations) = 0,
    'an open share for Carol grants Bob nothing');
end $$;

\echo '== Revocation and expiry ============================================'

reset role; select test.act_as('11111111-1111-1111-1111-111111111111'); set role authenticated;
update public.trusted_location_shares set revoked_at = now()
where activity_id = '7e510000-0000-0000-0000-00000000000a';

reset role; select test.act_as('33333333-3333-3333-3333-333333333333'); set role authenticated;
do $$ begin
  perform test.assert(
    (select count(*) from public.activity_locations) = 0,
    'revoking a share cuts access immediately');
end $$;

-- Re-grant, then age the grant past its expiry.
reset role; select test.act_as('11111111-1111-1111-1111-111111111111'); set role authenticated;
select count(*) from public.open_trusted_shares(
  p_activity_id => '7e510000-0000-0000-0000-00000000000a', p_duration_minutes => 60) \gset expired_

reset role;
update public.trusted_location_shares
set granted_at = now() - interval '3 hours', expires_at = now() - interval '1 hour'
where activity_id = '7e510000-0000-0000-0000-00000000000a' and revoked_at is null;

select test.act_as('33333333-3333-3333-3333-333333333333'); set role authenticated;
do $$ begin
  perform test.assert(
    (select count(*) from public.activity_locations) = 0,
    'an expired share exposes nothing');
  perform test.assert(
    public.has_active_trusted_share('7e510000-0000-0000-0000-00000000000a',
                                    '33333333-3333-3333-3333-333333333333') = false,
    'has_active_trusted_share is false once expired');
end $$;

\echo '== Group visibility ================================================='

reset role; select test.act_as('11111111-1111-1111-1111-111111111111'); set role authenticated;
update public.activities
set visibility = 'group', group_id = 'aaaa0000-0000-0000-0000-00000000000a'
where id = '7e510000-0000-0000-0000-00000000000a';

-- Dave is an approved member: allowed.
reset role; select test.act_as('44444444-4444-4444-4444-444444444444'); set role authenticated;
do $$ begin
  perform test.assert(
    (select count(*) from public.activity_locations) = 1,
    'approved group member can read group-visibility location');
end $$;

-- Bob is not a member: denied.
reset role; select test.act_as('22222222-2222-2222-2222-222222222222'); set role authenticated;
do $$ begin
  perform test.assert(
    (select count(*) from public.activity_locations) = 0,
    'non-member cannot read group-only precise location');
end $$;

-- A pending (unapproved) membership is not a membership.
reset role; select test.act_as('55555555-5555-5555-5555-555555555555'); set role authenticated;
insert into public.group_members (group_id, user_id)
values ('aaaa0000-0000-0000-0000-00000000000a', '55555555-5555-5555-5555-555555555555');
do $$ begin
  perform test.assert(
    (select status from public.group_members
     where group_id = 'aaaa0000-0000-0000-0000-00000000000a'
       and user_id = '55555555-5555-5555-5555-555555555555') = 'pending',
    'self-service join lands in pending, not approved');
  perform test.assert(
    (select count(*) from public.activity_locations) = 0,
    'a pending member cannot read group-only precise location');
  perform test.assert_raises(
    $q$ update public.group_members set status = 'approved'
        where user_id = '55555555-5555-5555-5555-555555555555' $q$,
    'a member cannot approve their own join request', 'members_may_only_leave');
end $$;

-- Leaving is permitted; smuggling a role change into the same UPDATE is not.
-- The guard normalises `role` back rather than erroring, so assert the outcome.
update public.group_members set role = 'admin', status = 'left'
where user_id = '55555555-5555-5555-5555-555555555555';

do $$ begin
  perform test.assert(
    (select role from public.group_members
     where group_id = 'aaaa0000-0000-0000-0000-00000000000a'
       and user_id = '55555555-5555-5555-5555-555555555555') = 'member',
    'a member cannot promote themselves to group admin while leaving');
  perform test.assert(
    (select status from public.group_members
     where group_id = 'aaaa0000-0000-0000-0000-00000000000a'
       and user_id = '55555555-5555-5555-5555-555555555555') = 'left',
    'a member can leave a group');
end $$;

\echo '== Expired / ended activities ======================================='

reset role; select test.act_as('11111111-1111-1111-1111-111111111111'); set role authenticated;
-- Dave could read it a moment ago; ending the activity must close that door.
select public.end_activity('7e510000-0000-0000-0000-00000000000a', 'completed');

reset role; select test.act_as('44444444-4444-4444-4444-444444444444'); set role authenticated;
do $$ begin
  perform test.assert(
    (select count(*) from public.activity_locations) = 0,
    'ending an activity removes precise points for group members');
  perform test.assert(
    public.can_view_activity_location('7e510000-0000-0000-0000-00000000000a',
                                      '44444444-4444-4444-4444-444444444444') = false,
    'a completed activity is never viewable');
end $$;

reset role;
do $$ begin
  perform test.assert(
    (select count(*) from public.activity_locations
     where activity_id = '7e510000-0000-0000-0000-00000000000a') = 0,
    'end_activity physically deleted the precise points');
  perform test.assert(
    (select count(*) from public.trusted_location_shares
     where activity_id = '7e510000-0000-0000-0000-00000000000a' and revoked_at is null) = 0,
    'end_activity revoked every outstanding share');
  perform test.assert(
    (select approx_location from public.activities
     where id = '7e510000-0000-0000-0000-00000000000a') is null,
    'ending an activity clears its coarse community point');
end $$;

-- A row whose own expires_at has passed is invisible even to its owner.
select test.act_as('11111111-1111-1111-1111-111111111111'); set role authenticated;
insert into public.activities (id, user_id, activity_type, visibility, expected_end_time)
values ('7e510000-0000-0000-0000-00000000000b', '11111111-1111-1111-1111-111111111111',
        'walking', 'private', now() + interval '2 hours');
-- Backdated on insert: the table is append-only, so an already-expired row is
-- created rather than mutated after the fact.
insert into public.activity_locations (activity_id, user_id, location, recorded_at, expires_at)
values ('7e510000-0000-0000-0000-00000000000b', '11111111-1111-1111-1111-111111111111',
        st_setsrid(st_point(18.42, -33.92), 4326)::geography,
        now() - interval '3 hours', now() - interval '2 hours');

do $$ begin
  perform test.assert(
    (select count(*) from public.activity_locations
     where activity_id = '7e510000-0000-0000-0000-00000000000b') = 0,
    'an expired point is invisible even to its owner');
end $$;

\echo '== Consent gates ===================================================='

reset role; select test.act_as('22222222-2222-2222-2222-222222222222'); set role authenticated;
do $$ begin
  perform test.assert_raises(
    $q$ insert into public.activities (user_id, activity_type, visibility, expected_end_time)
        values ('22222222-2222-2222-2222-222222222222', 'running', 'nearby', now() + interval '1 hour') $q$,
    'sharing visibility is refused while the master switch is off', 'location_sharing_disabled');
end $$;

insert into public.activities (id, user_id, activity_type, visibility, expected_end_time, contributes_to_density)
values ('7e510000-0000-0000-0000-00000000000c', '22222222-2222-2222-2222-222222222222',
        'walking', 'private', now() + interval '1 hour', true);

do $$ begin
  perform test.assert(
    (select contributes_to_density from public.activities
     where id = '7e510000-0000-0000-0000-00000000000c') = false,
    'a private activity can never contribute to the community map');
  perform test.assert_raises(
    $q$ insert into public.activity_locations (activity_id, user_id, location)
        values ('7e510000-0000-0000-0000-00000000000c', '22222222-2222-2222-2222-222222222222',
                st_setsrid(st_point(18.4, -33.9), 4326)::geography) $q$,
    'no point may be recorded while location sharing is off', 'location_sharing_disabled');
end $$;

-- A client cannot forge someone else's activity or location row.
do $$ begin
  perform test.assert_raises(
    $q$ insert into public.activities (user_id, activity_type, visibility, expected_end_time)
        values ('11111111-1111-1111-1111-111111111111', 'running', 'private', now() + interval '1 hour') $q$,
    'a user cannot create an activity owned by someone else', 'row-level security');
  perform test.assert_raises(
    $q$ insert into public.activity_locations (activity_id, user_id, location)
        values ('7e510000-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222',
                st_setsrid(st_point(18.4, -33.9), 4326)::geography) $q$,
    'a user cannot append a point to another user''s activity', 'row-level security');
end $$;

reset role; select test.act_as('11111111-1111-1111-1111-111111111111'); set role authenticated;
-- A live point to attempt the update against (the earlier ones are gone).
insert into public.activity_locations (activity_id, user_id, location)
values ('7e510000-0000-0000-0000-00000000000b', '11111111-1111-1111-1111-111111111111',
        st_setsrid(st_point(18.4231, -33.9239), 4326)::geography);

do $$ begin
  perform test.assert(
    (select count(*) from public.activity_locations
     where activity_id = '7e510000-0000-0000-0000-00000000000b') = 1,
    'exactly the live point is visible; the expired one is not');
end $$;

-- Two independent layers stop a point being rewritten:
--   1. RLS has no UPDATE policy at all, so a client's UPDATE matches no rows.
update public.activity_locations set accuracy = 1
where activity_id = '7e510000-0000-0000-0000-00000000000b';

do $$ begin
  perform test.assert(
    (select accuracy from public.activity_locations
     where activity_id = '7e510000-0000-0000-0000-00000000000b') is null,
    'no UPDATE policy exists, so a client cannot rewrite a recorded point');
end $$;

--   2. Even a privileged connection that bypasses RLS hits the append-only
--      trigger, so a compromised service key cannot forge a route either.
reset role;
do $$ begin
  perform test.assert_raises(
    $q$ update public.activity_locations set accuracy = 1
        where activity_id = '7e510000-0000-0000-0000-00000000000b' $q$,
    'the append-only trigger stops even a privileged rewrite', 'append_only');
end $$;

select test.act_as('11111111-1111-1111-1111-111111111111'); set role authenticated;

\echo '== Profile privacy =================================================='

reset role; select test.act_as('22222222-2222-2222-2222-222222222222'); set role authenticated;
do $$ begin
  perform test.assert(
    (select count(*) from public.profiles) = 1,
    'a user can only see their own row in profiles');
  perform test.assert(
    (select count(*) from public.profiles
     where id = '11111111-1111-1111-1111-111111111111') = 0,
    'another user''s profile row (with email/phone) is unreachable');
  perform test.assert(
    (select count(*) from public.public_profiles
     where id = '11111111-1111-1111-1111-111111111111') = 0,
    'public_profiles hides a user you share no group with (no enumeration)');
end $$;

-- Dave shares a group with Alice, so he sees her limited profile — and only
-- the safe columns exist on that view at all.
reset role; select test.act_as('44444444-4444-4444-4444-444444444444'); set role authenticated;
do $$ begin
  perform test.assert(
    (select count(*) from public.public_profiles
     where id = '11111111-1111-1111-1111-111111111111') = 1,
    'public_profiles reveals a fellow group member');
  perform test.assert(
    not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'public_profiles'
        and column_name in ('email', 'phone', 'role', 'account_status')),
    'public_profiles exposes no email, phone or role column');
end $$;

\echo '== Privilege escalation ============================================='

reset role; select test.act_as('55555555-5555-5555-5555-555555555555'); set role authenticated;
update public.profiles set role = 'admin', account_status = 'active',
       verification_status = 'fully_verified'
where id = '55555555-5555-5555-5555-555555555555';

do $$ begin
  perform test.assert(
    (select role from public.profiles where id = '55555555-5555-5555-5555-555555555555') = 'user',
    'a user cannot promote themselves to admin');
  -- Set to email_verified by the auth trigger; the attempted self-upgrade to
  -- fully_verified was reverted.
  perform test.assert(
    (select verification_status from public.profiles
     where id = '55555555-5555-5555-5555-555555555555') = 'email_verified',
    'a user cannot self-assert a higher verification status');
  perform test.assert(public.is_admin('55555555-5555-5555-5555-555555555555') = false,
    'is_admin stays false after the attempted escalation');
  perform test.assert_raises(
    $q$ select * from public.admin_dashboard_metrics() $q$,
    'a regular user cannot read admin metrics', 'not_authorised');
  perform test.assert_raises(
    $q$ select public.admin_suspend_user('11111111-1111-1111-1111-111111111111', 'because') $q$,
    'a regular user cannot suspend anyone', 'not_authorised');
  perform test.assert_raises(
    $q$ select * from public.admin_report_queue() $q$,
    'a regular user cannot read the moderation queue', 'not_authorised');
  perform test.assert_raises(
    $q$ select * from public.admin_emergency_overview() $q$,
    'a regular user cannot read the emergency overview', 'not_authorised');
  perform test.assert(
    (select count(*) from public.audit_logs) = 0,
    'a regular user sees no audit entries about other people');
  perform test.assert_raises(
    $q$ insert into public.audit_logs (action, entity_type) values ('fake.event', 'profile') $q$,
    'a user cannot forge an audit entry', 'row-level security');
end $$;

\echo '== Admin boundaries ================================================='

reset role; select test.act_as('99999999-9999-9999-9999-999999999999'); set role authenticated;
do $$ begin
  perform test.assert(
    (select total_users from public.admin_dashboard_metrics()) = 6,
    'admin can read aggregate metrics');
  -- The point of the product: an administrator is not a location operator.
  perform test.assert(
    (select count(*) from public.activity_locations) = 0,
    'an ADMIN cannot browse precise locations');
  perform test.assert(
    (select count(*) from public.activities) = 0,
    'an ADMIN cannot browse live activities');
  perform test.assert(
    (select count(*) from public.emergency_contacts) = 0,
    'an ADMIN cannot read a user''s trusted-contact phone numbers');
  perform test.assert(
    not exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'admin_emergency_overview'
        and pg_get_function_result(p.oid) ilike '%geography%'),
    'admin_emergency_overview returns no geography column');
end $$;

select public.admin_suspend_user('55555555-5555-5555-5555-555555555555', 'Repeated harassment reports');
do $$ begin
  perform test.assert(
    (select account_status from public.profiles
     where id = '55555555-5555-5555-5555-555555555555') = 'suspended',
    'admin can suspend a user');
  perform test.assert(
    (select count(*) from public.audit_logs where action = 'admin.user_suspended') = 1,
    'suspension is written to the audit log');
end $$;

-- The audit log has SELECT policies but no INSERT/UPDATE/DELETE policy, so an
-- admin's attempt matches no rows at all...
update public.audit_logs set action = 'nothing.happened';
delete from public.audit_logs;

do $$ begin
  perform test.assert(
    (select count(*) from public.audit_logs where action = 'admin.user_suspended') = 1,
    'an admin cannot rewrite or delete audit entries through the API');
  perform test.assert(
    (select count(*) from public.audit_logs where action = 'nothing.happened') = 0,
    'the forged action was never written');
end $$;

-- ...and the append-only trigger catches a privileged connection too.
reset role;
do $$ begin
  perform test.assert_raises(
    $q$ update public.audit_logs set action = 'nothing.happened' $q$,
    'the append-only trigger stops a privileged audit rewrite', 'append_only');
  perform test.assert_raises(
    $q$ delete from public.audit_logs $q$,
    'the append-only trigger stops a privileged audit delete', 'append_only');
end $$;

select test.act_as('99999999-9999-9999-9999-999999999999'); set role authenticated;

-- A suspended user loses their read surface.
reset role; select test.act_as('55555555-5555-5555-5555-555555555555'); set role authenticated;
do $$ begin
  perform test.assert(
    public.is_active_account('55555555-5555-5555-5555-555555555555') = false,
    'a suspended account is not active');
  perform test.assert_raises(
    $q$ insert into public.groups (name, owner_id) values ('Evil Group',
        '55555555-5555-5555-5555-555555555555') $q$,
    'a suspended user cannot create a group', 'row-level security');
end $$;

reset role; select test.act_as('99999999-9999-9999-9999-999999999999'); set role authenticated;
select public.admin_restore_user('55555555-5555-5555-5555-555555555555');

\echo '== Blocking ========================================================='

reset role; select test.act_as('11111111-1111-1111-1111-111111111111'); set role authenticated;
-- Only one activity may be live per user, so close the previous one.
select public.end_activity('7e510000-0000-0000-0000-00000000000b', 'completed');

insert into public.activities (id, user_id, activity_type, visibility, group_id, expected_end_time)
values ('7e510000-0000-0000-0000-00000000000d', '11111111-1111-1111-1111-111111111111',
        'running', 'group', 'aaaa0000-0000-0000-0000-00000000000a', now() + interval '1 hour');
insert into public.activity_locations (activity_id, user_id, location)
values ('7e510000-0000-0000-0000-00000000000d', '11111111-1111-1111-1111-111111111111',
        st_setsrid(st_point(18.4241, -33.9249), 4326)::geography);

reset role; select test.act_as('44444444-4444-4444-4444-444444444444'); set role authenticated;
do $$ begin
  perform test.assert((select count(*) from public.activity_locations) = 1,
    'group member can read before the block');
end $$;

reset role; select test.act_as('11111111-1111-1111-1111-111111111111'); set role authenticated;
insert into public.user_blocks (blocker_id, blocked_id)
values ('11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444');

reset role; select test.act_as('44444444-4444-4444-4444-444444444444'); set role authenticated;
do $$ begin
  perform test.assert((select count(*) from public.activity_locations) = 0,
    'blocking revokes group-visibility location access immediately');
  perform test.assert(
    (select count(*) from public.public_profiles
     where id = '11111111-1111-1111-1111-111111111111') = 0,
    'a blocked user cannot see the blocker''s profile');
  perform test.assert(
    (select count(*) from public.user_blocks) = 0,
    'a blocked user is not told that they were blocked');
end $$;

reset role; select test.act_as('11111111-1111-1111-1111-111111111111'); set role authenticated;
delete from public.user_blocks where blocked_id = '44444444-4444-4444-4444-444444444444';

\echo '== Community map aggregation ========================================'

reset role; select test.act_as('11111111-1111-1111-1111-111111111111'); set role authenticated;
do $$ begin
  perform test.assert_raises(
    $q$ select * from public.community_activity_density(-180, -90, 180, 90) $q$,
    'the density feed refuses a world-sized bounding box', 'bounds_too_large');
end $$;

-- Two runners in the same cell is below the k-anonymity threshold of 3.
reset role;
update public.profiles set location_sharing_enabled = true
  where id in ('22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333',
               '44444444-4444-4444-4444-444444444444');
-- Close anything still running so the one-active-activity-per-user rule holds.
update public.activities set status = 'completed'
  where status in ('active', 'overdue', 'emergency');

insert into public.activities (user_id, activity_type, visibility, expected_end_time,
                               contributes_to_density, approx_location, approx_location_updated_at)
values
  ('22222222-2222-2222-2222-222222222222', 'running', 'nearby', now() + interval '1 hour', true,
   public.coarsen_point(st_setsrid(st_point(18.4241, -33.9249), 4326)::geography), now()),
  ('33333333-3333-3333-3333-333333333333', 'running', 'nearby', now() + interval '1 hour', true,
   public.coarsen_point(st_setsrid(st_point(18.4245, -33.9245), 4326)::geography), now());

select test.act_as('99999999-9999-9999-9999-999999999999'); set role authenticated;
do $$ begin
  perform test.assert(
    (select count(*) from public.community_activity_density(18.3, -34.0, 18.6, -33.8)) = 0,
    'a cell with only 2 activities is suppressed (k-anonymity)');
end $$;

reset role;
insert into public.activities (user_id, activity_type, visibility, expected_end_time,
                               contributes_to_density, approx_location, approx_location_updated_at)
values ('44444444-4444-4444-4444-444444444444', 'running', 'nearby', now() + interval '1 hour', true,
        public.coarsen_point(st_setsrid(st_point(18.4239, -33.9247), 4326)::geography), now());

select test.act_as('99999999-9999-9999-9999-999999999999'); set role authenticated;
do $$
declare cell record;
begin
  select * into cell from public.community_activity_density(18.3, -34.0, 18.6, -33.8);
  perform test.assert(cell.activity_count = 3, 'three activities in a cell are reported as a count');
  perform test.assert(
    abs(cell.cell_lng - 18.42) < 0.0001 and abs(cell.cell_lat + 33.92) < 0.0001,
    'the reported point is grid-snapped, not the true coordinate');
  perform test.assert(
    (select count(*) from public.community_activity_density(18.3, -34.0, 18.6, -33.8)) = 1,
    'the feed returns aggregate cells only — no per-user rows');
end $$;

-- A `nearby` activity contributes a count but never a readable coordinate.
do $$ begin
  perform test.assert(
    (select count(*) from public.activity_locations) = 0,
    'nearby visibility never exposes a precise point');
end $$;

\echo '== Reporting ========================================================'

reset role; select test.act_as('22222222-2222-2222-2222-222222222222'); set role authenticated;
insert into public.reports (reporter_id, subject_type, reported_user_id, category, description)
values ('22222222-2222-2222-2222-222222222222', 'user', '55555555-5555-5555-5555-555555555555',
        'harassment', 'Sent repeated unwanted messages after I left the group.');

do $$ begin
  perform test.assert(
    (select status from public.reports limit 1) = 'open',
    'a new report starts in the open state');
  perform test.assert_raises(
    $q$ insert into public.reports (reporter_id, subject_type, reported_user_id, category, description)
        values ('22222222-2222-2222-2222-222222222222', 'user', '55555555-5555-5555-5555-555555555555',
                'harassment', 'Duplicate report about the same person and subject.') $q$,
    'a duplicate open report is refused', 'duplicate_open_report');
  perform test.assert_raises(
    $q$ insert into public.reports (reporter_id, subject_type, reported_user_id, category, description)
        values ('22222222-2222-2222-2222-222222222222', 'user', '22222222-2222-2222-2222-222222222222',
                'spam', 'Reporting myself, which makes no sense.') $q$,
    'self-reporting is refused', 'reports_no_self_report');
end $$;

update public.reports set status = 'dismissed', resolution_note = 'nothing to see here';
do $$ begin
  perform test.assert(
    (select status from public.reports limit 1) = 'open',
    'a reporter cannot dismiss their own report');
end $$;

-- The reported user learns nothing.
reset role; select test.act_as('55555555-5555-5555-5555-555555555555'); set role authenticated;
do $$ begin
  perform test.assert(
    (select count(*) from public.reports) = 0,
    'the reported user cannot see reports filed against them');
end $$;

reset role; select test.act_as('99999999-9999-9999-9999-999999999999'); set role authenticated;
do $$
declare rid uuid;
begin
  select id into rid from public.reports limit 1;
  perform public.admin_review_report(rid, 'actioned', 'Warning issued.');
  perform test.assert(
    (select status from public.reports where id = rid) = 'actioned',
    'a moderator can action a report');
  perform test.assert(
    (select count(*) from public.audit_logs where action = 'admin.report_reviewed') = 1,
    'report review is audited');
end $$;

\echo '== Emergency ========================================================'

reset role; select test.act_as('11111111-1111-1111-1111-111111111111'); set role authenticated;
insert into public.emergency_events (id, user_id, triggered_location, emergency_services_contacted)
values ('e0e00000-0000-0000-0000-00000000000e', '11111111-1111-1111-1111-111111111111',
        st_setsrid(st_point(18.4241, -33.9249), 4326)::geography, true);

do $$ begin
  perform test.assert(
    (select emergency_services_contacted from public.emergency_events
     where id = 'e0e00000-0000-0000-0000-00000000000e') = false,
    'a client cannot claim that emergency services were contacted');
  perform test.assert(
    (select location_available from public.emergency_events
     where id = 'e0e00000-0000-0000-0000-00000000000e') = true,
    'location_available is derived from the stored point, not the client');
end $$;

reset role; select test.act_as('22222222-2222-2222-2222-222222222222'); set role authenticated;
do $$ begin
  perform test.assert(
    (select count(*) from public.emergency_events) = 0,
    'a stranger cannot see someone else''s emergency event');
end $$;

\echo '== Anonymous access ================================================='

reset role; select test.act_as_anon(); set role anon;
do $$ begin
  perform test.assert_raises($q$ select count(*) from public.profiles $q$,
    'anon has no access to profiles', 'permission denied');
  perform test.assert_raises($q$ select count(*) from public.activity_locations $q$,
    'anon has no access to activity_locations', 'permission denied');
  perform test.assert_raises($q$ select count(*) from public.public_profiles $q$,
    'anon has no access to public_profiles', 'permission denied');
  perform test.assert_raises(
    $q$ select * from public.community_activity_density(18.3, -34.0, 18.6, -33.8) $q$,
    'anon cannot read the community map', 'permission denied');
  perform test.assert_raises(
    $q$ select * from public.location_by_share_token(repeat('a', 64)) $q$,
    'an invalid share token yields nothing', 'share_unavailable');
end $$;

reset role;
\echo ''
\echo '===================== ALL DATABASE SECURITY TESTS PASSED ============'
