import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pool } from "../platform/db.ts";
import type { Logger } from "../platform/logger.ts";
import type { SkinApi } from "../platform/skinapi.ts";
import { loadInventory } from "../inventory.ts";
import { loginUrl, verifyAssertion } from "../steam/openid.ts";
import { fetchProfile, parseSteamInput } from "../steam/profile.ts";
import type { FetchLike } from "../steam/http.ts";
import type { FetchInventoryOptions } from "../steam/inventory.ts";
import { createUserSession, deleteUser, endUserSession, upsertUser, USER_SESSION_TTL_MS, userForSession } from "../users.ts";
import { actionPage } from "./pages.ts";
import { inventoryHome, inventoryPage, SHOW_KEYS, SORT_KEYS, WEARS, type Filters, type LookupNotice, type ShowKey, type SortKey, type WearCode } from "./inventoryPage.ts";
import { readCookie, setCookie } from "./ownerSession.ts";
import { createRateLimiter } from "./rateLimit.ts";
import type { layout } from "./html.ts";

// Steam sign-in and the inventory pages. For now the router only hands requests to this module when an owner or
// co-owner is signed in, so nobody else can reach these paths.

export type SteamOptions = {
  skinApi?: SkinApi | null;
  fetchFn?: FetchLike; // Steam OpenID and profile calls; tests pass a fake
  steam?: FetchInventoryOptions; // Steam inventory calls; tests pass a fake
};

type Headers = Record<string, string | string[]>;

export type RouteContext = {
  pool: Pool;
  baseUrl: string;
  secure: boolean;
  log?: Logger;
  options: SteamOptions;
  page: (res: ServerResponse, status: number, p: Parameters<typeof layout>[1], headers?: Headers) => true;
  redirect: (res: ServerResponse, to: string, extra?: Headers) => true;
  sameOrigin: (req: IncomingMessage) => boolean;
  clientKey: (req: IncomingMessage) => string;
};

// Item and avatar images come from Valve's CDN only; every other source stays blocked.
const CSP =
  "default-src 'none'; style-src 'self'; img-src 'self' data: https://*.steamstatic.com; font-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";

const ID_PATH = /^\/inventory\/(\d{17})$/;

export function createSteamRoutes(ctx: RouteContext) {
  const sessionName = ctx.secure ? "__Host-sv_session" : "sv_session";
  const stateName = ctx.secure ? "__Host-sv_oid" : "sv_oid";
  const lookups = createRateLimiter(30, 10 * 60_000);
  const logins = createRateLimiter(20, 10 * 60_000);
  const callback = `${ctx.baseUrl}/auth/steam/callback`;
  const headers = (extra: Headers = {}): Headers => ({ "content-security-policy": CSP, ...extra });
  const clear = (name: string) => setCookie(name, "", ctx.secure, 0);

  const skinApi = ctx.options.skinApi ?? null;
  const deps = {
    pool: ctx.pool,
    skinApi,
    steam: ctx.options.steam,
    profile: async (steamId: string) => {
      const r = await fetchProfile({ kind: "id", steamId }, ctx.options.fetchFn);
      return r.status === "ok" ? r.profile : null;
    },
  };

  const failure = (res: ServerResponse, status: number, message: string) =>
    ctx.page(res, status, actionPage("/auth/steam", "Sign-in failed", "Sign-in failed", message, undefined, true));

  return {
    async handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
      const path = url.pathname;
      if (!path.startsWith("/auth/") && !path.startsWith("/inventory") && path !== "/account/delete") return false;
      const get = req.method === "GET" || req.method === "HEAD";
      const post = req.method === "POST";
      const user = await userForSession(ctx.pool, readCookie(req.headers.cookie, sessionName) ?? null);

      if (get && path === "/auth/steam") {
        if (!logins.allow(ctx.clientKey(req))) return failure(res, 429, "Too many sign-in attempts. Please wait a few minutes.");
        const state = randomBytes(16).toString("hex");
        return ctx.redirect(res, loginUrl(`${callback}?s=${state}`, ctx.baseUrl), { "set-cookie": setCookie(stateName, state, ctx.secure, 600) });
      }

      if (get && path === "/auth/steam/callback") {
        const state = url.searchParams.get("s") ?? "";
        const expected = readCookie(req.headers.cookie, stateName) ?? "";
        const reset = { "set-cookie": clear(stateName) };
        if (!/^[0-9a-f]{32}$/.test(state) || state !== expected) return ctx.page(res, 400, actionPage("/auth/steam", "Sign-in expired", "Sign-in expired", "The sign-in took too long or did not start on this site. Please try again.", undefined, true), reset);
        const steamId = await verifyAssertion(url.searchParams, `${callback}?s=${state}`, ctx.options.fetchFn);
        if (steamId === null) {
          ctx.log?.warn("steam_login_rejected");
          return ctx.page(res, 400, actionPage("/auth/steam", "Sign-in failed", "Sign-in failed", "Steam did not confirm the sign-in. Please try again.", undefined, true), reset);
        }
        const profile = await fetchProfile({ kind: "id", steamId }, ctx.options.fetchFn);
        await upsertUser(ctx.pool, { steamId, personaName: profile.status === "ok" ? profile.profile.personaName : "", avatarUrl: profile.status === "ok" ? profile.profile.avatarUrl : "" });
        const token = await createUserSession(ctx.pool, steamId);
        ctx.log?.info("steam_login", { steamId });
        const cookies = [setCookie(sessionName, token, ctx.secure, Math.floor(USER_SESSION_TTL_MS / 1000)), clear(stateName)];
        return ctx.redirect(res, `/inventory/${steamId}`, { "set-cookie": cookies });
      }

      if (post && (path === "/auth/logout" || path === "/account/delete")) {
        if (!ctx.sameOrigin(req)) return failure(res, 403, "This form can only be sent from our own site.");
        if (path === "/account/delete") {
          if (user !== null) await deleteUser(ctx.pool, user.steamId);
        } else {
          await endUserSession(ctx.pool, readCookie(req.headers.cookie, sessionName) ?? null);
        }
        return ctx.redirect(res, "/inventory", { "set-cookie": clear(sessionName) });
      }

      if (get && path === "/inventory") {
        const q = url.searchParams.get("q");
        if (q === null) return ctx.page(res, 200, inventoryHome(user), headers());
        const notice = (n: Exclude<LookupNotice, "none">, status: number) => ctx.page(res, status, inventoryHome(user, n, q), headers());
        if (!lookups.allow(ctx.clientKey(req))) return notice("busy", 429);
        const target = parseSteamInput(q);
        if (target === null) return notice("invalid", 400);
        if (target.kind === "id") return ctx.redirect(res, `/inventory/${target.steamId}`);
        const profile = await fetchProfile(target, ctx.options.fetchFn);
        if (profile.status === "ok") return ctx.redirect(res, `/inventory/${profile.profile.steamId}`);
        return profile.status === "not_found" ? notice("not_found", 404) : notice("unavailable", 502);
      }

      const match = get ? ID_PATH.exec(path) : null;
      if (match) {
        const steamId = match[1]!;
        if (!lookups.allow(ctx.clientKey(req))) return ctx.page(res, 429, inventoryHome(user, "busy"), headers({ "retry-after": "600" }));
        const outcome = await loadInventory(deps, steamId, url.searchParams.get("refresh") === "1");
        if (outcome.status !== "ok") {
          const code = { private: 403, not_found: 404, rate_limited: 503, unavailable: 502 }[outcome.status];
          return ctx.page(res, code, inventoryHome(user, outcome.status), headers());
        }
        const asked = url.searchParams.get("sort");
        const show = url.searchParams.get("show");
        const wear = url.searchParams.get("wear");
        const filters: Filters = {
          sort: SORT_KEYS.includes(asked as SortKey) ? (asked as SortKey) : "value",
          show: SHOW_KEYS.includes(show as ShowKey) ? (show as ShowKey) : "all",
          wear: WEARS.some((w) => w.code === wear) ? (wear as WearCode) : null,
        };
        return ctx.page(res, 200, inventoryPage({ snapshot: outcome.snapshot, user, cached: outcome.cached, stale: outcome.stale, filters }), headers());
      }

      return false;
    },
  };
}
