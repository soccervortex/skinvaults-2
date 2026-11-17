import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import pg from "pg";
import { createLogger } from "../src/platform/logger.ts";
import { migrate, type Pool } from "../src/platform/db.ts";
import { hashPassword } from "../src/platform/password.ts";
import { createWeb } from "../src/web/router.ts";
import type { OwnerAuth } from "../src/web/ownerSession.ts";
import type { FetchLike } from "../src/steam/http.ts";
import type { SkinApi } from "../src/platform/skinapi.ts";
import { INVENTORY_TTL_MS, loadInventory } from "../src/inventory.ts";
import { createUserSession, deleteExpiredSessions, userForSession, USER_SESSION_TTL_MS } from "../src/users.ts";

const log = createLogger("error");
const schema = `i_${process.pid}_${Date.now()}`;
const base = "http://localhost";
const site = { baseUrl: base, discordInviteUrl: null, contactEmail: null };
const PASSWORD = "correct horse battery staple";
const ID = "76561198750974604";
const OTHER = "76561198000000001";
let pool: Pool;
let server: Server;
let origin = "";
let ownerCookie = "";

const reply = (status: number, body: string): ReturnType<FetchLike> => Promise.resolve({ ok: status >= 200 && status < 300, status, text: () => Promise.resolve(body) });

// What the fake Steam does is switched per test.
const steam = { inventoryStatus: 200, inventoryCalls: 0, openidValid: true, stickerName: "Mirage (Gold)" };
let fixtureText = "";
const steamFetch: FetchLike = (url, init) => {
  if (url.startsWith("https://steamcommunity.com/inventory/")) {
    steam.inventoryCalls++;
    return reply(steam.inventoryStatus, steam.inventoryStatus === 200 ? fixtureText.replace("Mirage (Gold)", steam.stickerName) : "null");
  }
  if (url === "https://steamcommunity.com/openid/login") return reply(200, steam.openidValid ? "is_valid:true\n" : "is_valid:false\n");
  const m = /\/(?:profiles|id)\/([^/]+)\/\?xml=1$/.exec(url);
  if (m) {
    const id = m[1] === "known_name" ? OTHER : /^\d{17}$/.test(m[1]!) ? m[1]! : "";
    if (!id) return reply(200, "<response><error><![CDATA[not found]]></error></response>");
    return reply(200, `<profile><steamID64>${id}</steamID64><steamID><![CDATA[Test <b>Person</b>]]></steamID><avatarFull><![CDATA[https://avatars.steamstatic.com/x_full.jpg]]></avatarFull></profile>`);
  }
  void init;
  return reply(404, "");
};
let priceCalls = 0;
let pricesUp = true;
const skinApi: SkinApi = {
  async inventoryPrices() {
    priceCalls++;
    if (!pricesUp) return null;
    return { currency: "EUR", prices: new Map([["53903990221", { price: 366, source: "skinport" }], ["53903990220", { price: 1500, source: "csgotm" }], ["52199500623", { price: 250, source: "skinport" }]]) };
  },
};

before(async () => {
  const url = process.env.DATABASE_URL;
  assert.ok(url, "DATABASE_URL must point at a test PostgreSQL (run: npm run db:dev)");
  fixtureText = await readFile(new URL("./fixtures/steam-inventory.json", import.meta.url), "utf8");
  const admin = new pg.Pool({ connectionString: url, max: 1 });
  await admin.query(`create schema ${schema}`);
  await admin.end();
  pool = new pg.Pool({ connectionString: url, max: 4, options: `-c search_path=${schema}` });
  await migrate(pool, log);
  const owners: OwnerAuth = { sessionSecret: "s".repeat(48), version: "1", accounts: [{ name: "owner", hash: await hashPassword(PASSWORD, { N: 1024, r: 8, p: 1 }) }] };
  const web = createWeb(pool, site, { owners, steam: { skinApi, fetchFn: steamFetch, steam: { fetchFn: steamFetch, sleep: async () => {} } } });
  server = createServer((req, res) => {
    const u = new URL(req.url ?? "/", "http://localhost");
    void web.handle(req, res, u).then((handled) => { if (!handled) { res.writeHead(404); res.end("nf"); } });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const login = await fetch(origin + "/owner", { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", "cf-connecting-ip": "203.0.113.50" }, body: new URLSearchParams({ password: PASSWORD }) });
  assert.equal(login.status, 303);
  ownerCookie = login.headers.get("set-cookie")!.split(";")[0]!;
});
after(async () => {
  server.close();
  const url = process.env.DATABASE_URL!;
  await pool.end();
  const admin = new pg.Pool({ connectionString: url, max: 1 });
  await admin.query(`drop schema ${schema} cascade`);
  await admin.end();
});

const get = (path: string, cookie = ownerCookie, ip = "198.51.100.1") => fetch(origin + path, { redirect: "manual", headers: { cookie, "cf-connecting-ip": ip } });
const clearCache = () => pool.query("delete from inventory_cache");

test("nobody but a signed-in owner reaches the inventory or the Steam sign-in", async () => {
  for (const path of ["/inventory", `/inventory/${ID}`, "/auth/steam", "/auth/steam/callback"]) {
    assert.equal((await get(path, "")).status, 404, path);
  }
  assert.equal((await fetch(origin + "/account/delete", { method: "POST" })).status, 404);
});

test("the lookup page is private, allows Valve's image CDN and nothing else, and has no inline styles", async () => {
  const r = await get("/inventory");
  assert.equal(r.status, 200);
  assert.match(r.headers.get("x-robots-tag")!, /noindex/);
  const csp = r.headers.get("content-security-policy")!;
  assert.match(csp, /img-src 'self' data: https:\/\/\*\.steamstatic\.com/);
  assert.match(csp, /default-src 'none'/);
  const html = await r.text();
  assert.match(html, /Sign in with Steam/);
  assert.ok(!/ style=/.test(html));
  assert.match(await (await fetch(origin + "/robots.txt")).text(), /Disallow: \/inventory/);
});

test("lookup: IDs and links go to the inventory page, names are resolved, junk is refused", async () => {
  const id = await get(`/inventory?q=${ID}`);
  assert.equal(id.status, 303);
  assert.equal(id.headers.get("location"), `/inventory/${ID}`);
  const name = await get("/inventory?q=known_name");
  assert.equal(name.headers.get("location"), `/inventory/${OTHER}`);
  assert.equal((await get("/inventory?q=https://evil.test/x")).status, 400);
  assert.equal((await get("/inventory?q=nobody_here")).status, 404);
});

test("inventory page: value, float, seed and stickers are shown, and Steam is asked once for repeated views", async () => {
  await clearCache();
  steam.inventoryCalls = 0;
  priceCalls = 0;
  const r = await get(`/inventory/${ID}`);
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.match(html, /Test &lt;b&gt;Person&lt;\/b&gt;/); // the public name is escaped, never raw markup
  assert.ok(!html.includes("<b>Person</b>"));
  assert.match(html, /€21\.16/); // 3.66 + 15.00 + 2.50: the charm has no price and is not counted
  assert.match(html, /0\.035838645/);
  assert.match(html, /Seed <b>71<\/b>/);
  assert.match(html, /Mirage \(Gold\)/);
  assert.match(html, /steam:\/\/run\/730\/\/\+csgo_econ_action_preview%20/);
  assert.match(html, /https:\/\/community\.cloudflare\.steamstatic\.com\/economy\/image\//);
  assert.ok(!/ style=/.test(html));
  assert.equal(steam.inventoryCalls, 1);
  assert.equal(priceCalls, 1);
  await (await get(`/inventory/${ID}?sort=float`)).text();
  await (await get(`/inventory/${ID}?sort=bogus`)).text();
  assert.equal(steam.inventoryCalls, 1); // served from the cache
  assert.equal(priceCalls, 1);
});

test("inventory page: sticker names from Steam cannot inject markup", async () => {
  await clearCache();
  steam.stickerName = `<img src=x onerror=alert(1)>`;
  const html = await (await get(`/inventory/${ID}`)).text();
  steam.stickerName = "Mirage (Gold)";
  assert.ok(!html.includes("<img src=x"));
});

test("inventory page: when prices are down the inventory still shows, honestly without a value", async () => {
  await clearCache();
  pricesUp = false;
  const html = await (await get(`/inventory/${ID}`)).text();
  pricesUp = true;
  assert.match(html, /Prices are unavailable/);
  assert.match(html, /0\.035838645/);
  assert.match(html, /no price/);
});

test("inventory: private and missing inventories explain themselves; a busy Steam falls back to the saved copy", async () => {
  await clearCache();
  steam.inventoryStatus = 403;
  const priv = await get(`/inventory/${OTHER}`);
  assert.equal(priv.status, 403);
  assert.match(await priv.text(), /inventory is private/);

  steam.inventoryStatus = 200;
  await (await get(`/inventory/${ID}`)).text();
  await pool.query("update inventory_cache set fetched_at = now() - interval '1 hour' where steam_id = $1", [ID]);
  steam.inventoryStatus = 429;
  const stale = await get(`/inventory/${ID}`);
  assert.equal(stale.status, 200);
  assert.match(await stale.text(), /last copy we saved/);
  await clearCache();
  const none = await get(`/inventory/${ID}`);
  assert.equal(none.status, 503);
  assert.match(await none.text(), /asking everybody to slow down/);
  steam.inventoryStatus = 200;
});

test("inventory service: two people asking at once share one Steam call, and a fresh copy is reused until it ages", async () => {
  await clearCache();
  steam.inventoryCalls = 0;
  const deps = { pool, skinApi: null, steam: { fetchFn: steamFetch, sleep: async () => {} } };
  const [a, b] = await Promise.all([loadInventory(deps, ID), loadInventory(deps, ID)]);
  assert.equal(a.status, "ok");
  assert.equal(b.status, "ok");
  assert.equal(steam.inventoryCalls, 1);
  const again = await loadInventory(deps, ID);
  assert.ok(again.status === "ok" && again.cached && !again.stale);
  await pool.query("update inventory_cache set fetched_at = now() - ($2 || ' milliseconds')::interval where steam_id = $1", [ID, String(INVENTORY_TTL_MS + 1000)]);
  const refreshed = await loadInventory(deps, ID);
  assert.ok(refreshed.status === "ok" && !refreshed.cached);
  assert.equal(steam.inventoryCalls, 2);
});

test("lookups are rate limited per address", async () => {
  const ip = "198.51.100.99";
  let last = 0;
  for (let i = 0; i < 31; i++) last = (await get("/inventory?q=bad!", ownerCookie, ip)).status;
  assert.equal(last, 429);
});

test("user sessions: only the hash is stored, they expire, and they are cleaned up", async () => {
  await pool.query("insert into users (steam_id, persona_name) values ($1, 'Someone') on conflict do nothing", [OTHER]);
  const now = Date.now();
  const token = await createUserSession(pool, OTHER, now);
  assert.equal((await userForSession(pool, token, now + 1000))?.steamId, OTHER);
  assert.equal(await userForSession(pool, token, now + USER_SESSION_TTL_MS + 1000), null);
  assert.equal(await userForSession(pool, "short"), null);
  assert.equal(await userForSession(pool, "A".repeat(43)), null);
  const stored = (await pool.query<{ token_hash: string }>("select token_hash from sessions")).rows.map((r) => r.token_hash);
  assert.ok(!stored.includes(token));
  await pool.query("update sessions set expires_at = now() - interval '1 minute'");
  assert.ok((await deleteExpiredSessions(pool)) >= 1);
});

test("Steam sign-in: the full round trip creates a user and a session; stale, forged or replayed attempts do not", async () => {
  const start = await get("/auth/steam");
  assert.equal(start.status, 303);
  const location = new URL(start.headers.get("location")!);
  assert.equal(location.origin, "https://steamcommunity.com");
  const returnTo = new URL(location.searchParams.get("openid.return_to")!);
  assert.equal(returnTo.origin + returnTo.pathname, `${base}/auth/steam/callback`);
  const state = returnTo.searchParams.get("s")!;
  const stateCookie = start.headers.get("set-cookie")!.split(";")[0]!;
  assert.match(stateCookie, /^sv_oid=[0-9a-f]{32}$/);

  const query = (s: string, claimed = ID) =>
    "?" + new URLSearchParams({
      s,
      "openid.ns": "http://specs.openid.net/auth/2.0",
      "openid.mode": "id_res",
      "openid.op_endpoint": "https://steamcommunity.com/openid/login",
      "openid.claimed_id": `https://steamcommunity.com/openid/id/${claimed}`,
      "openid.identity": `https://steamcommunity.com/openid/id/${claimed}`,
      "openid.return_to": `${base}/auth/steam/callback?s=${s}`,
      "openid.response_nonce": "2026-11-18T10:00:00Zabc",
      "openid.assoc_handle": "1",
      "openid.signed": "signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle",
      "openid.sig": "c2ln",
    }).toString();

  // an answer that did not start here (no matching state cookie) is refused
  assert.equal((await get(`/auth/steam/callback${query(state)}`, ownerCookie)).status, 400);
  // Steam says no
  steam.openidValid = false;
  assert.equal((await get(`/auth/steam/callback${query(state)}`, `${ownerCookie}; ${stateCookie}`)).status, 400);
  steam.openidValid = true;
  assert.equal((await pool.query("select 1 from users where steam_id = $1", [ID])).rowCount, 0);

  const ok = await get(`/auth/steam/callback${query(state)}`, `${ownerCookie}; ${stateCookie}`);
  assert.equal(ok.status, 303);
  assert.equal(ok.headers.get("location"), `/inventory/${ID}`);
  const cookies = ok.headers.getSetCookie();
  const session = cookies.find((c) => c.startsWith("sv_session="))!;
  assert.match(session, /HttpOnly/);
  assert.match(session, /SameSite=Lax/);
  assert.ok(cookies.some((c) => c.startsWith("sv_oid=;") && /Max-Age=0/.test(c)));
  const user = (await pool.query("select persona_name, avatar_url from users where steam_id = $1", [ID])).rows[0];
  assert.equal(user.persona_name, "Test <b>Person</b>");
  assert.equal(user.avatar_url, "https://avatars.steamstatic.com/x_full.jpg");

  const sessionCookie = session.split(";")[0]!;
  const home = await (await get("/inventory", `${ownerCookie}; ${sessionCookie}`)).text();
  assert.match(home, /Signed in as Test &lt;b&gt;Person&lt;\/b&gt;/);

  // sign out removes the session on our side too
  const out = await fetch(origin + "/auth/logout", { method: "POST", redirect: "manual", headers: { cookie: `${ownerCookie}; ${sessionCookie}` } });
  assert.equal(out.status, 303);
  assert.equal(await userForSession(pool, sessionCookie.split("=")[1]!), null);

  // a different Steam ID cannot ride on someone else's assertion: the claimed id is inside what Steam signed and checked
  assert.equal((await get(`/auth/steam/callback${query(state, "123")}`, `${ownerCookie}; ${stateCookie}`)).status, 400);
});

test("delete my data removes the user, the sessions and the cached inventory", async () => {
  await get(`/inventory/${ID}`).then((r) => r.text());
  await pool.query("insert into users (steam_id) values ($1) on conflict do nothing", [ID]);
  const token = await createUserSession(pool, ID);
  const cookie = `${ownerCookie}; sv_session=${token}`;
  const r = await fetch(origin + "/account/delete", { method: "POST", redirect: "manual", headers: { cookie } });
  assert.equal(r.status, 303);
  assert.equal((await pool.query("select 1 from users where steam_id = $1", [ID])).rowCount, 0);
  assert.equal((await pool.query("select 1 from sessions where steam_id = $1", [ID])).rowCount, 0);
  assert.equal((await pool.query("select 1 from inventory_cache where steam_id = $1", [ID])).rowCount, 0);
  const cross = await fetch(origin + "/account/delete", { method: "POST", redirect: "manual", headers: { cookie, origin: "https://evil.test" } });
  assert.equal(cross.status, 403);
});
