import { esc, type Page } from "./html.ts";
import type { InventoryItem } from "../steam/inventory.ts";
import type { InventorySnapshot } from "../inventory.ts";
import type { User } from "../users.ts";

export type LookupNotice = "none" | "invalid" | "not_found" | "private" | "rate_limited" | "unavailable" | "busy";
export type SortKey = "value" | "float" | "name";
export const SORT_KEYS: SortKey[] = ["value", "float", "name"];

const NOTICES: Record<Exclude<LookupNotice, "none">, string> = {
  invalid: "That is not a Steam ID or a Steam profile link. Paste the 17-digit Steam ID, the link to the profile, or the custom name from it.",
  not_found: "We could not find that Steam profile.",
  private: "That inventory is private. In Steam, open Edit Profile, then Privacy Settings, and set both the profile and the inventory to Public.",
  rate_limited: "Steam is asking everybody to slow down. Please try again in a minute.",
  unavailable: "Steam did not answer. This is usually short: please try again in a minute.",
  busy: "Too many lookups from your connection. Please try again in a few minutes.",
};

// The page may not use inline styles (strict CSP), so rarity colours are classes in the theme.
export const RARITY_COLORS = ["b0c3d9", "5e98d9", "4b69ff", "8847ff", "d32ce6", "eb4b4b", "e4ae39", "ffd700"];

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 2 }).format(cents / 100);

const iconSrc = (icon: string) => `https://community.cloudflare.steamstatic.com/economy/image/${icon}/128fx128f`;

const lookupForm = (value = "") => `<form class="signup" method="get" action="/inventory">
<label class="mono" for="q">Steam ID, profile link or custom name</label>
<div class="field-row">
<input id="q" name="q" type="text" value="${esc(value)}" maxlength="200" required placeholder="76561198000000000" autocomplete="off" spellcheck="false">
<button type="submit">Show inventory &rarr;</button>
</div>
</form>`;

function account(user: User | null): string {
  if (user === null) return `<p><a class="button" href="/auth/steam">Sign in with Steam</a></p>`;
  return `<p class="mono">Signed in as ${esc(user.personaName || user.steamId)}</p>
<p><a class="button" href="/inventory/${esc(user.steamId)}">My inventory</a></p>
<form method="post" action="/auth/logout"><button type="submit">Sign out</button></form>
<form method="post" action="/account/delete"><button type="submit">Delete my data</button></form>`;
}

export function inventoryHome(user: User | null, notice: LookupNotice = "none", typed = ""): Page {
  const n = notice === "none" ? "" : `<p class="notice error" role="alert">${esc(NOTICES[notice])}</p>`;
  return {
    path: "/inventory",
    title: "Inventory value: SkinVaults",
    description: "See what a CS2 inventory is worth, with float, pattern seed and stickers.",
    index: false,
    body: `<div class="wrap narrow prose">
<h1>Inventory</h1>
<p class="lead">What a CS2 inventory is worth, with the float, pattern seed and stickers of every skin. The inventory has to be public on Steam.</p>
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

function card(item: InventoryItem, currency: string): string {
  const img = item.iconUrl ? `<img src="${esc(iconSrc(item.iconUrl))}" alt="" width="128" height="128" loading="lazy" referrerpolicy="no-referrer">` : "";
  const edge = item.color && RARITY_COLORS.includes(item.color.toLowerCase()) ? ` r-${item.color.toLowerCase()}` : "";
  const facts = [
    item.exterior ? `<li>${esc(item.exterior)}</li>` : "",
    item.float !== null ? `<li>Float <b>${item.float.toFixed(9)}</b></li>` : "",
    item.seed !== null ? `<li>Seed <b>${item.seed}</b></li>` : "",
    item.stickers.length > 0 ? `<li>Stickers: ${item.stickers.map(esc).join(", ")}</li>` : "",
  ].join("");
  const price = item.price === null ? `<span class="muted">no price</span>` : `<b>${esc(money(item.price * item.amount, currency))}</b>${item.amount > 1 ? ` <span class="muted">(${item.amount} &times; ${esc(money(item.price, currency))})</span>` : ""}`;
  const inspect = item.inspectLink ? ` <a href="${esc(item.inspectLink)}">Inspect</a>` : "";
  return `<li class="skin${edge}">${img}<div><h3>${item.amount > 1 ? `${item.amount}&times; ` : ""}${esc(item.name)}</h3><ul class="facts">${facts}</ul><p class="price">${price}${inspect}</p></div></li>`;
}

export function inventoryPage(opts: { snapshot: InventorySnapshot; user: User | null; cached: boolean; stale: boolean; sort: SortKey }): Page {
  const { snapshot: s, sort } = opts;
  const profile = s.profile;
  const who = profile?.personaName || s.steamId;
  const avatar = profile?.avatarUrl ? `<img class="avatar" src="${esc(profile.avatarUrl)}" alt="" width="64" height="64" referrerpolicy="no-referrer">` : "";
  const notes: string[] = [];
  if (!s.priced) notes.push("Prices are unavailable right now, so the value below is not shown. Float, seed and stickers come from Steam and are correct.");
  if (opts.stale) notes.push("Steam is busy, so this is the last copy we saved.");
  const when = new Date(s.fetchedAt).toISOString().replace("T", " ").slice(0, 16) + " UTC";
  const sortLinks = SORT_KEYS.map((k) => (k === sort ? `<b>${k}</b>` : `<a href="/inventory/${esc(s.steamId)}?sort=${k}">${k}</a>`)).join(" &middot; ");
  const rows = sortItems(s.items, sort).map((i) => card(i, s.currency)).join("");
  return {
    path: `/inventory/${s.steamId}`,
    title: `Inventory of ${who}: SkinVaults`,
    description: `CS2 inventory of ${who}.`,
    index: false,
    body: `<div class="wrap inv">
<header class="inv-head">${avatar}<div><p class="mono">Inventory</p><h1>${esc(who)}</h1></div></header>
${notes.map((n) => `<p class="notice" role="status">${esc(n)}</p>`).join("")}
<dl class="totals">
<div><dt>Value</dt><dd>${s.priced ? esc(money(s.totalValue, s.currency)) : "n/a"}</dd></div>
<div><dt>Items</dt><dd>${s.items.length}</dd></div>
<div><dt>With a price</dt><dd>${s.pricedItems}</dd></div>
<div><dt>Read from Steam</dt><dd class="small">${esc(when)}</dd></div>
</dl>
<p class="muted">Value is the lowest marketplace price per item in ${esc(s.currency)}, from our price data. Float and seed come from Steam. Sort by: ${sortLinks}</p>
<ul class="skins">${rows}</ul>
<p><a class="button ghost" href="/inventory">Look up another inventory</a></p>
</div>`,
  };
}

export function inventoryError(notice: Exclude<LookupNotice, "none">, user: User | null): Page {
  return inventoryHome(user, notice);
}
