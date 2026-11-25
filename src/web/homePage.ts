import { esc } from "./html.ts";
import type { User } from "../users.ts";

// The front page of the real site. It only promises what works today; the rest is marked "Soon" and has no button.
type Feature = { tag: string; title: string; text: string; soon?: boolean };

const FEATURES: Feature[] = [
  { tag: "&euro;", title: "Inventory value", text: "Your whole inventory in one view, each item at the lowest marketplace price in our price data." },
  { tag: "0.", title: "Float and seed", text: "The exact float and pattern seed of each skin, read straight from Steam." },
  { tag: "ST", title: "Stickers", text: "Every applied sticker by name, so you can spot a craft." },
  { tag: "!", title: "Price alerts", text: "A message when a skin drops below the price you set.", soon: true },
];

const COMING: Feature[] = [
  { tag: "&#8646;", title: "Price compare", text: "One skin across every marketplace, sorted by price.", soon: true },
  { tag: "&#8776;", title: "Skin pages", text: "A page for each skin with its price history.", soon: true },
  { tag: "&#9733;", title: "Wishlist", text: "The skins you want, in one place.", soon: true },
  { tag: "&#182;", title: "Guides", text: "Plain explanations of float, patterns and prices.", soon: true },
];

const featureCard = (f: Feature) => `<li class="feature"><div class="f-top"><span class="f-tag" aria-hidden="true">${f.tag}</span>${f.soon ? `<span class="tag">Soon</span>` : ""}</div><h3>${f.title}</h3><p>${f.text}</p></li>`;

export function homeBody(user: User | null): string {
  const after = user === null
    ? `Or <a href="/auth/steam">sign in with Steam</a>. We never see your password and never ask for your trade link.`
    : `Signed in as ${esc(user.personaName || user.steamId)}. <a href="/inventory/${esc(user.steamId)}">Open my inventory</a>`;
  return `<div class="wrap home">
<section class="home-hero">
<p class="eyebrow">CS2 inventory and price tools</p>
<h1>See what your skins are worth, and where they are cheapest.</h1>
<p class="home-sub">Value, float, pattern seed and stickers for every item in a public CS2 inventory.</p>
<form class="home-form" method="get" action="/inventory">
<label class="sr" for="q">Steam profile link, Steam ID or custom name</label>
<div class="field-row">
<input id="q" name="q" type="text" maxlength="200" required placeholder="Steam profile link, Steam ID or custom name" autocomplete="off" spellcheck="false">
<button class="btn big" type="submit">Check inventory</button>
</div>
</form>
<p class="home-after">${after}</p>
</section>
<section aria-labelledby="now-title">
<h2 id="now-title" class="sr">What you get</h2>
<ul class="features">${FEATURES.map(featureCard).join("")}</ul>
</section>
<section aria-labelledby="next-title" class="home-next">
<p class="eyebrow">On the way</p>
<h2 id="next-title">More than an inventory check.</h2>
<ul class="features">${COMING.map(featureCard).join("")}</ul>
</section>
</div>`;
}
