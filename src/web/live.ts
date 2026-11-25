import { esc, type Page } from "./html.ts";
import type { OwnerName } from "./ownerSession.ts";
import type { User } from "../users.ts";
import { homeBody } from "./homePage.ts";

// The real SkinVaults 2.0 that visitors cannot see yet. Only a signed-in owner or co-owner reaches these pages; for
// everybody else these paths do not exist. Going public later means moving a page from here to the public routes.

type Status = "not built" | "in progress" | "ready to review";
const LAUNCH_FEATURES: [string, string, Status][] = [
  ["Home page", "The front page of the new site, with the inventory lookup.", "ready to review"],
  ["Inventory with value, float, seed and stickers", "The hook: float and seed come from Steam, prices from our price data. Steam sign-in is built too.", "ready to review"],
  ["One page per skin", "Price per marketplace and a price history chart. The base for Google.", "not built"],
  ["Search", "Find a skin by name.", "not built"],
  ["Price compare", "One skin across every marketplace.", "not built"],
  ["Price alerts", "A Discord message or e-mail when a price drops.", "not built"],
  ["Wishlist", "Skins you want, in one place.", "not built"],
  ["Profile after Steam sign-in", "Credit balance, wishlist, alerts and inventory.", "not built"],
  ["My prizes", "Lets members claim the prizes they already won.", "not built"],
  ["Guides and blog", "Written to be found.", "not built"],
];

// A slim strip so the owners always know they are looking at the private site.
const ownerBar = (owner: OwnerName) => `<div class="ownerbar"><div class="wrap">
<p role="status"><strong>Owner preview.</strong> You are signed in as <strong>${esc(owner)}</strong>. Visitors still see the coming-soon page.</p>
<nav aria-label="Owner"><a href="/owner/progress">Progress</a><a href="/?view=public">Public page</a><form method="post" action="/owner/logout"><button type="submit">Owner sign out</button></form></nav>
</div></div>`;

const shell = (user: User | null) => ({ user: user === null ? null : { name: user.personaName || user.steamId, steamId: user.steamId } });

export function siteHome(owner: OwnerName, user: User | null): Page {
  return {
    path: "/",
    title: "SkinVaults: CS2 inventory value, float and stickers",
    description: "See what a CS2 inventory is worth, with float, pattern seed and stickers.",
    index: false,
    app: shell(user),
    body: ownerBar(owner) + homeBody(user),
  };
}

export function progressPage(owner: OwnerName, user: User | null): Page {
  const rows = LAUNCH_FEATURES.map(([name, note, status]) => `<li><div><strong>${esc(name)}</strong><p>${esc(note)}</p></div><span class="tag${status === "ready to review" ? " ready" : ""}">${esc(status)}</span></li>`).join("");
  return {
    path: "/owner/progress",
    title: "Progress: SkinVaults",
    description: "What is built of the new SkinVaults.",
    index: false,
    app: shell(user),
    body: `${ownerBar(owner)}<div class="wrap narrow"><h1>Progress</h1><p class="lead">The launch features and where each one stands.</p><ul class="progress">${rows}</ul></div>`,
  };
}

export const isLivePath = (path: string): boolean => path === "/" || path === "/owner/progress";

export function renderLive(path: string, owner: OwnerName, user: User | null): Page | null {
  if (path === "/") return siteHome(owner, user);
  if (path === "/owner/progress") return progressPage(owner, user);
  return null;
}
