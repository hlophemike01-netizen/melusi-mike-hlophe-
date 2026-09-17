# Privacy

Privacy here is an architectural property, not a policy document. Each claim
below points at the code or constraint that makes it true.

## Defaults

| Setting | Default | Where |
| --- | --- | --- |
| Location sharing | **off** | `profiles.location_sharing_enabled default false` |
| Activity visibility | **private** | `activities.visibility default 'private'` |
| Community map contribution | **off** | `activities.contributes_to_density default false` |
| Trusted contact permission | **emergency only** | `emergency_contacts.permission_level default 'emergency_only'` |
| Group visibility | **private** | `groups.visibility default 'private'` |
| Group join | **requires approval** | `groups.requires_approval default true` |
| New membership | **pending** | `group_members.status default 'pending'` |
| Search engine indexing | **off** | `robots: { index: false }` in the root layout |

Asserted by `tests/security/privacy-defaults.test.ts`, which reads the
migration SQL directly — so a default that drifts fails the build.

---

## Data inventory

| Data | Who can read it | Retention |
| --- | --- | --- |
| Email, phone | The owner. Moderators during a review | Life of the account |
| Display name, avatar, area | The owner; members of shared groups | Life of the account |
| Activity metadata | The owner; group members for group activities; authorised trusted contacts | Life of the account (summary only) |
| **Precise coordinates** | The owner; whoever the visibility rules authorise, while live | **Deleted when the activity ends**; expired rows purged every 15 minutes |
| Coarse map point | Aggregated into counts. Nobody reads it individually | Cleared when the activity ends; stale after 30 minutes |
| Trusted contacts | **The owner only.** Not administrators | Until deleted |
| Share grants | Owner and recipient | Revoked/expired rows deleted after 7 days |
| Check-ins | The owner | Life of the account |
| Emergency events | The owner; alerted contacts while the share is live. Admins see status and counts, never location | Life of the account |
| Reports | The reporter; moderators | Retained as a moderation record |
| Audit entries | Admins; each user for entries about themselves | Retained |

---

## The consent chain

A precise coordinate becomes readable by another person only if **every** link
holds:

1. The account's master location switch is on.
2. The user started an activity and chose a sharing visibility.
3. The browser granted location permission at that moment.
4. The activity is still live.
5. The specific viewer satisfies the visibility rule — approved group member,
   or the holder of an unrevoked, unexpired share.
6. Neither party has blocked the other.
7. The individual point has not passed its own `expires_at`.

Break any link and access stops on the next read. There is no cached grant and
no "already authorised" shortcut: `has_active_trusted_share()` re-evaluates
revocation and expiry on every single call.

---

## Retention

- Every `activity_locations` row carries `expires_at`, clamped server-side to
  `least(requested, activity end + 1h, now + 24h)`.
- RLS refuses an expired row **even to its owner**, so expiry is enforced on
  read and not only by the cleanup job.
- `end_activity()` deletes the activity's points in the same transaction that
  ends it. The privacy promise does not wait for a scheduled job.
- `purge_expired_location_data()` runs every 15 minutes and physically deletes
  anything expired or orphaned.
- Revoked and expired share grants are deleted after 7 days.
- The user can delete every stored point at any time from Privacy settings.

**There is no movement history.** Not for other users, not for the owner, not
for administrators. `latest_activity_location` returns `limit 1`, and no
endpoint returns a series.

---

## Coarsening and k-anonymity

The community map reads `activities.approx_location`, never
`activity_locations`. Positions are **grid-snapped** to about 1.1 km by
`coarsen_point()` before they are stored in that column.

A cell is square in degrees, not in metres: about 1.1 km north to south
everywhere, and narrower east to west the further you are from the equator
(roughly 930 m at 33 degrees, 560 m at 60). The narrow edge is the figure to
judge the protection by, since a narrower cell localises someone more precisely.
The interface says "about a kilometre" rather than a computed figure, because
the true number depends on the viewer's latitude, and Mwhite SafeCircle will not
ask for someone's location just to render a sentence about privacy.

Grid snapping rather than random jitter is a deliberate choice. Random noise
averages out: given enough samples of the same person, the mean converges on
their true position. A grid does not — every sample inside a cell collapses to
the same point. `tests/unit/geo.test.ts` demonstrates this with 200 nearby
readings producing exactly one cell.

On top of that:

- an area with fewer than **3** activities is suppressed entirely, so a single
  person never becomes a visible dot;
- the "N runners nearby" total applies the same threshold, so a count below it
  is reported as zero rather than as "1";
- only activities whose owner opted in are counted at all;
- a point not updated in 30 minutes drops out, rather than implying someone is
  still there;
- bounding boxes wider than ~165 km are refused, so the feed cannot be walked to
  build a national picture.

---

## Avoiding home and routine disclosure

- **Destinations are text labels.** `activities.destination` stores "Home via
  Main Road", never coordinates. A stored destination is a de-facto home
  address.
- **`approximate_area` is validated.** `approximateAreaSchema` rejects
  coordinate pairs and street-address patterns, because that field is shown to
  other members.
- **No trails.** Nobody can watch a route unfold or replay one.
- **Coarse points are cleared on end**, so a finished activity leaves nothing on
  the map.
- **Activities are capped at 24 hours** in the database and 12 in the UI. An
  always-on activity would become continuous tracking by another name.

---

## What staff can see

Administrators see counts, reports, groups and account status. They cannot see
any user's location, activities or trusted contacts — enforced by the absence of
RLS policies granting it, not by a UI restriction. See
[SECURITY.md](./SECURITY.md#administrators).

Every privileged action is written to an append-only audit log whose metadata
column has a CHECK constraint **rejecting** keys named `latitude`, `longitude`,
`location`, `coordinates`, `email`, `phone`, `password` or any token. Logging is
a common escape route for sensitive data; here the common mistake is impossible
rather than discouraged.

---

## User controls

All in Privacy & location:

| Control | Effect |
| --- | --- |
| Master switch off | Stops all sharing **and ends any running activity** |
| Revoke all access | Every live share revoked immediately |
| Delete stored locations | Deletes every point the user has recorded |
| Group discoverability off | Hides the user from group member lists |
| Default visibility | Sets what a new activity starts as |
| Block someone | Instant, bidirectional, revokes live shares both ways |

The master switch deserves emphasis: `updatePrivacySettings()` ends any live
activity before writing the flag. A switch that left a broadcast running would
be a lie, so it does not.

---

## Transparency in the interface

- `PrivacyControl` takes `description` as a **required** prop. A toggle whose
  consequence is not spelled out where it is flipped is a dark pattern, and the
  component signature makes shipping one impossible.
- Every visibility option on the start screen shows its full consequence before
  the activity begins, and is badged "Shares precise location" or "No location
  shared".
- The dashboard's safety status states in one sentence what is being shared and
  with whom — "am I broadcasting right now?" is the question a
  privacy-conscious user opens the app to answer.
- The live activity screen always shows who has access and a one-tap way to stop.
- `/legal/privacy` explains all of this in plain language, for people deciding
  whether to trust the app at all.

---

## Regulatory notes

Not legal advice, but the architecture maps onto the common requirements:

- **Data minimisation** — precise location is collected only during an activity
  and deleted at its end; destinations are labels; no history is retained.
- **Purpose limitation** — a coordinate is readable only for the sharing purpose
  the user selected.
- **Right of access** — a user can read all of their own data and the audit
  entries about them.
- **Right to erasure** — location points are user-deletable; deleting the auth
  user cascades to the profile and everything hanging off it.
- **Consent** — freely given (the app works fully with sharing off), specific
  (per activity, per visibility, per contact), informed (consequence shown
  before the choice) and withdrawable (one tap, immediate effect).

South Africa's POPIA and the EU's GDPR both treat precise location as sensitive.
The design assumption throughout is that a breach of this data could put someone
in physical danger, which is why expiry and deletion are enforced in the
database rather than left to application code.
