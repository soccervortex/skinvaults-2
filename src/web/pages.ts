import { esc, type Page, type SiteInfo } from "./html.ts";

const DESC_HOME = "SkinVaults is being rebuilt: faster, simpler and easy to find. Join the waiting list and tell us what a CS2 skin site should do.";

const IDEAS: [string, string][] = [
  ["Compare prices", "One skin, every marketplace, side by side."],
  ["Inventory value", "What your whole Steam inventory is worth, in euros."],
  ["Price alerts", "A Discord message or an e-mail when a skin drops under your price."],
  ["Giveaways", "Real skins, no tricks."],
  ["Trade-up calculator", "Know the odds and the expected value before you commit."],
  ["Deals", "Where to buy low and where to sell high."],
  ["Wishlist", "Keep the skins you want in one place and watch them."],
  ["Guides and blog", "Clear answers, written to be found."],
];

const CROSSHAIR = `<svg class="crosshair" aria-hidden="true" viewBox="0 0 600 600" fill="none" stroke="#262c34" stroke-width="1.5"><circle cx="300" cy="300" r="290"/><circle cx="300" cy="300" r="190"/><circle cx="300" cy="300" r="70"/><path d="M300 0v230M300 370v230M0 300h230M370 300h230" stroke="#3a424d"/></svg>`;

export function homePage(site: SiteInfo, state: "none" | "check-inbox" | "invalid" | "busy" = "none"): Page {
  const notice =
    state === "check-inbox"
      ? `<p class="notice" role="status">Almost done. If that address is valid, a confirmation mail is on its way. Open the link in it to join the list.</p>`
      : state === "invalid"
        ? `<p class="notice error" role="alert">That does not look like an e-mail address. Please check it and try again.</p>`
        : state === "busy"
          ? `<p class="notice error" role="alert">Too many attempts from your connection. Please try again in a few minutes.</p>`
          : "";
  const rows = IDEAS.map(([t, d], i) => `<div class="row"><div class="lhs"><span class="no">${String(i + 1).padStart(2, "0")}</span><h3>${esc(t)}</h3></div><p>${esc(d)}</p></div>`).join("");
  const discordButton = site.discordInviteUrl ? `<a class="button dark" href="${esc(site.discordInviteUrl)}" rel="noopener">Open the Discord &rarr;</a>` : "";

  const body = `
<section class="hero">
${CROSSHAIR}
<div class="wrap">
<div class="hero-copy">
<p class="status-line mono"><span class="blink" aria-hidden="true"></span>Rebuild in progress</p>
<h1>CS2 skin prices.<br><em>Fewer tabs.</em></h1>
<p class="sub">SkinVaults is being rebuilt from scratch: smaller, faster and easy to find on Google. Leave your e-mail and we tell you once, when it opens.</p>
${notice}
<form class="signup" id="join" method="post" action="/waitlist">
<label class="mono" for="email">E-mail address</label>
<div class="field-row">
<input id="email" name="email" type="email" autocomplete="email" inputmode="email" required maxlength="254" placeholder="you@example.com">
<button type="submit">Join the waiting list &rarr;</button>
</div>
<div class="hp" aria-hidden="true"><label for="website">Leave this empty</label><input id="website" name="website" type="text" tabindex="-1" autocomplete="off"></div>
<p class="hint">One confirmation mail, then one mail at launch. Nothing else. Remove yourself any time. <a href="/privacy">Privacy</a></p>
</form>
</div>
<aside class="plate" aria-label="Project status">
<i></i><i></i><i></i><i></i>
<div class="title">// Status</div>
<dl>
<div><dt>Site</dt><dd>Rebuilding</dd></div>
<div><dt>Release</dt><dd>No date yet</dd></div>
<div><dt>Waiting list</dt><dd class="ok">Open</dd></div>
<div><dt>Cases and gambling</dt><dd>None</dd></div>
<div><dt>Trackers</dt><dd>None</dd></div>
</dl>
</aside>
</div>
</section>

<section class="ideas" id="ideas"><div class="wrap">
<div class="head"><h2>What we are considering</h2><p>Not final. Your feedback decides what stays and what goes.</p></div>
<div>${rows}</div>
</div></section>

<section class="band" id="discord">
<div class="stripe" aria-hidden="true"></div>
<div class="wrap">
<div class="col">
<p class="tag">// Your call</p>
<h2>You decide what stays.</h2>
<p class="copy">${site.discordInviteUrl ? "Join the Discord and use the feedback channel to suggest, add or remove features. " : "Tell us what you used, what you missed and what you would pay for. "}We would rather do a few things really well than a lot of things badly.</p>
${discordButton}
</div>
<div class="col right">
<p class="tag">// What we will not build</p>
<p class="big">No cases. No gambling games.</p>
<p class="copy">The rules around them are complicated and we would rather be safe than sorry. And we will not invent a release date.</p>
</div>
</div>
</section>`;

  return {
    path: "/",
    title: "SkinVaults: CS2 skin prices and tools, coming soon",
    description: DESC_HOME,
    body,
    index: true,
    jsonLd: [
      { "@context": "https://schema.org", "@type": "WebSite", name: "SkinVaults", url: site.baseUrl + "/", inLanguage: "en" },
      { "@context": "https://schema.org", "@type": "Organization", name: "SkinVaults", url: site.baseUrl + "/", logo: site.baseUrl + "/logo.png", ...(site.discordInviteUrl ? { sameAs: [site.discordInviteUrl] } : {}) },
    ],
  };
}

const narrow = (inner: string) => `<div class="wrap narrow prose">${inner}</div>`;

export function privacyPage(site: SiteInfo): Page {
  const contact = site.contactEmail
    ? `E-mail <a href="mailto:${esc(site.contactEmail)}">${esc(site.contactEmail)}</a>`
    : site.discordInviteUrl
      ? `Message the team on <a href="${esc(site.discordInviteUrl)}" rel="noopener">Discord</a>`
      : "Use the unsubscribe link in any mail we sent you";
  return {
    path: "/privacy",
    title: "Privacy: what SkinVaults stores about you",
    description: "SkinVaults keeps your e-mail address only if you join the waiting list, only to tell you when we open. No trackers, no ads.",
    index: true,
    body: narrow(`
<h1>Privacy</h1>
<p class="lead">Short version: if you join the waiting list we keep your e-mail address, and nothing else. No trackers, no ads, no cookies.</p>
<h2>What we store</h2>
<ul>
<li>Your e-mail address, the time you signed up and the time you confirmed.</li>
<li>Two random codes that make the confirm and remove links work.</li>
</ul>
<h2>Why</h2>
<p>To send you a confirmation mail and one mail when the new site opens. The legal basis is your consent, which you give by confirming.</p>
<h2>How long</h2>
<p>An address that is never confirmed is deleted after seven days. A confirmed address stays until you remove it or the list is closed after launch.</p>
<h2>Your rights</h2>
<p>Every mail contains a link that deletes your address at once. You can also ask to see or remove your data: ${contact}.</p>
<h2>Who sees it</h2>
<p>Only us. The address lives in our own database and mails go out through our mail provider. We do not sell or share it.</p>`),
  };
}

export function actionPage(path: string, title: string, heading: string, message: string, form?: { action: string; token: string; button: string; secondary?: boolean }, error = false): Page {
  const f = form
    ? `<form method="post" action="${esc(form.action)}"><input type="hidden" name="token" value="${esc(form.token)}"><button type="submit">${esc(form.button)}</button></form>`
    : "";
  return {
    path,
    title,
    description: message,
    index: false,
    body: narrow(`<h1>${esc(heading)}</h1><p class="notice${error ? " error" : ""}" role="${error ? "alert" : "status"}">${esc(message)}</p>${f}<p><a class="button ghost" href="/">Back to the home page</a></p>`),
  };
}

export function notFoundPage(): Page {
  return {
    path: "/404",
    title: "Page not found",
    description: "This page does not exist.",
    index: false,
    body: narrow(`<h1>Page not found</h1><p>The page you are looking for does not exist or has moved.</p><p><a class="button" href="/">Go to the home page</a></p>`),
  };
}
