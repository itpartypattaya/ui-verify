# Running the checks in your browser tool

Every file in `checks/` is a single function expression, `(opts = {}) => { … }`
or `async (opts = {}) => { … }`, that returns plain JSON. There are two ways a
tool can accept it:

- **Function-style** — the tool takes a function and calls it.
  Pass the file text as-is (no options), or wrap it to pass options:
  `async () => (<file text>)({ selector: '.card' })`.
- **Expression-style (REPL)** — the tool evaluates an expression and returns
  the last value. Use `await (<file text>)({ … })` where the tool supports
  top-level `await` (Claude's `javascript_tool`, the DevTools console). Where
  it does not, return the promise — `(<file text>)({ … })` — if the tool
  awaits it (Playwright/Puppeteer `page.evaluate` do). Async checks:
  `settle`, `theme`, `glyphs`, `widths`, `images`.

Return values are JSON. Never return DOM nodes — the checks already return
names like `div.card#promo` and short text samples.

Tool names below are the ones these servers exposed when this was written;
if yours differ, look for "evaluate", "resize" and "emulate" in its tool list.

## Claude Code — preview pane / Claude in Chrome

| Need | How |
|---|---|
| run a check | `javascript_tool` (expression-style): `await (<file>)({ … })` |
| viewport | `resize_window` with explicit `width` and `height` — works even when the pane is hidden. A `desktop` preset *removes* emulation and a hidden pane drops back to 0×0, so reset it last |
| colour scheme | `resize_window` `colorScheme: 'dark' \| 'light'` (preview pane) |
| several steps at once | `browser_batch`: navigate → resize → settle → check → screenshot |
| console after reload | `read_console_messages` |

Local `file://` pages may open as static snapshots where scripts do not run —
serve the folder over HTTP (`python -m http.server`, `npx serve`).

## Playwright MCP

| Need | How |
|---|---|
| run a check | `browser_evaluate` with `function: "<file text>"`, or `function: "async () => (<file text>)({ … })"` for options |
| viewport | `browser_resize` `{ width, height }` |
| colour scheme | no dedicated tool in most versions — for class/attribute themes use `theme.js { to: 'dark' }`; for `prefers-color-scheme` start the browser with a dark colour scheme or use Playwright code |
| screenshot | `browser_take_screenshot` |

## Chrome DevTools MCP

| Need | How |
|---|---|
| run a check | `evaluate_script` with `function: "<file text>"` (or the wrapped form with options) |
| viewport | `resize_page` `{ width, height }` |
| colour scheme | `emulate` if your version exposes colour-scheme emulation; otherwise as for Playwright MCP |

## Playwright / Puppeteer code (tests, CI)

```js
import { readFileSync } from 'node:fs';
const src = readFileSync('skills/ui-verify/checks/overflow.js', 'utf8');
const run = (page, opts = {}) => page.evaluate(`(${src}\n)(${JSON.stringify(opts)})`);

await page.setViewportSize({ width: 375, height: 812 });   // Puppeteer: page.setViewport
await page.emulateMedia({ colorScheme: 'dark' });           // Puppeteer: page.emulateMediaFeatures
const result = await run(page);
expect(result.ok).toBe(true);
```

`page.evaluate` with a string evaluates it as an expression and awaits the
returned promise, so async checks work the same way.

## Cypress

```js
cy.viewport(375, 812);
cy.readFile('skills/ui-verify/checks/overflow.js').then((src) =>
  cy.window().then((win) => win.eval(`(${src}\n)({})`)).then((r) => expect(r.ok).to.eq(true)));
```

## DevTools console (by hand)

Paste `await (<file text>)()` and press Enter; `copy($_)` puts the result on
the clipboard. Device toolbar (Ctrl/Cmd+Shift+M) sets the width; Rendering →
"Emulate CSS media feature prefers-color-scheme" switches the scheme.

## Inside an iframe or a shadow root

The checks walk `document`. For a same-origin iframe run the check in the
frame's context (most tools let you pick the frame). Shadow DOM is not
traversed; measure the light-DOM host or run your own selector inside the
shadow root.
