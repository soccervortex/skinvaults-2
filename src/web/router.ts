import type { IncomingMessage, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import type { Pool } from "../platform/db.ts";
import { cssPath, esc, faviconSvg, layout, type SiteInfo } from "./html.ts";
import { logoPng } from "./logo.ts";
import { themeCss } from "./theme.ts";
import { actionPage, homePage, notFoundPage, privacyPage } from "./pages.ts";
import { confirm, looksLikeToken, signup, unsubscribe } from "../waitlist.ts";
import { createRateLimiter } from "./rateLimit.ts";

const MAX_BODY = 4096;
// Self-hosted fonts live in public/fonts (shipped in the image). Only names matching this pattern are ever read.
const FONT_DIR = new URL("../../public/fonts/", import.meta.url);
const FONT_RE = /^\/fonts\/([a-z0-9-]+\.woff2)$/;
const fontCache = new Map<string, Buffer>();
const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "content-security-policy": "default-src 'none'; style-src 'self'; img-src 'self' data:; font-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
};

export type Web = { handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> };

// no-transform stops Cloudflare from rewriting the page (it would replace the contact address with "[email protected]").
function html(res: ServerResponse, status: number, body: string, extra: Record<string, string> = {}): true {
  res.writeHead(status, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store, no-transform", ...SECURITY_HEADERS, ...extra });
  res.end(body);
  return true;
}
function text(res: ServerResponse, type: string, body: string, cache: string): true {
  res.writeHead(200, { "content-type": type, "cache-control": cache, "x-content-type-options": "nosniff" });
  res.end(body);
  return true;
}

export async function readForm(req: IncomingMessage): Promise<URLSearchParams | null> {
  if (!(req.headers["content-type"] ?? "").startsWith("application/x-www-form-urlencoded")) return null;
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) return null;
    chunks.push(chunk as Buffer);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}

// A form post must come from our own pages. Browsers always send Origin on cross-site posts.
export function sameOrigin(req: IncomingMessage, baseUrl: string): boolean {
  const origin = req.headers.origin;
  if (origin === undefined) return true;
  return origin === baseUrl || origin === `http://${req.headers.host}` || origin === `https://${req.headers.host}`;
}

// Cloudflare and Caddy put the visitor address in these headers; the socket address is the proxy.
export function clientKey(req: IncomingMessage): string {
  const h = (n: string) => (typeof req.headers[n] === "string" ? (req.headers[n] as string) : "");
  return h("cf-connecting-ip") || h("x-forwarded-for").split(",")[0]!.trim() || req.socket.remoteAddress || "unknown";
}

export function createWeb(pool: Pool, site: SiteInfo): Web {
  const limiter = createRateLimiter(5, 10 * 60_000);
  const page = (res: ServerResponse, status: number, p: Parameters<typeof layout>[1], headers?: Record<string, string>) => html(res, status, layout(site, p), headers);

  return {
    async handle(req, res, url) {
      const path = url.pathname;
      const get = req.method === "GET" || req.method === "HEAD";

      if (get && path === cssPath) return text(res, "text/css; charset=utf-8", themeCss, "public, max-age=31536000, immutable");
      const font = get ? FONT_RE.exec(path) : null;
      if (font) {
        let data = fontCache.get(font[1]!);
        if (!data) {
          try { data = await readFile(new URL(font[1]!, FONT_DIR)); } catch { return false; }
          fontCache.set(font[1]!, data);
        }
        res.writeHead(200, { "content-type": "font/woff2", "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff" });
        res.end(data);
        return true;
      }
      if (get && path === "/favicon.svg") return text(res, "image/svg+xml", faviconSvg, "public, max-age=86400");
      if (get && (path === "/logo.png" || path === "/favicon.ico")) {
        res.writeHead(200, { "content-type": "image/png", "cache-control": "public, max-age=86400", "x-content-type-options": "nosniff" });
        res.end(logoPng);
        return true;
      }
      if (get && path === "/robots.txt") {
        return text(res, "text/plain; charset=utf-8", `User-agent: *\nAllow: /\nDisallow: /waitlist\n\nSitemap: ${site.baseUrl}/sitemap.xml\n`, "public, max-age=3600");
      }
      if (get && path === "/sitemap.xml") {
        const urls = ["/", "/privacy"].map((p) => `<url><loc>${esc(site.baseUrl + p)}</loc></url>`).join("");
        return text(res, "application/xml; charset=utf-8", `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, "public, max-age=3600");
      }
      if (get && path === "/") return page(res, 200, homePage(site));
      if (get && path === "/privacy") return page(res, 200, privacyPage(site));

      if (req.method === "POST" && path === "/waitlist") {
        if (!sameOrigin(req, site.baseUrl)) return page(res, 403, actionPage("/waitlist", "Request refused", "Request refused", "This form can only be sent from our own site.", undefined, true));
        if (!limiter.allow(clientKey(req))) return page(res, 429, homePage(site, "busy"), { "retry-after": "600" });
        const form = await readForm(req);
        if (form === null) return page(res, 400, homePage(site, "invalid"));
        // Bots fill the hidden field; they get the same friendly answer and nothing is stored.
        if ((form.get("website") ?? "") !== "") return page(res, 200, homePage(site, "check-inbox"));
        const result = await signup(pool, site.baseUrl, form.get("email") ?? "");
        return page(res, result === "ok" ? 200 : 400, homePage(site, result === "ok" ? "check-inbox" : "invalid"));
      }

      // Confirm and remove: the mail link opens a page with a button, so mail scanners that fetch links cannot trigger them.
      if (path === "/waitlist/confirm" || path === "/waitlist/unsubscribe") {
        const isConfirm = path === "/waitlist/confirm";
        const bad = () => page(res, 400, actionPage(path, "Link not valid", "Link not valid", "This link is not valid or was already used. If you want to join the list, sign up again on the home page.", undefined, true));
        if (get) {
          const token = url.searchParams.get("token");
          if (!looksLikeToken(token)) return bad();
          return page(res, 200, isConfirm
            ? actionPage(path, "Confirm your address", "Confirm your place", "Press the button to confirm that you want to be told when SkinVaults opens.", { action: path, token, button: "Confirm" })
            : actionPage(path, "Remove your address", "Remove your address", "Press the button to delete your address from the waiting list.", { action: path, token, button: "Remove my address" }));
        }
        if (req.method === "POST") {
          if (!sameOrigin(req, site.baseUrl)) return bad();
          const form = await readForm(req);
          const token = form?.get("token") ?? null;
          if (!looksLikeToken(token)) return bad();
          const ok = isConfirm ? await confirm(pool, token) : await unsubscribe(pool, token);
          if (!ok) return bad();
          return page(res, 200, isConfirm
            ? actionPage(path, "You are on the list", "You are on the list", "Thank you. We will send one mail when SkinVaults opens.")
            : actionPage(path, "Address removed", "Address removed", "Your address was deleted. You will not hear from us again."));
        }
      }

      return false;
    },
  };
}

export const notFoundHtml = (site: SiteInfo): string => layout(site, notFoundPage());
