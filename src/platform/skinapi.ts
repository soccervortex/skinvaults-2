import { realFetch, type FetchLike } from "../steam/http.ts";

// Client for our price service (SkinAPI). The key lives only in the environment and is sent only to this base URL.
// Prices are minor units (cents) in the requested currency.

export type SkinApiConfig = { baseUrl: string; key: string };
export type Priced = { price: number; source: string | null };
export type InventoryPrices = { prices: Map<string, Priced>; currency: string };

export type SkinApi = { inventoryPrices(steamId: string): Promise<InventoryPrices | null> };

export function createSkinApi(config: SkinApiConfig, fetchFn: FetchLike = realFetch): SkinApi {
  return {
    // One call prices a whole inventory, keyed by asset id. Returns null when the service is down or answers badly:
    // the caller then shows the inventory without prices instead of failing.
    async inventoryPrices(steamId) {
      if (!/^\d{17}$/.test(steamId)) return null;
      try {
        const url = `${config.baseUrl}/inventory?steam_id=${steamId}&game=cs2&currency=EUR`;
        const res = await fetchFn(url, { headers: { "x-api-key": config.key, accept: "application/json" }, signal: AbortSignal.timeout(60_000) });
        if (!res.ok) return null;
        const body = JSON.parse(await res.text()) as { data?: { currency?: string; items?: { assetId?: string; price?: number | null; priceSource?: string | null }[] } };
        const items = body.data?.items;
        if (!Array.isArray(items)) return null;
        const prices = new Map<string, Priced>();
        for (const i of items) {
          if (typeof i.assetId === "string" && typeof i.price === "number" && Number.isFinite(i.price) && i.price >= 0) {
            prices.set(i.assetId, { price: Math.round(i.price), source: typeof i.priceSource === "string" ? i.priceSource.slice(0, 32) : null });
          }
        }
        return { prices, currency: body.data?.currency ?? "EUR" };
      } catch {
        return null;
      }
    },
  };
}
