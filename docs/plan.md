# Skinvaults 2.0: structure and infrastructure plan (DRAFT for approval)

Written 2026-11-16. This is **not** the product design. It says how the thing is built and run, so that whatever
features the owner picks later fit in. Features are listed only as "slots". Revenue ideas are parked on purpose.

Inputs: `audit.md` (what went wrong before) and the Nebula Host docs (what the host can do).

## 1. Rules that come straight from the audit

| Old problem (measured) | Rule |
|---|---|
| 482 routes, 141 pages, admin 28% of code | Keep it small on purpose (targets, not walls): about 15 public pages, under 8 admin pages, no file over about 300 lines. Page and route counts get fixed once the feature list is decided |
| 318 Mongo collections, fake key-value store, 5 clusters, dead layers | **One PostgreSQL database.** Plain SQL migrations in the repo. One table per thing. No key-value document store |
| Casino code and money economy mixed into the product | Anything chance-based lives in `features/<name>/` behind a flag that is off by default and is not built in v1 |
| Crons wired by hand on the wrong platform, price worker died silently | Jobs run inside the app, every run is a row in `job_runs`, status page shows "last success" |
| Webhooks failed silently, URLs hard-coded in source | Every outbound message goes through an **outbox table** with retry, result and alert |
| Secrets in git, 6.7 GB `.git`, 20 snapshot folders | New repo, secret scan in pre-commit and CI, no data dumps or logs in the repo, releases are git tags not folders |
| Free CORS proxies, home-PC proxy chain, Steam IP block | Test first whether the new host is blocked by Steam. Build a proxy only if it is |

## 2. Where it runs (checked in the Nebula Host docs and code)

Nebula Host already offers what we need, with no changes to it:
- **Web app from a Git repository.** Its deployer builds the repo's own `Dockerfile` (a repo Dockerfile always wins), serves it at
  `<app>.apps.<domain>` through Caddy with automatic HTTPS, and supports **custom domains** per web app.
- **Environment variables** per app, **persistent volume** per app, live logs, restart.
- **PostgreSQL** as a server template with a data browser, scheduled **backups with restore**, copied to a second machine.
- Limits: per app 4 GB RAM / 2 CPUs, but the whole pool is 6 GB real memory. The control plane starts a new app only if 768 MB is really free
  and **stops the largest tenant when the pool goes over 6 GB**. Owner decision 2026-11-16: the app does not have to be tiny, some
  resources may be "wasted". Working assumption: up to about 2 GB is fine. Not unlimited, because the pool is shared with other
  tenants and the same PC also runs `skinapi` and `dislite`; if we go over, Nebula kills the biggest tenant, and that would be us.

Things I could not confirm and must test in slice 0:
1. Can the web app reach the Postgres server on the internal `cloud-platform` Docker network by name? (Should; not tested.)
2. Does a push to Git redeploy automatically, or is deploy a button/API call? (`docs/api.md` has no webhook that I could see.)
3. Is the environment-variable list editable per deploy without a rebuild, and are secrets hidden in the panel? (features.md says yes.)
4. Rollback: can we redeploy a previous git tag in one step?

**Risks to accept or fix (owner decision):**
- Everything runs on one home PC, also hosting `skinapi` and `dislite`. If the PC or the connection is down, the site is down
  (the old site returned 502 on 2026-11-16). Mitigation: nightly backup copy off the machine, a one-page "rebuild from scratch" runbook.
  Real fix would be a second node (Nebula has an Oracle node), which is not needed for launch.
- Nebula's own opening plan is a closed waiting list until 2026-12-05. Skinvaults uses it as the owner, so this does not block us.

## 3. Shape of the system

```
 visitor ──https──> Caddy (Nebula, auto TLS, custom domain)
                       │
                       ▼
          ┌──────── app container (one image, Node LTS, non-root) ─────────┐
          │  web  : server-rendered pages + JSON routes                    │
          │  jobs : in-process scheduler (price cache, alerts, giveaways)  │
          │  outbox: sends Discord/e-mail, retries, alerts on failure      │
          └───────────┬───────────────────────────────┬────────────────────┘
                      │ SQL                           │ HTTPS, server-side only
                      ▼                               ▼
              PostgreSQL (Nebula)        Steam OpenID · SkinAPI · SMTP · Discord webhooks
```

- **One container, one database.** The jobs run in the same process (a second small worker from the same image only if memory forces it).
- **SkinAPI is a private backend dependency.** It is called server-side with an API key and never shown or named on skinvaults.online.
  Prices are cached in our own Postgres, so a SkinAPI outage shows "last updated" data instead of an error page. SkinAPI runs on the same PC,
  so an outage of the PC takes both down; the cache does not help against that.
- **No third-party trackers.** Own counters in Postgres: visits, sign-ins, return after 7 days, plus anything the owner picks later.

## 4. Repository layout (new repo, name to be agreed)

```
skinvaults-2/
  README.md                run locally in 5 minutes
  Dockerfile               pinned Node LTS, non-root, HEALTHCHECK on /healthz
  .env.example             every variable, no real values
  migrations/              0001_init.sql ... plain SQL, applied in order at start
  src/
    server.ts              boot: validate env, run migrations, start web + jobs
    config.ts              reads and validates env, refuses to start with a clear message
    platform/              db, http, session, rate limit, outbox, jobs, logger  (the only shared code)
    theme/theme.css        ALL colours, radii, spacing, shadows, fonts as CSS variables (design swap = edit this file)
    features/
      auth/                Steam OpenID, session cookie
      prices/              cached SkinAPI reads, item pages
      inventory/
      (giveaways/, alerts/, ...)   only if the owner keeps them
    admin/                 under 8 pages: users, jobs, errors, outbox, plus feature admin
  tests/                   unit (money, draws, pricing) + one e2e (sign-in, main flow)
  docs/                    architecture.md, runbook.md, decisions.md, dependencies.md
```

Each `features/<name>/` has its own routes, queries, tests and a `FLAG` in config. No `utils` folder; shared code sits in `platform/` with a
name that says what it does.

## 5. Data rules

- PostgreSQL 16, one schema. Migrations are numbered SQL files; the app applies them at start inside a transaction and records them.
- Money, balances and draw results are computed **server-side only**; the client never sends a price or a result.
- Core tables (always): `users` (steam_id, name, avatar, created_at), `sessions`, `job_runs`, `outbox`, `events` (own counters), `price_cache`, `item_images`.
- Feature tables are added by the feature's own migration, and only when that feature is approved.
- Migrate from the old site only: Steam id, trade URL, Discord id, wishlist, newsletter consent with date, and any still-running Pro. Everything else starts empty.
  The import is one read-only script run once, with a row count before and after.

## 6. Errors, alerts, proof

- JSON logs to stdout (visible in Nebula's live logs). A start-up line prints the version and which flags are on, never secret values.
- **Outbox**: a message row has `status`, `attempts`, `last_error`. Retries with backoff. After N failures a different channel is used (e-mail) and the
  admin page shows it in red.
- **Job runs**: each job writes start, result, duration, error. `/status` (internal) shows last success per job and flags anything overdue.
- **Proof, built into every slice**: a test that forces a failing webhook and a failing job and checks that the owner is told. Done = I trigger it live and show it arrived.
- Secret scan (pre-commit and CI) fails the build on key-like strings; `.env` and data dumps are git-ignored from commit 1.

## 7. Backups and restore

- Nebula's Postgres backup (scheduled, copied to a second machine) is the base. On top: a nightly `pg_dump` into the app's mounted folder.
- Written in `runbook.md`: what is backed up, where it goes, how to restore. **Slice 0 ends with an actual restore into a scratch database.**

## 8. Quality gates

TypeScript strict. One command runs lint, types and all tests; a phase is not done until it passes. Every dependency gets a one-line reason in
`dependencies.md`. Accessibility floor and mobile (390 px) checks with screenshots per slice. Memory measured at idle and under a simple load test.

## 9. Order of work (slices)

0. **Foundation on Nebula**: empty app with health check, Postgres, migrations, env validation, theme file with a plain placeholder look,
   deploy from Git, rollback, backup and a tested restore, Steam block test. *Nothing user-visible, but everything after depends on it.*
1. Steam sign-in + session + minimal admin (users, jobs, outbox).
2. The one main flow (decided by the owner).
3. Retention feature(s) if any (decided by the owner).
4. Alerts and notifications on the outbox.
5. Cut-over: import small tables, point the domain, keep the old site read-only for a while.

Each slice ends with: runs on Nebula, tested at 390 px and desktop with screenshots, errors proven visible, runbook updated.

## 10. Decisions I need (everything else I will choose and log in `decisions.md`)

1. **Web framework: OPEN, decided after the feature list.** Owner: it depends on what goes in and out and how the site is built.
   See section 11. Slice 0 is framework-neutral, so work can start before this is decided.
2. **Domain and cut-over.** Reuse skinvaults.online (old site is down anyway), or launch 2.0 on a new hostname first?
3. **Repo name and where it is hosted** (GitHub private repo is my assumption).
4. **Language of the site**: English first, Dutch second (my proposal), instead of 30 machine translations.

## 11. How we choose the framework (criteria first, framework last)

The framework follows from these answers. None are known yet.

| Question | If the answer is... | ...it pushes towards |
|---|---|---|
| Must thousands of item pages rank in search? | yes | server rendering with caching (any of Next.js, SvelteKit, Astro, or a plain Node server) |
| How interactive is the main screen (inventory with filters and sorting, live price updates, reveal animations)? | a lot | a component framework (React or Svelte), not plain server pages |
| Is anything live (giveaway countdowns and draws, notifications, chat)? | yes | a Node server with SSE or WebSocket; every candidate can do it |
| In what form will the Claude Design output arrive (HTML/CSS only, or React components)? | React | Next.js or Vite + React, so design code can be dropped in |
| Do other things need to call us (trade bot, Discord bot, mobile later)? | yes | clean JSON routes separate from the pages |
| Who maintains it? | one person who already knows React/Next | strong reason to stay with React unless the cost is real |

Candidates: (a) Next.js (known, biggest, heavy build, the old project's size came partly from habits around it, not only from it),
(b) SvelteKit (smaller, fast, less known), (c) Hono + server pages + small client scripts (lightest, most work for interactive parts),
(d) Astro for content pages + islands. I make a recommendation with reasons in `decisions.md` once the feature list and the design format are known.

What does not depend on the framework and can start now (slice 0): Postgres and migrations, env validation, jobs and outbox,
theme tokens file, Dockerfile, Nebula deploy, backups and restore test, the Steam block test.

## 12. Answers so far (owner, 2026-11-16)

- **Everything must be findable in Google.** This is now a hard requirement, and it settles part of section 11:
  every public page is rendered on the server (no content that only appears after JavaScript runs), each page has its own title,
  description, canonical URL and structured data, there is a generated sitemap, and item pages exist as real URLs, not only as app state.
  Candidates that cannot do this well are out; all four listed can. Interactivity and live parts stay open.
- **Open:** the product sentence, what is live, the Claude Design format, the domain cut-over.
- **Old URLs:** skinvaults.online already has pages Google knows (item, skins, blog, giveaways). Before cut-over we list them and either keep the same
  paths or add 301 redirects, so ranking is not lost. Search Console data would tell us which pages matter (owner to share, if available).

## 13. Idea for later: "coming soon" page with countdown and waitlist

A small first slice (call it slice 0.5) that can go live before the real product exists:
- a page on skinvaults.online with a timer to the release date, a short pitch, and an e-mail field for the waitlist;
- it exercises the whole pipeline on Nebula (Git deploy, Postgres, e-mail through the outbox, domain, HTTPS, backups), so slice 0 is not wasted work;
- it gives the domain a working page instead of the current 502, and it starts collecting an audience before launch.

Things to decide before building it: release date (or "no date yet"), what the waitlist promises, **double opt-in and a working unsubscribe link**
(e-mail consent rules; the old site had 29 subscribers with consent dates, and whether they may be mailed needs checking), and where the
waitlist e-mails are stored (our Postgres, deleted on request).
