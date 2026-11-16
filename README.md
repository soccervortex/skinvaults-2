# Skinvaults 2.0

Foundation only (step 0): configuration, PostgreSQL migrations, scheduled jobs, an outbox for e-mail and Discord with retries and alerts,
and a health and status endpoint. No product features yet. See `docs/` for the audit, the plan and the decisions.

## Run locally in 5 minutes

Needs Node 24+ and Docker.

```bash
npm install
npm run db:dev            # starts a local PostgreSQL 17 and prints a DATABASE_URL
cp .env.example .env      # paste the DATABASE_URL, set STATUS_TOKEN (24+ chars), the SMTP_* values and an alert channel
npm run smtp:verify       # checks the SMTP login, sends nothing
npm run dev               # http://localhost:3000/healthz  and  /status (Authorization: Bearer <STATUS_TOKEN>)
npm test                  # types, secret scan, unit and database tests
```

The app refuses to start and lists every missing variable by name.

## Layout

- `src/config.ts` environment parsing; `src/server.ts` boot; `src/platform/` db, jobs, outbox, senders, alerts, logger
- `migrations/` numbered SQL files applied at start
- `docs/` audit.md, plan.md, runbook.md, decisions.md, dependencies.md
