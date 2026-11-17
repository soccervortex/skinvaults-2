import { esc, type Page } from "./html.ts";
import type { OwnerName } from "./ownerSession.ts";

// The site that visitors cannot see yet. Only a signed-in owner or co-owner reaches these pages; for everybody else
// these paths do not exist. Each feature that gets built is added here, so the owners see it before the public does.
// Going public later means moving a page from here to the public routes.

type Status = "not built" | "in progress" | "ready to review";
const LAUNCH_FEATURES: [string, string, Status][] = [
  ["Inventory with value, float, seed and stickers", "The hook: float and seed come from Steam, prices from our price data.", "not built"],
  ["One page per skin", "Price per marketplace and a price history chart. The base for Google.", "not built"],
  ["Search", "Find a skin by name.", "not built"],
  ["Price compare", "One skin across every marketplace.", "not built"],
  ["Price alerts", "A Discord message or e-mail when a price drops.", "not built"],
  ["Wishlist", "Skins you want, in one place.", "not built"],
  ["Profile after Steam sign-in", "Credit balance, wishlist, alerts and inventory.", "not built"],
  ["My prizes", "Lets members claim the prizes they already won.", "not built"],
  ["Guides and blog", "Written to be found.", "not built"],
];

const narrow = (inner: string) => `<div class="wrap narrow prose">${inner}</div>`;

export function previewHome(owner: OwnerName): Page {
  const rows = LAUNCH_FEATURES.map(([name, note, status]) => `<li><strong>${esc(name)}</strong> <span class="mono">(${esc(status)})</span><br>${esc(note)}</li>`).join("");
  return {
    path: "/",
    title: "Owner preview: SkinVaults",
    description: "Private preview of the new SkinVaults for the owner and co-owner.",
    index: false,
    body: narrow(`
<p class="notice" role="status">Owner preview. You are signed in as <strong>${esc(owner)}</strong>. Visitors cannot see this page: they see the coming-soon page.</p>
<h1>The new SkinVaults appears here first.</h1>
<p class="lead">Every page we build shows up here before the public sees it. Only the owner and co-owner can sign in.</p>
<h2>Launch features</h2>
<ul>${rows}</ul>
<p><a class="button ghost" href="/?view=public">View the public page</a></p>
<form method="post" action="/owner/logout"><button type="submit">Sign out</button></form>`),
  };
}

export function renderLive(path: string, owner: OwnerName): Page | null {
  return path === "/" ? previewHome(owner) : null;
}
