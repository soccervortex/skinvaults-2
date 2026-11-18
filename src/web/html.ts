import { createHash } from "node:crypto";
import { themeCss } from "./theme.ts";
import { appCss } from "./appTheme.ts";

export type SiteInfo = { baseUrl: string; discordInviteUrl: string | null; contactEmail: string | null };

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ESC[c]!);

// The css file name carries a content hash, so a changed theme is picked up at once and old copies can be cached for a year.
export const cssHash = createHash("sha256").update(themeCss).digest("hex").slice(0, 10);
export const cssPath = `/assets/theme.${cssHash}.css`;
export const appCssHash = createHash("sha256").update(appCss).digest("hex").slice(0, 10);
export const appCssPath = `/assets/app.${appCssHash}.css`;

// Pages of the real site (inventory and later the price pages) use the app look and carry who is signed in.
export type AppShell = { user: { name: string; steamId: string } | null };

export type Page = {
  app?: AppShell; // set: render with the app look instead of the coming-soon look
  path: string; // canonical path, e.g. "/" or "/privacy"
  title: string; // under 60 characters
  description: string; // under 160 characters
  body: string; // trusted HTML built with esc()
  index?: boolean; // false adds noindex (action pages)
  jsonLd?: object[];
};

const SITE_NAME = "SkinVaults";

export function layout(site: SiteInfo, page: Page): string {
  const url = site.baseUrl + (page.path === "/" ? "/" : page.path);
  const robots = page.index === false ? '<meta name="robots" content="noindex,nofollow">' : "";
  const ld = (page.jsonLd ?? []).map((o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`).join("\n");
  const title = esc(page.title);
  const desc = esc(page.description);
  const app = page.app !== undefined;
  const year = new Date().getUTCFullYear();
  const right = !app ? "" : page.app!.user === null
    ? `<a class="btn" href="/auth/steam">Sign in with Steam</a>`
    : `<a class="who-link" href="/inventory/${esc(page.app!.user.steamId)}">${esc(page.app!.user.name)}</a><form method="post" action="/auth/logout"><button class="btn ghost" type="submit">Sign out</button></form>`;
  const chrome = app
    ? `<header class="bar"><div class="wrap">
<a class="brand" href="/inventory"><span class="mark" aria-hidden="true">SV</span>${SITE_NAME}</a>
<nav aria-label="Main"><a class="on" href="/inventory">Inventory</a></nav>
<div class="right">${right}</div>
</div></header>`
    : `<header class="site"><div class="wrap">
<a class="brand" href="/"><span class="mark cut" aria-hidden="true">SV</span><span class="name">${SITE_NAME}</span></a>
<nav class="top" aria-label="Main"><a href="/#ideas">Ideas</a>${site.discordInviteUrl ? `<a href="${esc(site.discordInviteUrl)}" rel="noopener">Discord</a>` : ""}<a class="login" href="/owner">Owner login</a><a class="cta cut" href="/#join">Join the list</a></nav>
</div></header>`;
  const foot = app
    ? `<footer class="site"><div class="wrap">
<span>&copy; ${year} ${SITE_NAME}. Not affiliated with Valve Corporation.</span>
<nav aria-label="Footer"><a href="/privacy">Privacy</a></nav>
</div></footer>`
    : `<footer class="site"><div class="wrap">
<span>&copy; ${year} ${SITE_NAME}</span>
<nav aria-label="Footer"><a href="/privacy">Privacy</a> &middot; <a href="/owner">Owner login</a>${site.discordInviteUrl ? ` &middot; <a href="${esc(site.discordInviteUrl)}" rel="noopener">Discord</a>` : ""}</nav>
</div></footer>`;
  const preload = app
    ? `<link rel="preload" href="/fonts/inter-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>`
    : `<link rel="preload" href="/fonts/barlow-condensed-latin-800-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/barlow-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${desc}">
<link rel="canonical" href="${esc(url)}">
${robots}
<meta property="og:type" content="website">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:url" content="${esc(url)}">
<meta name="twitter:card" content="summary">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
${preload}
<meta property="og:image" content="${esc(site.baseUrl)}/logo.png">
<meta name="theme-color" content="${app ? "#14171b" : "#0b0d10"}">
<link rel="stylesheet" href="${app ? appCssPath : cssPath}">
${ld}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
${chrome}
<main id="main">
${page.body}
</main>
${foot}
</body>
</html>`;
}

export const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M0 0h52l12 12v52H12L0 52z" fill="#f0a62b"/><text x="32" y="45" text-anchor="middle" font-family="Arial Narrow,Arial,sans-serif" font-weight="800" font-size="36" fill="#0b0d10">SV</text></svg>`;
