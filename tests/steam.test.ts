import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { decodeCertificate, inspectHex } from "../src/steam/certificate.ts";
import { loginUrl, verifyAssertion } from "../src/steam/openid.ts";
import { fetchProfile, parseSteamInput, safeAvatarUrl } from "../src/steam/profile.ts";
import { fetchInventory, parseInventoryPages } from "../src/steam/inventory.ts";
import type { FetchLike } from "../src/steam/http.ts";
import { createSkinApi } from "../src/platform/skinapi.ts";
import { loadConfig } from "../src/config.ts";

const fixture = async () => JSON.parse(await readFile(new URL("./fixtures/steam-inventory.json", import.meta.url), "utf8"));
const reply = (status: number, body: string): ReturnType<FetchLike> => Promise.resolve({ ok: status >= 200 && status < 300, status, text: () => Promise.resolve(body) });

const CERT = "2939E4929FCEE128313309D9230128192D11A2BEE2C12A696E41AAA9A9A9255931454E0882";

test("certificate: decodes float, seed, paint and weapon from a real item, with or without the link around it", () => {
  const item = decodeCertificate(CERT)!;
  assert.equal(item.defIndex, 26);
  assert.equal(item.paintIndex, 1392);
  assert.equal(item.paintSeed, 71);
  assert.ok(Math.abs(item.float! - 0.035838645) < 1e-8);
  assert.deepEqual(item.stickers, []);
  assert.equal(decodeCertificate(`steam://run/730//+csgo_econ_action_preview%20${CERT}`)!.paintSeed, 71);
  assert.equal(inspectHex(`  csgo_econ_action_preview ${CERT.toLowerCase()} `), CERT);
});

test("certificate: junk and old-style links give null instead of an error", () => {
  for (const bad of ["", "hello", "steam://run/730//+csgo_econ_action_preview%20S76561198750974604A1D2", "ZZZZ", "AB".repeat(5), "00".repeat(40)]) {
    assert.equal(decodeCertificate(bad), null, bad);
  }
});

test("steam input: ids, profile links and custom names are accepted, anything else is not", () => {
  const id = "76561198750974604";
  assert.deepEqual(parseSteamInput(` ${id} `), { kind: "id", steamId: id });
  assert.deepEqual(parseSteamInput(`https://steamcommunity.com/profiles/${id}/`), { kind: "id", steamId: id });
  assert.deepEqual(parseSteamInput("steamcommunity.com/id/some_name?x=1"), { kind: "vanity", name: "some_name" });
  assert.deepEqual(parseSteamInput("some-name"), { kind: "vanity", name: "some-name" });
  for (const bad of ["", "a", "76561198750974", "https://evil.test/id/x", "https://steamcommunity.com.evil.test/id/x", "../../etc/passwd", "a b", "x".repeat(300), "https://steamcommunity.com/profiles/123"]) {
    assert.equal(parseSteamInput(bad), null, bad);
  }
});

test("profile: reads name and avatar, refuses an avatar outside Steam's CDN, and handles missing profiles", async () => {
  const xml = (id: string, avatar: string) => `<?xml version="1.0"?><profile><steamID64>${id}</steamID64><steamID><![CDATA[Some <Name>]]></steamID><avatarFull><![CDATA[${avatar}]]></avatarFull></profile>`;
  const ok = await fetchProfile({ kind: "id", steamId: "76561198750974604" }, () => reply(200, xml("76561198750974604", "https://avatars.steamstatic.com/abc_full.jpg")));
  assert.deepEqual(ok, { status: "ok", profile: { steamId: "76561198750974604", personaName: "Some <Name>", avatarUrl: "https://avatars.steamstatic.com/abc_full.jpg" } });
  const evil = await fetchProfile({ kind: "id", steamId: "76561198750974604" }, () => reply(200, xml("76561198750974604", "https://evil.test/a.jpg")));
  assert.equal(evil.status === "ok" && evil.profile.avatarUrl, "");
  const mismatch = await fetchProfile({ kind: "id", steamId: "76561198750974604" }, () => reply(200, xml("76561198000000001", "")));
  assert.equal(mismatch.status, "unavailable");
  const vanity = await fetchProfile({ kind: "vanity", name: "x1" }, () => reply(200, xml("76561198750974605", "")));
  assert.equal(vanity.status === "ok" && vanity.profile.steamId, "76561198750974605");
  assert.equal((await fetchProfile({ kind: "vanity", name: "nobody" }, () => reply(200, "<response><error><![CDATA[not found]]></error></response>"))).status, "not_found");
  assert.equal((await fetchProfile({ kind: "vanity", name: "nobody" }, () => Promise.reject(new Error("down")))).status, "unavailable");
  assert.equal(safeAvatarUrl("http://avatars.steamstatic.com/a.jpg"), "");
  assert.equal(safeAvatarUrl("https://steamstatic.com.evil.test/a.jpg"), "");
});

const callback = "https://example.test/auth/steam/callback?s=abc";
const assertion = (over: Record<string, string> = {}) =>
  new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "id_res",
    "openid.op_endpoint": "https://steamcommunity.com/openid/login",
    "openid.claimed_id": "https://steamcommunity.com/openid/id/76561198750974604",
    "openid.identity": "https://steamcommunity.com/openid/id/76561198750974604",
    "openid.return_to": callback,
    "openid.response_nonce": "2026-11-18T10:00:00Zabc",
    "openid.assoc_handle": "1234567890",
    "openid.signed": "signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle",
    "openid.sig": "c2ln",
    ...over,
  });

test("openid: login URL asks Steam to pick the identity and returns to us", () => {
  const u = new URL(loginUrl(callback, "https://example.test"));
  assert.equal(u.origin + u.pathname, "https://steamcommunity.com/openid/login");
  assert.equal(u.searchParams.get("openid.return_to"), callback);
  assert.equal(u.searchParams.get("openid.realm"), "https://example.test");
  assert.equal(u.searchParams.get("openid.mode"), "checkid_setup");
});

test("openid: only an assertion Steam confirms gives a Steam ID, and Steam gets the same fields back", async () => {
  let sent = "";
  const yes: FetchLike = (_u, init) => { sent = init?.body ?? ""; return reply(200, "ns:http://specs.openid.net/auth/2.0\nis_valid:true\n"); };
  assert.equal(await verifyAssertion(assertion(), callback, yes), "76561198750974604");
  const echoed = new URLSearchParams(sent);
  assert.equal(echoed.get("openid.mode"), "check_authentication");
  assert.equal(echoed.get("openid.sig"), "c2ln");
  assert.equal(echoed.get("openid.claimed_id"), "https://steamcommunity.com/openid/id/76561198750974604");
  assert.equal(await verifyAssertion(assertion(), callback, () => reply(200, "is_valid:false\n")), null);
  assert.equal(await verifyAssertion(assertion(), callback, () => reply(500, "is_valid:true")), null);
  assert.equal(await verifyAssertion(assertion(), callback, () => Promise.reject(new Error("down"))), null);
});

test("openid: assertions meant for somebody else, or forged in shape, are refused before Steam is even asked", async () => {
  let calls = 0;
  const yes: FetchLike = () => { calls++; return reply(200, "is_valid:true"); };
  const bad: Record<string, string>[] = [
    { "openid.return_to": "https://evil.test/auth/steam/callback?s=abc" },
    { "openid.claimed_id": "https://evil.test/openid/id/76561198750974604", "openid.identity": "https://evil.test/openid/id/76561198750974604" },
    { "openid.claimed_id": "https://steamcommunity.com/openid/id/123" },
    { "openid.identity": "https://steamcommunity.com/openid/id/76561198000000001" },
    { "openid.op_endpoint": "https://evil.test/openid/login" },
    { "openid.mode": "cancel" },
    { "openid.signed": "signed,op_endpoint" },
    { "openid.ns": "http://specs.openid.net/auth/1.1" },
  ];
  for (const over of bad) assert.equal(await verifyAssertion(assertion(over), callback, yes), null, JSON.stringify(over));
  assert.equal(calls, 0);
});

test("inventory: float, seed, stickers, exterior and inspect link come straight from Steam's JSON", async () => {
  const { items, steamCount } = parseInventoryPages([await fixture()]);
  assert.equal(items.length, 4);
  assert.equal(steamCount, 4);
  const bizon = items.find((i) => i.assetId === "53903990221")!;
  assert.equal(bizon.marketHashName, "PP-Bizon | Thermal Currents (Factory New)");
  assert.ok(Math.abs(bizon.float! - 0.035838645) < 1e-8);
  assert.equal(bizon.seed, 71);
  assert.equal(bizon.exterior, "Factory New");
  assert.match(bizon.color ?? "", /^[0-9a-f]{6}$/i);
  assert.equal(bizon.inspectLink, `steam://run/730//+csgo_econ_action_preview%20${CERT}`);
  assert.ok(bizon.iconUrl.length > 20);

  const souvenir = items.find((i) => i.assetId === "52199500623")!;
  assert.deepEqual(souvenir.stickers, ["BLAST.tv (Gold) | Paris 2023", "Mirage (Gold)", "Apeks (Gold) | Paris 2023", "Vitality (Gold) | Paris 2023"]);

  const charm = items.find((i) => i.assetId === "49725585289")!;
  assert.equal(typeof charm.charmTemplate, "number");
  assert.equal(charm.float, null);

  const crate = items.find((i) => i.assetId === "53903990220")!;
  assert.equal(crate.float, null);
  assert.equal(crate.seed, null);
  assert.deepEqual(crate.stickers, []);
  assert.equal(crate.price, null);
});

test("inventory: pages are followed with the cursor, with a pause between them", async () => {
  const f = await fixture();
  const page1 = { ...f, assets: f.assets.slice(0, 2), more_items: 1, last_assetid: "52199500623" };
  const page2 = { ...f, assets: f.assets.slice(2), more_items: 0 };
  const urls: string[] = [];
  const sleeps: number[] = [];
  const fetchFn: FetchLike = (url) => { urls.push(url); return reply(200, JSON.stringify(urls.length === 1 ? page1 : page2)); };
  const r = await fetchInventory("76561198750974604", { fetchFn, sleep: async (ms) => { sleeps.push(ms); } });
  assert.ok(r.ok && r.items.length === 4);
  assert.equal(urls.length, 2);
  assert.ok(!urls[0]!.includes("start_assetid"));
  assert.ok(urls[1]!.includes("start_assetid=52199500623"));
  assert.equal(sleeps.length, 1);
});

test("inventory: private, missing, rate limited and broken answers each get their own reason", async () => {
  const id = "76561198750974604";
  const reason = async (fetchFn: FetchLike) => { const r = await fetchInventory(id, { fetchFn, sleep: async () => {} }); return r.ok ? "ok" : r.reason; };
  assert.equal(await reason(() => reply(403, "null")), "private");
  assert.equal(await reason(() => reply(200, "null")), "private");
  assert.equal(await reason(() => reply(200, JSON.stringify({ success: false }))), "private");
  assert.equal(await reason(() => reply(404, "")), "not_found");
  assert.equal(await reason(() => reply(429, "")), "rate_limited");
  assert.equal(await reason(() => reply(500, "")), "unavailable");
  assert.equal(await reason(() => reply(200, "<html>")), "unavailable");
  assert.equal(await reason(() => Promise.reject(new Error("down"))), "unavailable");
  assert.equal((await fetchInventory("not-an-id", { fetchFn: () => reply(200, "{}") })).ok, false);
  const loop: FetchLike = () => reply(200, JSON.stringify({ success: 1, assets: [], more_items: 1, last_assetid: "1" }));
  const bounded = await fetchInventory(id, { fetchFn: loop, sleep: async () => {} });
  assert.ok(bounded.ok); // a Steam that never stops paging cannot keep us busy for ever
});

test("skinapi: prices are read per asset; a down or odd service gives null so the page still works", async () => {
  let seen: { url: string; key: string | undefined } = { url: "", key: undefined };
  const ok: FetchLike = (url, init) => {
    seen = { url, key: init?.headers?.["x-api-key"] };
    return reply(200, JSON.stringify({ data: { currency: "EUR", items: [{ assetId: "1", price: 366, priceSource: "skinport" }, { assetId: "2", price: null }, { assetId: "3", price: -5 }, { price: 3 }] } }));
  };
  const api = createSkinApi({ baseUrl: "https://price.test/api/v1", key: "k".repeat(10) }, ok);
  const r = (await api.inventoryPrices("76561198750974604"))!;
  assert.deepEqual([...r.prices.entries()], [["1", { price: 366, source: "skinport" }]]);
  assert.equal(seen.url, "https://price.test/api/v1/inventory?steam_id=76561198750974604&game=cs2&currency=EUR");
  assert.equal(seen.key, "k".repeat(10));
  assert.equal(await api.inventoryPrices("nope"), null);
  assert.equal(await createSkinApi({ baseUrl: "https://price.test", key: "k" }, () => reply(502, "")).inventoryPrices("76561198750974604"), null);
  assert.equal(await createSkinApi({ baseUrl: "https://price.test", key: "k" }, () => reply(200, "{}")).inventoryPrices("76561198750974604"), null);
  assert.equal(await createSkinApi({ baseUrl: "https://price.test", key: "k" }, () => Promise.reject(new Error("x"))).inventoryPrices("76561198750974604"), null);
});

test("config: the price service is off without a key and must be https when set", () => {
  const good = { DATABASE_URL: "postgresql://u:p@h/db", STATUS_TOKEN: "x".repeat(32), SMTP_HOST: "h", SMTP_USER: "u", SMTP_PASS: "p", SMTP_FROM: "a@b.c", OWNER_ALERT_EMAIL: "o@b.c" };
  assert.equal(loadConfig(good).skinApi, null);
  assert.deepEqual(loadConfig({ ...good, SKINAPI_KEY: "abc" }).skinApi, { baseUrl: "https://skinapi.skinvaults.online/api/v1", key: "abc" });
  assert.throws(() => loadConfig({ ...good, SKINAPI_KEY: "abc", SKINAPI_URL: "http://skinapi.test" }), (e: Error) => /SKINAPI_URL/.test(e.message) && !e.message.includes("abc"));
});
