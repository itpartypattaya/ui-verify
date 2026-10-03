# Changelog

## 1.2.1 — 2026-10-03

Second Codex review of the 1.2.0 sheet re-fetching; each finding reproduced by
a case that fails on 1.2.0 (C29–C33), then an Antigravity review of the
result (C34). Self-test 94 → 100.

- The 3 s budget now covers the response body too (a body that never ended
  hung `widths`/`rules`); expired requests are aborted, at most 20 sheets are
  fetched.
- Fetches use the HTTP cache first (`force-cache`), so the copy is usually
  the response the page used. `rules` marks candidates from re-fetched sheets
  `refetched` and notes it when one is the likely winner.
- `@import` detection ignores comments and treats escaped at-rules
  (`@\69mport`) as possible imports, keeping coverage incomplete.
- The stylesheet list is re-read after the fetches: a sheet the page added
  meanwhile is no longer silently skipped.
- `@import` mentioned inside a CSS string (`content: "@import …"`) no longer
  counts as an import; C30 now asserts the request was really made.
- `references/adapters.md`: `rules` listed as async; when a sheet stays unread,
  and that a fetched sheet with `@import` is still read apart from the import.
- `grid`: columns that are uneven on purpose (a `1.5fr 1fr 1fr` footer,
  flex-grow ratios) are no longer reported as a defect. A hidden copy of the
  container with emptied items is measured: if the widths stay the same, the
  layout is by design (listed in `byDesign`); a content blowout disappears.
  Found on a live site during the Chrome run of this release.

## 1.2.0 — 2026-10-03

Restricted browser contexts (Codex In-app Browser) and honest CSS coverage.

- Add `capabilities.js` to identify supported evaluation modes before checks.
  Each check returns `ok: null` with missing APIs and a next channel when
  required browser features are unavailable, before mutating the page.
- Support constructor-free CSSOM and SVG detection and contexts without
  global `parseFloat`; add the Codex In-app Browser adapter while retaining
  Claude's preview/Chrome instructions and plugin settings.
- `widths { listOnly: true }` is explicitly planning-only (`ok: null`,
  `tested: 0`); report CSS coverage and distinguish access from traversal
  errors. Partial CSS cannot produce a passing sweep or a likely rule winner.
- `widths` and `rules` (now `async`) fetch and re-parse cross-origin sheets
  the CSSOM hides when CORS allows it (Google Fonts, most CDNs) — otherwise
  the rule above would make every site with a font CDN inconclusive.
  Re-read sheets are listed in `fetchedSheets`.
- Add 28 capability and coverage regressions alongside all 66 existing browser tests
  (C26–C28: sheet re-fetching inside the read-only context Codex recorded).

## 1.1.0 — 2026-10-03

Fixes from two independent reviews of 1.0 — Codex, then Antigravity
(Gemini) on the result. Each finding was reproduced by a new fixture before
the fix; self-test 35 → 66 cases.

contrast
- Gradients judged on the colours between stops too, not only the stops.
- Unknown backgrounds: bound over any colour underneath — exact for opaque
  text, 5-level grey steps for translucent text (was nine greys).
- Ancestor opacity composited as a group (premultiplied), not per layer.
- Filters, blend modes, backdrop-filter and large positioned ::before/::after
  overlays make the answer `inconclusive` (estimate kept), instead of a
  confident pass/fail.
- Image pixels: pass only if every sampled pixel passes; fail if more than
  10 % fail; in between `inconclusive`. About one sample per CSS pixel
  (up to 256×16, nearest-neighbour) so thin bright lines are not averaged
  away; combinations are capped by luminance quantiles, keeping the extremes.
  Transparent pixels show the layers below. object-position keywords/calc and the content box are honoured;
  transformed images fall back to the bound.
- Every line box of the text is measured (up to 6), worst wins.
- Transparent text fill / unknown foreground → `inconclusive`, never a pass.
- Inner scrollers moved by `scrollIntoView` are restored.

rules
- Named cascade layers ranked by declaration order (normal: later wins;
  !important: earlier wins); `layer()` imports.
- Specificity: `:is()/:not()/:has()` take their most specific argument,
  `:where()` counts zero, `:nth-child(… of S)`; numeric comparison.
- `@scope` evaluated; a candidate in an unresolved context is never named winner.
- Properties set only inline (`style=""`) are listed too.

theme
- Selectors validated before any change; theme restored in `finally`.
- `stale` only for properties that actually have a transition; the reference
  clone keeps a text node.
- SVG elements: `fill` and `stroke` are probed too (icons).

visible
- `clip-path` is a note, not "hidden".
- Clipping per axis; fixed boxes inside transformed/filtered/backdrop-filtered/
  contained ancestors and size containers are clipped by them.
- Opacity checked before media counts as opaque; images with unreadable
  alpha give `possibly-covered`.

clipped
- A fixed box is inspected before leaving the loop; text inside a scroller
  is still checked against clippers further out.
- Spills are checked per axis: text falling out of the bottom of an
  `overflow-x: clip` box is reported.

widths
- A 40 px grid between breakpoints (option `step`); the page's resize
  handlers are fired in hidden tabs; unmeasured widths or undecided extra
  checks give `ok: null`. Docs no longer claim "every width".

overflow
- Only the scrolling side counts (right in LTR, left in RTL); the other side
  goes to `offscreenOtherSide`.

images
- `srcset` candidates: the file's own pixels are read (naturalWidth is
  density-corrected), with the image's own `crossorigin`/`referrerpolicy`;
  `noDimensions` tests whether space is really reserved (CSS sizes count) and
  covers pending images.

grid / glyphs / mobile
- grid selector mode: tolerance honoured, empty selection → `ok: null`.
- mobile: `contenteditable` under 16px counts as an iOS-zoom input.
- glyphs: installed fonts are "installed font", not "not loaded".

docs
- Three-state results are bounded by coverage; "measurement wins" softened;
  hidden ≠ 0×0; range syntax (not `.98`) removes the fractional-zoom gap;
  iframes of any origin are not traversed; z-index works on flex/grid items;
  large bold text ≈ 18.67px; non-text contrast is a separate criterion.

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
