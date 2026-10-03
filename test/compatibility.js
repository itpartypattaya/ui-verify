// Capability regressions run in the fixture's real browser realm, with only
// selected APIs shadowed. No globals or page contents are changed by the shim.
const has = (list, part) => JSON.stringify(list || []).includes(part);
const unavailable = (label) => (r) => [
  ['inconclusive', r.ok === null],
  ['capability named', has(r.missingCapabilities, label)],
  ['next channel supplied', typeof r.next === 'string' && r.next.length > 0],
];
const documentWithout = (w, props) => new Proxy(w.document, {
  get(target, key) {
    if (key in props) return props[key];
    const v = Reflect.get(target, key, target);
    return typeof v === 'function' ? v.bind(target) : v;
  },
});
const missingConstructors = () => Object.fromEntries([
  'CSSStyleRule', 'CSSMediaRule', 'CSSSupportsRule', 'CSSImportRule',
  'CSSContainerRule', 'CSSScopeRule', 'CSSLayerBlockRule', 'CSSLayerStatementRule',
  'SVGElement', 'NodeFilter', 'parseFloat',
].map(k => [k, undefined]));

export const compatibilityCases = [
  ['C1 settle: unavailable performance returns null', 1280, 'settle.js', {}, unavailable('performance.now'), () => ({ performance: undefined })],
  ['C2 clipped: unavailable tree walker returns null', 1280, 'clipped.js', {}, unavailable('document.createTreeWalker'), w => ({ document: documentWithout(w, { createTreeWalker: undefined }) })],
  ['C3 mobile: unavailable tree walker returns null', 375, 'mobile.js', {}, unavailable('document.createTreeWalker'), w => ({ document: documentWithout(w, { createTreeWalker: undefined }) })],
  ['C4 contrast: unavailable DOM creation returns null', 1280, 'contrast.js', { selector: '#c-ok' }, unavailable('document.createElement'), w => ({ document: documentWithout(w, { createElement: undefined }) })],
  ['C5 visible: unavailable DOM creation returns null', 1280, 'visible.js', { selector: '#v-relative-title' }, unavailable('document.createElement'), w => ({ document: documentWithout(w, { createElement: undefined }) })],
  ['C6 glyphs: non-iterable fonts returns null', 1280, 'glyphs.js', { family: 'Arial', chars: 'A' }, unavailable('document.fonts iterator'), w => ({ document: documentWithout(w, { fonts: { load: () => Promise.resolve([]) } }) })],
  ['C7 images: unavailable Image returns null', 1280, 'images.js', {}, unavailable('Image'), () => ({ Image: undefined })],
  ['C8 grid: no global parseFloat still measures defect and control', 1280, 'grid.js', {}, r => [
    ['defect found', has(r.groups, 'g-grid.bad')], ['control clean', !has(r.groups, 'g-grid.ok')],
  ], missingConstructors],
  ['C9 widths: no constructors still reads media queries without sweep', 1280, 'widths.js', { listOnly: true }, r => [
    ['not an acceptance', r.ok === null], ['list-only', r.mode === 'listOnly' && r.tested === 0],
    ['complete CSS', r.cssCoverage.complete === true], ['breakpoints', [500, 1024, 1039].every(b => r.breakpoints.includes(b))],
  ], missingConstructors],
  ['C10 theme: probe without SVG constructor', 1280, 'theme.js', { selectors: ['#t-probe', '#t-svg'] }, r => [
    ['probe returned', r.ok === true], ['HTML probed', '#t-probe color' in r.probe], ['SVG fill probed', '#t-svg fill' in r.probe],
  ], missingConstructors],
  ['C11 theme: blocked cycle leaves the theme untouched', 1280, 'theme.js', { cycle: true }, (r, d) => [
    ...unavailable('document.createTextNode')(r), ['theme intact', d.documentElement.dataset.theme === 'light'],
  ], w => ({ document: documentWithout(w, { createTextNode: undefined }) })],
  ['C12 rules: no CSS constructors still resolves the cascade', 1280, 'rules.js', { selector: '#r-target', props: ['color'] }, r => [
    ['complete', r.ok === true], ['computed blue', r.computed.color === 'rgb(0, 0, 255)'],
    ['winner', r.candidates.color[0].likelyWinner && r.candidates.color[0].selector.includes('#r-target')],
  ], missingConstructors],
  ['C13 widths: access denial distinguished from traversal errors', 1280, 'widths.js', { listOnly: true }, r => [
    ['incomplete', r.ok === null && !r.cssCoverage.complete], ['access denied', r.unreadableSheets.length === 1],
    ['traversal failure', r.traversalErrors.length === 1], ['fallback widths supplied', r.widths.includes(375)],
  ], w => ({ document: documentWithout(w, { styleSheets: [
    { href: 'denied.css', get cssRules() { throw new Error('Access denied'); } },
    { href: 'walk.css', cssRules: [{ type: 4, get media() { throw new Error('Traversal unavailable'); } }] },
  ] }) })],
  ['C14 widths: blocked sweep supplies the external list', 1280, 'widths.js', {}, r => [
    ...unavailable('document.createElement')(r), ['no widths measured', r.tested === 0],
    ['external widths kept', r.widths.includes(375)],
  ], w => ({ document: documentWithout(w, { createElement: undefined }) })],
  ['C15 contrast: unavailable canvas is inconclusive', 1280, 'contrast.js', { selector: '#c-ok' }, unavailable('Canvas 2D'), w => ({ document: documentWithout(w, { createElement: (tag) => tag === 'canvas' ? { getContext: () => null } : w.document.createElement(tag) }) })],
  ['C16 settle: fonts readiness alone does not confirm animations', 1280, 'settle.js', {}, unavailable('document.getAnimations'), w => ({ document: documentWithout(w, { getAnimations: undefined }) })],
  ['C17 capabilities: full window advertises all modes without acceptance', 1280, 'capabilities.js', {}, r => [
    ['not acceptance', r.ok === null], ['14 modes available', r.availableModes.length === 14],
    ['no blocked modes', Object.keys(r.unavailableModes).length === 0],
  ]],
  ['C18 capabilities: read-only context advertises only supported modes', 1280, 'capabilities.js', {}, r => [
    ['not acceptance', r.ok === null], ['five modes', r.availableModes.length === 5],
    ['rules and probe', r.availableModes.includes('rules') && r.availableModes.includes('theme:probe')],
    ['canvas unavailable', r.apis['Canvas 2D'] === false],
  ], readOnly],
  ['C19 rules: partial CSS never names a winner', 1280, 'rules.js', { selector: '#r-target', props: ['color'] }, r => [
    ['inconclusive', r.ok === null], ['computed value retained', r.computed.color === 'rgb(0, 0, 255)'],
    ['no false winner', r.candidates.color.every(c => !c.likelyWinner)],
  ], w => ({ document: documentWithout(w, { styleSheets: [...w.document.styleSheets, { href: 'denied.css', get cssRules() { throw new Error('Access denied'); } }] }) })],
  ['C20 widths: measured clean viewport with incomplete CSS is not a pass', 1280, 'widths.js', { widths: [1280] }, r => [
    ['inconclusive', r.ok === null], ['viewport measured', r.tested === 1], ['CSS incomplete', !r.cssCoverage.complete],
  ], w => ({ document: documentWithout(w, { styleSheets: [{ href: 'denied.css', get cssRules() { throw new Error('Access denied'); } }] }) })],
  ['C21 clipped: no NodeFilter/SVG/global parseFloat still finds defect and control', 1280, 'clipped.js', {}, r => [
    ['defect', r.issues.some(i => i.box.includes('cl-btn'))], ['control', !has(r.issues, 'cl-ok')],
  ], missingConstructors],
  ['C22 mobile: no NodeFilter/SVG/global parseFloat still finds defect and control', 375, 'mobile.js', {}, r => [
    ['defect', has(r.smallTargets, 'm-ico1')], ['control', !has(r.smallTargets, 'm-big')],
  ], missingConstructors],
  // a cross-origin sheet the CSSOM hides but CORS lets fetch read (Google Fonts) must not
  // turn every sweep and every cascade answer into "inconclusive"
  ['C23 widths: hidden but fetchable sheet is re-read', 1280, 'widths.js', { listOnly: true }, r => [
    ['complete', r.cssCoverage.complete === true], ['fetched', r.fetchedSheets.length === 1],
    ['its breakpoint', r.breakpoints.includes(777)], ['page breakpoints kept', r.breakpoints.includes(1024)],
  ], w => ({ document: documentWithout(w, { styleSheets: [...w.document.styleSheets, hiddenSheet(w, 'cross.css')] }) })],
  ['C24 rules: hidden but fetchable sheet keeps the winner', 1280, 'rules.js', { selector: '#r-target', props: ['color'] }, r => [
    ['complete', r.ok === true], ['fetched', r.fetchedSheets.length === 1],
    ['its rule listed', r.candidates.color.some(c => c.selector === ':where(#r-target)' && /cross\.css/.test(c.sheet))],
    ['real winner kept', r.candidates.color[0].likelyWinner && r.candidates.color[0].selector === '#r-target'],
  ], w => ({ document: documentWithout(w, { styleSheets: [...w.document.styleSheets, hiddenSheet(w, 'cross.css')] }) })],
  ['C25 widths: fetched sheet with @import stays incomplete', 1280, 'widths.js', { listOnly: true }, r => [
    ['incomplete', r.cssCoverage.complete === false], ['own media read', r.breakpoints.includes(888)],
    ['import named', has(r.unreadableSheets, '@import')],
  ], w => ({ document: documentWithout(w, { styleSheets: [hiddenSheet(w, 'cross-import.css')] }) })],
];
// The 1.2.0 sheet recovery (fetch + CSSStyleSheet) must not break the read-only context
// recorded in the Codex In-app Browser — there neither may exist.
compatibilityCases.push(
  ['C26 rules: read-only context without fetch still names the winner', 1280, 'rules.js', { selector: '#r-target', props: ['color'] }, r => [
    ['complete', r.ok === true], ['nothing fetched', r.fetchedSheets.length === 0],
    ['winner', r.candidates.color[0].likelyWinner && r.candidates.color[0].selector === '#r-target'],
  ], (w) => ({ ...readOnly(w), fetch: undefined, CSSStyleSheet: undefined })],
  ['C27 widths: read-only context without fetch still lists breakpoints', 1280, 'widths.js', { listOnly: true }, r => [
    ['planning only', r.ok === null && r.tested === 0], ['complete CSS', r.cssCoverage.complete === true],
    ['breakpoints', [500, 1024, 1039].every(b => r.breakpoints.includes(b))],
  ], (w) => ({ ...readOnly(w), fetch: undefined, CSSStyleSheet: undefined })],
  ['C28 widths: hidden sheet without CSSStyleSheet stays incomplete, no request', 1280, 'widths.js', { listOnly: true }, r => [
    ['incomplete', r.cssCoverage.complete === false], ['nothing fetched', r.fetchedSheets.length === 0],
    ['no request made', spy.calls === 0],
  ], (w) => ({ CSSStyleSheet: undefined, fetch: spy.wrap(w), document: documentWithout(w, { styleSheets: [...w.document.styleSheets, hiddenSheet(w, 'cross.css')] }) })],
  // second Codex review of 1.2.0
  ['C29 rules: a re-fetched sheet keeps its place in source order', 1280, 'rules.js', { selector: '#r-target', props: ['color'] }, r => [
    ['complete', r.ok === true], ['equal-specificity rule from the earlier sheet listed', r.candidates.color.some(c => c.refetched && /cross-equal/.test(c.sheet))],
    ['later readable rule wins', r.candidates.color[0].likelyWinner && !r.candidates.color[0].refetched && r.candidates.color[0].value === 'blue'],
  ], w => ({ document: documentWithout(w, { styleSheets: [hiddenSheet(w, 'cross-equal.css'), ...w.document.styleSheets] }) })],
  ['C30 widths: a response body that never ends times out', 1280, 'widths.js', { listOnly: true }, r => [
    ['finished, incomplete', r.cssCoverage.complete === false], ['nothing fetched', r.fetchedSheets.length === 0],
    ['the request was made', spy.calls === 1],
  ], w => ({ fetch: spy.wrap(w, () => Promise.resolve({ ok: true, text: () => new Promise(() => {}) })), document: documentWithout(w, { styleSheets: [hiddenSheet(w, 'cross.css')] }) })],
  ['C31 widths: @import inside a comment is not an import', 1280, 'widths.js', { listOnly: true }, r => [
    ['complete', r.cssCoverage.complete === true], ['its breakpoint', r.breakpoints.includes(666)],
  ], w => ({ document: documentWithout(w, { styleSheets: [hiddenSheet(w, 'cross-comment.css')] }) })],
  ['C32 widths: an escaped @import keeps coverage incomplete', 1280, 'widths.js', { listOnly: true }, r => [
    ['incomplete', r.cssCoverage.complete === false], ['own media still read', r.breakpoints.includes(555)],
  ], w => ({ document: documentWithout(w, { styleSheets: [hiddenSheet(w, 'cross-escaped.css')] }) })],
  ['C33 widths: a hidden sheet added while fetching is not silently skipped', 1280, 'widths.js', { listOnly: true }, r => [
    ['incomplete', r.cssCoverage.complete === false], ['late sheet named', has(r.unreadableSheets, 'late.css')],
  ], (w) => {
    const sheets = [hiddenSheet(w, 'cross.css')];
    // the page appends another cross-origin sheet while the check waits for the first fetch
    return { fetch: (...a) => { sheets.push(hiddenSheet(w, 'late.css')); return w.fetch(...a); }, document: documentWithout(w, { styleSheets: sheets }) };
  }],
);
// review by Antigravity of 1.2.1
compatibilityCases.push(
  ['C34 widths: @import inside a CSS string is not an import', 1280, 'widths.js', { listOnly: true }, r => [
    ['complete', r.cssCoverage.complete === true], ['its breakpoint', r.breakpoints.includes(444)],
  ], w => ({ document: documentWithout(w, { styleSheets: [hiddenSheet(w, 'cross-string.css')] }) })],
);
// counts fetch calls for the case that wraps it (reset on each wrap); `impl` replaces the real fetch
const spy = { calls: 0, wrap(w, impl = (...a) => w.fetch(...a)) { spy.calls = 0; return (...a) => { spy.calls++; return impl(...a); }; } };
// the API inventory Codex recorded in its In-app Browser evaluate (read-only DOM)
function readOnly(w) {
  return { ...missingConstructors(), performance: undefined, requestAnimationFrame: undefined, Image: undefined,
    document: documentWithout(w, { createElement: undefined, createTextNode: undefined, createTreeWalker: undefined, getAnimations: undefined, fonts: {},
      documentElement: new Proxy(w.document.documentElement, { get: (n, k) => ['setAttribute', 'cloneNode'].includes(k) ? undefined : Reflect.get(n, k, n) }),
    }),
  };
}
// a sheet whose rules throw on access, like a cross-origin <link> without CORS
function hiddenSheet(w, file) {
  return { href: new URL(file, w.location.href).href, media: { mediaText: '' }, get cssRules() { throw new w.DOMException('Cannot access rules', 'SecurityError'); } };
}
