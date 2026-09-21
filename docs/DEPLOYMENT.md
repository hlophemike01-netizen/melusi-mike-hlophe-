# Deployment

Target: **Vercel** for the app, **Supabase** for the database, auth and realtime.

---

## The short version

Do these in order. Each one blocks the next.

| # | Step | You need | Time |
| --- | --- | --- | --- |
| 1 | Buy the domain | A card | 10 min |
| 2 | Create the Supabase project, enable PostGIS | — | 10 min |
| 3 | `supabase db push` — apply all 16 migrations | The project ref | 5 min |
| 4 | Configure Auth: confirm-email on, Site URL, redirect URLs | The domain | 5 min |
| 5 | Generate `CRON_SECRET` and one VAPID key pair | — | 2 min |
| 6 | Import to Vercel **or Netlify**, set every env var **before the first build** | Steps 1-5 | 15 min |
| 7 | Point the domain at your host | — | 10 min + DNS |
| 8 | Schedule the background jobs (see below — this is the part people get wrong) | — | 15 min |
| 9 | Promote your own account to `admin` | A signed-up account | 2 min |
| 10 | Walk the verification checklist | — | 30 min |

**Two things that will bite you, both discovered the hard way:**

1. **Set the environment variables before the first Vercel build, not after.**
   The build renders pages, page code constructs a Supabase client, and a
   missing `NEXT_PUBLIC_SUPABASE_URL` fails the build outright with
   *"Your project's URL and API key are required"*. It is not a runtime warning.
2. **Vercel's free plan cannot run this app's schedule.** Hobby allows 2 cron
   jobs, each **once per day**. This app needs 3 jobs at 5-15 minute intervals.
   On Hobby, expired locations would sit for up to 24 hours and a missed
   check-in would escalate a day late — a safety feature silently not working.
   See *Scheduled jobs* for the free way around it.

---

## 1. Supabase

### Create the project

Choose a region close to your users — it affects both latency and where the
data legally resides, which matters for precise location.

### Enable PostGIS

The first migration does this (`create extension if not exists postgis with
schema extensions`). On Supabase you can also enable it from
Database → Extensions.

### Apply the migrations

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

Verify afterwards:

```sql
-- Every one of these must report rowsecurity = true.
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;

-- Sanity-check the policy count (expect ~30).
select count(*) from pg_policies where schemaname = 'public';
```

### Configure Auth

Authentication → Providers → Email:

- **Confirm email: on.** Unverified accounts should not be able to receive
  location shares.
- Set the Site URL to your production origin.
- Add redirect URLs: `https://<your-domain>/auth/callback` and, for local work,
  `http://localhost:3000/auth/callback`.

Optionally enable phone verification — the schema already models
`phone_verified` and `fully_verified`.

### Create your first administrator

There is no self-service path to `admin`, by design: `role` is not writable by
the account holder. Promote through the SQL editor (a service-role connection,
where `auth.uid()` is null, so the privilege guard allows it):

```sql
update public.profiles
set role = 'admin'
where email = 'you@example.com';
```

---

## 2. Mapbox (optional)

Create a **public** token (`pk.*`) and restrict it by URL to your domain in the
Mapbox dashboard.

Never use a secret token (`sk.*`). `NEXT_PUBLIC_MAPBOX_TOKEN` is compiled into
the browser bundle.

Without a token the app works fully; the map screen explains that it needs
configuration. Nothing private depends on it, because the map only ever shows
aggregate counts.

---

## 3a. Vercel

### Import and configure

Import the repository, then set environment variables under
Settings → Environment Variables.

| Variable | Environments | Secret? |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | all | no |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | all | no |
| `NEXT_PUBLIC_SITE_URL` | all | no |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | all | no |
| `SUPABASE_SERVICE_ROLE_KEY` | production, preview | **yes** |
| `CRON_SECRET` | production, preview | **yes** |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | all | no |
| `VAPID_PRIVATE_KEY` | production, preview | **yes** |
| `VAPID_SUBJECT` | all | no |

Generate the cron secret with:

```bash
openssl rand -hex 32
```

### Web Push

Generate one VAPID key pair and keep it — rotating it unsubscribes every device
that has already opted in.

```bash
npx web-push generate-vapid-keys
```

Set `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` from the output, and
`VAPID_SUBJECT` to a contact a push service can use to reach you
(`mailto:you@example.co.za`).

Without these the app runs normally and alerts stay in-app — but a missed
check-in then reaches nobody who is not already looking at the screen, which is
the whole point of the feature. Treat them as required for production.

**What to expect per platform.** Push works on Android and on desktop browsers.
On iPhone it works only once the user has added SafeCircle to their home screen
(iOS 16.4+); Safari in an ordinary tab cannot receive it. The alert settings
screen says so rather than letting someone assume otherwise.

> `NEXT_PUBLIC_*` values are compiled into the browser bundle. Putting a secret
> behind that prefix publishes it. `tests/security/secret-handling.test.ts`
> fails the build if anything matching `NEXT_PUBLIC_*SERVICE_ROLE` or
> `NEXT_PUBLIC_*SECRET` appears in source.

### Scheduled jobs

`vercel.json` registers three crons:

| Path | Schedule | What it does |
| --- | --- | --- |
| `/api/cron/purge-locations` | every 15 min | Deletes expired points, closes long-overdue activities, removes dead share grants |
| `/api/cron/check-ins` | every 5 min | Marks missed check-ins, flips activities to `overdue`, opens escalation shares |
| `/api/push/dispatch` | every 5 min | Drains the notification outbox and sends the Web Push messages |

**Vercel's free plan will not run these.** Hobby allows 2 cron jobs per
project, each firing **once per day**. There are 3 here, and two of them are
retention and escalation guarantees that mean nothing on a daily schedule.
Either move to Vercel Pro, or use the free path below.

#### The free path: run the first two inside Postgres

`/api/cron/purge-locations` and `/api/cron/check-ins` are thin wrappers — each
makes exactly one RPC call and returns the count. The work is already a SQL
function, so it can run in the database itself via `pg_cron`, with no HTTP, no
`CRON_SECRET`, and no dependence on the web app being up at all. For a
retention promise that is a better place for it than a serverless function.

In the Supabase SQL editor:

```sql
create extension if not exists pg_cron with schema extensions;

select cron.schedule(
  'purge-expired-locations', '*/15 * * * *',
  $$select public.purge_expired_location_data()$$
);

select cron.schedule(
  'sweep-missed-check-ins', '*/5 * * * *',
  $$select public.sweep_missed_check_ins(5)$$
);

-- Check they are registered, and later that they are succeeding:
select jobname, schedule, active from cron.job;
select jobname, status, start_time
from cron.job_run_details order by start_time desc limit 20;
```

Then delete those two entries from `vercel.json`, leaving only
`/api/push/dispatch` — one cron, inside the Hobby limit of two.

That last one still needs a real schedule, because Hobby would only fire it
daily and a safety alert a day late is not an alert. It needs Node (the
`web-push` library signs each message), so it cannot move into Postgres as-is.
Pick one:

- **Vercel Pro** — keep `vercel.json` as written, nothing else to do.
- **An external scheduler** — [cron-job.org](https://cron-job.org) or a GitHub
  Actions workflow on a `schedule:` trigger, calling the endpoint every 5
  minutes with the `Authorization: Bearer $CRON_SECRET` header. Both are free.
- **`pg_net` from Supabase** — `cron.schedule` a `net.http_post` to the same
  endpoint with the same header, keeping everything in one place.

Whichever you choose, confirm it by watching `notification_outbox` drain rather
than by trusting the schedule.

Both require `Authorization: Bearer $CRON_SECRET`, compared with
`timingSafeEqual`. Vercel Cron sends this automatically once `CRON_SECRET` is
set.

**These are not optional.** Without the purge job, expired points stay on disk
(they remain unreadable — RLS refuses them — but retention is a promise about
storage, not only about reads). Without the check-in sweep, a missed check-in
never escalates, which is a safety feature silently not working.

If you deploy somewhere without Vercel Cron, call the same endpoints from any
scheduler:

```bash
curl -X POST https://<your-domain>/api/cron/purge-locations \
  -H "Authorization: Bearer $CRON_SECRET"
```

---

## 3b. Netlify

`netlify.toml` and `netlify/functions/` are committed, so this works out of the
box: connect the repository in the Netlify UI and it builds.

**This app cannot be a static site.** Every page renders per request (the CSP
nonce requires it), the proxy refreshes the Supabase session on every request,
and there are API routes. `@netlify/plugin-nextjs` turns all of that into
Netlify Functions and Edge Functions. Without it the build produces nothing
servable, and `next export` fails outright — there is no `index.html` to drag
and drop.

### Environment variables

The same table as Vercel, under Site configuration → Environment variables.
Set them **before the first build**: page code constructs a Supabase client
while prerendering, so a missing `NEXT_PUBLIC_SUPABASE_URL` fails the build
with *"Your project's URL and API key are required"* rather than warning at
runtime.

`NEXT_PUBLIC_SITE_URL` must be the final public URL — it is baked into every
share link you generate. Netlify also injects `URL` automatically, which the
scheduled function falls back to.

### Scheduled jobs

**`vercel.json` is inert on Netlify.** Netlify has no equivalent of Vercel
Cron, so those three entries do nothing here and the jobs are split instead:

| Job | Where it runs |
| --- | --- |
| Expired-location purge | `pg_cron`, every 15 min |
| Missed check-in sweep | `pg_cron`, every 5 min |
| Alert outbox drain | `netlify/functions/push-dispatch.mts`, every 5 min |

Run the `pg_cron` SQL from *Scheduled jobs* above — it is the same on either
host, and it is the better home for those two regardless: they are single SQL
calls, so in the database they cannot be broken by a bad deploy or a cold
start, and a retention promise should not depend on the web tier being up.

The third needs Node, because `web-push` signs each message. The committed
scheduled function calls the app's own `/api/push/dispatch` with the
`CRON_SECRET` header, so there is one implementation of the sending path. It
fails loudly if `CRON_SECRET` or the site URL is missing — a scheduled job that
quietly does nothing is worse than one that errors, because the alerts it was
meant to send simply never arrive.

Confirm it by watching `notification_outbox` drain, not by trusting the
schedule. Check Netlify's current plan limits for scheduled functions before
relying on a 5-minute interval.

### What was verified here, and what was not

A real `netlify build` was run against this repository. The Next.js build
compiled, the config resolved (publish directory, plugin, functions directory,
headers, redirects), and **Functions bundling succeeded** — the scheduled
function bundles.

**Edge Functions bundling was not verified.** It needs to download the Deno
runtime from `dl.deno.land`, which the development sandbox blocks (HTTP 403).
That is an environment limit, not a configuration fault, and it should succeed
on Netlify's builders — but it is the one step of this deployment path that has
not actually been executed, so watch the first build's log for it.

---

## HTTPS

Vercel and Netlify both provision TLS automatically. The app assumes HTTPS
throughout: the service worker refuses to register on anything but `https:` or
`localhost`, secure
cookies require it, and geolocation is unavailable on insecure origins in every
modern browser.

---

## 4. Verify the deployment

```bash
npm run verify      # typecheck, lint, 208 tests
npm run test:db     # the SQL security suite (needs PostgreSQL + PostGIS locally)
npm run build
```

Then check by hand:

- [ ] Sign up, confirm by email, sign in.
- [ ] The dashboard does **not** prompt for location.
- [ ] "Show nearby activity" prompts, and declining leaves the app usable.
- [ ] Starting a private activity works with sharing off.
- [ ] Choosing a sharing visibility with sharing off is refused, with a link to
      Privacy settings.
- [ ] Ending an activity clears the shares (check the live screen).
- [ ] The admin area 404s for a non-admin account.
- [ ] `curl https://<domain>/api/cron/purge-locations` without the header
      returns 401.
- [ ] `view-source` on the deployed page contains no `eyJ`-prefixed key beyond
      the anon key.

---

## Local development against a real database

```bash
npx supabase start          # local stack in Docker
npx supabase db reset       # applies every migration
npm run dev
```

`npx supabase status` prints the local URL and anon key for `.env.local`.

To run the SQL security suite against an existing database instead of a
throwaway one:

```bash
PGURL=postgres://postgres:postgres@localhost:54322/postgres npm run test:db
```

---

## Operations

### Monitoring

Watch for:

- **Cron failures.** A silent purge failure means location data is being
  retained past its promise.
- **`system.check_in_sweep` audit entries.** Their absence means escalation has
  stopped working.
- **`admin.*` audit entries.** Unexpected suspensions or report actions.
- **Row counts on `activity_locations`.** A steadily growing table means the
  purge is not running.

```sql
-- Should be ~0 at any time if the purge is healthy.
select count(*) from public.activity_locations where expires_at <= now();

-- Recent scheduled-job activity.
select action, metadata, created_at
from public.audit_logs
where action like 'system.%'
order by created_at desc
limit 20;
```

### Backups

Supabase takes automatic backups. Note the tension: a backup containing precise
location undermines the deletion promise. Keep the retention window short, and
if you offer users a formal erasure right, document that backups are purged on
the provider's own cycle.

### Incident response

If the service-role key is exposed:

1. Rotate it in Supabase (Settings → API) — this invalidates the old key
   immediately.
2. Update `SUPABASE_SERVICE_ROLE_KEY` in Vercel and redeploy.
3. Review `audit_logs` for the exposure window.
4. Because the key bypasses RLS, treat every row as potentially read. Precise
   location is the sensitive part — note that it expires quickly, which
   meaningfully limits the blast radius.

---

## Before a public launch

Honest list of what this V1 does not yet include:

1. **Reaching contacts without an account.** Web Push now covers contacts who
   have a SafeCircle account and have enabled alerts on a device. Anyone else
   still gets a link the user sends by hand, and iPhone users must install the
   app first. An SMS provider is what would close that last gap.
2. **Real icons.** `public/icons/*` are generated placeholders
   (`npm run icons`). Replace with designed artwork.
3. **A locale-aware emergency number.** `EmergencyDialog` links `tel:112`, the
   GSM-standard number. Map it to the user's region before launching elsewhere.
4. **Edge rate limiting** on sign-in and share-token lookups.
5. **An independent security review.** This codebase has not been penetration
   tested.
6. **Legal review** of the privacy explainer against POPIA/GDPR for your
   jurisdiction.
7. **A native app** if continuous background location is a requirement — see
   [LOCATION_MODEL.md](./LOCATION_MODEL.md#the-native-path).
