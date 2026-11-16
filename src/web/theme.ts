// PLACEHOLDER THEME. Every colour, size and radius used by the site comes from the tokens in :root below, so the real
// look (from the design phase) replaces this one block and nothing else. Kept as a TypeScript string so the build
// ships it without extra copy steps. No external fonts, no external requests.
export const themeCss = `
:root {
  color-scheme: light dark;
  --bg: #f6f7f9;
  --surface: #ffffff;
  --text: #14171c;
  --muted: #4d5663;
  --border: #d9dde3;
  --accent: #2457d6;
  --accent-text: #ffffff;
  --danger: #b3261e;
  --ok: #1b6b3a;
  --radius: 12px;
  --space: 1rem;
  --max: 46rem;
  --font: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f1216;
    --surface: #171b21;
    --text: #eceff3;
    --muted: #aab2bd;
    --border: #2c333c;
    --accent: #7aa2ff;
    --accent-text: #0b1020;
    --danger: #ff8a80;
    --ok: #7fd49b;
  }
}
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--text); font: 1rem/1.6 var(--font); }
a { color: var(--accent); text-underline-offset: 0.2em; }
a:focus-visible, button:focus-visible, input:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
.skip { position: absolute; left: -999px; top: 0; background: var(--surface); color: var(--text); padding: .5rem 1rem; z-index: 10; }
.skip:focus { left: var(--space); top: var(--space); }
.wrap { width: 100%; max-width: var(--max); margin: 0 auto; padding: 0 var(--space); }
header.site { padding: 1.25rem 0; }
header.site .wrap, footer.site .wrap { display: flex; flex-wrap: wrap; gap: .5rem 1.5rem; align-items: baseline; justify-content: space-between; }
.brand { font-weight: 700; font-size: 1.15rem; color: var(--text); text-decoration: none; }
main { padding-bottom: 3rem; }
h1 { font-size: clamp(1.9rem, 6vw, 2.8rem); line-height: 1.15; margin: 1.5rem 0 1rem; letter-spacing: -0.02em; }
h2 { font-size: 1.3rem; margin: 2.5rem 0 .75rem; }
p { margin: 0 0 1rem; }
.lead { font-size: 1.15rem; color: var(--muted); }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 1.25rem; }
.card h2 { margin-top: 0; }
ul.plain { margin: 0; padding-left: 1.25rem; }
ul.plain li { margin: .35rem 0; }
label { display: block; font-weight: 600; margin-bottom: .35rem; }
input[type=email] { width: 100%; font: inherit; padding: .75rem .9rem; border-radius: 8px; border: 1px solid var(--border); background: var(--bg); color: var(--text); min-height: 44px; }
.row { display: flex; flex-wrap: wrap; gap: .75rem; margin-top: .75rem; }
.row > input { flex: 1 1 14rem; width: auto; }
button, .button { font: inherit; font-weight: 600; min-height: 44px; padding: .65rem 1.25rem; border-radius: 8px; border: 0; cursor: pointer; background: var(--accent); color: var(--accent-text); text-decoration: none; display: inline-flex; align-items: center; }
.button.secondary { background: transparent; color: var(--accent); border: 1px solid var(--accent); }
.hint { font-size: .9rem; color: var(--muted); margin: .75rem 0 0; }
.notice { border-left: 4px solid var(--ok); padding: .75rem 1rem; background: var(--surface); border-radius: 0 var(--radius) var(--radius) 0; }
.notice.error { border-left-color: var(--danger); }
.hp { position: absolute; left: -9999px; width: 1px; height: 1px; overflow: hidden; }
footer.site { border-top: 1px solid var(--border); padding: 1.5rem 0 2.5rem; color: var(--muted); font-size: .9rem; }
@media (prefers-reduced-motion: no-preference) { button, .button { transition: filter .15s; } button:hover, .button:hover { filter: brightness(1.08); } }
`;
