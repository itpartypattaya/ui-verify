# Fixes: symptom → cause → change

Measure first, then pick the fix that matches the **cause the check
reported**, not the symptom. After the change, run the same check again — the
fix is done when the number changed, not when the screenshot "looks better".

## Horizontal overflow (`overflow.js`, `widths.js`)

| `why` / what you see | Cause | Fix |
|---|---|---|
| wider than its container, has a fixed `width` | hard-coded px width | `max-width: 100%` (keep the width as an upper bound) |
| wider than its container, contains a long URL/word/code | min-content of unbreakable text | `overflow-wrap: anywhere` on the text block; `pre`/code → `overflow-x: auto` |
| a grid/flex item wider than its track | `min-width: auto` = min-content | `min-width: 0` on the item (and on nested flex/grid items), or `grid-template-columns: repeat(n, minmax(0, 1fr))` |
| table, iframe, video, embed | intrinsic width | wrap: `.scroll-x { overflow-x: auto }`; media: `max-width: 100%; height: auto` |
| `width: 100vw` element | `vw` includes the vertical scrollbar | `width: 100%`, or `100dvw` only where there is no scrollbar |
| shifted out (offset/transform/negative margin) | off-canvas menu, decorative shape, AOS-style `translateX` | clip the section: `overflow-x: clip` on that section (not on `body`) |
| `masked` is set | `overflow-x: hidden` on `html`/`body` hides the scrollbar, content is still cut off | fix the culprit; if you must clip, prefer `overflow-x: clip` (does not create a scroll container, keeps `position: sticky` working) |
| only between two breakpoints | `max-width: N` / `min-width: N+1` gap at fractional zoom, or a rule tuned for one side only | complementary range syntax `(width < 1040px)` / `(width >= 1040px)` — no gap at all; `max-width: N.98px` only narrows it |

## Contrast (`contrast.js`)

| Situation | Fix |
|---|---|
| `fail` on plain background | darken/lighten the text token, not the single element; re-run on both themes |
| `fail` over a photo (`stack+pixels`) | a scrim under the text: `linear-gradient(to top, rgb(0 0 0 / .6), transparent)` on an overlay, or a solid caption panel; text-shadow alone is not counted |
| `inconclusive` (CSS background image / cross-origin image) | read the range: if the worst case fails, add a scrim/overlay until even the worst grey passes ("guaranteed") |
| translucent panel over varying background | raise the panel's alpha, or measure every section the panel can scroll over |
| gradient button, one end fails | the result shows the worst stop; adjust that stop or the text colour |
| placeholder text | not measured here (pseudo-element); keep ≥ 4.5:1 if it carries information |

Thresholds (WCAG 2.x, SC 1.4.3): 4.5:1 normal text, 3:1 large text (≥ 18pt ≈ 24px,
or ≥ 14pt ≈ 18.67px bold). AAA (1.4.6): 7:1 / 4.5:1. Disabled controls are exempt.
UI components and meaningful graphics are a separate criterion (1.4.11, 3:1, with
its own exceptions) — this check measures text only.

## Uneven cards (`grid.js`)

| Cause | Fix |
|---|---|
| one card blown wider by long content | `min-width: 0` on cards + `overflow-wrap: anywhere`; or `minmax(0, 1fr)` tracks |
| covers of different height | the width differs (`aspect-ratio` turns width into height) — fix the width; then `aspect-ratio` + `object-fit: cover` on the media |
| equal widths, unequal heights in a row | `align-items: stretch` (default; something set `start`), card as `display: flex; flex-direction: column` with the footer `margin-top: auto`; `grid-template-rows: subgrid` to align inner rows |
| last row stretched | flex-wrap with `flex-grow: 1` — use grid, or `flex-grow: 0` with a fixed basis |

## A rule did not apply (`rules.js`)

| The candidates list shows | Fix |
|---|---|
| your rule is there but `active: false` (`@media …`) | the media query does not match at this width — check the breakpoint and units |
| your rule loses on specificity | lower the other rule's specificity (`:where()`), or put both in the same `@layer` order; avoid `!important` wars |
| a layered rule loses to an unlayered one | unlayered styles beat all layers for normal declarations — move the other rule into a layer, or yours out |
| no candidate at all | the selector does not match (typo, hashed class in CSS modules, element rendered later), or the sheet is cross-origin (`unreadableSheets`) |
| pseudo-element `content: none` | `::before/::after` needs `content` (even `""`) |
| value is inherited | no rule declares it on the element — set it on the element or check the parent |

## Theme (`theme.js`)

| Result | Fix |
|---|---|
| `stuck` (colour does not come back) | JS sets inline styles on switch and never resets — move colours to CSS variables/selectors |
| `stale` (transition froze the old colour) | disable transitions while switching: add `.theme-switching * { transition: none !important }` to `<html>`, switch, remove after two `requestAnimationFrame` callbacks |
| `unchanged` colours | often intentional (brand colour in both themes); if not, a hard-coded colour instead of a theme token |
| flash of the wrong theme on load | set the theme in a blocking inline `<head>` script before CSS paints; add `<meta name="color-scheme" content="light dark">` |

## Missing glyphs (`glyphs.js`)

Re-subset the font with the missing code points (or extend `unicode-range`),
or choose a fallback with matching metrics (`size-adjust`, `ascent-override`
in `@font-face`) so borrowed glyphs do not jump. Check every weight you use —
subsets are per file.

## Covered or not clickable (`visible.js`)

| Cause | Fix |
|---|---|
| static element under an absolutely positioned sibling | `position: relative` on the element (+ `z-index` if needed) — `z-index` does nothing on a static box, except on flex and grid items |
| `z-index: 9999` and still under | the parent creates a stacking context (`transform`, `opacity < 1`, `filter`, `isolation`, `position` + `z-index`) — raise the parent, not the child |
| dropdown/tooltip cut off | an ancestor has `overflow: hidden` — move it out (portal, `popover` attribute, `<dialog>`), or remove the clip |
| visible but clicks go elsewhere | a transparent overlay on top — `pointer-events: none` on the overlay |
| hidden by opacity/visibility | an animation never ran (reveal-on-scroll), or a state class is missing |

## Clipped or spilling text (`clipped.js`)

| Kind | Fix |
|---|---|
| `spills` horizontally | `overflow-wrap: anywhere`; drop `white-space: nowrap` or give the box `min-width: max-content` |
| `spills` vertically | `min-height` instead of `height`; let the box grow |
| `clipped` | the clipping box is too small for the content: `min-height`, fewer lines, or an intentional `line-clamp` with the full text available elsewhere |

## Images (`images.js`)

| Problem | Fix |
|---|---|
| broken | path/case of the file, MIME type, CORS, hotlink protection; see `settle.js` `failedResources` |
| distorted | `object-fit: cover` (or `contain`) — or matching `width`/`height` ratio |
| blurry | serve a larger file: `srcset` with `w` descriptors + correct `sizes` |
| oversized | smaller variants in `srcset`; correct `sizes` so the browser picks them |
| noDimensions | `width` and `height` attributes (the browser derives `aspect-ratio`), or CSS `aspect-ratio` |
| noAlt | meaningful `alt`; `alt=""` for decorative images |

## Mobile (`mobile.js`)

| Problem | Fix |
|---|---|
| no / wrong viewport meta | `<meta name="viewport" content="width=device-width, initial-scale=1">` |
| zoom disabled | remove `user-scalable=no` and `maximum-scale` < 5 |
| text < 12px | raise to ≥ 12px (body text ≥ 16px is the usual baseline) |
| inputs < 16px | `font-size: 16px` (or `max(16px, 1rem)`) on inputs/selects/textareas — iOS zooms otherwise |
| small tap targets | padding or `min-width/min-height: 24px` (44px comfortable); or spread them so a 24px circle around each touches nothing |
