# Architecture

## The layering rule

```
  UI (app/, components/, features/)
        │  props, hooks — never a query
        ▼
  Services (services/)          ← the ONLY layer that talks to the database
        │  RLS-scoped Supabase client
        ▼
  PostgreSQL + RLS (supabase/migrations/)   ← the actual security boundary
```

Two rules hold throughout:

1. **No component builds a query.** Every database call lives in
   `services/*.service.ts`. A component that needs data receives it as a prop
   from a Server Component, or calls a service from a hook.
2. **No layer above the database is a security boundary.** Middleware,
   layout-level session checks and role checks in the UI all exist for a clean
   user experience. If every one of them were deleted, a request could still
   not read another user's data, because Row Level Security is what actually
   refuses it.

The second rule is the important one. It is why `services/` accepts the
caller's own RLS-scoped client and never the service-role client — a service
cannot accidentally grant access it was not meant to, because it has no
elevated privilege to grant.

---

## Directory structure

```
app/                        Next.js App Router
  (auth)/                   sign-in, sign-up, password reset  — unauthenticated
  (app)/                    the signed-in application shell   — bottom nav + emergency
    home/                   dashboard
    map/                    community map
    groups/                 group list, detail, creation
    activity/               start, live view, history
    profile/                profile, privacy, contacts, blocked
  (admin)/admin/            admin dashboard (404s for non-admins)
  api/cron/                 scheduled retention + check-in sweep
  auth/                     OAuth/email callback, sign-out
  shared/[token]/           token-based share link for non-account contacts
  legal/privacy/            the user-facing privacy explanation

components/
  ui/                       primitives: Button, Card, Input, Dialog, States, UserAvatar
  layout/                   AppShell, AppHeader, BottomNavigation, ServiceWorkerRegistration

features/                   feature-scoped components (UI + local state, no queries)
  auth/ activities/ checkin/ contacts/ dashboard/ emergency/
  groups/ map/ privacy/ reports/ admin/ profile/

lib/                        cross-cutting, framework-adjacent
  supabase/                 client / server / admin / middleware clients
  env.ts                    public vs server-secret env access
  errors.ts                 database error → safe user-facing message
  validation.ts             zod schemas for every user input
  geo.ts                    coarsening, bounds clamping, WKT
  constants.ts              product copy and the safety promises
  cron-auth.ts              constant-time scheduled-job authorisation

services/                   data access — the only layer that queries
hooks/                      React hooks (geolocation, countdown, async actions)
types/                      database row and RPC result types
supabase/migrations/        the schema, RLS policies and RPCs
tests/
  unit/                     validation, geo, errors, safety copy
  security/                 service authorisation, permissions, defaults, secrets
  db/                       the SQL security suite (real PostgreSQL + PostGIS)
docs/                       this documentation
scripts/                    icon generation, database test runner
```

---

## Why `features/` and `components/` are separate

`components/ui/` holds primitives that know nothing about Mwhite SafeCircle — a
`Button` does not know what an activity is. `features/` holds components that
encode product rules: `StartActivityForm` knows that choosing group visibility
requires a group, `EmergencyDialog` knows that the confirmation must state what
will *not* happen.

The split matters because the product rules are the part that must not drift.
`PrivacyControl`, for instance, takes `description` as a **required** prop
rather than an optional one — a privacy toggle whose consequence is not spelled
out where it is flipped is a dark pattern, and making it a required prop means
you cannot ship one by accident.

---

## Request flow: starting an activity

```
StartActivityForm (client)
  │  user picks type, visibility, duration, contacts
  │  reads the full consequence text for the chosen visibility
  │
  │  user presses "Start activity"
  ▼
zod (lib/validation.ts)              ← layer 1: shape and business rules
  │  refuses group visibility with no group, a 24h "session", a check-in
  │  scheduled after the activity ends
  ▼
navigator.geolocation                ← the browser prompt fires HERE, not earlier
  ▼
startActivity() (services/)
  │  inserts the activity FIRST, so the database's consent triggers can reject
  │  an unsupported combination before any share or point exists
  ▼
PostgreSQL
  ├─ RLS: activities_insert_own       ← layer 2: you may only create your own
  ├─ trigger tg_activities_enforce_consent
  │     · master switch off  → refuse any sharing visibility
  │     · private            → force contributes_to_density = false
  │     · group              → owner must be an APPROVED member
  └─ unique index: one active activity per user
  ▼
  if share setup then fails, the service cancels the activity
  rather than leaving the user "live" under an unconfirmed sharing mode
```

Every user input crosses three independent layers: zod, then RLS, then the
table's own CHECK constraints and triggers. Client-side validation exists for
helpful error messages; it is never the thing keeping data safe.

---

## Request flow: reading a precise location

This is the path that matters most, so it is worth following end to end.

```
Viewer asks for an activity's position
  ▼
services/activity.service.ts → getLatestLocation()
  │  calls the RPC. It does NOT select from activity_locations, because that
  │  would bypass the single authorisation predicate.
  ▼
public.latest_activity_location(act_id)     [SECURITY DEFINER]
  │
  ├─ can_view_activity_location(act_id, auth.uid())
  │     1. owner?                        → yes
  │     2. viewer's account active?      → no ⇒ deny
  │     3. block in either direction?    → yes ⇒ deny
  │     4. activity still live?          → no ⇒ deny (even for the group)
  │     5. visibility:
  │          private          ⇒ deny
  │          nearby           ⇒ deny (a count is not a coordinate)
  │          group            ⇒ approved member of THAT group
  │          trusted_contacts ⇒ live, unrevoked, unexpired share
  │
  └─ returns ONE row, ordered by recorded_at desc, limit 1
        a full result set would be a movement trail
```

Note what is *not* in `can_view_activity_location`: any reference to
`is_admin`. An administrator has no path to a coordinate. That is asserted by a
test (`tests/security/privacy-defaults.test.ts`) and again against a live
database (`tests/db/03_security.test.sql`).

---

## The two Supabase clients (and the third you should almost never use)

| Client | Where | Privileges |
| --- | --- | --- |
| `lib/supabase/client.ts` | browser | anon key, RLS applies |
| `lib/supabase/server.ts` | Server Components, Route Handlers | anon key + session cookie, **RLS still applies** |
| `lib/supabase/admin.ts` | scheduled jobs only | service role, **bypasses RLS entirely** |

Server rendering grants no extra privilege, which is deliberate: the same
policies apply whether a query starts in the browser or on the server, so there
is no "server-side path" where a rule quietly does not hold.

`admin.ts` carries `import 'server-only'`, so importing it from a client
component fails the build rather than shipping the key. It is used in exactly
two places — the location purge and the missed check-in sweep — and even there
it never reads a coordinate; it deletes by expiry.

---

## Where each product rule is enforced

| Rule | Enforced by |
| --- | --- |
| Location sharing off by default | `profiles.location_sharing_enabled default false` |
| No prompt during ordinary browsing | `useGeolocation` reads the Permissions API, never probes with `getCurrentPosition`; tested in `tests/security/location-permission.test.tsx` |
| Sharing needs the master switch on | `tg_activities_enforce_consent`, `tg_activity_locations_guard` |
| Strangers never see a coordinate | `can_view_activity_location` + `activity_locations_select_authorised` |
| Group location needs approved membership | `is_group_member()` requires `status = 'approved'` |
| Trusted-contact access is revocable and expires | `has_active_trusted_share()` checks `revoked_at` and `expires_at` on every call |
| Ended activity exposes nothing | `end_activity()` deletes the points in the same transaction |
| No movement trails | `latest_activity_location` returns `limit 1`; there is no history endpoint |
| Community map shows counts only | `community_activity_density` aggregates and applies a k-anonymity threshold |
| Home/routine not inferable | Destination is a text label; coordinates are grid-snapped before aggregation |
| Blocked users cannot interact | `is_blocked_between()` in every relationship policy; `tg_user_blocks_revoke_shares` cuts live shares instantly |
| No privilege escalation | `tg_profiles_guard_privileged_columns`, `tg_group_members_guard` |
| Admins cannot see locations | No admin policy on `activities` or `activity_locations`; admin RPCs return no geography |
| Every privileged action logged | `record_audit_event()` takes the actor from the session, not the arguments |
| Audit log cannot be rewritten | No INSERT/UPDATE/DELETE policy + an append-only trigger |
| No user enumeration | No search endpoint; `public_profiles` requires a shared group |

---

## Error handling

`lib/errors.ts` maps every database failure to a stable code and a plain-English
message. The raw error is logged server-side; the user sees the mapped message.

The rule is absolute: no table name, constraint name, stack frame, hostname,
port or internal ID reaches the UI. `tests/unit/errors.test.ts` asserts this
against a list of realistically leaky errors.

`serialiseError()` is the API boundary equivalent: it produces
`{ error: { code, message } }` and nothing else.

---

## Progressive Web App

- `public/manifest.webmanifest` — installable, standalone, with shortcuts to
  "Start a safe activity" and the map.
- `public/sw.js` — caches the application shell and content-hashed build output.
  It explicitly **does not** cache API responses, cross-origin requests, auth
  callbacks or share links. A cached roster or position could be hours stale,
  and stale safety information is more dangerous than an honest offline page.
- `app/offline/page.tsx` — says plainly that live information is unavailable and
  points the user at their local emergency number.

Background location is not available to a service worker, and browsers throttle
geolocation for hidden pages. Mwhite SafeCircle stops sending rather than implying
continuity. The native-app path for genuine background tracking is described in
[LOCATION_MODEL.md](./LOCATION_MODEL.md#the-background-location-limitation).
