# Security

## Posture

Row Level Security is the security boundary. Everything above it — middleware,
layout session checks, role checks in the UI — exists for a clean user
experience. If all of it were deleted, a request still could not read another
user's data.

This is not a stylistic preference. It means a bug in a React component, a
forgotten `.eq()` in a service, or a route that fails to redirect cannot become
a data breach on its own.

---

## Threat model

| Threat | Mitigation |
| --- | --- |
| Reading a stranger's location | `can_view_activity_location()` denies every case except owner, approved group member, or live trusted share |
| Harvesting the location table | No policy returns rows a viewer is not authorised for; the map RPC never touches the table; there is no unfiltered endpoint |
| Reconstructing someone's routine | Points expire and are deleted; `latest_activity_location` returns exactly one row; no history endpoint exists |
| Inferring a home address | Destination is a text label, not coordinates; `approximate_area` rejects coordinates and street addresses; map points are grid-snapped |
| Identifying an individual from the map | Grid snapping + a k-anonymity threshold of 3 + aggregate-only results |
| User enumeration | No search endpoint; `public_profiles` requires a shared group; auth errors are deliberately vague |
| Privilege escalation to admin | `tg_profiles_guard_privileged_columns` reverts `role` and `account_status` for non-admin actors |
| Privilege escalation in a group | `tg_group_members_guard` blocks self-approval, self-promotion and owner assignment |
| Stale access after revocation | `has_active_trusted_share()` checks `revoked_at` and `expires_at` on **every** call, not at grant time |
| Access continuing after an activity ends | `end_activity()` deletes the points; the predicate also refuses non-live activities |
| Blocked user retaining access | `tg_user_blocks_revoke_shares` revokes on insert; `is_blocked_between()` in every relationship policy |
| Forged audit entries | `record_audit_event()` takes the actor from the session; no INSERT policy exists |
| Audit tampering | No UPDATE/DELETE policy plus an append-only trigger |
| Service-role key leaking to the browser | `import 'server-only'`, never `NEXT_PUBLIC_`, asserted by `tests/security/secret-handling.test.ts` and by scanning the built bundle |
| Open redirect after authentication | `?next=` must start with `/` and not `//` |
| Timing attack on the cron secret | `timingSafeEqual` |
| SQL injection | PostgREST parameterises everything; no string-built SQL exists in the app |
| XSS | React escapes by default; the one DOM-building site (map markers) uses `textContent` |
| Clickjacking | `X-Frame-Options: DENY` and `frame-ancestors 'none'` |
| Report spam | 10/hour rate limit and a duplicate-open-report guard, both in the database |

---

## Row Level Security policies

Full definitions are in `supabase/migrations/…000010_rls.sql`. The shape:

### `profiles`

- **SELECT** own row only. Moderators and admins may read profiles for
  moderation — a privileged action that the app audits.
- **UPDATE** own row; the privileged-column trigger decides what may actually
  change.
- No DELETE policy.

Other users never read this table. They read **`public_profiles`**, a
security-barrier view exposing `id`, `display_name`, `avatar_url`,
`verification_status`, `approximate_area` and `created_at` — and visible only
between users who share a group, with blocks applied. There is no `email`,
`phone` or `role` column on the view at all, so a mistake cannot leak them.

`anon` is stripped of access to every table. Unauthenticated users have no read
surface whatsoever.

### `activity_locations` — the strictest policy

```sql
create policy activity_locations_select_authorised on public.activity_locations
  for select to authenticated
  using (
    expires_at > now()
    and public.can_view_activity_location(activity_id, (select auth.uid()))
  );
```

Two conditions, both required. There is no admin override and no
service-role-free escape hatch. The table has **no UPDATE policy at all**.

### `activities`

Deliberately absent: an admin SELECT policy. An administrator cannot browse who
is currently out running. Admin dashboards read aggregate counts through
dedicated RPCs instead.

### `emergency_contacts`

Owner-only, for every operation. Not even admins — these are third parties'
phone numbers.

### `emergency_events`

Own events, plus recipients of a live emergency share. No blanket admin SELECT:
`triggered_location` is a precise coordinate at a person's worst moment. Admin
oversight goes through `admin_emergency_overview()`, which returns status,
counts and timing — and no geography column.

### `audit_logs`

SELECT for admins, plus each user may read entries about themselves
(transparency). No write policy of any kind.

---

## Administrators

What an administrator **can** do:

- see aggregate counts (users, activities, groups, reports, emergencies);
- review, action and dismiss reports;
- suspend and restore accounts;
- suspend and restore groups;
- read the audit log;
- see that an emergency event exists, its status, how many contacts were
  alerted and when.

What an administrator **cannot** do:

- see anyone's location, past or present;
- see who is currently on an activity;
- read anyone's trusted contacts or their phone numbers;
- resolve someone else's emergency — only the person who raised it can, because
  marking someone else "safe" is a statement about their wellbeing that nobody
  at Mwhite SafeCircle is in a position to make;
- modify or delete an audit entry.

Suspension is not just a flag: `admin_suspend_user()` ends the account's live
activities, revokes every location share and deletes its stored points, then
writes an audit entry. Every admin RPC re-checks the role server-side; the UI's
role check is a convenience, not the control.

---

## Secrets

| Variable | Exposure |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public — safe **only because RLS is on** |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Public. `pk.*` only, URL-restricted in the Mapbox dashboard |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret.** Bypasses RLS entirely |
| `CRON_SECRET` | **Secret.** Authorises the scheduled endpoints |

Rules enforced in code and asserted by tests:

- `lib/env.ts` separates the two. `serverEnv()` throws immediately if evaluated
  in a browser, so a bad import is a loud error rather than a silent leak.
- `lib/supabase/admin.ts` and `lib/cron-auth.ts` carry `import 'server-only'`,
  so a client import fails the build.
- No client component imports the admin client, `serverEnv`, or the cron helper.
- No source file contains a JWT-shaped or `sk.`-shaped literal.
- `.env.example` contains no filled-in values; every `.env*` variant is
  gitignored.

The service-role key is used in exactly two places — the location purge and the
check-in sweep — and neither reads a coordinate.

---

## HTTP headers

Set in `next.config.ts` for every route:

- **CSP** — `default-src 'self'`; no remote script origins; `connect-src`
  limited to self, the Supabase project (plus `wss:` for Realtime) and Mapbox;
  `frame-ancestors 'none'`; `object-src 'none'`; `base-uri 'self'`.
  `script-src` includes `'unsafe-inline'` and `'unsafe-eval'`, which Next.js
  requires without a nonce-based setup — worth tightening with a nonce
  middleware before a high-risk launch.
- **Permissions-Policy** — `geolocation=(self)`, everything else disabled.
  Geolocation is still gated behind the in-app opt-in before any prompt.
- **HSTS** — two years, `includeSubDomains`, `preload`.
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin`.

---

## Input validation

Three independent layers, in order:

1. **zod** (`lib/validation.ts`) — shape and business rules, for helpful errors.
2. **RLS** — whether the row may be written at all.
3. **CHECK constraints and triggers** — what the row is allowed to say.

Layer 1 is never the thing keeping data safe. The phone-format regex, for
instance, is identical in zod and in the `profiles_phone_format` constraint, so
bypassing the client changes nothing.

`approximateAreaSchema` is worth calling out: it rejects coordinate pairs and
street-address patterns, because that field is shown to other members and is the
most likely place for a home address to end up by accident.

---

## The security test suite

### SQL suite — `npm run test:db`

Applies the **real** migrations to a throwaway PostgreSQL + PostGIS database on
top of a shim that recreates `auth.uid()` and the three PostgREST roles, then
runs every assertion as the `authenticated` role — i.e. with exactly what a
browser client has. 85 assertions, including all five explicitly required
properties:

| Required property | Assertion |
| --- | --- |
| User A cannot access User B's private location | "stranger sees zero rows in activity_locations" |
| A non-member cannot access group-only precise location | "non-member cannot read group-only precise location" |
| Expired activities cannot expose precise coordinates | "ending an activity removes precise points for group members", "an expired point is invisible even to its owner" |
| Regular users cannot access admin functions | "a regular user cannot read admin metrics / suspend anyone / read the moderation queue" |
| Blocked users cannot interact | "blocking revokes group-visibility location access immediately" |

It also asserts that **an administrator** cannot browse locations, activities or
trusted contacts; that revocation and expiry both cut access immediately; that a
member cannot self-approve or self-promote; that a user cannot promote
themselves to admin; that the audit log cannot be rewritten even by an admin or
a privileged connection; that a k-anonymity-suppressed cell returns nothing; and
that `anon` has no access to anything.

Two findings from writing these tests are worth recording, because they show the
layering working: attempting to UPDATE `activity_locations` or `audit_logs` as a
client does not raise — it matches **zero rows**, because no UPDATE policy
exists. The append-only trigger is the second layer, for privileged connections.
Both are now asserted separately.

### TypeScript suite — `npm run test`

138 tests. The security-relevant ones:

- `tests/security/location-permission.test.tsx` — mounting `useGeolocation`
  never calls `getCurrentPosition` or `watchPosition`, even when permission is
  already granted; a watch is always cleared on unmount.
- `tests/security/service-authorisation.test.ts` — services scope queries to the
  signed-in user, read `public_profiles` rather than `profiles` for other
  people, never send a client-supplied `expires_at`, and go through RPCs rather
  than direct table reads for anything authorisation-sensitive.
- `tests/security/privacy-defaults.test.ts` — reads the migration SQL directly
  and asserts the shipped defaults, the absence of an admin escape hatch in the
  location policy, and that the density RPC never references
  `activity_locations`.
- `tests/security/secret-handling.test.ts` — the secret rules listed above.
- `tests/unit/errors.test.ts` — no table name, constraint name, stack frame,
  host or port survives error mapping.

---

## Known limitations

Stated plainly rather than buried:

1. **CSP allows `'unsafe-inline'` and `'unsafe-eval'` for scripts.** Next.js
   requires this without nonce-based middleware. Tighten before a high-risk
   launch.
2. **Rate limiting is partial.** Reports are rate-limited in the database.
   Authentication attempts rely on Supabase Auth's own limits; add an edge rate
   limiter (e.g. Upstash) for sign-in and share-token lookups before launch.
3. **Share-link tokens are bearer credentials.** Anyone holding the URL can see
   the position until it expires or is revoked. This is inherent to sending a
   link to someone without an account; the mitigations are a short window, a
   hashed-at-rest token, one-time display, `noindex`, and instant revocation.
4. **No transport for notifications.** Contacts with an account see alerts
   in-app; everyone else gets a link the user sends themselves. Web Push or an
   SMS provider is the V2 work.
5. **No independent security review yet.** This codebase has not been
   penetration tested.
