# Mwhite SafeCircle

A consent-first community safety and activity Progressive Web App.

Mwhite SafeCircle lets people start a **temporary safety activity** — a walk home, a
run, a journey — and share it with people they choose, for as long as they
choose. It is deliberately **not** a people-tracking product, and the
architecture is built so that it cannot quietly become one.

---

## The product principle

> Mwhite SafeCircle is not designed to track people. It is designed to let people
> voluntarily create temporary safety activities and share their location
> selectively.

Three consequences follow, and they run through the schema, the API
authorisation, the UI and this documentation:

1. **Location sharing is off by default and must be turned on explicitly.**
   The app never asks the browser for a position while someone is just
   browsing.
2. **A precise coordinate is only ever readable by someone the owner has
   authorised, while the activity is live.** There is one database predicate
   that decides this, and administrators are deliberately excluded from it.
3. **Precise location is temporary.** Every stored point carries an expiry;
   ending an activity deletes its points outright.

---

## Documentation map

| Document | What it covers |
| --- | --- |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Layers, directory structure, data flow, where each rule is enforced |
| [DATABASE.md](./DATABASE.md) | Every table, column, index and constraint, and why |
| [SECURITY.md](./SECURITY.md) | RLS policies, threat model, the security tests |
| [PRIVACY.md](./PRIVACY.md) | Data inventory, retention, user controls, what staff can see |
| [LOCATION_MODEL.md](./LOCATION_MODEL.md) | The location lifecycle, coarsening, k-anonymity, browser limits |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Supabase + Vercel setup, environment variables, scheduled jobs |

---

## Quick start

### Requirements

- Node.js 20.9 or later
- A Supabase project (PostgreSQL 15+ with PostGIS)
- A Mapbox public access token (optional — everything except the map works
  without one)

### 1. Install

```bash
npm install
cp .env.example .env.local
```

### 2. Configure

Fill in `.env.local`. The full description of each variable is in
[DEPLOYMENT.md](./DEPLOYMENT.md); the short version:

| Variable | Required | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Public key — safe in the browser *because RLS is on* |
| `NEXT_PUBLIC_SITE_URL` | yes | Used for auth redirect links |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | no | `pk.*` only. Never an `sk.*` secret token |
| `SUPABASE_SERVICE_ROLE_KEY` | prod | **Secret.** Server-only, scheduled jobs only |
| `CRON_SECRET` | prod | **Secret.** Authorises the scheduled job endpoints |

> Anything prefixed `NEXT_PUBLIC_` is compiled into the browser bundle and is
> therefore public. Never put a secret behind that prefix.

### 3. Apply the database migrations

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

The migrations create the schema, the PostGIS indexes, every RLS policy and the
authorisation functions. They are ordered and idempotent-safe to re-run against
a fresh database.

### 4. Run

```bash
npm run dev
```

---

## Verifying the build

```bash
npm run verify      # typecheck + lint + 138 TypeScript tests
npm run test:db     # the SQL security suite (needs PostgreSQL + PostGIS)
npm run verify:all  # both
```

`npm run test:db` spins up a throwaway PostgreSQL database, applies the **real**
migrations on top of a small shim that recreates `auth.uid()` and the
anon/authenticated/service_role roles, and then runs every assertion as the
`authenticated` role — i.e. with exactly the privileges a browser client has.
See [SECURITY.md](./SECURITY.md#the-security-test-suite).

---

## What Mwhite SafeCircle does not do

Being explicit about this is part of the product, not a disclaimer bolted on at
the end.

- **It does not contact emergency services.** Emergency mode alerts the trusted
  contacts a user has configured. There is no integration with police,
  ambulance or fire services, the database column recording it is `false` and
  a client cannot set it true.
- **It does not guarantee anyone's safety.** It helps people share their plans
  with people they trust.
- **It does not track location in the background.** Browsers stop or heavily
  throttle geolocation once a page is hidden. Mwhite SafeCircle stops sending rather
  than showing a stale point as live. See
  [LOCATION_MODEL.md](./LOCATION_MODEL.md#the-background-location-limitation).
- **It does not send SMS or make calls.** Contacts without an account receive a
  link that the user sends themselves.
- **It does not let you search for people.** There is no user directory, by
  design — that is user enumeration.

---

## Status

This is a complete V1 of the features described above, with the database,
authorisation and privacy model implemented and tested. Before a public launch
you would still want: a real notification transport (push or SMS via a provider),
professionally designed icons in place of the generated placeholders, a
locale-aware emergency number, and an independent security review. These are
listed in [DEPLOYMENT.md](./DEPLOYMENT.md#before-a-public-launch).
