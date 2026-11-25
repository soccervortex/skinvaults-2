import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { hashPassword, isValidHash, verifyPassword } from "../src/platform/password.ts";
import { createSessionToken, readSessionToken, SESSION_TTL_MS, type OwnerAuth } from "../src/web/ownerSession.ts";
import { createWeb, type WebOptions } from "../src/web/router.ts";
import type { Pool } from "../src/platform/db.ts";
import { loadConfig } from "../src/config.ts";

const FAST = { N: 1024, r: 8, p: 1 }; // cheap parameters, only for tests; the format carries them, so verify adapts
const OWNER_PW = "correct horse battery staple";
const COOWNER_PW = "another long passphrase here";
const SECRET = "s".repeat(48);
let auth: OwnerAuth;

before(async () => {
  auth = {
    sessionSecret: SECRET,
    version: "1",
    accounts: [
      { name: "owner", hash: await hashPassword(OWNER_PW, FAST) },
      { name: "co-owner", hash: await hashPassword(COOWNER_PW, FAST) },
    ],
  };
});

test("password hashes verify the right password only, and bad input is simply a mismatch", async () => {
  const h = await hashPassword(OWNER_PW, FAST);
  assert.ok(isValidHash(h));
  assert.ok(!h.includes(OWNER_PW));
  assert.ok(await verifyPassword(OWNER_PW, h));
  assert.ok(!(await verifyPassword(OWNER_PW + "x", h)));
  assert.ok(!(await verifyPassword("", h)));
  assert.notEqual(h, await hashPassword(OWNER_PW, FAST)); // new salt each time
  assert.ok(!(await verifyPassword(OWNER_PW, "not-a-hash")));
  assert.ok(!(await verifyPassword(OWNER_PW, "scrypt:1000:8:1:aaaa:bbbb")));
  assert.ok(!(await verifyPassword("x".repeat(300), h))); // refused before any hashing
  await assert.rejects(() => hashPassword("short", FAST), /at least 12/);
});

test("session tokens: valid, tampered, expired, wrong secret, new version, removed account", () => {
  const now = 1_000_000;
  const t = createSessionToken(auth, "owner", now);
  assert.equal(readSessionToken(auth, t, now + 1000), "owner");
  assert.equal(readSessionToken(auth, undefined, now), null);
  assert.equal(readSessionToken(auth, "garbage", now), null);
  const [payload, sig] = t.split(".") as [string, string];
  const forged = Buffer.from(JSON.stringify({ n: "co-owner", v: "1", e: now + SESSION_TTL_MS })).toString("base64url");
  assert.equal(readSessionToken(auth, `${forged}.${sig}`, now + 1000), null);
  assert.equal(readSessionToken(auth, `${payload}.${sig.slice(0, -2)}xx`, now + 1000), null);
  assert.equal(readSessionToken(auth, t, now + SESSION_TTL_MS + 1), null);
  assert.equal(readSessionToken({ ...auth, sessionSecret: "t".repeat(48) }, t, now + 1000), null);
  assert.equal(readSessionToken({ ...auth, version: "2" }, t, now + 1000), null);
  assert.equal(readSessionToken({ ...auth, accounts: auth.accounts.filter((a) => a.name !== "owner") }, t, now + 1000), null);
});

test("config: owner sign-in is off without hashes and checked when set; values never appear in errors", async () => {
  const good = { DATABASE_URL: "postgresql://u:p@h/db", STATUS_TOKEN: "x".repeat(32), SMTP_HOST: "h", SMTP_USER: "u", SMTP_PASS: "p", SMTP_FROM: "a@b.c", OWNER_ALERT_EMAIL: "o@b.c" };
  assert.equal(loadConfig(good).owners, null);
  const hashA = await hashPassword(OWNER_PW, FAST);
  const hashB = await hashPassword(COOWNER_PW, FAST);
  const on = loadConfig({ ...good, OWNER_PASSWORD_HASH: hashA, COOWNER_PASSWORD_HASH: hashB, SESSION_SECRET: SECRET });
  assert.deepEqual(on.owners!.accounts.map((a) => a.name), ["owner", "co-owner"]);
  assert.equal(on.owners!.version, "1");
  assert.throws(() => loadConfig({ ...good, OWNER_PASSWORD_HASH: hashA }), /SESSION_SECRET/);
  assert.throws(() => loadConfig({ ...good, OWNER_PASSWORD_HASH: hashA, SESSION_SECRET: "short" }), /SESSION_SECRET/);
  assert.throws(() => loadConfig({ ...good, OWNER_PASSWORD_HASH: "plaintext-password", SESSION_SECRET: SECRET }), (e: Error) => /OWNER_PASSWORD_HASH/.test(e.message) && !e.message.includes("plaintext-password"));
  assert.throws(() => loadConfig({ ...good, OWNER_PASSWORD_HASH: hashA, COOWNER_PASSWORD_HASH: hashA, SESSION_SECRET: SECRET }), /must be different/);
  assert.equal(loadConfig({ ...good, COOWNER_PASSWORD_HASH: hashB, SESSION_SECRET: SECRET }).owners!.accounts[0]!.name, "co-owner");
});

type Running = { origin: string; close: () => void; notes: string[] };
const running: Running[] = [];
async function start(options: Partial<WebOptions>, baseUrl = "https://example.test"): Promise<Running> {
  const notes: string[] = [];
  const web = createWeb({} as Pool, { baseUrl, discordInviteUrl: null, contactEmail: null }, { notify: (t) => notes.push(t), ...options });
  const server: Server = createServer((req, res) => {
    void web.handle(req, res, new URL(req.url ?? "/", "http://localhost")).then((handled) => { if (!handled) { res.writeHead(404); res.end("nf"); } });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const r = { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => server.close(), notes };
  running.push(r);
  return r;
}
after(() => running.forEach((r) => r.close()));

const login = (s: Running, password: string, ip = "203.0.113.1", headers: Record<string, string> = {}) =>
  fetch(s.origin + "/owner", { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", "cf-connecting-ip": ip, ...headers }, body: new URLSearchParams({ password }) });
const cookieOf = (res: Response): string => res.headers.getSetCookie()[0]!.split(";")[0]!;

test("HTTP: the sign-in page exists, is not indexed, and says so when it is not set up", async () => {
  const s = await start({ owners: auth });
  const page = await fetch(s.origin + "/owner");
  assert.equal(page.status, 200);
  assert.match(page.headers.get("x-robots-tag")!, /noindex/);
  assert.match(page.headers.get("cache-control")!, /no-store/);
  const html = await page.text();
  assert.match(html, /type="password"/);
  assert.match(html, /<meta name="robots" content="noindex,nofollow">/);
  assert.match(await (await fetch(s.origin + "/robots.txt")).text(), /Disallow: \/owner/);
  const off = await start({ owners: null });
  assert.equal((await fetch(off.origin + "/owner")).status, 503);
  assert.match(await (await fetch(off.origin + "/owner")).text(), /not set up/);
  assert.equal((await login(off, OWNER_PW)).status, 503);
});

test("HTTP: a wrong password is refused with one generic message and no cookie", async () => {
  const s = await start({ owners: auth });
  const res = await login(s, "wrong password entirely");
  assert.equal(res.status, 401);
  assert.equal(res.headers.getSetCookie().length, 0);
  const html = await res.text();
  assert.match(html, /That password is not right/);
  assert.ok(!html.includes("wrong password entirely"));
  assert.equal((await login(s, "")).status, 401);
  assert.deepEqual(s.notes, []); // failures do not send alerts
});

test("HTTP: owner and co-owner sign in, see the preview, and visitors still see the public page", async () => {
  const s = await start({ owners: auth });
  const res = await login(s, OWNER_PW);
  assert.equal(res.status, 303);
  assert.equal(res.headers.get("location"), "/");
  const setCookie = res.headers.getSetCookie()[0]!;
  assert.match(setCookie, /^__Host-sv_owner=/);
  for (const flag of ["HttpOnly", "Secure", "SameSite=Lax", "Path=/", `Max-Age=${SESSION_TTL_MS / 1000}`]) assert.ok(setCookie.includes(flag), flag);
  assert.ok(!setCookie.includes("Domain="));
  assert.ok(!setCookie.includes(OWNER_PW));

  const mine = await fetch(s.origin + "/", { headers: { cookie: cookieOf(res) } });
  const html = await mine.text();
  assert.match(html, /Owner preview/);
  assert.match(html, /signed in as <strong>owner<\/strong>/);
  assert.match(mine.headers.get("cache-control")!, /private, no-store/);
  assert.match(mine.headers.get("x-robots-tag")!, /noindex/);

  // The owner lands on the real home page of the new site, in the app look, with a working inventory lookup.
  assert.match(html, /href="\/assets\/app\.[0-9a-f]{10}\.css"/);
  assert.match(html, /<form class="home-form" method="get" action="\/inventory">/);
  const progress = await fetch(s.origin + "/owner/progress", { headers: { cookie: cookieOf(res) } });
  assert.equal(progress.status, 200);
  assert.match(progress.headers.get("cache-control")!, /private, no-store/);
  assert.match(await progress.text(), /Price compare/);
  assert.equal((await fetch(s.origin + "/owner/progress")).status, 404);

  const visitor = await (await fetch(s.origin + "/")).text();
  assert.match(visitor, /Planned release/);
  assert.ok(!/Owner preview/.test(visitor));

  const publicView = await (await fetch(s.origin + "/?view=public", { headers: { cookie: cookieOf(res) } })).text();
  assert.match(publicView, /Planned release/);

  const co = await login(s, COOWNER_PW);
  assert.equal(co.status, 303);
  assert.match(await (await fetch(s.origin + "/", { headers: { cookie: cookieOf(co) } })).text(), /signed in as <strong>co-owner<\/strong>/);
  assert.equal((await fetch(s.origin + "/owner", { redirect: "manual", headers: { cookie: cookieOf(res) } })).status, 303); // already signed in
  assert.equal(s.notes.length, 2);
  assert.match(s.notes[0]!, /owner signed in/);
  assert.ok(!s.notes.join(" ").includes(OWNER_PW));
});

test("HTTP: a forged, tampered or old-version cookie gives no access", async () => {
  const s = await start({ owners: auth });
  const good = cookieOf(await login(s, OWNER_PW));
  const [name, value] = [good.slice(0, good.indexOf("=")), good.slice(good.indexOf("=") + 1)];
  const seen = async (cookie: string) => /Owner preview/.test(await (await fetch(s.origin + "/", { headers: { cookie } })).text());
  assert.equal(await seen(good), true);
  assert.equal(await seen(`${name}=${value.slice(0, -3)}abc`), false);
  assert.equal(await seen(`${name}=${createSessionToken({ ...auth, sessionSecret: "z".repeat(48) }, "owner")}`), false);
  assert.equal(await seen(`${name}=`), false);
  assert.equal(await seen("sv_owner=" + value), false); // wrong cookie name on an https site
  const bumped = await start({ owners: { ...auth, version: "2" } });
  assert.equal(/Owner preview/.test(await (await fetch(bumped.origin + "/", { headers: { cookie: good } })).text()), false);
});

test("HTTP: sign-out clears the cookie, and cross-site posts are refused", async () => {
  const s = await start({ owners: auth });
  const out = await fetch(s.origin + "/owner/logout", { method: "POST", redirect: "manual" });
  assert.equal(out.status, 303);
  assert.match(out.headers.getSetCookie()[0]!, /Max-Age=0/);
  assert.equal((await fetch(s.origin + "/owner/logout", { method: "POST", redirect: "manual", headers: { origin: "https://evil.test" } })).status, 403);
  assert.equal((await login(s, OWNER_PW, "203.0.113.7", { origin: "https://evil.test" })).status, 403);
  assert.equal((await login(s, OWNER_PW, "203.0.113.7", { origin: "https://example.test" })).status, 303);
});

test("HTTP: five attempts per address in fifteen minutes, then locked; other addresses are not affected", async () => {
  const s = await start({ owners: auth });
  for (let i = 0; i < 5; i++) assert.equal((await login(s, "nope nope nope nope", "198.51.100.1")).status, 401);
  const locked = await login(s, OWNER_PW, "198.51.100.1"); // even the right password is refused while locked
  assert.equal(locked.status, 429);
  assert.equal(locked.headers.get("retry-after"), "900");
  assert.equal(locked.headers.getSetCookie().length, 0);
  assert.equal((await login(s, OWNER_PW, "198.51.100.2")).status, 303);
});

test("HTTP: a forged address header cannot get around the combined limit, and the owner is told once", async () => {
  const s = await start({ owners: auth });
  let refused = 0;
  for (let i = 0; i < 40; i++) if ((await login(s, "guess guess guess guess", `192.0.2.${i + 1}`)).status === 429) refused += 1;
  assert.ok(refused >= 10, `expected the combined limit to stop attempts, got ${refused} refusals`);
  assert.equal((await login(s, OWNER_PW, "192.0.2.200")).status, 429);
  assert.equal(s.notes.filter((n) => /hammered/.test(n)).length, 1);
});

test("HTTP: owner pages work on plain http for local development (no Secure, no __Host- prefix)", async () => {
  const s = await start({ owners: auth }, "http://localhost:3000");
  const res = await login(s, OWNER_PW);
  const c = res.headers.getSetCookie()[0]!;
  assert.match(c, /^sv_owner=/);
  assert.ok(!c.includes("Secure"));
  assert.ok(c.includes("HttpOnly"));
});
