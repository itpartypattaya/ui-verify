# Self-test

`fixtures.html` holds one deliberate defect per check and a healthy control
next to it. `index.html` + `run.js` load the fixtures into iframes of the
widths each case needs, run the check from `../skills/ui-verify/checks/`, and
assert both what must be found and what must not.

Run from the repository root:

```bash
python -m http.server 8000
```

Open `http://localhost:8000/test/`. Rows turn green or red; click a row to see
the raw JSON. Cases named `R…` (Codex) and `A…` (Antigravity) are regressions
from the reviews of 1.0: each failed before its fix. `window.__uiVerify` holds `{ done, passed, total, failures }` for
automation.

`compatibility.js` adds capability regressions. They shadow selected APIs
in the fixture's real browser realm without modifying its globals: missing
APIs must return an inconclusive result, constructor-free CSSOM must still
find defects and healthy controls, and incomplete CSS must not claim a pass.
The full-window control also tests the capability preflight. `cross.css` and
`cross-import.css` play cross-origin sheets the CSSOM hides: the checks must
fetch and re-read them (and report an `@import` they cannot follow);
`cross-equal.css`, `cross-comment.css` and `cross-escaped.css` cover source
order, an import mentioned in a comment, an escaped `@import`; `cross-string.css`
an import keyword inside a CSS string.

Notes:

- The `glyphs` cases need a local Arial, Liberation Sans or DejaVu Sans (the
  fixture font is a `local()` subset limited to Latin-1).
- `widths` expects `1024–1039` at an integer devicePixelRatio and `1024–1038`
  at fractional zoom (e.g. Windows 125 %), where a 1039px frame is 1039.2 CSS px.
- The `theme` case expects either the Chromium transition + `light-dark()`
  freeze (`stale`) or, in a browser that fixed it, a normal colour change.

Adding a check or fixing a false positive: add the situation to
`fixtures.html` (defect *and* control) and a case to `run.js`.
