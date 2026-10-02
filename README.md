# ui-verify

**Measure the page, don't trust the screenshot.** A skill for AI coding agents
(and a set of plain browser functions for humans) that checks web layout with
numbers: overflow and its culprit, contrast over real backgrounds, uneven
cards, which CSS rule won, theme switching, missing glyphs, covered elements,
clipped text, images, mobile basics, and every breakpoint in between.

[Русская версия](README.ru.md)

## Why

An agent looks at a screenshot, doesn't see the change, and "fixes" CSS that
was working. Or it sees a pale link that is pale only because the image was
compressed. Screenshots lose low-contrast detail and can be captured before
the page finishes painting, so:

- **a positive result is reliable, a negative one is not** — "I see it" is a
  fact, "I don't see it" is a question;
- **a confident number is also just a channel** — a naive contrast meter
  reports 1.36 : 1 for text that is really 9.4 : 1, and someone goes to fix it.

So every check here runs inside the page, measures what the browser actually
computed, and answers in three states: `ok: true`, `ok: false` with the
element, numbers and cause, or `ok: null` with the reason it cannot tell.
Never a made-up number to fill the gap.

![How ui-verify works: gate, check, three outcomes](docs/workflow.svg)

## What it checks

| Check | Catches | Typical answer |
|---|---|---|
| `settle` | measuring too early: 0×0 viewport of a hidden pane, fonts/images loading, transitions running, 404 assets | `blockers: ["viewport is 0×0 …"]` |
| `overflow` | page scrolls sideways — the outermost culprit, why, and the wider child inside | `div.o-band 1100px in a 1015px section — wider than its container` |
| `widths` | bugs that live between breakpoints: reads the page's own `@media` widths, sweeps them, bisects to the exact pixel; flags fractional-zoom gaps | `failingRanges: ["1024–1039"]`, `gaps: ["1039px/1040px"]` |
| `contrast` | WCAG contrast against what is really under the text: translucent layers, gradients, siblings, **image pixels**; any CSS colour incl. `oklch()`, `color-mix()` | `1.55 : 1 fail` · over a photo `1.85 (pixels)` · `inconclusive, range 1–21` |
| `grid` | cards, tiles, covers of different size; points at `min-width: auto` blow-outs | `widths differ: 182px ×2, 512px ×1` |
| `rules` | "my CSS didn't apply": every matching rule with `@media`/`@layer`/`@supports` context, active or not, specificity, likely winner | `.r-box (unlayered) beats @layer #r-target` |
| `theme` | theme mechanism (class, `data-theme`, `data-bs-theme`, media); switch there and back — colours that don't return or are frozen by a transition | `stale: #t-ld color` |
| `glyphs` | characters drawn by a fallback font (arrows, ✓, currency signs) | `missing: ["→", "€"]` |
| `visible` | "numbers are fine but it's not on screen": covered by a sibling, clipped by `overflow`, opacity, off-screen, and whether clicks reach it | `covered by img.v-frame — static under positioned` |
| `clipped` | text cut off by `overflow: hidden` or spilling out of a button/card; ignores ellipsis, line-clamp, `.sr-only` | `button#cl-btn spills 91px` |
| `images` | broken, stretched, blurry for the screen's DPR, oversized, no `width`/`height`, no `alt` | `distorted 200×200 from 200×100` |
| `mobile` | viewport meta, text < 12px, inputs < 16px (iOS zoom), tap targets < 24×24 with WCAG 2.2 exceptions | `smallTargets: 2 icons 16×16, 4px apart` |

Each answer comes with a fix recipe in
[`references/fixes.md`](skills/ui-verify/references/fixes.md).

### Contrast that doesn't lie

![How contrast.js rebuilds the background under the text](docs/contrast.svg)

The check hit-tests the text, walks every layer beneath it (not just the
parents) and composites them back together. Over a same-origin `<img>` or
`<video>` it reads the actual pixels under the text. Where the pixels are
unknowable (CSS background image, cross-origin), it tests every grey from
black to white under the overlay: if even the worst case passes, the overlay
guarantees legibility; if not, the answer is `inconclusive` with a range.

### Every width, not two presets

![How widths.js sweeps and bisects](docs/widths.svg)

## Install

**Claude Code (plugin):**

```bash
claude plugin marketplace add itpartypattaya/ui-verify
```

```bash
claude plugin install ui-verify@ui-verify
```

or inside a session: `/plugin marketplace add itpartypattaya/ui-verify`, then
`/plugin install ui-verify@ui-verify`.

**Claude Code (just the skill):** copy `skills/ui-verify` into
`~/.claude/skills/` (all projects) or `.claude/skills/` (one project).

**Other agents** that read `SKILL.md` skills: copy the same folder into their
skills directory. Tested with Claude Code; the checks themselves are plain
JavaScript and run anywhere.

**No agent at all:** the files in `skills/ui-verify/checks/` are standalone
functions. Paste one into the DevTools console, or call it from Playwright,
Puppeteer or Cypress tests — see
[`references/adapters.md`](skills/ui-verify/references/adapters.md).

## Use

The skill triggers on its own when the agent is about to conclude something
about layout from a screenshot. You can also ask directly:

- "The pricing cards are uneven on tablet — check with ui-verify."
- "Run ui-verify on localhost:4321 at 375 and 1280 px."
- "Contrast of the hero text over the photo?"
- «Проверь вёрстку на телефоне: что-то ездит вбок».

A typical agent report after the skill:

> At 1030 px the page overflows by 109 px: `div.o-band` is 1100 px wide inside
> a 1015 px section (fixed width from `@media (min-width: 1024px) and
> (max-width: 1039px)`). Broken range found by bisection: exactly 1024–1039 px.
> Fix: `max-width: 100%` on `.o-band`, then re-run `widths` to confirm.

Driving the checks yourself in a test:

```js
const src = readFileSync('skills/ui-verify/checks/overflow.js', 'utf8');
await page.setViewportSize({ width: 375, height: 812 });
const r = await page.evaluate(`(${src}\n)({})`);
expect(r.ok, JSON.stringify(r.culprits)).toBe(true);
```

## Tested

`test/fixtures.html` is a page with one deliberate defect per check next to a
healthy control for each (an oklch colour on `color-mix()`, a carousel that
must *not* count as overflow, an ellipsis that must *not* count as clipped
text, a theme bug, a font subset without `→` and `€` …). `test/index.html`
runs every check against it at the right width and asserts both what must be
found and what must not: **35 / 35 pass in Chrome 152**. Run it yourself:

```bash
python -m http.server 8000
```

then open `http://localhost:8000/test/`.

The checks were also run against a live production site (Astro, oklch
colours, a photo hero) to hunt false positives; the ones found there — a
skip link under `overflow-x: clip`, content-sized footer pills — are fixed and
pinned by fixtures.

Two things the suite caught in the browser itself, both now reported by the
checks:

- At Windows 125 % scaling a 1039 px viewport is 1039.2 CSS px, so
  `max-width: 1039px` and `min-width: 1040px` both miss it (`widths` → `gaps`).
- Chromium 152 does not update a transitioned colour whose value comes from
  `light-dark()` when `color-scheme` changes (`theme` → `stale`).

## Limits

Not a design critic: composition, rhythm and taste remain the screenshot's
and your job. Not a full accessibility audit (use axe-core), not pixel-diff
visual regression, not performance. Shadow DOM and cross-origin iframes are
not traversed. Contrast follows WCAG 2.x, not APCA.

## Repository

```
skills/ui-verify/
  SKILL.md                 the skill: rules, workflow, complaint → check table
  checks/*.js              12 self-contained check functions
  references/adapters.md   how to run them in each browser tool / test runner
  references/fixes.md      symptom → cause → fix
test/                      fixtures + self-test runner
docs/                      diagrams
.claude-plugin/            plugin + marketplace manifests
```

Contributions: a new check or a false positive fix comes with a fixture in
`test/fixtures.html` and a case in `test/run.js` — one that must be found and
one that must not.

## License

[MIT](LICENSE)
