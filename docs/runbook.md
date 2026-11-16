# Runbook (foundation)

## Start-up refuses to run
The log lists missing variables by name. Set them in the Nebula app's environment and restart. Values are never printed.

## Is it healthy?
- `GET /healthz` returns `{"ok":true}` when the database answers.
- `GET /status` with `Authorization: Bearer <STATUS_TOKEN>` shows each job's last success and whether it is overdue, plus outbox counts
  (`pending`, `dead`, age of the oldest pending message). Overdue or `dead > 0` means look at the logs.

## A message is stuck or dead
`outbox` rows retry with backoff (30 s, 1 min, 2 min, ... max 1 h). After 6 failed attempts a row becomes `dead` and the owner is alerted by
every configured alert channel. `last_error` says why (never contains URLs or passwords). Fix the cause, then reset the row:
`update outbox set status='pending', attempts=0, next_attempt_at=now() where id=<id>;`

## A job failed
Each run is a row in `job_runs` (`status`, `error`, `duration_ms`). The scheduler never lets one job overlap itself.

## Deploy, rollback, backup, restore

Tested on Nebula on 2026-11-16 (test app `skinvaults2`, database `skinvaults2-db`). "Not tested" is said where it applies.

**What runs where**
- App `skinvaults2`: built by Nebula from the public repo `soccervortex/skinvaults-2`, branch `main`, using the repo `Dockerfile`. Port 3000.
- Database `skinvaults2-db`: Nebula PostgreSQL 17. The app reaches it by container name `cp-skinvaults2-db:5432` on the `cloud-platform` network (tested). The URL Nebula shows in its panel uses the LAN address and does **not** work from inside a container.
- Environment variables are set in Nebula (names in `.env.example`). `PORT` is set by the platform, never put it in the list.
- Address today: `https://skinvaults2.apps.localhost`. That name only exists on the Nebula machine's network, so it is not reachable from the internet yet. Health was checked with `curl -k --resolve skinvaults2.apps.localhost:443:<Nebula LAN address> https://skinvaults2.apps.localhost/healthz` (answer `{"ok":true}`).

**Deploy**
1. Push to `main`. A push does **not** deploy by itself (no webhook).
2. Redeploy by saving the environment variables again (`PUT /api/apps/skinvaults2/env` with the same list, or Save in the panel). `POST /restart` does not work until a first deploy has succeeded.
3. Watch the deployment status until `running`. Migrations run at start; the log line is `migration_applied`.
4. Check `/healthz`. A build that fails leaves the previous container untouched? **Not tested.**

First deploy lesson: a `.gitignore` rule `*.sql` hid `migrations/`, so the build failed on `COPY migrations`. Always deploy from a clean clone, not from the working folder.

**Rollback**
Nebula builds the branch head only and the branch cannot be changed after creation. Rollback therefore means `git revert` the bad commit, push, redeploy. A one-click "deploy tag X" does not exist. **Not tested end to end**; listed as a Nebula gap.

**Backup**
- `GET /api/apps/skinvaults2-db/backup` (token needed) returns a gzip file with the output of `pg_dumpall` (about 2 KB for the empty schema).
- Nebula's panel also keeps scheduled backups for database servers. Whether they leave the machine was **not verified**.
- Do this before every migration that deletes or changes data, and keep the file outside the repo (`*.sql` and `backups/` are git-ignored).

**Restore (tested)**
1. `gunzip` the file.
2. Start a scratch database: `docker run -d --name scratch -e POSTGRES_PASSWORD=x postgres:17`, wait for `pg_isready`.
3. `docker exec -i scratch psql -U postgres < backup.sql`.
4. Check: a probe table with one row created before the backup came back, and `job_runs`, `outbox`, `schema_migrations` were all present.
To restore for real, run the same into a new Nebula PostgreSQL server, point `DATABASE_URL` to it and redeploy.
