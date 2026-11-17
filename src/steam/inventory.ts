import { realFetch, USER_AGENT, type FetchLike } from "./http.ts";

// Reads a public CS2 inventory from Steam and keeps what the Steam JSON itself tells us: float (Wear Rating), pattern
// seed (Pattern Template) and the sticker names. Prices are added elsewhere. Steam rate limits this endpoint hard, so
// callers must cache and must expect "rate_limited".

export type InventoryItem = {
  assetId: string;
  marketHashName: string;
  name: string;
  type: string;
  iconUrl: string; // the icon id only; the page builds the image URL from it
  amount: number;
  tradable: boolean;
  marketable: boolean;
  exterior: string | null;
  color: string | null; // rarity colour, hex without #
  float: number | null;
  seed: number | null;
  stickers: string[];
  charmTemplate: number | null;
  inspectLink: string | null;
  price: number | null; // minor units (cents) in the display currency
  priceSource: string | null;
};

export type InventoryFailure = "private" | "not_found" | "rate_limited" | "unavailable";
export type InventoryResult = { ok: true; items: InventoryItem[]; steamCount: number } | { ok: false; reason: InventoryFailure };

type SteamDescription = {
  classid?: string;
  instanceid?: string;
  icon_url?: string;
  name?: string;
  type?: string;
  market_hash_name?: string;
  tradable?: number;
  marketable?: number;
  descriptions?: { name?: string; value?: string }[];
  actions?: { link?: string }[];
  tags?: { category?: string; localized_tag_name?: string; color?: string }[];
};
type SteamAssetProps = { assetid?: string; asset_properties?: { propertyid?: number; int_value?: string; float_value?: string; string_value?: string }[] };
type SteamPage = {
  success?: number | boolean;
  assets?: { assetid?: string; classid?: string; instanceid?: string; amount?: string }[];
  descriptions?: SteamDescription[];
  asset_properties?: SteamAssetProps[];
  total_inventory_count?: number;
  more_items?: number;
  last_assetid?: string;
};

const MAX_PAGES = 20;
const PAGE_DELAY_MS = 1200;
const ICON_RE = /^[A-Za-z0-9_-]{20,400}$/;
const COLOR_RE = /^[0-9a-fA-F]{6}$/;
const INSPECT_RE = /^steam:\/\/run\/730\/\/\+csgo_econ_action_preview(?:%20|\s)[A-Za-z0-9%:]+$/;

const decodeEntities = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

// Sticker and patch names sit in the title attributes of the images in the "sticker_info" block.
export function stickerNames(d: SteamDescription): string[] {
  const names: string[] = [];
  for (const part of d.descriptions ?? []) {
    if (part.name !== "sticker_info" || !part.value) continue;
    for (const m of part.value.matchAll(/title="(?:Sticker|Patch): ([^"]{1,120})"/g)) names.push(decodeEntities(m[1]!));
  }
  return names.slice(0, 8);
}

export function parseInventoryPages(pages: SteamPage[]): { items: InventoryItem[]; steamCount: number } {
  const descriptions = new Map<string, SteamDescription>();
  const props = new Map<string, NonNullable<SteamAssetProps["asset_properties"]>>();
  let steamCount = 0;
  for (const page of pages) {
    steamCount = Math.max(steamCount, page.total_inventory_count ?? 0);
    for (const d of page.descriptions ?? []) descriptions.set(`${d.classid}_${d.instanceid}`, d);
    for (const p of page.asset_properties ?? []) if (p.assetid) props.set(p.assetid, p.asset_properties ?? []);
  }

  const items: InventoryItem[] = [];
  for (const page of pages) {
    for (const a of page.assets ?? []) {
      const d = descriptions.get(`${a.classid}_${a.instanceid}`);
      if (!a.assetid || !d || !d.market_hash_name) continue;
      const p = props.get(a.assetid) ?? [];
      const num = (id: number, field: "int_value" | "float_value") => {
        const raw = p.find((x) => x.propertyid === id)?.[field];
        const n = raw === undefined ? NaN : Number(raw);
        return Number.isFinite(n) ? n : null;
      };
      const float = num(2, "float_value");
      const link = d.actions?.find((x) => typeof x.link === "string")?.link ?? null;
      // The link only works with the certificate of this exact item, so the template placeholder is filled in.
      const cert = p.find((x) => x.propertyid === 6)?.string_value;
      const inspect = link && cert && /^[0-9A-F]+$/i.test(cert) ? link.replace("%propid:6%", cert) : link;
      items.push({
        assetId: a.assetid,
        marketHashName: d.market_hash_name,
        name: d.name ?? d.market_hash_name,
        type: d.type ?? "",
        iconUrl: ICON_RE.test(d.icon_url ?? "") ? d.icon_url! : "",
        amount: Math.max(1, Number(a.amount ?? 1) || 1),
        tradable: d.tradable === 1,
        marketable: d.marketable === 1,
        exterior: d.tags?.find((t) => t.category === "Exterior")?.localized_tag_name ?? null,
        color: (() => { const c = d.tags?.find((t) => t.category === "Rarity")?.color; return c && COLOR_RE.test(c) ? c : null; })(),
        float: float !== null && float >= 0 && float <= 1 ? float : null,
        seed: num(1, "int_value"),
        stickers: stickerNames(d),
        charmTemplate: num(3, "int_value"),
        inspectLink: inspect && INSPECT_RE.test(inspect) ? inspect : null,
        price: null,
        priceSource: null,
      });
    }
  }
  return { items, steamCount };
}

export type FetchInventoryOptions = { fetchFn?: FetchLike; sleep?: (ms: number) => Promise<void> };

export async function fetchInventory(steamId: string, options: FetchInventoryOptions = {}): Promise<InventoryResult> {
  if (!/^\d{17}$/.test(steamId)) return { ok: false, reason: "not_found" };
  const fetchFn = options.fetchFn ?? realFetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const pages: SteamPage[] = [];
  let cursor = "";
  try {
    for (let i = 0; i < MAX_PAGES; i++) {
      if (i > 0) await sleep(PAGE_DELAY_MS);
      const url = `https://steamcommunity.com/inventory/${steamId}/730/2?l=english&count=2000${cursor ? `&start_assetid=${encodeURIComponent(cursor)}` : ""}`;
      const res = await fetchFn(url, { headers: { "user-agent": USER_AGENT, accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
      if (res.status === 403 || res.status === 401) return { ok: false, reason: "private" };
      if (res.status === 404) return { ok: false, reason: "not_found" };
      if (res.status === 429) return { ok: false, reason: "rate_limited" };
      if (!res.ok) return { ok: false, reason: "unavailable" };
      const page = JSON.parse(await res.text()) as SteamPage | null;
      if (page === null || !(page.success === true || page.success === 1)) return { ok: false, reason: "private" };
      pages.push(page);
      if (!page.more_items || !page.last_assetid) break;
      if (!/^\d+$/.test(page.last_assetid)) return { ok: false, reason: "unavailable" };
      cursor = page.last_assetid;
    }
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  return { ok: true, ...parseInventoryPages(pages) };
}
