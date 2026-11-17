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

## Domain and tunnel (skinvaults.online)

Traffic path: Cloudflare (proxied apex and `www`) -> tunnel `skinvaults-tunnel` (system service on the Nebula PC, config `~/.cloudflared/config.yml`) -> Caddy (`cloud-platform-caddy-1`, 192.168.1.252:443) -> app container.

- Adding a domain in Nebula needs a TXT record `_nebula-verify.<host>` = `nebula-verify=<token>`; Nebula then creates the Caddy helper container.
- Tunnel ingress for the apex and `www` points at `https://192.168.1.252:443` with `noTLSVerify` and `originServerName` set to the host.
- **Certificates:** Caddy gets them by HTTP-01. Before the first certificate the HTTPS origin has none, so the tunnel needs a rule per host that sends `^/\.well-known/acme-challenge/` to `http://192.168.1.252:80`, placed above the HTTPS rule. Without it the site is a 502 and Let's Encrypt counts failed attempts (limit: 5 per hour per name, then wait).
- Edit the tunnel config only after making a backup copy next to it. Apply it by restarting the service (`kill -TERM` of the cloudflared process; systemd starts it again). Check `skinapi.skinvaults.online` and the other hostnames afterwards, they share the tunnel.
- Rollback: restore the backup copy of `config.yml` and restart the tunnel.

## Waiting list

- Table `waitlist` (pending or confirmed). Mail goes through the outbox, so a mail provider outage delays confirmation mails but loses nothing; check `/status` for outbox counts.
- Remove a person by hand: `delete from waitlist where lower(email) = lower('...')`. Their own remove link does the same.
- Settings: `PUBLIC_BASE_URL` (canonical links, sitemap, mail links), `DISCORD_INVITE_URL` (shown when set), `CONTACT_EMAIL` (privacy page).
- Never send anything to `pending` rows other than the confirmation mail.

## Owner sign-in (owner and co-owner)

The coming-soon page has an "Owner login" link (header on desktop, footer everywhere). Signing in shows the pages visitors cannot see (`src/web/live.ts`); visitors only ever get the coming-soon page. `/?view=public` shows the public page to a signed-in owner.

**Set it up.** Passwords are never stored, only scrypt hashes.
1. Each person runs `npm run owner:hash -- owner` (or `-- co-owner`) in a terminal and types their own password twice (12 to 256 characters, nothing is shown). It prints one line.
2. Add that line to the app's environment in the Nebula panel: `OWNER_PASSWORD_HASH=...` and `COOWNER_PASSWORD_HASH=...`. Saving redeploys.
3. `SESSION_SECRET` (at least 32 random characters) must be set too. Without any hash the sign-in page says "not set up".

**Change a password.** Run the script again and replace the line. **Sign everybody out** (lost phone, shared screen): change `OWNER_SESSION_VERSION` (for example 1 to 2) or `SESSION_SECRET`. **Forgot it:** run the script again.

**Limits and alerts.** 5 attempts per address and 30 in total per 15 minutes, then the page answers 429 for everybody until the window passes (the address header can be forged when the app is reached without Cloudflare, so the total limit is the real brake). The owner gets an alert on every successful sign-in and once per lockout. Failed attempts are logged as `owner_login_failed`. Cookie: `__Host-sv_owner`, HttpOnly, Secure, SameSite=Lax, valid 12 hours.

## Steam sign-in and inventory (owner preview only, for now)

Pages: `/inventory` (lookup by Steam ID, profile link or custom name), `/inventory/<steamid64>` (the inventory), `/auth/steam` (sign in), `POST /auth/logout`, `POST /account/delete` (removes the user, sessions and cached inventory). For now the router only hands these paths to a signed-in owner or co-owner; for everybody else they do not exist (404). Going public means removing that gate in `src/web/router.ts` (the `owner !== null && steam.handle` line) and moving the links out of `live.ts`.

**Environment.** `SKINAPI_KEY` (and optionally `SKINAPI_URL`, default `https://skinapi.skinvaults.online/api/v1`). Without a key the inventory still works, without prices and without a total. Use a separate SkinAPI key for 2.0 when one exists (the old site's key is shared for now).

**Where data comes from.** Items, float (Wear Rating), pattern seed (Pattern Template) and sticker names come from Steam's own inventory JSON, read by us. Prices come from SkinAPI `GET /inventory` (lowest marketplace price per asset, EUR, minor units). If SkinAPI is down the page says so and shows no value. Steam answers 429 now and then: a saved copy up to 24 hours old is then shown with a note, otherwise the page asks the visitor to try again.

**Cache and limits.** `inventory_cache` keeps the last read per Steam ID for 10 minutes (a refresh inside the first minute is ignored), rows older than 7 days are deleted by the `session-cleanup` job. Two people asking for the same inventory share one Steam call. 30 lookups per address per 10 minutes. Each lookup is one Steam call plus one SkinAPI call, and SkinAPI reads Steam itself, so a busy day means twice the Steam traffic from this home connection.

**Sessions.** Cookie `__Host-sv_session` (HttpOnly, Secure, SameSite=Lax, 30 days). The database stores only the SHA-256 of the token. The sign-in start sets a 10-minute `__Host-sv_oid` state cookie that must match the `s` value in the OpenID return address, which stops somebody else's sign-in being forced on you.

**Images.** Item and avatar images load from `*.steamstatic.com` (Valve's CDN), so a visitor's address is visible to Valve. The inventory pages have their own CSP for that; the rest of the site still allows no third-party images. Mention this on the privacy page before going public.
