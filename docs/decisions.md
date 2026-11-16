# Decisions log

| Date | Decision | Rejected | Why |
|---|---|---|---|
| 2026-11-16 | One PostgreSQL database, plain SQL migrations | MongoDB again, Redis, key-value layer | The old site had 318 collections and a fake KV store on top. Nebula has a PostgreSQL template with backups |
| 2026-11-16 | Plain Node server for the foundation, no web framework yet | Choosing Next.js now | Owner: the framework depends on what the site contains. Foundation code does not depend on it |
| 2026-11-16 | `pg` driver, no ORM | Prisma, Drizzle | Few tables, SQL is the source of truth, fewer dependencies |
| 2026-11-16 | `nodemailer` for SMTP (Hostinger, port 587 STARTTLS) | The old hand-written SMTP client (`raw-smtp.ts`, 175 lines of protocol code) | A maintained library over our own protocol code. Owner can overrule if "no nodemailer" was meant literally |
| 2026-11-16 | Outbox table for every outbound message, webhook URLs only in env | Sending inline with try/catch | The old site lost Discord messages silently |
| 2026-11-16 | Alerts bypass the outbox and use every configured channel | Alerting through the outbox | A broken outbox must still be able to raise an alarm |
| 2026-11-16 | In-process scheduler with `job_runs` table | External cron, Inngest | One process, visible history, no extra service. Single instance assumed |
| 2026-11-16 | `node:test` and `tsx` for tests | Vitest, Jest | Built in, fewer dependencies |
| 2026-11-16 | New small community bot (`community-bot/`, discord.js 14, own token, one server) for lockdown and feedback tickets | Adding it to the old 7,590-line bot | The old bot serves 48 servers, uses its own Atlas database and is not running on this PC, so changing it blind is risky. The new one is about 600 lines and can be tested on its own |
| 2026-11-16 | Lockdown stores a full permission snapshot on disk first and verifies the restore against Discord | Toggling a single "everyone" flag | Restoring "what it was" needs the real previous state of every channel, and a wrong restore on a live community cannot be undone by hand |
| 2026-11-16 | Bot state in JSON files under `DATA_DIR` | A database for the bot | One writer, a few small files, fits the Nebula `/data` volume and backups |
| 2026-11-16 | Owner decided to use the existing SkinVaults Discord bot, not a new one (supersedes the "new small community bot" row). The community-bot code is added to it as separate commands | A second bot | Same bot identity in the server. Open: where the existing bot runs, and its commands must be added without replacing its others |
| 2026-11-16 | First public page is a server-rendered "coming soon" page with a waiting list, plain HTML from TypeScript functions, no client framework | Next.js, a static page | The framework decision is still open. Server-rendered HTML is indexable, needs no JavaScript and costs nothing to replace |
| 2026-11-16 | Every colour and size comes from one token block in `src/web/theme.ts`; the current values are a neutral placeholder | Designing the final look now | The real look comes from the design phase and should replace one block, not every page |
| 2026-11-16 | Waiting list is double opt-in; confirm and remove links open a page with a button instead of acting on GET; unsubscribing deletes the row; unconfirmed rows are deleted after 7 days | Single opt-in, soft delete | Mail scanners fetch links and would confirm or remove on GET. Deleting is the simplest way to honour "delete my data" |
| 2026-11-16 | No cookies, no trackers, no external fonts or scripts; strict Content-Security-Policy | Analytics from day one | Nothing to ask consent for, nothing third parties can see. Analytics can be added later with a decision |
