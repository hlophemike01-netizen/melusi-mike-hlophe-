-- ============================================================================
-- Fixtures for the security suite. Runs as superuser (RLS bypassed) so we can
-- construct the world; every assertion afterwards runs as `authenticated`.
-- ============================================================================
set search_path = public, extensions;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.test',   now(), '{"display_name":"Alice"}'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.test',     now(), '{"display_name":"Bob"}'),
  ('33333333-3333-3333-3333-333333333333', 'carol@example.test',   now(), '{"display_name":"Carol"}'),
  ('44444444-4444-4444-4444-444444444444', 'dave@example.test',    now(), '{"display_name":"Dave"}'),
  ('55555555-5555-5555-5555-555555555555', 'mallory@example.test', now(), '{"display_name":"Mallory"}'),
  ('99999999-9999-9999-9999-999999999999', 'admin@example.test',   now(), '{"display_name":"Admin"}');

-- Alice opts in to location sharing. Everyone else keeps the default (off).
update public.profiles set location_sharing_enabled = true, phone = '+27821110001'
  where id = '11111111-1111-1111-1111-111111111111';
update public.profiles set phone = '+27821110003'
  where id = '33333333-3333-3333-3333-333333333333';
update public.profiles set role = 'admin' where id = '99999999-9999-9999-9999-999999999999';

-- A group Alice owns, with Dave approved and Bob not a member.
insert into public.groups (id, name, description, activity_type, owner_id, visibility, requires_approval)
values ('aaaa0000-0000-0000-0000-00000000000a', 'Sunrise Runners',
        'Early morning group runs along the promenade.', 'running',
        '11111111-1111-1111-1111-111111111111', 'public', true);

insert into public.group_members (group_id, user_id, role, status, joined_at)
values ('aaaa0000-0000-0000-0000-00000000000a', '44444444-4444-4444-4444-444444444444',
        'member', 'approved', now());

-- Carol is one of Alice's trusted contacts, and has a SafeCircle account.
insert into public.emergency_contacts (id, owner_id, name, phone, relationship, permission_level, contact_user_id)
values ('cccc0000-0000-0000-0000-00000000000c', '11111111-1111-1111-1111-111111111111',
        'Carol', '+27821110003', 'Sister', 'always_when_enabled',
        '33333333-3333-3333-3333-333333333333');
