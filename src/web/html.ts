import { createHash } from "node:crypto";
import { themeCss } from "./theme.ts";

export type SiteInfo = { baseUrl: string; discordInviteUrl: string | null; contactEmail: string | null };

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ESC[c]!);

// The css file name carries a content hash, so a changed theme is picked up at once and old copies can be cached for a year.
export const cssHash = createHash("sha256").update(themeCss).digest("hex").slice(0, 10);
export const cssPath = `/assets/theme.${cssHash}.css`;

export type Page = {
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
<link rel="stylesheet" href="${cssPath}">
${ld}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site"><div class="wrap"><a class="brand" href="/">${SITE_NAME}</a></div></header>
<main id="main"><div class="wrap">
${page.body}
</div></main>
<footer class="site"><div class="wrap">
<span>&copy; ${new Date().getUTCFullYear()} ${SITE_NAME}</span>
<nav aria-label="Footer"><a href="/privacy">Privacy</a>${site.discordInviteUrl ? ` &middot; <a href="${esc(site.discordInviteUrl)}" rel="noopener">Discord</a>` : ""}</nav>
</div></footer>
</body>
</html>`;
}

export const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#2457d6"/><path d="M18 22h28v8H28v4h18v14H18v-8h18v-4H18z" fill="#fff"/></svg>`;
