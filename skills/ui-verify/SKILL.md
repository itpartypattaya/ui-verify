---
name: ui-verify
description: "Verify web layout in a real browser with numbers, not by eyeballing screenshots: horizontal overflow and its culprit, text contrast over real backgrounds (translucent panels, gradients, photos), uneven cards, which CSS rule won, theme switching, missing glyphs, covered or unclickable elements, clipped text, broken/stretched/blurry images, mobile basics, overflow at every breakpoint. Use whenever you check your own layout through a browser tool (Playwright, DevTools, Claude in Chrome, a preview pane) and are about to conclude 'no effect', 'broken', 'pale', 'didn't apply', 'disappeared'; when a user sends a screenshot complaining about layout; when numbers look fine but the element is not visible; when a tool returned a negative result ('grep found nothing'). Russian: «поехала вёрстка», «съехало», «бледно», «не применилось», «пропал», «обрезан текст», «ездит вбок», «на телефоне криво». Not for unit tests, mockup critique or performance."
---

# ui-verify — measure the page, don't trust the picture

A screenshot can precede painting or lose low-contrast detail in compression.

**A positive result is reliable, a negative one is not.** If the effect is
visible on the screenshot, it is there. Absence can mean a defect or a channel
failure. Same with `grep`: "found" is a fact, "not found" is a question.

**A confident number is also just a channel.** A naive contrast meter that
stops at a translucent parent can report 1.26 instead of 8.8. Checks return —
`ok: true`, `ok: false`, `ok: null` (cannot tell, and why) — and says where
it is unsure instead of filling the gap with a made-up number. A `true` is
still bounded by what the check covers: read its `notes`, `unmodelled`,
`skipped` and `method` before treating it as proof.

## Workflow

0. **Context: `checks/capabilities.js`.** Run once per evaluation context.
   Some tools expose a read-only DOM rather than a full `window`. Use the
   reported `availableModes`; unavailable checks return `ok: null` with
   `missingCapabilities` and `next`. See `references/adapters.md` for Codex.
1. **Gate: `checks/settle.js`.** Viewport non-zero, document loaded, fonts in,
   images in, transitions finished. `ok: false` → fix the blockers first;
   `ok: null` → use a full page context before claiming readiness. A
   hidden pane can report 0×0 (hidden alone does not mean zero — check).
   Set an explicit viewport; geometry from 0×0 is unusable.
2. **Measure** with the check that matches the complaint (table below).
3. **Screenshot** only for what numbers don't measure: composition, rhythm,
   whitespace, "cheap or premium". Not for colour, not for "did it apply".
4. **Conclude by the numbers.** A screenshot that *doesn't show* something
   does not overrule a measurement. A screenshot that *shows* something the
   numbers say is absent is a positive result: you measured the wrong axis
   (usually: run `visible.js`). When the two disagree in any other way,
   re-check the measurement's assumptions (`notes`, `method`) before
   trusting either.
5. **Report with numbers**: "3 cards 299×168, no overflow at 320–1920" is
   checkable; "looks fine" is not.

## Running a check

Each file in `checks/` is one self-contained function expression
`(opts = {}) => { … }` (some are `async`) returning plain JSON. Read the file
and pass its text to your browser tool's JavaScript evaluation:

- function-style tools (Playwright MCP `browser_evaluate`, Chrome DevTools MCP
  `evaluate_script`): pass the file text as the function; for options wrap it:
  `async () => (<file text>)({ selector: '.card' })`;
- expression/REPL tools (Claude in Chrome / preview-pane `javascript_tool`,
  DevTools console, `page.evaluate(string)`): `await (<file text>)({ … })`.

Details, viewport and colour-scheme commands per tool: `references/adapters.md`.
Batch navigate → settle → check → screenshot in one call where the tool allows.
`widths.js { listOnly: true }` plans the widths only (`ok: null`, `tested: 0`).
Read `cssCoverage.complete`, `unreadableSheets` and `traversalErrors`; an empty
breakpoint list from an incomplete CSS read does not establish responsive coverage.

## Complaint → check

| Complaint / suspicion | Check | Key options |
|---|---|---|
| page scrolls sideways, "something sticks out" | `overflow.js` | — |
| breaks only at some widths, "fine on my laptop" | `widths.js` | `{ listOnly: true }` to drive the viewport yourself |
| text pale / unreadable, text over a photo | `contrast.js` | `{ selector }` or none (whole page), `level: 'AAA'` |
| cards/tiles/covers of different size | `grid.js` | none (auto) or `{ cells, inner }` |
| "my CSS didn't apply", "what overrides it" | `rules.js` | `{ selector, props, pseudo: '::after' }` |
| dark/light theme wrong, colour stuck after toggle | `theme.js` | `{ cycle: true, selectors }` |
| icon/arrow/currency sign looks off, odd font | `glyphs.js` | `{ selector }` or `{ family, chars }` |
| numbers fine but element not on screen / not clickable | `visible.js` | `{ selector }` |
| text cut off, spills out of a button/card | `clipped.js` | — |
| image broken, stretched, blurry, layout jumps | `images.js` | — |
| "crooked on the phone" | `mobile.js` at 360–414px | — |

When unsure, run `settle` → `overflow` → `clipped` → `images` → `contrast`
(whole page) at desktop width, then `mobile` + `overflow` at 375px. That pass
covers most layout bug reports.

## Reading results

- `ok: false` → the defect is real; the result names the element, the
  numbers, and usually the cause (`why`, `hint`). Fix recipes:
  `references/fixes.md`.
- `ok: null` → the check could not decide and says why (`error`, `unknown`,
  `inconclusive`). Do not round it to pass or fail: change the channel —
  scroll, set a viewport, zoom a screenshot, read the image file.
- Notes like "outside the viewport — used ancestors only" lower confidence;
  re-run after scrolling to that section.

## Second-channel rule

A tool said "no" → recheck by a **different mechanism**.

| First channel said "no" | Second channel |
|---|---|
| don't see the effect/colour on the screenshot | `getComputedStyle` / these checks |
| screenshot blank or came after a timeout | an unpainted frame: shoot again; if it persists, navigate again and pause |
| `grep` didn't find the rule in the build | `rules.js` — minifiers rewrite `::after` to `:after`, hash class names, inline small CSS |
| `grep` found "error" in a build log | the exit code and the tool's own summary, not word counts |
| "console is empty" | read console messages after a reload — some print before you attach |
| contrast/overflow number looks shocking | print the background chain (`notes`, `method`) — make sure you measured what the eye sees |

The rule is wider than browsers: "test doesn't fail", "diff is empty", "no
errors in the log" are all negative results.

## Traps worth knowing

- **Fractional zoom gap.** `max-width: 1039px` + `min-width: 1040px` miss
  1039.01–1039.99, where a 125 %-scaled viewport really lands. `widths.js`
  reports such `gaps`; range syntax (`width < 1040px` / `>= 1040px`) fixes it.
- **Reveal-on-scroll.** Elements waiting for an IntersectionObserver have
  opacity 0; checks skip invisible elements and say so. Scroll the page, re-run.
- **Transition + `light-dark()`** (Chromium 152): the colour stays at the old
  theme; `theme.js { cycle: true }` reports it as `stale`.
- **Measure the build you edited** (rebuilt, reloaded), at a viewport you set
  this turn — some tools reset emulation between turns; reset it last.

## What this skill does not do

Composition and taste need your eye; accessibility needs axe-core, performance
needs Lighthouse. This is not pixel-diff regression. Shadow DOM and iframe
contents (same-origin ones included) are not traversed — run the check inside
the frame, or on the shadow host's content via the page's own tooling.
