import type { Pool } from "./platform/db.ts";
import type { SkinApi } from "./platform/skinapi.ts";
import type { Profile } from "./steam/profile.ts";
import { fetchInventory, type FetchInventoryOptions, type InventoryFailure, type InventoryItem } from "./steam/inventory.ts";

// Inventory service: Steam gives items, float, seed and stickers; our price service gives the value.
// Results are cached per Steam ID for a few minutes (Steam rate limits this endpoint), and a stale copy is
// preferred over an error when Steam is busy.

export const INVENTORY_TTL_MS = 10 * 60_000;
export const INVENTORY_STALE_LIMIT_MS = 24 * 60 * 60_000;

export type InventorySnapshot = {
  steamId: string;
  fetchedAt: string; // ISO time of the Steam read
  steamCount: number;
  items: InventoryItem[];
  currency: string;
  priced: boolean; // false when the price service could not be reached
  totalValue: number; // minor units, only items with a price
  pricedItems: number;
  profile: Profile | null; // public name and avatar at the time of the read
};

export type InventoryOutcome =
  | { status: "ok"; snapshot: InventorySnapshot; cached: boolean; stale: boolean }
  | { status: InventoryFailure };

export type InventoryDeps = { pool: Pool; skinApi: SkinApi | null; steam?: FetchInventoryOptions; profile?: (steamId: string) => Promise<Profile | null>; now?: () => number };

export function summarise(items: InventoryItem[]): { totalValue: number; pricedItems: number } {
  let totalValue = 0;
  let pricedItems = 0;
  for (const i of items) {
    if (i.price === null) continue;
    totalValue += i.price * i.amount;
    pricedItems += 1;
  }
  return { totalValue, pricedItems };
}

async function readCache(pool: Pool, steamId: string): Promise<{ snapshot: InventorySnapshot; ageMs: number } | null> {
  const { rows } = await pool.query<{ payload: InventorySnapshot; age_ms: string }>(
    "select payload, (extract(epoch from now() - fetched_at) * 1000)::bigint as age_ms from inventory_cache where steam_id = $1",
    [steamId],
  );
  const row = rows[0];
  return row ? { snapshot: row.payload, ageMs: Number(row.age_ms) } : null;
}

// Two people asking for the same inventory at once share one Steam call.
const inflight = new Map<string, Promise<InventoryOutcome>>();

export function loadInventory(deps: InventoryDeps, steamId: string, refresh = false): Promise<InventoryOutcome> {
  const running = inflight.get(steamId);
  if (running) return running;
  const job = load(deps, steamId, refresh).finally(() => inflight.delete(steamId));
  inflight.set(steamId, job);
  return job;
}

async function load(deps: InventoryDeps, steamId: string, refresh: boolean): Promise<InventoryOutcome> {
  const cached = await readCache(deps.pool, steamId);
  if (cached && cached.ageMs < INVENTORY_TTL_MS && !(refresh && cached.ageMs > 60_000)) {
    return { status: "ok", snapshot: cached.snapshot, cached: true, stale: false };
  }

  const steam = await fetchInventory(steamId, deps.steam);
  if (!steam.ok) {
    if ((steam.reason === "rate_limited" || steam.reason === "unavailable") && cached && cached.ageMs < INVENTORY_STALE_LIMIT_MS) {
      return { status: "ok", snapshot: cached.snapshot, cached: true, stale: true };
    }
    return { status: steam.reason };
  }

  const [priced, profile] = await Promise.all([deps.skinApi ? deps.skinApi.inventoryPrices(steamId) : null, deps.profile ? deps.profile(steamId).catch(() => null) : null]);
  const items = steam.items.map((item) => {
    const p = priced?.prices.get(item.assetId);
    return p ? { ...item, price: p.price, priceSource: p.source } : item;
  });
  const snapshot: InventorySnapshot = {
    steamId,
    fetchedAt: new Date(deps.now?.() ?? Date.now()).toISOString(),
    steamCount: steam.steamCount,
    items,
    currency: priced?.currency ?? "EUR",
    priced: priced !== null,
    profile,
    ...summarise(items),
  };
  await deps.pool.query(
    `insert into inventory_cache (steam_id, fetched_at, payload) values ($1, now(), $2)
     on conflict (steam_id) do update set fetched_at = now(), payload = excluded.payload`,
    [steamId, JSON.stringify(snapshot)],
  );
  return { status: "ok", snapshot, cached: false, stale: false };
}

// Cached inventories of people who never come back are not kept for long.
export async function deleteOldInventories(pool: Pool): Promise<number> {
  return (await pool.query("delete from inventory_cache where fetched_at < now() - interval '7 days'")).rowCount ?? 0;
}
