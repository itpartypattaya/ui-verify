# Changelog

## 1.0.0 — 2026-10-03

First public release.

- 12 self-contained checks in `skills/ui-verify/checks/`: `settle`, `overflow`,
  `widths`, `contrast`, `grid`, `rules`, `theme`, `glyphs`, `visible`,
  `clipped`, `images`, `mobile`. Each returns `ok: true | false | null`.
- `contrast`: colours normalised through canvas (oklch, lab, `color-mix()`,
  `color(srgb …)`), every gradient stop, layers found by hit-testing instead of
  walking parents, pixels read from same-origin images/video, grey sweep when
  pixels are unknowable.
- `widths`: breakpoints read from the page's CSS, iframe sweep, bisection to
  exact range edges, fractional-zoom gap detection.
- `theme`: mechanism detection (class / data attributes / media), there-and-back
  cycle, `stale` detection for transitioned `light-dark()` colours.
- `overflow`: ignores legitimate scrollers and fixed layers; reports masking by
  `overflow-x: hidden` on `html`/`body`.
- Viewport gate in every geometric check; frame waits survive hidden tabs.
- `references/adapters.md` (preview pane, Claude in Chrome, Playwright MCP,
  Chrome DevTools MCP, Playwright/Puppeteer/Cypress code, DevTools console) and
  `references/fixes.md`.
- Self-test: `test/fixtures.html` + `test/index.html`, 35 cases.
- Claude Code plugin and marketplace manifests.
