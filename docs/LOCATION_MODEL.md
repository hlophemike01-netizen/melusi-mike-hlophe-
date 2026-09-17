# The location model

This is the heart of the product. If you read one document, read this one.

---

## Two kinds of location, kept apart

Mwhite SafeCircle stores location in exactly two places, and they never mix:

| | `activity_locations.location` | `activities.approx_location` |
| --- | --- | --- |
| Precision | Exact GPS | Grid-snapped to ~1.1 km |
| Purpose | Share with authorised people | Feed the aggregate community map |
| Who can read it | Owner + whoever visibility authorises | Nobody individually — only counts |
| Lifetime | Expires per row; deleted when the activity ends | Cleared when the activity ends; stale after 30 min |
| Written by | The browser, while an activity runs | A trigger, derived from the precise point |

The separation is the architectural guarantee. The community map code path
**cannot** reach a precise coordinate, because it reads a different column on a
different table. That is asserted twice: once by reading the SQL
(`tests/security/privacy-defaults.test.ts` — the density function never
mentions `activity_locations`) and once against a live database.

---

## Lifecycle

```
1. ACCOUNT CREATED
   location_sharing_enabled = false
   Nothing is collected. The browser is never asked for a position.

2. USER TURNS THE MASTER SWITCH ON
   Still nothing collected. This only unlocks the sharing options.

3. USER STARTS AN ACTIVITY
   They pick a visibility and read its full consequence.
   ── the browser permission prompt fires HERE ──
   The activity row is created first, so the database's consent triggers can
   reject an unsupported combination before any grant or point exists.

4. WHILE THE ACTIVITY RUNS
   A point is appended about every 30 seconds.
     · user_id derived from the activity, never from the request
     · expires_at clamped to least(requested, end + 1h, now + 24h)
     · if the user opted into the community count, a trigger also writes a
       grid-snapped point to activities.approx_location

5. READS
   Owner            → always (subject to per-row expiry)
   Group member     → only if approved, only while live
   Trusted contact  → only with an unrevoked, unexpired share
   Stranger / admin → never
   Everyone authorised gets ONE point. There is no series endpoint.

6. ACTIVITY ENDS  (user action, or the sweep closes it)
   end_activity() in a single transaction:
     · status → completed/cancelled
     · every outstanding share revoked
     · the scheduled check-in cancelled
     · the precise points DELETED
     · approx_location cleared

7. PURGE (every 15 minutes)
   Anything expired or orphaned is physically deleted.
```

---

## When permission is requested

> Mwhite SafeCircle must never ask for location during ordinary browsing.

`useGeolocation` reads permission state through
`navigator.permissions.query({ name: 'geolocation' })`, which never prompts and
never returns a position. It does **not** use the common shortcut of "just call
`getCurrentPosition` and see what happens" — that shortcut prompts.

`navigator.geolocation.getCurrentPosition` and `watchPosition` are only reached
from `requestOnce()` and `startWatching()`, which are only called from an
explicit user action:

| Action | Prompt? |
| --- | --- |
| Opening the app, dashboard, groups, profile | No |
| Opening the map | No — cells load for the default viewport |
| Pressing "Show nearby activity" | Yes |
| Pressing "Find me" on the map | Yes |
| Pressing "Start activity" with a sharing visibility | Yes |
| Confirming emergency mode | Yes |

`tests/security/location-permission.test.tsx` asserts this: mounting the hook
calls neither function, **even when permission is already granted** — an
existing grant is not consent to read a position unasked.

Declining is a supported path, not an error. The app says so: *"Location
permission was declined. You can still use Mwhite SafeCircle — location sharing is
optional."*

---

## Precision reduction

`coarsen_point(pt, grid = 0.01)` rounds longitude and latitude to a 0.01° grid,
roughly 1.1 km. `lib/geo.ts` mirrors the same maths so the client can preview
exactly what a "nearby" activity will contribute.

**Why a grid and not random jitter.** Jitter is the more common choice and it is
weaker. Random offsets are zero-mean, so given repeated samples of the same
person their average converges on the true position — an observer who can watch
a cell over time can de-noise it. Grid snapping is deterministic: every reading
inside a cell maps to the same output, so there is nothing to average away.
`tests/unit/geo.test.ts` shows 200 nearby readings collapsing to one cell.

The reported cell corner is also not a claim about where anyone is; it is the
identity of a bucket.

---

## k-anonymity

`community_min_cell_count()` returns **3**. A cell representing fewer than three
activities is not returned at all — so "one runner here" can never be rendered,
and a count can never be narrowed to a person.

The same threshold applies to the radius summary, so a total below it reports as
zero rather than as "1". Additional protections on the map feed:

- only activities whose owner opted in are counted;
- a point not refreshed within 30 minutes is dropped, rather than implying
  someone is still there;
- bounding boxes wider than 1.5° (~165 km) are refused, and results are capped
  at 500 cells, so the feed cannot be walked to assemble a national picture;
- activities involving a blocked party are excluded from that viewer's counts.

---

## Authorisation, in one place

`can_view_activity_location(activity_id, viewer)` is the single predicate. Every
read path goes through it — the RLS policy, `latest_activity_location`, and
nothing else. If a rule is not expressed there, it does not exist.

```
1. viewer is the owner                      → allow
2. viewer's account is not active           → deny
3. a block exists in either direction       → deny
4. the activity is not live                 → deny   (even for group members)
5. visibility:
     private           → deny
     nearby            → deny   (a count is not a coordinate)
     group             → allow if approved member of THAT group
     trusted_contacts  → allow if a live, unrevoked, unexpired share exists
```

`is_admin` appears nowhere in it. That is the point, and it is asserted by a
test that would fail if anyone added it.

---

## Trusted-contact shares

A share is a **session**, not a standing permission:

- time-boxed, capped at 24 hours by a CHECK constraint;
- revocable, and revocation takes effect on the very next read because
  `has_active_trusted_share()` re-checks `revoked_at` every call;
- scoped to one activity or one emergency event;
- automatically revoked when the activity ends, when the owner is suspended, or
  when either party blocks the other.

For contacts **with** a Mwhite SafeCircle account, `recipient_user_id` is matched by
RLS directly.

For contacts **without** one, `open_trusted_shares()` generates a 32-byte
token, stores only its SHA-256, and returns the raw token to the owner exactly
once. The contact opens `/shared/<token>`, which calls
`location_by_share_token()` — the one function `anon` may execute. It returns a
single point and nothing enumerable, the page is `noindex`, and the lookup runs
client-side so the token does not land in server request logs.

This is a bearer credential and is documented as such in
[SECURITY.md](./SECURITY.md#known-limitations). The mitigations are the short
window, hashing at rest, one-time display and instant revocation.

---

## The background location limitation

**Continuous background location does not work reliably in a browser, and
Mwhite SafeCircle does not claim otherwise.**

What actually happens:

| Situation | Behaviour |
| --- | --- |
| App open and visible | Updates roughly every 30 seconds |
| Tab backgrounded | Browsers throttle or suspend geolocation |
| Screen locked | Updates stop on essentially every mobile browser |
| Installed PWA, backgrounded | Same — installation does not change this |
| App closed | No updates |

Service workers cannot access geolocation at all. The Background Geolocation API
is not available across the browsers this product must support.

**How Mwhite SafeCircle responds.** `useLocationBroadcast` listens for
`visibilitychange` and **stops sending** when the page is hidden, rather than
letting a stale point sit there looking live. The live activity screen shows
when the last point was sent, and `SAFETY_COPY.backgroundLimitation` appears on
the start screen, the live screen, the landing page and the privacy explainer:

> "Location updates pause when this app is closed or your screen is locked. Web
> browsers do not allow continuous background location."

A stale position presented as current is worse than an honest gap — someone
might act on it.

### The native path

The architecture is already shaped for a native app to provide this without a
redesign:

1. **The API is transport-agnostic.** A native client inserts into
   `activity_locations` through the same PostgREST endpoint with the same user
   JWT, and gets the same RLS treatment. No new server-side authorisation is
   needed.
2. **Consent is modelled in the database, not the client.** The master switch,
   visibility rules and expiry clamping are triggers. A native client cannot
   grant itself more than the web client has.
3. **Retention is enforced server-side.** Expiry clamping and the purge job
   apply identically to points from any client.
4. **What a native app adds:** an OS background-location permission (which is a
   separate, stronger consent and must be requested separately), a foreground
   service or significant-location-change subscription, and an ongoing
   notification while tracking — required by Android and good practice anyway.
5. **What must not change:** background permission must remain per-activity, not
   a standing grant. A native app that tracks continuously in the background is
   the surveillance product this one refuses to be.

---

## Data flow diagram

```
┌──────────────┐
│   Browser    │
│              │  permission granted by explicit user action only
│ geolocation  │
└──────┬───────┘
       │ { lat, lng, accuracy }        ← nothing else; no user_id, no expiry
       ▼
┌────────────────────────────────────────────────────────────────┐
│ recordLocation()                                               │
│  · zod-validates the reading                                   │
│  · serialises to SRID=4326 WKT                                 │
└──────┬─────────────────────────────────────────────────────────┘
       ▼
┌────────────────────────────────────────────────────────────────┐
│ RLS: activity_locations_insert_own                             │
│ trigger tg_activity_locations_guard                            │
│   · user_id  ← derived from the activity                       │
│   · expires_at ← clamped server-side                           │
│   · refuses if the activity is not live or sharing is off      │
│   · if opted in: activities.approx_location ← coarsen_point()  │
└──────┬──────────────────────────────────┬──────────────────────┘
       │ precise                           │ coarse
       ▼                                   ▼
┌────────────────────┐            ┌──────────────────────────────┐
│ activity_locations │            │ activities.approx_location   │
│ append-only        │            │ ~1.1km grid                  │
│ expires per row    │            └──────────┬───────────────────┘
└────────┬───────────┘                       │
         │                                   ▼
         │                        ┌──────────────────────────────┐
         │                        │ community_activity_density() │
         │                        │  · aggregates to counts      │
         │                        │  · suppresses cells < 3      │
         │                        │  · refuses huge bboxes       │
         │                        └──────────┬───────────────────┘
         ▼                                   ▼
┌────────────────────────────┐    ┌──────────────────────────────┐
│ can_view_activity_location │    │  "14 runners nearby"         │
│  owner / approved member / │    │  every signed-in user        │
│  live trusted share ONLY   │    └──────────────────────────────┘
│  → exactly ONE point       │
└────────────────────────────┘
```
