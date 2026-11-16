import { esc, type Page, type SiteInfo } from "./html.ts";

const DESC_HOME = "SkinVaults is being rebuilt: faster, simpler and easy to find. Join the waiting list and tell us what a CS2 skin site should do.";

export function homePage(site: SiteInfo, state: "none" | "check-inbox" | "invalid" | "busy" = "none"): Page {
  const notice =
    state === "check-inbox"
      ? `<p class="notice" role="status">Almost done. If that address is valid, a confirmation mail is on its way. Open the link in it to join the list.</p>`
      : state === "invalid"
        ? `<p class="notice error" role="alert">That does not look like an e-mail address. Please check it and try again.</p>`
        : state === "busy"
          ? `<p class="notice error" role="alert">Too many attempts from your connection. Please try again in a few minutes.</p>`
          : "";
  const discord = site.discordInviteUrl
    ? `<p>Want to help decide what we build? Join us on <a href="${esc(site.discordInviteUrl)}" rel="noopener">Discord</a> and use the feedback channel.</p>`
    : "";
  const body = `
<h1>SkinVaults is being rebuilt</h1>
<p class="lead">A smaller, faster site for Counter-Strike 2 skins. Fewer things, done properly, and easy to find on Google.</p>

<section class="card" id="waitlist" aria-labelledby="wl-h">
<h2 id="wl-h">Tell me when it opens</h2>
${notice}
<form method="post" action="/waitlist">
<label for="email">E-mail address</label>
<div class="row">
<input id="email" name="email" type="email" autocomplete="email" inputmode="email" required maxlength="254" placeholder="you@example.com">
<button type="submit">Join the waiting list</button>
</div>
<div class="hp" aria-hidden="true"><label for="website">Leave this empty</label><input id="website" name="website" type="text" tabindex="-1" autocomplete="off"></div>
<p class="hint">One confirmation mail, then one mail when we open. Nothing else. You can remove yourself at any time. <a href="/privacy">Privacy</a></p>
</form>
</section>

<h2>What we are thinking about</h2>
<ul class="plain">
<li>Compare the price of a skin across marketplaces</li>
<li>The value of your whole inventory</li>
<li>Price alerts by Discord message or e-mail</li>
<li>Giveaways with real skins</li>
<li>Trade-up calculator</li>
<li>Deals: where to buy low and sell high</li>
<li>Wishlist, guides and a blog</li>
</ul>
<p class="hint">This list is not final. Your feedback decides what stays.</p>

<h2>What we will not build</h2>
<p>No cases and no gambling games for now. The rules around them are complicated and we would rather be safe than sorry.</p>

${discord}
<p class="hint">There is no release date yet. We will not invent one.</p>`;

  return {
    path: "/",
    title: "SkinVaults: CS2 skin prices and tools, coming soon",
    description: DESC_HOME,
    body,
    index: true,
    jsonLd: [
      { "@context": "https://schema.org", "@type": "WebSite", name: "SkinVaults", url: site.baseUrl + "/", inLanguage: "en" },
      { "@context": "https://schema.org", "@type": "Organization", name: "SkinVaults", url: site.baseUrl + "/", ...(site.discordInviteUrl ? { sameAs: [site.discordInviteUrl] } : {}) },
    ],
  };
}

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
    body: `
<h1>Privacy</h1>
<p class="lead">Short version: if you join the waiting list we keep your e-mail address, and nothing else. No trackers, no ads, no cookies.</p>
<h2>What we store</h2>
<ul class="plain">
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
<p>Only us. The address lives in our own database and mails go out through our mail provider. We do not sell or share it.</p>
<p class="hint">Draft: the owner still has to add the company name and registration details here before launch.</p>`,
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
    body: `<h1>${esc(heading)}</h1><p class="notice${error ? " error" : ""}" role="${error ? "alert" : "status"}">${esc(message)}</p>${f}<p><a class="button secondary" href="/">Back to the home page</a></p>`,
  };
}

export function notFoundPage(): Page {
  return {
    path: "/404",
    title: "Page not found",
    description: "This page does not exist.",
    index: false,
    body: `<h1>Page not found</h1><p>The page you are looking for does not exist or has moved.</p><p><a class="button" href="/">Go to the home page</a></p>`,
  };
}
