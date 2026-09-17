# Database

PostgreSQL 15+ with PostGIS. Every table has Row Level Security enabled and
deny-by-default policies; see [SECURITY.md](./SECURITY.md) for the policies
themselves.

## Migrations

| File | Contents |
| --- | --- |
| `…000001_extensions_and_enums.sql` | PostGIS, pgcrypto, every enum, `tg_set_updated_at` |
| `…000002_profiles.sql` | `profiles`, auth-user provisioning, privilege-escalation guard |
| `…000003_blocks.sql` | `user_blocks`, `is_blocked_between`, `is_admin`, `is_active_account` |
| `…000004_groups.sql` | `groups`, `group_members`, membership helpers |
| `…000005_activities.sql` | `activities` and its consent triggers |
| `…000006_trusted_contacts.sql` | `emergency_contacts`, `trusted_location_shares` |
| `…000007_activity_locations.sql` | `activity_locations`, `coarsen_point`, `can_view_activity_location` |
| `…000008_checkins_and_emergency.sql` | `check_ins`, `emergency_events` |
| `…000009_reports_and_audit.sql` | `reports`, `audit_logs`, `record_audit_event` |
| `…000010_rls.sql` | Every RLS policy and the `public_profiles` view |
| `…000011_membership_guards.sql` | Membership integrity, ownership transfer, block cascade |
| `…000012_community_map.sql` | Aggregate map RPCs with k-anonymity |
| `…000013_activity_rpcs.sql` | `end_activity`, `open_trusted_shares`, share-token read |
| `…000014_admin_rpcs.sql` | Admin metrics and moderation, all audited |
| `…000015_retention.sql` | Purge and check-in sweep (service_role only) |

Each file begins with `set search_path = public, extensions;` so PostGIS and
pgcrypto resolve whether they are installed in `public` (plain PostgreSQL) or
`extensions` (Supabase's default). Every `SECURITY DEFINER` function pins the
same search path so a caller cannot shadow a table or function name.

---

## Entity relationships

```
auth.users ──1:1──> profiles
                      │
    ┌─────────────────┼──────────────────┬───────────────────┐
    │                 │                  │                   │
 activities        groups          emergency_contacts    user_blocks
    │                 │                  │
    │            group_members            │
    │                                     │
    ├──> activity_locations  (precise, expiring, append-only)
    ├──> check_ins
    ├──> emergency_events ──┐
    └──> trusted_location_shares <──┘   (the grant that makes a point readable)

reports ──> profiles / groups / activities
audit_logs (append-only, no foreign-key cascade from deletes)
```

---

## Tables

### `profiles`

One row per auth user, created automatically by a trigger on `auth.users`.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | FK to `auth.users(id)`, cascade delete |
| `display_name` | `text` | 2–60 chars. What other members see |
| `email`, `phone` | `text` | **Private.** Never exposed to another user |
| `avatar_url` | `text` | Must be `https://` |
| `approximate_area` | `text` | Coarse label only. A street address here is a privacy violation |
| `verification_status` | enum | Synced from Supabase Auth confirmations |
| `role` | enum | `user` \| `moderator` \| `admin`. Not self-writable |
| `account_status` | enum | `active` \| `suspended` \| `deleted` |
| `location_sharing_enabled` | `boolean` | **default false.** The master switch |
| `discoverable_in_groups` | `boolean` | default true |
| `default_activity_visibility` | enum | **default `private`** |

**Phone format** is constrained to E.164 (`^\+[1-9][0-9]{6,14}$`) at the
database level, matching `phoneSchema` in `lib/validation.ts`.

Two triggers matter:

- `tg_profiles_guard_privileged_columns` — RLS lets a user update their own
  row, which without this would let them set `role = 'admin'` or lift their own
  suspension. The trigger reverts `role`, `account_status`, `suspended_*`,
  `verification_status`, `id` and `created_at` for any non-admin actor.
- `tg_handle_new_auth_user` / `tg_sync_auth_verification` — provision the
  profile and keep verification state in step with Auth.

### `activities`

The unit of consent. Location may only be recorded in the context of an
activity the user started, for as long as it is running.

| Column | Notes |
| --- | --- |
| `visibility` | `private` \| `nearby` \| `group` \| `trusted_contacts` |
| `status` | `active` \| `completed` \| `cancelled` \| `overdue` \| `emergency` |
| `destination` | **A text label, not coordinates.** A stored destination is a de-facto home address |
| `expected_end_time` | `CHECK` ≤ `start_time + 24 hours` |
| `contributes_to_density` | Opt-in to the community count. Forced false for private activities and when the master switch is off |
| `approx_location` | `geography(Point,4326)`, grid-snapped. **The only geography the map reads** |

Constraints and indexes worth knowing:

- `activities_max_duration` — a session that runs for a day is tracking, not a
  session.
- `activities_group_required_for_group_visibility` — group visibility with no
  group is not a valid state.
- `activities_one_active_per_user` — partial unique index over
  `status in ('active','emergency','overdue')`. Two concurrent sessions would
  double-count on the map and make check-in state ambiguous.
- `activities_density_gix` — partial GiST index on `approx_location` restricted
  to active, opted-in rows: exactly the map query's shape.

`tg_activities_enforce_consent` refuses a sharing visibility while the master
switch is off, forces `contributes_to_density = false` for private activities,
requires approved group membership for group visibility, and — on transition
out of `active` — stamps `ended_at` and clears the coarse point.

### `activity_locations`

The most sensitive table in the system.

| Column | Notes |
| --- | --- |
| `activity_id` | FK, cascade delete |
| `user_id` | **Denormalised**, so a policy can check ownership without joining `activities` (which is itself RLS-filtered) |
| `location` | `geography(Point,4326)` |
| `accuracy`, `heading`, `speed` | Range-checked |
| `recorded_at`, `expires_at` | `CHECK expires_at > recorded_at` |

Defences, in layers:

1. **Append-only.** `tg_activity_locations_no_update` raises on any UPDATE, and
   there is no UPDATE policy at all — so a client's update matches zero rows and
   even a service-role connection hits the trigger. Rewriting history would let
   someone forge a route and would break the expiry guarantee.
2. **Derived fields.** `tg_activity_locations_guard` overwrites `user_id` from
   the parent activity and clamps `expires_at` to
   `least(requested, activity end + 1h, now + 24h)` — a tampered request cannot
   extend retention or attribute a point to someone else.
3. **Consent re-checked on write.** The activity must be live and the owner's
   master switch on.
4. **Expiry enforced on read.** RLS refuses `expires_at <= now()` even for the
   owner.
5. **Purged.** `purge_expired_location_data()` physically deletes expired rows.

Indexes: `(activity_id, recorded_at desc)` for the latest-point query,
`(expires_at)` for the purge, and a GiST index on `location`.

### `emergency_contacts` and `trusted_location_shares`

`emergency_contacts` is the user's own list of trusted contacts. Rows are
private to their owner — **not even administrators can read them**, because they
are third parties' phone numbers, not the account holder's data.

`trusted_location_shares` is the *session* record: the time-boxed, revocable
grant that is the only thing making a precise coordinate readable by someone
else.

| Column | Notes |
| --- | --- |
| `recipient_user_id` | Set when the contact has a SafeCircle account. The column RLS matches on |
| `token_hash` | SHA-256 of a link token for contacts without an account. The raw token is shown to the owner once and never stored |
| `expires_at` | `CHECK` ≤ `granted_at + 24 hours` |
| `revoked_at` | Checked on every authorisation call, so revocation is immediate |

`has_active_trusted_share()` is the single predicate: unrevoked, within window,
matching recipient.

### `groups` and `group_members`

Only `status = 'approved'` confers any access. `tg_group_members_guard` is what
stops the obvious escalations:

- A self-service join is forced to `pending` when the group requires approval,
  and to `role = 'member'` always.
- A member may only change their own status to `left`; a role change smuggled
  into the same UPDATE is silently reverted.
- `owner` is never assignable through the member list — ownership transfers by
  updating `groups.owner_id`, which has its own trigger.
- An invite-only group refuses self-service join requests outright.

`groups.member_count` is maintained by a trigger rather than recounted per read.

### `check_ins` and `emergency_events`

`check_ins` has a partial unique index ensuring at most one `scheduled` prompt
per activity — a stack of overlapping prompts would make "did they respond?"
unanswerable.

`emergency_events.emergency_services_contacted` defaults to `false` and
`tg_emergency_events_guard` forces it to `false` on insert and preserves the old
value on update whenever `auth.uid()` is set. **A client cannot claim that
emergency services were contacted.** Only a real, verified integration —
running without a user session — could ever set it.

`location_available` is derived from whether a point was actually stored, not
from anything the client asserts.

### `reports` and `user_blocks`

`tg_reports_guard` sets `reporter_id` from the session, forces a new report to
`open`, strips client-supplied moderation fields, rate-limits to 10 reports per
hour, and refuses a duplicate open report against the same subject.

Blocking is directional in storage and bidirectional in effect.
`tg_user_blocks_revoke_shares` revokes any live share between the two parties
and unlinks the contact record the moment the block lands — there is no window
in which a blocked person still has a feed.

### `audit_logs`

Append-only: no INSERT, UPDATE or DELETE policy exists for any client role, and
`tg_audit_logs_append_only` raises for privileged connections too.

Writes go through `record_audit_event()`, which is `SECURITY DEFINER` and takes
the actor from `auth.uid()` rather than the argument list — so an actor cannot
forge an entry attributed to someone else.

`audit_logs_metadata_no_secrets` is a CHECK constraint that **rejects** metadata
containing any of: `password`, `token`, `access_token`, `refresh_token`,
`service_role_key`, `latitude`, `longitude`, `location`, `coordinates`, `email`,
`phone`. Logging is a common way for sensitive data to escape a well-designed
system; this makes the common mistake impossible rather than discouraged.

---

## Functions

### Authorisation helpers (`SECURITY DEFINER`)

`is_blocked_between`, `is_admin`, `is_moderator_or_admin`, `is_active_account`,
`is_group_member`, `is_group_admin`, `shares_group_with`,
`has_active_trusted_share`, `can_view_activity_location`.

They are `SECURITY DEFINER` because they are called from inside RLS policies: if
they ran as the caller they would re-trigger the very policies that invoke them
and recurse.

### Community map

`community_activity_density(bbox, types)` returns `(cell_lng, cell_lat,
activity_type, activity_count)`. It:

- reads `activities.approx_location` (already grid-snapped) and never
  `activity_locations`;
- requires `contributes_to_density`, a live activity, a point updated within 30
  minutes, and no block between the parties;
- groups by cell and applies `having count(*) >= community_min_cell_count()`
  (currently 3);
- refuses a bounding box wider than 1.5° and caps the result at 500 cells.

`community_activity_summary(lng, lat, radius)` produces the "14 runners nearby"
counts, clamps the radius to 500–25 000 m, and applies the same threshold to the
total so a single nearby person cannot be inferred.

### Transactional operations

`end_activity(act_id, status)` — ends the activity, revokes every outstanding
share, cancels the scheduled check-in and **deletes the precise points**, all in
one transaction. Doing this client-side could leave shares live if the tab
closed midway.

`open_trusted_shares(...)` — creates grants for contacts whose permission level
covers the reason, generates a 32-byte token for contacts without an account,
stores only its SHA-256, and returns the raw token to the owner once.

`location_by_share_token(token)` — the one function `anon` may call. Matches by
hash, checks revocation and expiry, returns one point.

### Scheduled jobs (`service_role` only)

`purge_expired_location_data()` and `sweep_missed_check_ins(grace)` are revoked
from `public`, `anon` **and** `authenticated`, so they are unreachable from a
browser session. Both write an audit entry with counts only.

---

## Index summary

| Purpose | Index |
| --- | --- |
| Activity status | `activities_status_idx` (partial, `status = 'active'`) |
| Activity type | `activities_type_idx` |
| Expiration sweep | `activities_expected_end_idx`, `activity_locations_expiry_idx`, `trusted_shares_expiry_sweep_idx`, `check_ins_due_idx` |
| Geographic (map) | `activities_density_gix` (partial GiST) |
| Geographic (points) | `activity_locations_gix` (GiST) |
| Group membership | `group_members_group_status_idx`, `group_members_user_status_idx`, `group_members_pending_idx` |
| Reports | `reports_status_idx`, `reports_open_idx`, `reports_reporter_idx` |
| Emergency status | `emergency_events_active_idx` (partial), `emergency_events_one_active_per_user` |
| Share lookup | `trusted_shares_recipient_active_idx`, `trusted_shares_token_hash_idx` (unique) |
| Audit | `audit_logs_created_idx`, `audit_logs_actor_idx`, `audit_logs_action_idx` |

Partial indexes are used wherever the query always carries the same predicate —
the map only ever looks at active, opted-in rows, so indexing the rest is waste.
