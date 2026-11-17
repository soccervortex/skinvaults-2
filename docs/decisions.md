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
| 2026-11-17 | Release target is Friday 29 January 2027 (reserve: 12 February). It is a target: the date moves if the release criteria are not met. Shown on the coming-soon page | A fixed promise, or no date | Owner wants an honest date to plan around, and "properly tested, not like 1.0" beats speed |
| 2026-11-17 | Planned launch features: inventory with value, float, seed and stickers plus inspect-link lookup (the hook), price compare, alerts, wishlist, guides and blog. Deals and trade-up after launch. Giveaways undecided | Everything at once | Fewer features done well. SkinAPI already has most of the data |
| 2026-11-17 | Revenue plan (proposal, owner has not confirmed): affiliate links first, Pro subscription after launch, no ads, no chance mechanics. Log anonymous outbound clicks from day one | Ads, credits, cases | Ads conflict with "no trackers" and page speed; credits and cases were the legal risk of 1.0 |
| 2026-11-17 | SkinAPI stays the data layer, called server-side only | Own price fetching | Already built, 11 marketplaces, float, inventory, alerts |
| 2026-11-17 | Owner and co-owner sign in on the coming-soon page with their own passwords (scrypt hashes in the environment, signed 12-hour cookie, per-address and total attempt limits, alert on sign-in). Unfinished pages are built behind this sign-in and move to the public routes at launch | One shared password, basic auth in front of the proxy, a separate staging site | Two people need to see the unfinished site on the real domain. Separate passwords show who signed in and can be changed alone. The cookie is only set after sign-in, so visitors still get no cookies |
| 2026-11-17 | Credits are kept: every balance is imported 1:1 at launch and the 3 open prize claims are honoured. No history import, no way to win or lose credits in 2.0, and no cash-out | Starting the credit ledger empty (the earlier plan) | The server owner told members on 2026-11-16 that no credits would be lost and won items stay theirs. Measured 2026-11-17: 134 users hold a balance, 46.4M credits in total, one account holds 38.2M (82 percent, almost all from plinko), 273,500 credits were bought with real money in total, 3 claims are PENDING. What credits can be spent on in 2.0 is still open |


## SkinAPI live test, 2026-11-17 (read-only calls with the owner key)

| Endpoint | Result |
|---|---|
| `markets` | Works. 8 sources for AK-47 Redline FT, prices in minor units, fresh within 10 minutes, about 0.8 s. **No listing URL per marketplace in the response**, so affiliate deep links need another source or a per-market URL builder |
| `history` | Works. Daily average and volume, 30 days in 0.3 s |
| `float/leaderboard` | **402: needs the Pro plan, the owner key has plan `owner_wes`.** The SkinAPI session says the plan gate did not know `owner_wes` and fixed it in code (not deployed when this was written). `/float` itself was not called yet, so not tested |
| `inventory` | Needs `game=cs2` (not 730). Not tested with data: the test profile was private. Needs a public Steam id |
| `status` | `degraded`. Workers (ingestor, alerts, floatbots, tracker) show stale about 19 hours. Cause in the logs: **the SkinAPI MongoDB Atlas cluster is over its 512 MB quota and blocks writes** (the tracker could not snapshot inventories, the ingestor status write failed). Prices are still updating, so only part of the writes fail |
| Host | Disk of the PC is at about 94 percent |

Consequences: alerts and float depend on workers that currently cannot write their state, so fix the quota (clean old data or upgrade the cluster) before building on them. Inventory history cannot be recorded until then.

### Float and seed come from Steam itself, tested 2026-11-17

Test profile: the site's own Steam account (`SV_WEBSITE_PRIVATE_STEAM_ID` in the old env, public inventory, 141 items).
- `GET steamcommunity.com/inventory/<id>/730/2?count=200` from this PC returned HTTP 200 (not blocked from this IP). The response has an `asset_properties` list: **Pattern Template (paint seed), Wear Rating (the float)** and an Item Certificate string, for 115 of the 141 items (the rest are items without wear, such as stickers, cases and agents). Sticker names are in the item description text.
- So the "hook" feature (inventory with value, float, seed and stickers) needs no bots, no game coordinator and no inspect-link decoding for items in a public inventory. Inspect-link lookup for items that are not in a public inventory (for example a link pasted from a market listing) still needs SkinAPI `/float` or the CSFloat serializer.
- SkinAPI `/inventory` (141 items, total 36.41 EUR, 0.74 s) returns price but **no float, seed or stickers**, so for 2.0 we merge two sources: Steam for float and seed, SkinAPI for prices.
- Not tested: SkinAPI `/float` with a real inspect link (my link had a made-up `D` value and stayed `queued`), sticker prices, and Steam's rate limit for many inventories in a row. Cache every inventory in Postgres and rate-limit our own lookups.

### SkinAPI retest after the fixes, 2026-11-18

| Check | Result |
|---|---|
| `status` | `operational`, every component ok (workers fresh, database writable) |
| `markets` links | A `url` per marketplace now. Buff, csgo.tm, cs.money, Skinport, Waxpeer are **search pages** on the marketplace, Steam is the exact listing, **loot.farm and swap.gg have none**. Not item-level deep links, so affiliate links need a per-marketplace check of what each programme accepts |
| `float/leaderboard` | 200, but empty (count 0): nothing has been collected yet |
| `/float` with a real inspect link | Stays `queued`; the float bots log `inspect failed: inspect timeout` for every request. Do not build on `/float` |
| Plan gate | The 402 on the owner key is gone |

**Decoding an inspect link locally works.** The Item Certificate that Steam puts in the inventory (and the payload inside a `steam://run/730//+csgo_econ_action_preview%20<hex>` link) is a masked protobuf: XOR every byte with the first byte, drop the first byte and the last 4 (checksum), read fields 3 defindex, 4 paintindex, 7 wear (float32 bits), 8 paintseed, 12 stickers. Decoded in about 20 lines of Python for the test item: float 0.0358386, seed 71, matching Steam's own `asset_properties` exactly. So both paths of the hook feature need no bots and no SkinAPI float service: inventory items use Steam's `asset_properties`, a pasted link is decoded in our own code. Old-style links (`S...A...D...`) still need Valve's game coordinator and are out of scope.
