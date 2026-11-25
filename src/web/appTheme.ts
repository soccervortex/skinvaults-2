// Styles for the real site (the "app" look): neutral dark panels, one amber accent, Inter for text and JetBrains Mono for
// numbers. The coming-soon pages keep theme.ts. Fonts are self-hosted from /fonts; nothing here needs an inline style,
// so the strict CSP stays as it is. Change the accent in one place: --accent.
export const RARITY_COLORS = ["b0c3d9", "5e98d9", "4b69ff", "8847ff", "d32ce6", "eb4b4b", "e4ae39", "ffd700"];

const rarityCss = RARITY_COLORS.map(
  (c) => `.card.r-${c} { border-top-color: #${c}; }\n.card.r-${c} .shot { background: radial-gradient(ellipse at 50% 95%, #${c}33 0%, transparent 70%); }`,
).join("\n");

export const appCss = `
@font-face { font-family: "Inter"; font-weight: 400; font-display: swap; src: url(/fonts/inter-latin-400-normal.woff2) format("woff2"); }
@font-face { font-family: "Inter"; font-weight: 500; font-display: swap; src: url(/fonts/inter-latin-500-normal.woff2) format("woff2"); }
@font-face { font-family: "Inter"; font-weight: 600; font-display: swap; src: url(/fonts/inter-latin-600-normal.woff2) format("woff2"); }
@font-face { font-family: "Inter"; font-weight: 700; font-display: swap; src: url(/fonts/inter-latin-700-normal.woff2) format("woff2"); }
@font-face { font-family: "JetBrains Mono"; font-weight: 400; font-display: swap; src: url(/fonts/jetbrains-mono-latin-400-normal.woff2) format("woff2"); }
@font-face { font-family: "JetBrains Mono"; font-weight: 700; font-display: swap; src: url(/fonts/jetbrains-mono-latin-700-normal.woff2) format("woff2"); }

:root {
  color-scheme: dark;
  --bg: #111316;
  --bar: #14171b;
  --panel: #181b20;
  --panel-2: #1e2228;
  --line: #262b33;
  --line-2: #2f3540;
  --line-3: #3a414c;
  --text: #e9ecf1;
  --text-2: #c3cad6;
  --muted: #8d96a5;
  --accent: #f0a62b;
  --accent-ink: #111316;
  --ok: #4ade80;
  --danger: #ff7a70;
  --max: 87.5rem;
  --sans: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
}
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--text); font: 400 .9375rem/1.5 var(--sans); -webkit-font-smoothing: antialiased; overflow-x: hidden; display: flex; flex-direction: column; min-height: 100vh; }
main { flex: 1; }
a { color: var(--text-2); text-decoration: none; }
a:hover { color: #fff; }
a:focus-visible, button:focus-visible, input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.skip { position: absolute; left: -999px; top: 0; background: var(--panel); color: var(--text); padding: .5rem 1rem; z-index: 50; }
.skip:focus { left: 1rem; top: 1rem; }
.wrap { width: 100%; max-width: var(--max); margin: 0 auto; padding: 0 1.5rem; }
.mono { font-family: var(--mono); }
.muted { color: var(--muted); }

/* header */
.bar { background: var(--bar); border-bottom: 1px solid var(--line); }
.bar .wrap { display: flex; align-items: center; gap: 0 2rem; min-height: 3.75rem; }
.brand { display: flex; align-items: center; gap: .65rem; font-weight: 700; font-size: 1.0625rem; color: #fff; }
.brand:hover { color: #fff; }
.mark { width: 28px; height: 28px; border-radius: 6px; background: var(--accent); color: var(--accent-ink); display: inline-grid; place-items: center; font-size: 13px; font-weight: 700; }
.bar nav { display: flex; gap: .25rem; font-weight: 500; }
.bar nav a { padding: 1.3rem .75rem 1.2rem; border-bottom: 2px solid transparent; }
.bar nav a.on { color: #fff; border-bottom-color: var(--accent); }
.bar .right { margin-left: auto; display: flex; align-items: center; gap: .75rem; font-size: .8125rem; }
.bar .right form { margin: 0; }
.who-link { display: flex; align-items: center; gap: .5rem; color: var(--text); font-weight: 500; }

/* buttons */
.btn, button.btn { display: inline-flex; align-items: center; justify-content: center; min-height: 2.5rem; padding: 0 1rem; border: 0; border-radius: 6px; background: var(--accent); color: var(--accent-ink); font: 600 .875rem var(--sans); cursor: pointer; white-space: nowrap; }
.btn:hover { color: var(--accent-ink); filter: brightness(1.1); }
.btn.ghost { background: var(--panel); color: var(--text); border: 1px solid var(--line); }
.btn.ghost:hover { color: #fff; border-color: var(--line-3); filter: none; }
.btn.big { min-height: 3.25rem; padding: 0 1.6rem; font-size: 1rem; border-radius: 8px; }

/* forms and notices */
.field-row { display: flex; flex-wrap: wrap; gap: .5rem; }
.field-row input[type=text] { flex: 1 1 16rem; min-width: 0; min-height: 3.25rem; border: 1px solid var(--line-2); background: var(--panel); padding: 0 1rem; font: inherit; font-size: 1rem; color: var(--text); border-radius: 8px; }
.field-row input::placeholder { color: var(--muted); }
.label { display: block; margin-bottom: .5rem; font-size: .8125rem; color: var(--muted); }
.notice { margin: 0 0 1rem; padding: .8rem 1rem; border: 1px solid var(--line); border-left: 3px solid var(--ok); border-radius: 8px; background: var(--panel); max-width: 44rem; }
.notice.error { border-left-color: var(--danger); }

/* text page (lookup) */
.narrow { max-width: 44rem; padding-top: 3.5rem; padding-bottom: 5rem; }
.narrow h1 { margin: 0 0 .75rem; font-size: clamp(2rem, 5vw, 2.75rem); line-height: 1.1; font-weight: 700; letter-spacing: -.03em; }
.narrow h2 { margin: 2.5rem 0 .75rem; font-size: 1.125rem; font-weight: 700; }
.narrow .lead { margin: 0 0 1.5rem; font-size: 1.125rem; color: var(--muted); }
.narrow form { margin: 0 0 1rem; }
.stack { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; }
.stack form { margin: 0; }

/* owner strip */
.ownerbar { border-bottom: 1px solid var(--line); background: #191c18; font-size: .8125rem; }
.ownerbar .wrap { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .25rem 1.5rem; padding-top: .45rem; padding-bottom: .45rem; }
.ownerbar p { margin: 0; color: var(--text-2); }
.ownerbar strong { color: var(--ok); font-weight: 600; }
.ownerbar nav { display: flex; align-items: center; gap: 1rem; }
.ownerbar a, .ownerbar button { color: var(--text-2); text-decoration: underline; text-underline-offset: 3px; }
.ownerbar form { margin: 0; }
.ownerbar button { background: none; border: 0; padding: .25rem 0; font: inherit; cursor: pointer; }

/* home */
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.eyebrow { margin: 0 0 .9rem; font: 400 .75rem var(--mono); letter-spacing: .1em; text-transform: uppercase; color: var(--accent); }
.home { max-width: 75rem; padding-bottom: 4.5rem; }
.home-hero { padding: 5rem 0 3.5rem; text-align: center; }
.home-hero h1 { margin: 0 auto; max-width: 52rem; font-size: clamp(2.2rem, 5.5vw, 3.75rem); line-height: 1.07; font-weight: 700; letter-spacing: -.035em; text-wrap: balance; }
.home-sub { margin: 1.25rem auto 0; max-width: 38rem; font-size: 1.125rem; color: var(--muted); }
.home-form { margin: 2.25rem auto 0; max-width: 42.5rem; text-align: left; }
.home-after { margin: .9rem 0 0; font-size: .8125rem; color: var(--muted); }
.home-after a { text-decoration: underline; text-underline-offset: 3px; }
.features { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); gap: .75rem; }
.feature { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 1.35rem; }
.f-top { display: flex; justify-content: space-between; align-items: center; gap: .5rem; }
.f-tag { width: 34px; height: 34px; border-radius: 8px; background: var(--panel-2); border: 1px solid var(--line); display: grid; place-items: center; font: 700 .8125rem var(--mono); color: var(--accent); }
.feature h3 { margin: 1rem 0 .35rem; font-size: 1.0625rem; font-weight: 700; }
.feature p { margin: 0; font-size: .875rem; line-height: 1.55; color: var(--muted); }
.tag { flex: none; padding: .2rem .55rem; border-radius: 5px; border: 1px solid var(--line-2); font-size: .6875rem; font-weight: 600; color: var(--muted); white-space: nowrap; }
.tag.ready { border-color: transparent; background: #16301f; color: var(--ok); }
.home-next { margin-top: 3.5rem; }
.home-next h2 { margin: 0 0 1.25rem; font-size: clamp(1.6rem, 3.5vw, 2.1rem); line-height: 1.15; font-weight: 700; letter-spacing: -.025em; }

/* progress list */
.progress { list-style: none; margin: 0; padding: 0; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; }
.progress li { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; padding: .9rem 1.1rem; border-top: 1px solid var(--line); }
.progress li:first-child { border-top: 0; }
.progress p { margin: .15rem 0 0; font-size: .8125rem; color: var(--muted); }

/* inventory */
.inv { padding-top: 1.5rem; padding-bottom: 4rem; }
.who { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
.who .id { display: flex; align-items: center; gap: .9rem; min-width: 0; }
.avatar { width: 52px; height: 52px; border-radius: 8px; border: 1px solid var(--line); background: var(--panel-2); display: block; flex: none; }
.who h1 { margin: 0; font-size: 1.375rem; line-height: 1.2; font-weight: 700; letter-spacing: -.01em; overflow-wrap: anywhere; }
.who p { margin: .15rem 0 0; font: 400 .75rem var(--mono); color: var(--muted); }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(8.5rem, 1fr)); gap: .5rem; margin: 0 0 1rem; }
.stats div { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: .85rem 1.1rem; }
.stats div.hero { border-top: 2px solid var(--accent); }
.stats dt { font-size: .75rem; color: var(--muted); }
.stats dd { margin: .2rem 0 0; font: 700 1.75rem/1.1 var(--mono); }
.stats div.hero dd { color: var(--accent); }
.layout { display: flex; gap: 1rem; align-items: flex-start; }
.filters { flex: none; width: 15.5rem; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 1rem; }
.filters h2 { margin: 0 0 .6rem; font-size: .8125rem; font-weight: 600; }
.fg + .fg { margin-top: 1.25rem; }
.wearbar { display: block; width: 100%; height: 4px; border-radius: 2px; margin-bottom: .6rem; }
.chips { display: flex; flex-wrap: wrap; gap: .3rem; }
.chips a { flex: 1 1 auto; min-width: 2.4rem; text-align: center; padding: .45rem .5rem; border-radius: 5px; background: var(--panel-2); font-size: .75rem; font-weight: 500; color: var(--text-2); }
.chips a:hover { color: #fff; background: var(--line); }
.chips a.on { background: var(--accent); color: var(--accent-ink); font-weight: 600; }
.checks { display: flex; flex-direction: column; gap: .3rem; font-size: .8125rem; }
.checks a { display: flex; align-items: center; gap: .55rem; padding: .3rem 0; color: var(--text-2); }
.checks a::before { content: ""; width: 16px; height: 16px; border-radius: 4px; border: 1px solid var(--line-3); flex: none; }
.checks a.on::before { background: var(--accent); border-color: var(--accent); }
.main { flex: 1; min-width: 0; }
.toolbar { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; margin-bottom: .75rem; font-size: .8125rem; }
.toolbar .tabs { display: flex; gap: 2px; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 3px; }
.toolbar .tabs a, .toolbar .tabs b { padding: .5rem .85rem; border-radius: 6px; font-weight: 500; }
.toolbar .tabs b { background: var(--line); color: #fff; }
.toolbar .count { margin-left: auto; color: var(--muted); }
.grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(14.5rem, 1fr)); gap: .75rem; }
.card { background: var(--panel); border: 1px solid var(--line); border-top: 3px solid var(--line-3); border-radius: 8px; overflow: hidden; display: flex; flex-direction: column; min-width: 0; }
.c-head { padding: .75rem .9rem 0; min-height: 3.6rem; }
.c-head h3 { margin: 0; font-size: .875rem; font-weight: 600; line-height: 1.25; overflow-wrap: anywhere; }
.c-head p { margin: .15rem 0 0; font-size: .75rem; color: var(--muted); }
.shot { margin-top: .5rem; height: 7.5rem; display: grid; place-items: center; }
.shot img { width: 7rem; height: 7rem; object-fit: contain; }
.stick { margin: 0; padding: .1rem .9rem .4rem; font-size: .6875rem; color: var(--muted); min-height: 1.45rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.c-foot { padding: .6rem .9rem .85rem; border-top: 1px solid #1f242b; display: flex; flex-direction: column; gap: .5rem; margin-top: auto; }
.price { margin: 0; display: flex; align-items: baseline; justify-content: space-between; gap: .5rem; }
.price b { font: 700 1.25rem/1 var(--mono); }
.price span { font-size: .6875rem; color: var(--muted); text-align: right; }
.floatbar { display: block; width: 100%; height: 5px; border-radius: 2px; }
.nums { margin: 0; display: flex; justify-content: space-between; gap: .5rem; font: 400 .6875rem var(--mono); color: var(--text-2); }
.insp { font-size: .6875rem; color: var(--muted); text-decoration: underline; text-underline-offset: 3px; }
.empty { padding: 3rem 1rem; text-align: center; color: var(--muted); background: var(--panel); border: 1px solid var(--line); border-radius: 8px; }
.foot-note { margin: 1rem .1rem 0; font-size: .75rem; color: var(--muted); }
${rarityCss}

footer.site { border-top: 1px solid var(--line); background: var(--bar); }
footer.site .wrap { padding-top: 1.5rem; padding-bottom: 1.75rem; display: flex; flex-wrap: wrap; justify-content: space-between; gap: .5rem 2rem; font-size: .8125rem; color: var(--muted); }

@media (max-width: 860px) {
  .layout { flex-direction: column; }
  .filters { width: 100%; display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: 1rem 1.5rem; padding: .85rem 1rem; }
  .fg + .fg { margin-top: 0; }
  .wrap { padding: 0 1rem; }
}
@media (max-width: 560px) {
  .bar nav { display: none; }
  .grid { grid-template-columns: 1fr; }
  .stats dd { font-size: 1.3rem; }
  .stats div { padding: .7rem .85rem; }
  .checks a { padding: .45rem 0; }
}
`;
