// Design tokens and styles for the whole site (dark, CS2-inspired: Barlow Condensed headings, hard lines, cut corners,
// one accent). Fonts are self-hosted from /fonts, so no request ever leaves the site. Kept as a TypeScript string so
// the build ships it as is. The accent can be changed in one place: --accent.
export const themeCss = `
@font-face { font-family: "Barlow Condensed"; font-weight: 700; font-display: swap; src: url(/fonts/barlow-condensed-latin-700-normal.woff2) format("woff2"); }
@font-face { font-family: "Barlow Condensed"; font-weight: 800; font-display: swap; src: url(/fonts/barlow-condensed-latin-800-normal.woff2) format("woff2"); }
@font-face { font-family: "Barlow"; font-weight: 400; font-display: swap; src: url(/fonts/barlow-latin-400-normal.woff2) format("woff2"); }
@font-face { font-family: "Barlow"; font-weight: 500; font-display: swap; src: url(/fonts/barlow-latin-500-normal.woff2) format("woff2"); }
@font-face { font-family: "Barlow"; font-weight: 600; font-display: swap; src: url(/fonts/barlow-latin-600-normal.woff2) format("woff2"); }
@font-face { font-family: "JetBrains Mono"; font-weight: 400; font-display: swap; src: url(/fonts/jetbrains-mono-latin-400-normal.woff2) format("woff2"); }
@font-face { font-family: "JetBrains Mono"; font-weight: 700; font-display: swap; src: url(/fonts/jetbrains-mono-latin-700-normal.woff2) format("woff2"); }

:root {
  color-scheme: dark;
  --bg: #0b0d10;
  --panel: #0f1318;
  --panel-2: #12161b;
  --line: #262c34;
  --line-2: #3a424d;
  --text: #e8ecf1;
  --text-2: #b7c0cc;
  --muted: #9aa4b2;
  --faint: #8a94a3;
  --accent: #f0a62b;
  --accent-ink: #0b0d10;
  --ok: #7ed957;
  --danger: #ff7a70;
  --max: 80rem;
  --display: "Barlow Condensed", "Arial Narrow", sans-serif;
  --body: "Barlow", system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
}
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--text); font: 400 1rem/1.6 var(--body); -webkit-font-smoothing: antialiased; overflow-x: hidden; display: flex; flex-direction: column; min-height: 100vh; }
main { flex: 1; position: relative; }
a { color: inherit; text-underline-offset: 4px; }
a:hover { color: var(--accent); }
a:focus-visible, button:focus-visible, input:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.skip { position: absolute; left: -999px; top: 0; background: var(--panel); color: var(--text); padding: .5rem 1rem; z-index: 50; }
.skip:focus { left: 1rem; top: 1rem; }
.wrap { width: 100%; max-width: var(--max); margin: 0 auto; padding: 0 2rem; }
.cut { clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px)); }
.mono { font-family: var(--mono); font-size: .8rem; letter-spacing: .08em; text-transform: uppercase; }

/* header */
header.site { border-bottom: 1px solid var(--line); }
header.site .wrap { height: 4.5rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.brand { display: flex; align-items: center; gap: .75rem; text-decoration: none; color: var(--text); }
.brand:hover { color: var(--text); }
.mark { width: 34px; height: 34px; background: var(--accent); color: var(--accent-ink); display: grid; place-items: center; font: 800 20px/1 var(--display); letter-spacing: .02em; }
.brand .name { font: 800 1.65rem/1 var(--display); letter-spacing: .04em; text-transform: uppercase; }
nav.top a { text-decoration: none; }
nav.top { display: flex; align-items: center; gap: 1.75rem; font: 400 .8rem var(--mono); text-transform: uppercase; letter-spacing: .04em; }
a.cta { white-space: nowrap; background: var(--accent); color: var(--accent-ink); padding: .7rem 1.25rem; text-decoration: none; font-weight: 700; }
a.cta:hover { color: var(--accent-ink); filter: brightness(1.12); }
@media (max-width: 560px) { nav.top a:not(.cta) { display: none; } .wrap { padding: 0 1.25rem; } a.cta { padding: .6rem .9rem; } .brand .name { font-size: 1.4rem; } }

/* buttons */
button, a.button { font: 800 1.35rem/1 var(--display); letter-spacing: .04em; text-transform: uppercase; min-height: 58px; padding: 0 1.9rem; border: 0; background: var(--accent); color: var(--accent-ink); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; text-decoration: none; clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px)); }
button:hover, a.button:hover { filter: brightness(1.12); color: var(--accent-ink); }
a.button.dark { background: var(--bg); color: var(--text); }
a.button.dark:hover { color: var(--text); }
a.button.ghost { background: var(--panel-2); color: var(--text); }
a.button.ghost:hover { color: var(--accent); }

/* hero */
.hero { position: relative; overflow: hidden; }
.crosshair { position: absolute; right: -140px; top: -40px; width: 760px; height: 760px; opacity: .55; pointer-events: none; }
.hero .wrap { position: relative; padding-top: 4.5rem; padding-bottom: 6rem; display: flex; flex-wrap: wrap; gap: 3.5rem 4rem; align-items: flex-start; }
.hero-copy { flex: 999 1 32rem; min-width: 0; }
.status-line { margin: 0 0 1.5rem; display: flex; align-items: center; gap: .65rem; color: var(--muted); }
.blink { width: 10px; height: 10px; background: var(--accent); display: inline-block; }
h1 { margin: 0 0 1.75rem; font: 800 clamp(3.6rem, 11vw, 9.6rem)/.86 var(--display); text-transform: uppercase; letter-spacing: -.005em; }
h1 em { font-style: normal; color: var(--accent); }
.sub { margin: 0 0 2.5rem; max-width: 32em; font-size: 1.25rem; line-height: 1.55; color: var(--text-2); }
.signup { max-width: 36rem; }
.signup label { display: block; margin-bottom: .5rem; color: var(--muted); }
.field-row { display: flex; flex-wrap: wrap; gap: .5rem; }
.field-row input[type=email], .field-row input[type=password] { flex: 1 1 15rem; min-width: 0; min-height: 58px; border: 1px solid var(--line-2); background: var(--panel-2); padding: 0 1.1rem; font: inherit; font-size: 1.1rem; color: var(--text); border-radius: 0; }
.field-row input::placeholder { color: var(--faint); }
.field-row button { flex: 1 1 auto; }
.hint { margin: .9rem 0 0; font-size: .9rem; line-height: 1.5; color: var(--faint); }
.hint a { color: var(--text-2); }
.notice { margin: 0 0 1.5rem; padding: .85rem 1.1rem; border: 1px solid var(--ok); border-left-width: 4px; background: var(--panel); max-width: 36rem; }
.notice.error { border-color: var(--danger); }
.hp { position: absolute; left: -9999px; width: 1px; height: 1px; overflow: hidden; }

/* status plate */
.plate { position: relative; flex: 1 1 20rem; min-width: 0; max-width: 27.5rem; border: 1px solid var(--line-2); background: var(--panel); }
.plate i { position: absolute; width: 16px; height: 16px; border: 0 solid var(--accent); }
.plate i:nth-child(1) { left: -1px; top: -1px; border-left-width: 3px; border-top-width: 3px; }
.plate i:nth-child(2) { right: -1px; top: -1px; border-right-width: 3px; border-top-width: 3px; }
.plate i:nth-child(3) { left: -1px; bottom: -1px; border-left-width: 3px; border-bottom-width: 3px; }
.plate i:nth-child(4) { right: -1px; bottom: -1px; border-right-width: 3px; border-bottom-width: 3px; }
.plate .title { padding: .9rem 1.25rem; border-bottom: 1px solid var(--line); color: var(--accent); font: 400 .75rem var(--mono); letter-spacing: .1em; text-transform: uppercase; }
.plate dl { margin: 0; font: 400 .875rem var(--mono); }
.plate dl div { display: flex; justify-content: space-between; gap: 1rem; padding: 1rem 1.25rem; border-bottom: 1px solid var(--line); }
.plate dl div:last-child { border-bottom: 0; }
.plate dt { color: var(--faint); }
.plate dd { margin: 0; font-weight: 700; text-align: right; }
.plate dd.ok { color: var(--ok); }

/* ideas */
.ideas { border-top: 1px solid var(--line); }
.ideas .wrap { padding-top: 5rem; padding-bottom: 1.5rem; }
.ideas .head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 1rem 3rem; margin-bottom: 2.5rem; }
h2 { margin: 0; font: 800 clamp(2.8rem, 6vw, 5rem)/.9 var(--display); text-transform: uppercase; }
.ideas .head p { margin: 0; max-width: 26em; font-size: 1.05rem; color: var(--text-2); }
.row { display: flex; flex-wrap: wrap; gap: .5rem 2rem; padding: 1.5rem 1.25rem; align-items: baseline; border-top: 1px solid var(--line); }
.row:last-child { border-bottom: 1px solid var(--line); }
.row:hover { background: var(--panel-2); box-shadow: inset 4px 0 0 var(--accent); }
.row .lhs { flex: 1 1 18rem; display: flex; gap: 1.5rem; align-items: baseline; min-width: 0; }
.row .no { font: 700 .875rem var(--mono); color: var(--accent); min-width: 1.75rem; }
.row h3 { margin: 0; font: 700 clamp(1.7rem, 3vw, 2.4rem)/1 var(--display); text-transform: uppercase; letter-spacing: .01em; }
.row p { flex: 1 1 20rem; margin: 0; font-size: 1.05rem; line-height: 1.5; color: var(--text-2); min-width: 0; }

/* band */
.band { margin-top: 4.5rem; background: var(--accent); color: var(--accent-ink); }
.band .stripe { height: 14px; background: repeating-linear-gradient(135deg, var(--accent-ink) 0 12px, transparent 12px 24px); }
.band .wrap { padding-top: 4.5rem; padding-bottom: 5.5rem; display: flex; flex-wrap: wrap; gap: 3.5rem 4.5rem; }
.band .col { flex: 1 1 24rem; min-width: 0; }
.band .col.right { border-left: 3px solid var(--accent-ink); padding-left: 2.5rem; display: flex; flex-direction: column; justify-content: flex-end; }
@media (max-width: 860px) { .band .col.right { border-left: 0; border-top: 3px solid var(--accent-ink); padding: 2.5rem 0 0; } }
.band .tag { margin: 0 0 1.1rem; font: 700 .8rem var(--mono); letter-spacing: .08em; text-transform: uppercase; }
.band h2 { margin-bottom: 1.5rem; font-size: clamp(3rem, 7vw, 6rem); }
.band .big { margin: 0 0 1rem; font: 800 clamp(2.2rem, 4.4vw, 3.6rem)/.95 var(--display); text-transform: uppercase; }
.band p.copy { margin: 0 0 2rem; max-width: 30em; font-size: 1.2rem; line-height: 1.5; font-weight: 500; }
.band .col.right p.copy { margin-bottom: 0; }

/* text pages */
.narrow { max-width: 46rem; padding-top: 4rem; padding-bottom: 6rem; }
.prose h1 { font-size: clamp(3rem, 8vw, 5.5rem); margin-bottom: 1.25rem; }
.prose h2 { font: 700 1.9rem/1.05 var(--display); text-transform: uppercase; letter-spacing: .01em; margin: 2.5rem 0 .6rem; }
.prose p, .prose li { color: var(--text-2); font-size: 1.1rem; }
.prose .lead { color: var(--text); font-size: 1.3rem; }
.prose ul { padding-left: 1.25rem; }
.prose .notice { color: var(--text); max-width: none; }
.prose form { margin: 1.5rem 0; }

/* inventory */
.inv { padding-top: 3rem; padding-bottom: 5rem; }
.inv-head { display: flex; align-items: center; gap: 1.25rem; margin-bottom: 1.5rem; }
.inv-head h1 { margin: 0; font: 800 clamp(2.4rem, 6vw, 4rem)/1 var(--display); text-transform: uppercase; }
.inv-head p { margin: 0; color: var(--muted); }
.avatar { border: 1px solid var(--line-2); display: block; }
.totals { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); gap: 1px; background: var(--line); border: 1px solid var(--line); margin: 0 0 1.25rem; }
.totals div { background: var(--panel); padding: 1rem 1.25rem; }
.totals dt { font: 400 .75rem var(--mono); letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
.totals dd { margin: .25rem 0 0; font: 800 2.2rem/1 var(--display); color: var(--accent); }
.totals dd.small { font: 500 1rem/1.4 var(--mono); color: var(--text); }
.muted { color: var(--muted); }
.skins { list-style: none; margin: 1.5rem 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(19rem, 1fr)); gap: .75rem; }
.skin { display: flex; gap: .9rem; align-items: center; background: var(--panel); border: 1px solid var(--line); border-top: 3px solid var(--line-2); padding: .75rem; }
.skin img { width: 88px; height: 88px; object-fit: contain; flex: none; background: var(--panel-2); }
.skin h3 { margin: 0 0 .25rem; font: 700 1.15rem/1.15 var(--display); letter-spacing: .01em; }
.skin .facts { list-style: none; margin: 0 0 .35rem; padding: 0; font-size: .875rem; color: var(--text-2); }
.skin .facts b { font-family: var(--mono); font-weight: 400; color: var(--text); }
.skin .price { margin: 0; font-size: 1rem; }
.skin .price b { color: var(--accent); font-family: var(--mono); font-weight: 700; }
.skin .price a { margin-left: .75rem; font-size: .8rem; }
.skin.r-b0c3d9 { border-top-color: #b0c3d9; } .skin.r-5e98d9 { border-top-color: #5e98d9; } .skin.r-4b69ff { border-top-color: #4b69ff; }
.skin.r-8847ff { border-top-color: #8847ff; } .skin.r-d32ce6 { border-top-color: #d32ce6; } .skin.r-eb4b4b { border-top-color: #eb4b4b; }
.skin.r-e4ae39 { border-top-color: #e4ae39; } .skin.r-ffd700 { border-top-color: #ffd700; }
.field-row input[type=text] { flex: 1 1 15rem; min-width: 0; min-height: 58px; border: 1px solid var(--line-2); background: var(--panel-2); padding: 0 1.1rem; font: inherit; font-size: 1.1rem; color: var(--text); border-radius: 0; }

footer.site { border-top: 1px solid var(--line); }
footer.site .wrap { padding-top: 1.75rem; padding-bottom: 2.5rem; display: flex; flex-wrap: wrap; justify-content: space-between; gap: .75rem 2rem; font: 400 .8125rem var(--mono); color: var(--faint); }

@media (prefers-reduced-motion: no-preference) { .blink { animation: blink 1.2s steps(2, start) infinite; } @keyframes blink { to { visibility: hidden; } } }
`;
