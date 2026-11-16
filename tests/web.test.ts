import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import pg from "pg";
import { createLogger } from "../src/platform/logger.ts";
import { migrate, type Pool } from "../src/platform/db.ts";
import { signup, confirm, unsubscribe, normaliseEmail, deleteStalePending, RESEND_COOLDOWN_MS, looksLikeToken } from "../src/waitlist.ts";
import { createRateLimiter } from "../src/web/rateLimit.ts";
import { createWeb } from "../src/web/router.ts";
import { esc, layout } from "../src/web/html.ts";
import { homePage } from "../src/web/pages.ts";
import { loadConfig } from "../src/config.ts";

const log = createLogger("error");
const schema = `w_${process.pid}_${Date.now()}`;
const base = "https://example.test";
const site = { baseUrl: base, discordInviteUrl: "https://discord.gg/abc123", contactEmail: null };
let pool: Pool;
let server: Server;
let origin = "";

before(async () => {
  const url = process.env.DATABASE_URL;
  assert.ok(url, "DATABASE_URL must point at a test PostgreSQL (run: npm run db:dev)");
  const admin = new pg.Pool({ connectionString: url, max: 1 });
  await admin.query(`create schema ${schema}`);
  await admin.end();
  pool = new pg.Pool({ connectionString: url, max: 4, options: `-c search_path=${schema}` });
  await migrate(pool, log);
  const web = createWeb(pool, site);
  server = createServer((req, res) => {
    const u = new URL(req.url ?? "/", "http://localhost");
    void web.handle(req, res, u).then((handled) => { if (!handled) { res.writeHead(404); res.end("nf"); } });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  server.close();
  const url = process.env.DATABASE_URL!;
  await pool.end();
  const admin = new pg.Pool({ connectionString: url, max: 1 });
  await admin.query(`drop schema ${schema} cascade`);
  await admin.end();
});

const post = (path: string, body: Record<string, string>, headers: Record<string, string> = {}) =>
  fetch(origin + path, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", ...headers }, body: new URLSearchParams(body) });
const rows = async () => (await pool.query("select * from waitlist order by id")).rows;
const mails = async () => (await pool.query("select payload from outbox order by id")).rows.map((r) => r.payload as { to: string; text: string });
const tokenFrom = (text: string, kind: "confirm" | "unsubscribe") => new RegExp(`/waitlist/${kind}\\?token=([A-Za-z0-9_-]+)`).exec(text)![1]!;

test("normaliseEmail accepts normal addresses and rejects junk", () => {
  assert.equal(normaliseEmail("  Ann@Example.COM "), "Ann@example.com");
  for (const bad of ["", "no-at", "a@b", "a b@c.com", "a@@c.com", "<x>@c.com", "a@c..com", "x".repeat(70) + "@c.com", "a,b@c.com"]) {
    assert.equal(normaliseEmail(bad), null, bad);
  }
});

test("rate limiter allows max hits per window, then recovers", () => {
  const l = createRateLimiter(2, 1000);
  assert.ok(l.allow("a", 0));
  assert.ok(l.allow("a", 10));
  assert.ok(!l.allow("a", 20));
  assert.ok(l.allow("b", 20));
  assert.ok(l.allow("a", 1500));
});

test("html escaping and page metadata", () => {
  assert.equal(esc(`<a href="x">&'`), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
  const h = layout(site, homePage(site));
  assert.match(h, /<title>[^<]{10,70}<\/title>/);
  assert.match(h, /<link rel="canonical" href="https:\/\/example\.test\/">/);
  assert.match(h, /<meta name="description" content="[^"]{50,160}"/);
  assert.match(h, /application\/ld\+json/);
  assert.ok(!/noindex/.test(h));
  assert.match(h, /https:\/\/discord\.gg\/abc123/);
});

test("signup queues exactly one confirmation mail; double submit and reconfirmation are quiet", async () => {
  assert.equal(await signup(pool, base, "Fan@Example.com"), "ok");
  assert.equal(await signup(pool, base, "fan@example.com"), "ok"); // within the cooldown: no second mail
  const m = await mails();
  assert.equal(m.length, 1);
  assert.equal(m[0]!.to, "Fan@example.com");
  assert.match(m[0]!.text, /https:\/\/example\.test\/waitlist\/confirm\?token=/);
  assert.equal((await rows()).length, 1);
});

test("after the cooldown a pending address gets a reminder; a confirmed one never does", async () => {
  const before = (await mails()).length;
  assert.equal(await signup(pool, base, "fan@example.com", Date.now() + RESEND_COOLDOWN_MS + 1000), "ok");
  assert.equal((await mails()).length, before + 1);
  const t = tokenFrom((await mails()).at(-1)!.text, "confirm");
  assert.ok(await confirm(pool, t));
  assert.equal(await signup(pool, base, "fan@example.com", Date.now() + 10 * RESEND_COOLDOWN_MS), "ok");
  assert.equal((await mails()).length, before + 1);
  assert.equal((await rows())[0].status, "confirmed");
});

test("unsubscribe deletes the row; unknown or malformed tokens do nothing", async () => {
  const t = tokenFrom((await mails())[0]!.text, "unsubscribe");
  assert.ok(!looksLikeToken("short"));
  assert.ok(!(await unsubscribe(pool, "x".repeat(32))));
  assert.ok(await unsubscribe(pool, t));
  assert.equal((await rows()).length, 0);
  assert.ok(!(await unsubscribe(pool, t)));
});

test("only unconfirmed addresses older than a week are cleaned up", async () => {
  await signup(pool, base, "old@example.com");
  await signup(pool, base, "new@example.com");
  await pool.query("update waitlist set created_at = now() - interval '8 days' where email = 'old@example.com'");
  assert.equal(await deleteStalePending(pool), 1);
  assert.deepEqual((await rows()).map((r) => r.email), ["new@example.com"]);
});

test("HTTP: home, privacy, robots, sitemap and css are served with the right headers", async () => {
  const home = await fetch(origin + "/");
  assert.equal(home.status, 200);
  assert.match(home.headers.get("content-type")!, /text\/html/);
  assert.match(home.headers.get("content-security-policy")!, /default-src 'none'/);
  assert.match(home.headers.get("cache-control")!, /no-transform/);
  const html = await home.text();
  const css = /href="(\/assets\/theme\.[a-f0-9]+\.css)"/.exec(html)![1]!;
  assert.equal((await fetch(origin + css)).status, 200);
  assert.equal((await fetch(origin + "/privacy")).status, 200);
  const robots = await (await fetch(origin + "/robots.txt")).text();
  assert.match(robots, /Sitemap: https:\/\/example\.test\/sitemap\.xml/);
  assert.match(await (await fetch(origin + "/sitemap.xml")).text(), /<loc>https:\/\/example\.test\/privacy<\/loc>/);
});

test("HTTP: the form flow works end to end and bots and cross-site posts are refused", async () => {
  const ok = await post("/waitlist", { email: "e2e@example.com", website: "" }, { "cf-connecting-ip": "203.0.113.1" });
  assert.equal(ok.status, 200);
  assert.match(await ok.text(), /confirmation mail is on its way/);
  const bot = await post("/waitlist", { email: "bot@example.com", website: "http://spam" }, { "cf-connecting-ip": "203.0.113.2" });
  assert.equal(bot.status, 200);
  assert.ok(!(await rows()).some((r) => r.email === "bot@example.com"));
  const cross = await post("/waitlist", { email: "x@example.com" }, { origin: "https://evil.test", "cf-connecting-ip": "203.0.113.3" });
  assert.equal(cross.status, 403);
  const bad = await post("/waitlist", { email: "nope" }, { "cf-connecting-ip": "203.0.113.4" });
  assert.equal(bad.status, 400);

  const t = tokenFrom((await mails()).find((m) => m.to === "e2e@example.com")!.text, "confirm");
  const page = await fetch(`${origin}/waitlist/confirm?token=${t}`);
  assert.match(await page.text(), /<button type="submit">Confirm<\/button>/);
  assert.equal((await rows()).find((r) => r.email === "e2e@example.com").status, "pending"); // a GET alone never confirms
  assert.equal((await post("/waitlist/confirm", { token: t })).status, 200);
  assert.equal((await rows()).find((r) => r.email === "e2e@example.com").status, "confirmed");
  assert.equal((await post("/waitlist/confirm", { token: "x".repeat(30) })).status, 400);
  assert.equal((await fetch(`${origin}/waitlist/unsubscribe?token=bad`)).status, 400);
});

test("HTTP: the sixth signup from one address in ten minutes is rate limited", async () => {
  const hit = () => post("/waitlist", { email: "rl@example.com" }, { "cf-connecting-ip": "198.51.100.9" });
  for (let i = 0; i < 5; i++) assert.notEqual((await hit()).status, 429);
  const r = await hit();
  assert.equal(r.status, 429);
  assert.equal(r.headers.get("retry-after"), "600");
});

test("config validates the public settings", () => {
  const good = { DATABASE_URL: "postgresql://u:p@h/db", STATUS_TOKEN: "x".repeat(32), SMTP_HOST: "h", SMTP_USER: "u", SMTP_PASS: "p", SMTP_FROM: "a@b.c", OWNER_ALERT_EMAIL: "o@b.c" };
  assert.equal(loadConfig({ ...good, PUBLIC_BASE_URL: "https://skinvaults.online/" }).site.publicBaseUrl, "https://skinvaults.online");
  assert.throws(() => loadConfig({ ...good, PUBLIC_BASE_URL: "skinvaults.online" }), /PUBLIC_BASE_URL/);
  assert.throws(() => loadConfig({ ...good, DISCORD_INVITE_URL: "https://evil.test/x" }), /DISCORD_INVITE_URL/);
  assert.equal(loadConfig(good).site.discordInviteUrl, null);
});

test("HTTP: fonts are served from an allowlisted path only", async () => {
  const ok = await fetch(origin + "/fonts/barlow-condensed-latin-800-normal.woff2");
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("content-type"), "font/woff2");
  assert.ok((await ok.arrayBuffer()).byteLength > 1000);
  assert.equal((await fetch(origin + "/fonts/nope.woff2")).status, 404);
  assert.equal((await fetch(origin + "/fonts/..%2F..%2Fpackage.json")).status, 404);
  assert.equal((await fetch(origin + "/fonts/LICENSE-barlow.txt")).status, 404);
});
