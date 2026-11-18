import { esc, type Page } from "./html.ts";
import { RARITY_COLORS } from "./appTheme.ts";
import type { InventoryItem } from "../steam/inventory.ts";
import type { InventorySnapshot } from "../inventory.ts";
import type { User } from "../users.ts";

export type LookupNotice = "none" | "invalid" | "not_found" | "private" | "rate_limited" | "unavailable" | "busy";
export type SortKey = "value" | "float" | "name";
export const SORT_KEYS: SortKey[] = ["value", "float", "name"];
export type ShowKey = "all" | "float" | "stickers";
export const SHOW_KEYS: ShowKey[] = ["all", "float", "stickers"];
// Wear filter: short code in the URL, the name Steam uses on the item.
export const WEARS = [
  { code: "FN", name: "Factory New" },
  { code: "MW", name: "Minimal Wear" },
  { code: "FT", name: "Field-Tested" },
  { code: "WW", name: "Well-Worn" },
  { code: "BS", name: "Battle-Scarred" },
] as const;
export type WearCode = (typeof WEARS)[number]["code"];
export type Filters = { sort: SortKey; show: ShowKey; wear: WearCode | null };

const NOTICES: Record<Exclude<LookupNotice, "none">, string> = {
  invalid: "That is not a Steam ID or a Steam profile link. Paste the 17-digit Steam ID, the link to the profile, or the custom name from it.",
  not_found: "We could not find that Steam profile.",
  private: "That inventory is private. In Steam, open Edit Profile, then Privacy Settings, and set both the profile and the inventory to Public.",
  rate_limited: "Steam is asking everybody to slow down. Please try again in a minute.",
  unavailable: "Steam did not answer. This is usually short: please try again in a minute.",
  busy: "Too many lookups from your connection. Please try again in a few minutes.",
};

const SOURCE_NAMES: Record<string, string> = { skinport: "Skinport", csmoney: "CS.MONEY", buff: "Buff163", buff163: "Buff163", waxpeer: "Waxpeer", csgomarket: "CSGO Market", csgotm: "CSGO Market", steam: "Steam Market", lootfarm: "Loot.farm", swapgg: "Swap.gg" };
const sourceName = (s: string | null): string => (s === null ? "" : SOURCE_NAMES[s.toLowerCase()] ?? s);

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 2 }).format(cents / 100);

const iconSrc = (icon: string) => `https://community.cloudflare.steamstatic.com/economy/image/${icon}/128fx128f`;

const shellUser = (user: User | null) => ({ user: user === null ? null : { name: user.personaName || user.steamId, steamId: user.steamId } });

// The wear scale, drawn as SVG so no inline style is needed: Factory New 0-0.07, Minimal Wear to 0.15, Field-Tested to 0.38,
// Well-Worn to 0.45, Battle-Scarred above. The marker is the item's own float.
const WEAR_SEGMENTS = [
  { x: 0, w: 7, c: "#3ddc4c" }, { x: 7, w: 8, c: "#9be34a" }, { x: 15, w: 23, c: "#e6c43a" }, { x: 38, w: 7, c: "#f08a2a" }, { x: 45, w: 55, c: "#ee3b32" },
];
const WEAR_RECTS = WEAR_SEGMENTS.map((s) => `<rect x="${s.x}" y="0" width="${s.w}" height="6" fill="${s.c}"/>`).join("");
const wearScale = (cls: string) => `<svg class="${cls}" viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true">${WEAR_RECTS}</svg>`;
function floatBar(value: number): string {
  const x = Math.min(99, Math.max(0, value * 100));
  return `<svg class="floatbar" viewBox="0 0 100 6" preserveAspectRatio="none" role="img" aria-label="Float ${value.toFixed(4)} on the wear scale">${WEAR_RECTS}<rect x="${x.toFixed(2)}" y="-1" width="1.2" height="8" fill="#fff"/></svg>`;
}

const lookupForm = (value = "") => `<form method="get" action="/inventory">
<label class="label" for="q">Steam ID, profile link or custom name</label>
<div class="field-row">
<input id="q" name="q" type="text" value="${esc(value)}" maxlength="200" required placeholder="76561198000000000" autocomplete="off" spellcheck="false">
<button class="btn big" type="submit">Show inventory</button>
</div>
</form>`;

function account(user: User | null): string {
  if (user === null) return `<p class="stack"><a class="btn big" href="/auth/steam">Sign in with Steam</a></p>`;
  return `<p class="muted">Signed in as ${esc(user.personaName || user.steamId)}.</p>
<div class="stack"><a class="btn" href="/inventory/${esc(user.steamId)}">My inventory</a>
<form method="post" action="/auth/logout"><button class="btn ghost" type="submit">Sign out</button></form>
<form method="post" action="/account/delete"><button class="btn ghost" type="submit">Delete my data</button></form></div>`;
}

export function inventoryHome(user: User | null, notice: LookupNotice = "none", typed = ""): Page {
  const n = notice === "none" ? "" : `<p class="notice error" role="alert">${esc(NOTICES[notice])}</p>`;
  return {
    path: "/inventory",
    title: "Inventory value: SkinVaults",
    description: "See what a CS2 inventory is worth, with float, pattern seed and stickers.",
    index: false,
    app: shellUser(user),
    body: `<div class="wrap narrow">
<h1>What is your inventory worth?</h1>
<p class="lead">The value of a CS2 inventory, with the float, pattern seed and stickers of every skin. The inventory has to be public on Steam.</p>
${n}${lookupForm(typed)}
<h2>Your account</h2>
${account(user)}
</div>`,
  };
}

function sortItems(items: InventoryItem[], sort: SortKey): InventoryItem[] {
  const copy = [...items];
  if (sort === "float") copy.sort((a, b) => (a.float ?? 2) - (b.float ?? 2) || a.name.localeCompare(b.name));
  else if (sort === "name") copy.sort((a, b) => a.name.localeCompare(b.name));
  else copy.sort((a, b) => (b.price ?? -1) * b.amount - (a.price ?? -1) * a.amount || a.name.localeCompare(b.name));
  return copy;
}

export function applyFilters(items: InventoryItem[], f: Filters): InventoryItem[] {
  const wear = f.wear === null ? null : WEARS.find((w) => w.code === f.wear)!.name;
  return items.filter((i) => (f.show === "float" ? i.float !== null : f.show === "stickers" ? i.stickers.length > 0 : true) && (wear === null || i.exterior === wear));
}

function card(item: InventoryItem, currency: string): string {
  const img = item.iconUrl ? `<img src="${esc(iconSrc(item.iconUrl))}" alt="" width="128" height="128" loading="lazy" referrerpolicy="no-referrer">` : "";
  const edge = item.color && RARITY_COLORS.includes(item.color.toLowerCase()) ? ` r-${item.color.toLowerCase()}` : "";
  const where = sourceName(item.priceSource);
  const price = item.price === null
    ? `<p class="price"><b class="muted">no price</b></p>`
    : `<p class="price"><b>${esc(money(item.price * item.amount, currency))}</b><span>${item.amount > 1 ? `${item.amount} &times; ${esc(money(item.price, currency))}` : where ? `lowest on ${esc(where)}` : ""}</span></p>`;
  const bar = item.float !== null ? `${floatBar(item.float)}<p class="nums"><span>${item.float.toFixed(9)}</span>${item.seed !== null ? `<span>Seed ${item.seed}</span>` : ""}</p>` : "";
  const stickers = item.stickers.length > 0 ? esc(item.stickers.join(", ")) : "";
  const inspect = item.inspectLink ? `<a class="insp" href="${esc(item.inspectLink)}">Inspect in game</a>` : "";
  return `<li class="card${edge}"><div class="c-head"><h3>${item.amount > 1 ? `${item.amount}&times; ` : ""}${esc(item.name)}</h3><p>${esc(item.exterior ?? item.type)}</p></div><div class="shot">${img}</div><p class="stick" title="${stickers}">${stickers}</p><div class="c-foot">${price}${bar}${inspect}</div></li>`;
}

export function inventoryPage(opts: { snapshot: InventorySnapshot; user: User | null; cached: boolean; stale: boolean; filters: Filters }): Page {
  const { snapshot: s, filters } = opts;
  const profile = s.profile;
  const who = profile?.personaName || s.steamId;
  const base = `/inventory/${s.steamId}`;
  // Build a link that changes one setting and keeps the others.
  const link = (change: Partial<Filters>): string => {
    const next = { ...filters, ...change };
    const q = new URLSearchParams();
    if (next.sort !== "value") q.set("sort", next.sort);
    if (next.show !== "all") q.set("show", next.show);
    if (next.wear !== null) q.set("wear", next.wear);
    const qs = q.toString();
    return esc(qs === "" ? base : `${base}?${qs}`);
  };
  const notes: string[] = [];
  if (!s.priced) notes.push("Prices are unavailable right now, so the value below is not shown. Float, seed and stickers come from Steam and are correct.");
  if (opts.stale) notes.push("Steam is busy, so this is the last copy we saved.");
  const when = new Date(s.fetchedAt).toISOString().replace("T", " ").slice(0, 16) + " UTC";
  const withFloat = s.items.filter((i) => i.float !== null).length;
  const withStickers = s.items.filter((i) => i.stickers.length > 0).length;
  const shown = sortItems(applyFilters(s.items, filters), filters.sort);
  const cards = shown.map((i) => card(i, s.currency)).join("");
  const avatar = profile?.avatarUrl ? `<img class="avatar" src="${esc(profile.avatarUrl)}" alt="" width="52" height="52" referrerpolicy="no-referrer">` : `<span class="avatar"></span>`;
  const wearChips = WEARS.map((w) => `<a class="${filters.wear === w.code ? "on" : ""}" href="${link({ wear: filters.wear === w.code ? null : w.code })}" title="${esc(w.name)}" aria-pressed="${filters.wear === w.code}">${w.code}</a>`).join("");
  const showChecks = ([["float", "Only items with float"], ["stickers", "Only items with stickers"]] as const)
    .map(([k, label]) => `<a class="${filters.show === k ? "on" : ""}" href="${link({ show: filters.show === k ? "all" : k })}" aria-pressed="${filters.show === k}">${label}</a>`).join("");
  const sortTabs = SORT_KEYS.map((k) => (k === filters.sort ? `<b>${{ value: "Highest value", float: "Lowest float", name: "Name" }[k]}</b>` : `<a href="${link({ sort: k })}">${{ value: "Highest value", float: "Lowest float", name: "Name" }[k]}</a>`)).join("");
  return {
    path: base,
    title: `Inventory of ${who}: SkinVaults`,
    description: `CS2 inventory of ${who}.`,
    index: false,
    app: shellUser(opts.user),
    body: `<div class="wrap inv">
<div class="who"><div class="id">${avatar}<div><h1>${esc(who)}</h1><p>${esc(s.steamId)} &middot; read from Steam ${esc(when)}</p></div></div>
<div class="stack"><a class="btn ghost" href="${base}?refresh=1">Refresh</a><a class="btn ghost" href="/inventory">Look up another</a></div></div>
${notes.map((n) => `<p class="notice" role="status">${esc(n)}</p>`).join("")}
<dl class="stats">
<div class="hero"><dt>Total value</dt><dd>${s.priced ? esc(money(s.totalValue, s.currency)) : "n/a"}</dd></div>
<div><dt>Items</dt><dd>${s.items.length}</dd></div>
<div><dt>With float</dt><dd>${withFloat}</dd></div>
<div><dt>With stickers</dt><dd>${withStickers}</dd></div>
</dl>
<div class="layout">
<aside class="filters" aria-label="Filters">
<div class="fg"><h2>Wear</h2>${wearScale("wearbar")}<div class="chips">${wearChips}</div></div>
<div class="fg"><h2>Show</h2><div class="checks">${showChecks}</div></div>
</aside>
<section class="main" aria-label="Items">
<div class="toolbar"><div class="tabs" role="group" aria-label="Sort by">${sortTabs}</div><span class="count">${shown.length === s.items.length ? `${shown.length} items` : `${shown.length} of ${s.items.length} items`}</span></div>
${shown.length > 0 ? `<ul class="grid">${cards}</ul>` : `<p class="empty">No items match these filters. <a href="${esc(base)}">Clear filters</a></p>`}
<p class="foot-note">Price is the lowest marketplace price in ${esc(s.currency)} from our price data. Float and seed come from Steam.</p>
</section>
</div>
</div>`,
  };
}

export function inventoryError(notice: Exclude<LookupNotice, "none">, user: User | null): Page {
  return inventoryHome(user, notice);
}
