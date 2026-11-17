import { realFetch, USER_AGENT, type FetchLike } from "./http.ts";

// Turns what a person types (a Steam ID, a profile link or a custom name) into a Steam ID and a public name.
// Only values that match strict patterns ever reach a URL, so nobody can point this server at another host.

export type SteamTarget = { kind: "id"; steamId: string } | { kind: "vanity"; name: string };
export type Profile = { steamId: string; personaName: string; avatarUrl: string };

const ID_RE = /^7656119\d{10}$/;
// Custom names that are only digits are refused: they cannot be told apart from a mistyped Steam ID.
const VANITY_RE = /^(?!\d+$)[A-Za-z0-9_-]{2,32}$/;

export function parseSteamInput(raw: string): SteamTarget | null {
  const input = raw.trim();
  if (input.length === 0 || input.length > 200) return null;
  if (ID_RE.test(input)) return { kind: "id", steamId: input };
  const url = /^(?:https?:\/\/)?(?:www\.)?steamcommunity\.com\/(profiles|id)\/([A-Za-z0-9_-]+)\/?(?:[?#].*)?$/i.exec(input);
  if (url) {
    const [, type, value] = url;
    if (type!.toLowerCase() === "profiles") return ID_RE.test(value!) ? { kind: "id", steamId: value! } : null;
    return VANITY_RE.test(value!) ? { kind: "vanity", name: value! } : null;
  }
  return VANITY_RE.test(input) ? { kind: "vanity", name: input } : null;
}

// Avatars are shown from Steam's own CDN only.
export function safeAvatarUrl(value: string): string {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && /(^|\.)steamstatic\.com$/.test(u.hostname) ? u.toString() : "";
  } catch {
    return "";
  }
}

const tag = (xml: string, name: string): string | null => {
  const m = new RegExp(`<${name}>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))</${name}>`).exec(xml);
  return m ? (m[1] ?? m[2] ?? "").trim() : null;
};

export type ProfileResult = { status: "ok"; profile: Profile } | { status: "not_found" | "unavailable" };

export async function fetchProfile(target: SteamTarget, fetchFn: FetchLike = realFetch): Promise<ProfileResult> {
  const path = target.kind === "id" ? `profiles/${target.steamId}` : `id/${target.name}`;
  try {
    const res = await fetchFn(`https://steamcommunity.com/${path}/?xml=1`, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return { status: res.status === 404 ? "not_found" : "unavailable" };
    const xml = await res.text();
    const steamId = tag(xml, "steamID64");
    if (steamId === null || !ID_RE.test(steamId)) return { status: xml.includes("<error>") ? "not_found" : "unavailable" };
    if (target.kind === "id" && steamId !== target.steamId) return { status: "unavailable" };
    return { status: "ok", profile: { steamId, personaName: (tag(xml, "steamID") ?? "").slice(0, 64), avatarUrl: safeAvatarUrl(tag(xml, "avatarFull") ?? "") } };
  } catch {
    return { status: "unavailable" };
  }
}
