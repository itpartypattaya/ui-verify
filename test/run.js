// Runs every check against fixtures.html inside an iframe of a given width and
// asserts what each one must find (defects) and must not find (healthy controls).
// Serve the repo root over HTTP and open /test/ — see test/README.md.

const CHECKS = '../skills/ui-verify/checks/';
import { compatibilityCases } from './compatibility.js';
const src = {};
const load = async (file) => (src[file] ??= await (await fetch(CHECKS + file, { cache: 'no-store' })).text());

const frames = {};
async function frameAt(width) {
  if (frames[width]) return frames[width];
  const f = document.createElement('iframe');
  f.src = `fixtures.html?t=${Date.now()}`;
  f.style.cssText = `width:${width}px;height:800px;border:1px solid #999;display:block;margin:8px 0`;
  f.title = `fixtures @ ${width}px`;
  document.getElementById('frames').appendChild(f);
  await new Promise((r) => (f.onload = r));
  await f.contentDocument.fonts.ready;
  await new Promise((r) => setTimeout(r, 300));
  frames[width] = f;
  return f;
}

const has = (list, part) => JSON.stringify(list || []).includes(part);

const cases = [
  ['settle: page ready, broken image + 404 noticed', 1280, 'settle.js', {}, (r) => [
    ['ok', r.ok === true], ['1 broken image', r.images.broken === 1], ['404 in failedResources', has(r.failedResources, 'missing-image.png')]]],
  ['settle: 0-wide viewport is a blocker, not data', 0, 'settle.js', { timeout: 500 }, (r) => [
    ['not ok', r.ok === false], ['viewport blocker', has(r.blockers, 'viewport is 0')]]],
  ['overflow: refuses to measure a 0-wide viewport', 0, 'overflow.js', {}, (r) => [['ok is null', r.ok === null], ['says why', /viewport is 0/.test(r.error)]]],
  ['overflow: carousel is not a culprit at 1280', 1280, 'overflow.js', {}, (r) => [
    ['ok', r.ok === true], ['no culprits', r.culprits.length === 0]]],
  ['overflow: band breaks at 1030', 1030, 'overflow.js', {}, (r) => [
    ['not ok', r.ok === false], ['culprit .o-band', has(r.culprits[0], 'o-band')], ['carousel ignored', !has(r.culprits, 'carousel')]]],
  ['widths: breakpoints read from CSS', 1280, 'widths.js', { listOnly: true }, (r) => [
    ['bp 1024, 1039, 500', [1024, 1039, 500].every((b) => r.breakpoints.includes(b))], ['edges 1023/1040 tested', r.widths.includes(1023) && r.widths.includes(1040)]]],
  ['widths: iframe sweep, band range exact to the pixel', 1280, 'widths.js', {}, (r) => [
    // 1024–1039 at an integer devicePixelRatio; 1024–1038 at fractional zoom, where a 1039px frame is really 1039.2px wide
    ['not ok', r.ok === false], ['exactly 1024–1039 (or –1038 at fractional dpr)', r.failingRanges.includes(Number.isInteger(r.dpr) ? '1024–1039' : '1024–1038') || r.failingRanges.includes('1024–1039')],
    ['1039/1040 gap reported', r.gaps.includes('1039px/1040px')],
    ['narrow grid overflow found too', r.failingRanges.some((x) => /^≤?320–\d+$/.test(x))]]],

  ['contrast: dark on white passes', 1280, 'contrast.js', { selector: '#c-ok' }, (r) => [['pass', r.results[0].status === 'pass']]],
  ['contrast: oklch on color-mix fails (no regex garbage)', 1280, 'contrast.js', { selector: '#c-oklch-fail' }, (r) => [
    ['fail', r.results[0].status === 'fail'], ['ratio < 2', r.results[0].ratio < 2]]],
  ['contrast: dark oklch on tint passes', 1280, 'contrast.js', { selector: '#c-oklch-pass' }, (r) => [
    ['pass', r.results[0].status === 'pass'], ['ratio > 7', r.results[0].ratio > 7]]],
  ['contrast: translucent panel composited, not taken literally', 1280, 'contrast.js', { selector: '#c-translucent' }, (r) => [
    ['pass', r.results[0].status === 'pass'], ['ratio > 7', r.results[0].ratio > 7]]],
  ['contrast: oklch gradient stops all read', 1280, 'contrast.js', { selector: '#c-gradient' }, (r) => [
    ['pass', r.results[0].status === 'pass'], ['range of stops', Array.isArray(r.results[0].range)]]],
  ['contrast: dark sibling layer seen via hit-testing', 1280, 'contrast.js', { selector: '#c-sibling' }, (r) => [
    ['pass', r.results[0].status === 'pass'], ['ratio > 10', r.results[0].ratio > 10], ['stack method', r.results[0].method === 'stack']]],
  ['contrast: strong veil over a photo — pixels read, passes', 1280, 'contrast.js', { selector: '#c-photo-strong p' }, (r) => [
    ['pass', r.results[0].status === 'pass'], ['measured on pixels', r.results[0].method === 'stack+pixels']]],
  ['contrast: weak veil over a photo — pixels read, fails', 1280, 'contrast.js', { selector: '#c-photo-weak p' }, (r) => [
    ['fail', r.results[0].status === 'fail'], ['measured on pixels', r.results[0].method === 'stack+pixels'], ['range given', Array.isArray(r.results[0].range)]]],
  ['contrast: CSS background image is inconclusive, not a number', 1280, 'contrast.js', { selector: '#c-bgphoto p' }, (r) => [
    ['inconclusive', r.results[0].status === 'inconclusive'], ['range given', Array.isArray(r.results[0].range)]]],
  ['contrast: disabled control exempt', 1280, 'contrast.js', { selector: '#c-disabled' }, (r) => [['exempt', r.results[0].status.startsWith('exempt')]]],
  ['contrast: page scan', 1280, 'contrast.js', {}, (r) => [
    ['finds c-oklch-fail', has(r.failed, 'c-oklch-fail')], ['not c-ok', !has(r.failed, '#c-ok ')], ['skips invisible', r.skipped.invisible >= 2],
    ['bg-image text inconclusive, not failed', has(r.inconclusive, 'c-bgphoto') && !has(r.failed, 'c-bgphoto')],
    ['weak-veil photo failed on pixels', has(r.failed, 'c-photo-weak')], ['strong-veil photo not failed', !has(r.failed, 'c-photo-strong')]]],

  ['grid: auto finds the blown-out grid only', 1280, 'grid.js', {}, (r) => [
    ['bad grid flagged', has(r.groups.map((g) => g.container), 'g-grid.bad')], ['ok grid clean', !has(r.groups.map((g) => g.container), 'g-grid.ok')],
    ['image gallery row not flagged', !has(r.groups.map((g) => g.container), 'i-row')],
    ['content-sized pills not flagged', !has(r.groups.map((g) => g.container), 'g-pills')],
    ['1.5fr 1fr 1fr template not flagged', !has(r.groups.map((g) => g.container), 'g-grid.wide')],
    ['…and listed as by design', has(r.byDesign.map((g) => g.container), 'g-grid.wide')],
    ['blown-out grid not excused as by design', !has(r.byDesign.map((g) => g.container), 'g-grid.bad')],
    ['min-width hint', has(r.groups.find((g) => g.container.includes('g-grid.bad')), 'min-width: 0')]]],
  ['grid: selector mode on the fixed grid', 1280, 'grid.js', { cells: '.g-grid.ok .g-card', inner: '.g-grid.ok img' }, (r) => [['ok', r.ok === true]]],

  ['rules: id beats class, layer loses, media inactive, nesting resolved', 1280, 'rules.js', { selector: '#r-target', props: ['color', 'margin-top', 'padding-top'] }, (r) => [
    ['color winner #r-target', r.candidates.color[0].likelyWinner && r.candidates.color[0].selector.includes('#r-target')],
    ['computed blue', r.computed.color === 'rgb(0, 0, 255)'],
    ['unlayered .r-box beats @layer #r-target', r.candidates['margin-top'][0].selector.includes('.r-box') && r.computed['margin-top'] === '7px'],
    ['nested rule found', r.candidates['padding-top'].length > 0],
    ['@media (max-width: 500px) inactive', has(r.inactive, 'max-width: 500px')]]],
  ['rules: ::after generated', 1280, 'rules.js', { selector: '#r-target', pseudo: '::after', props: ['content'] }, (r) => [
    ['content "x"', r.computed.content === '"x"'], ['rule found', r.candidates.content.length === 1]]],

  ['theme: mechanism detected', 1280, 'theme.js', {}, (r) => [['data-theme', r.mechanism.type === 'attribute' && r.mechanism.where === 'html[data-theme]']]],
  ['theme: cycle catches the stuck colour', 1280, 'theme.js', { cycle: true, selectors: ['#t-probe', '#t-ld', '#t-js'] }, (r) => [
    ['not ok', r.ok === false], ['#t-js stuck', has(r.stuck, '#t-js color')], ['#t-probe returns', !has(r.stuck, '#t-probe')], ['something changed', r.changed > 0],
    // Chromium 152 freezes a transitioned light-dark() colour; if a later version fixes it, the colour simply changes
    ['light-dark + transition: stale or fixed', has(r.stale, '#t-ld color') || r.probe.other['#t-ld color'] !== r.probe.before['#t-ld color']],
    ['the check itself leaves #t-ld alone', !has(r.stuck, '#t-ld')]]],
  ['theme: page left as found after the cycle', 1280, 'contrast.js', { selector: '#t-ld' }, (r) => [['#t-ld still readable', r.results[0].status === 'pass']]],

  ['glyphs: subset lacks → and €', 1280, 'glyphs.js', { family: 'Subset', chars: 'A«→€' }, (r) => [
    ['family available', r.familyAvailable], ['→ € missing', r.missing.includes('→') && r.missing.includes('€')], ['A « present', !r.missing.includes('A') && !r.missing.includes('«')]]],
  ['glyphs: from an element', 1280, 'glyphs.js', { selector: '#g-text' }, (r) => [['→ missing', r.missing.includes('→')], ['A not missing', !r.missing.includes('A')]]],

  ['visible: static text under an absolute image', 1280, 'visible.js', { selector: '#v-static-title' }, (r) => [
    ['covered', r.results[0].verdict === 'covered'], ['static hint', /position: relative/.test(r.results[0].hint || '')]]],
  ['visible: relative text above the image', 1280, 'visible.js', { selector: '#v-relative-title' }, (r) => [['visible', r.results[0].verdict === 'visible']]],
  ['visible: button under transparent glass', 1280, 'visible.js', { selector: '#v-trapped' }, (r) => [
    ['visible', r.results[0].verdict === 'visible'], ['not clickable', r.results[0].clickable === false]]],
  ['visible: clipped by overflow', 1280, 'visible.js', { selector: '#v-clipped' }, (r) => [
    ['hidden', r.results[0].verdict === 'hidden'], ['clipped reason', has(r.results[0].reasons, 'clipped by overflow')]]],
  ['visible: opacity 0', 1280, 'visible.js', { selector: '#v-transparent' }, (r) => [['hidden by opacity', has(r.results[0].reasons, 'opacity')]]],

  ['clipped: spill, clip, and intentional truncation', 1280, 'clipped.js', {}, (r) => [
    ['button spills', r.issues.some((i) => i.kind === 'spills' && i.box.includes('cl-btn'))],
    ['card clipped', r.issues.some((i) => i.kind === 'clipped' && i.box.includes('cl-card'))],
    ['ellipsis not reported', !has(r.issues, 'cl-ellipsis') && r.intentional.ellipsis >= 1],
    ['sr-only not reported', r.intentional.visuallyHidden >= 1],
    ['ordinary paragraph clean', !has(r.issues, 'cl-ok')],
    ['overflow-x: clip does not hide vertical overflow', !has(r.issues.filter((i) => i.kind === 'clipped'), 'cl-xclip')]]],

  ['images: every defect once, the good image never', 1280, 'images.js', {}, (r) => [
    ['broken', has(r.broken, 'i-broken')], ['distorted', has(r.distorted, 'i-distorted')], ['blurry', has(r.blurry, 'i-blurry')],
    ['oversized', has(r.oversized, 'i-oversized')], ['noAlt', has(r.noAlt, 'i-noalt')], ['noDimensions', has(r.noDimensions, 'i-nodims')],
    ['i-ok clean', !JSON.stringify(r).includes('i-ok')]]],

  // ---- regressions from the 1.0 review (each failed before its fix) ----
  ['R1 contrast: gradient midpoint, not just its ends', 1280, 'contrast.js', { selector: '#r1' }, (r) => [['not a pass', r.results[0].status === 'fail']]],
  ['R3 contrast: ancestor opacity composited as a group', 1280, 'contrast.js', { selector: '#r3' }, (r) => [
    ['pass (black on ~#808080 ≈ 5.3)', r.results[0].status === 'pass'], ['ratio 5–5.6', r.results[0].ratio > 5 && r.results[0].ratio < 5.6]]],
  ['R4 contrast: filter on the text is not modelled → inconclusive', 1280, 'contrast.js', { selector: '#r4' }, (r) => [['inconclusive', r.results[0].status === 'inconclusive']]],
  ['R5 contrast: a bright strip under part of the text is not averaged away', 1280, 'contrast.js', { selector: '#r5' }, (r) => [
    ['not a pass', !r.results[0].status.startsWith('pass')], ['pixels read', r.results[0].method === 'stack+pixels']]],
  ['R8 contrast: nested scroller restored', 1280, 'contrast.js', { selector: '#r8' }, (r, d) => [['scrollTop back to 0', d.getElementById('r8box').scrollTop === 0], ['measured', r.results[0].method === 'stack']]],
  ['R10 contrast: transparent PNG pixels show the black below', 1280, 'contrast.js', { selector: '#r10' }, (r) => [
    ['pass', r.results[0].status === 'pass'], ['ratio ≈ 21', r.results[0].ratio > 20]]],
  ['R11 contrast: every line measured, worst wins', 1280, 'contrast.js', { selector: '#r11' }, (r) => [['fail (2nd line white on white)', r.results[0].status === 'fail']]],
  ['R12 contrast: transparent text fill is not judged by color', 1280, 'contrast.js', { selector: '#r12' }, (r) => [['inconclusive', r.results[0].status === 'inconclusive']]],
  ['R13 rules: later named layer beats earlier, regardless of specificity', 1280, 'rules.js', { selector: '#r13', props: ['color'] }, (r) => [
    ['computed blue', r.computed.color === 'rgb(0, 0, 255)'], ['winner .r13', r.candidates.color[0].selector.includes('.r13') && r.candidates.color[0].likelyWinner]]],
  ['R14 rules: :is() specificity is its max argument', 1280, 'rules.js', { selector: '#r14', props: ['margin-left'] }, (r) => [
    ['computed 2px', r.computed['margin-left'] === '2px'], ['winner .ra.rb', r.candidates['margin-left'][0].selector === '.ra.rb']]],
  ['R15 rules: non-matching @scope is not active', 1280, 'rules.js', { selector: '.r15', props: ['padding-left'] }, (r) => [
    ['computed 0px', r.computed['padding-left'] === '0px'], ['scoped rule inactive', r.candidates['padding-left'].every((c) => c.active !== true)]]],
  ['R16 rules: `all` counts as a candidate', 1280, 'rules.js', { selector: '#r16', props: ['color'] }, (r) => [['winner #r16', r.candidates.color[0].selector.includes('#r16')]]],
  ['R6/7 theme: clone keeps content; invalid selector → error, theme untouched', 1280, 'theme.js', { cycle: true, selectors: ['#t-empty', '['] }, (r, d) => [
    ['returns an error', !!r.error], ['theme still light', d.documentElement.dataset.theme === 'light']]],
  ['R6 theme: :not(:empty) element is not "stale"', 1280, 'theme.js', { cycle: true, selectors: ['#t-empty'] }, (r) => [['not stale', !has(r.stale, '#t-empty')]]],
  ['R17 visible: clip-path inset(0) is visible', 1280, 'visible.js', { selector: '#r17' }, (r) => [['visible', r.results[0].verdict === 'visible']]],
  ['R18 visible: overflow-x clip leaves vertical overflow visible', 1280, 'visible.js', { selector: '#r18a' }, (r) => [['visible', r.results[0].verdict === 'visible']]],
  ['R18 visible: fixed inside a transformed clipper is clipped', 1280, 'visible.js', { selector: '#r18b' }, (r) => [['hidden', r.results[0].verdict === 'hidden']]],
  ['R19 visible: an opacity-0 image does not cover (but takes the click)', 1280, 'visible.js', { selector: '#r19' }, (r) => [
    ['visible', r.results[0].verdict === 'visible'], ['not clickable', r.results[0].clickable === false]]],
  ['R20 clipped: fixed box and a scroller inside a clipping panel', 1280, 'clipped.js', {}, (r) => [
    ['fixed banner clipped', r.issues.some((i) => i.box.includes('#r20'))], ['outer panel clips scroller text', has(r.issues, 'r20outer')]]],
  ['R22 widths: script-only island between breakpoints', 1280, 'widths.js', {}, (r) => [['1100–1150 found', r.failingRanges.includes('1100–1150')]]],
  ['R23 overflow: protrusion to the non-scrollable side is not overflow', 1280, 'overflow.js', {}, (r) => [
    ['ok', r.ok === true], ['listed separately', has(r.offscreenOtherSide, 'r23')]]],
  ['R24/25 images: 2x srcset not blurry; CSS-sized image has room reserved', 1280, 'images.js', {}, (r) => [
    ['r24 not blurry', !has(r.blurry, 'r24')], ['r25 not noDimensions', !has(r.noDimensions, 'r25')], ['i-nodims still flagged', has(r.noDimensions, 'i-nodims')]]],
  ['R26 grid: missing selection is not a pass', 1280, 'grid.js', { cells: '.does-not-exist' }, (r) => [['ok null', r.ok === null]]],
  ['R27 glyphs: installed font is not "not loaded"', 1280, 'glyphs.js', { family: 'Arial', chars: 'A' }, (r) => [['available', r.familyAvailable === true], ['no "not loaded" note', !/not loaded/.test(r.note || '')]]],

  // ---- regressions from the second review (Antigravity) ----
  ['A1 clipped: vertical spill out of an x-only clipper', 1280, 'clipped.js', {}, (r) => [['#a1 spills', r.issues.some((i) => i.kind === 'spills' && i.box.includes('#a1'))]]],
  ['A3 rules: inline-only property listed', 1280, 'rules.js', { selector: '#a3' }, (r) => [
    ['letter-spacing present', !!r.candidates['letter-spacing']], ['inline winner', (r.candidates['letter-spacing'] || [])[0]?.selector === 'style="" (inline)']]],
  ['A4 visible: fixed inside backdrop-filter is clipped', 1280, 'visible.js', { selector: '#a4' }, (r) => [['hidden', r.results[0].verdict === 'hidden']]],
  ['A4 visible: fixed inside a size container is clipped', 1280, 'visible.js', { selector: '#a4b' }, (r) => [['hidden', r.results[0].verdict === 'hidden']]],
  ['A6 contrast: a thin bright line under the text is not averaged away', 1280, 'contrast.js', { selector: '#a6' }, (r) => [['not a pass', !r.results[0].status.startsWith('pass')]]],
  ['A7 mobile: contenteditable under 16px zooms on iOS', 375, 'mobile.js', {}, (r) => [['m-ce listed', has(r.smallInputs, 'm-ce')]]],
  ['A8 theme: SVG fill probed (stale or switching)', 1280, 'theme.js', { cycle: true, selectors: ['#t-svg'] }, (r) => [
    ['fill probed', '#t-svg fill' in r.probe.before], ['stale or changed', has(r.stale, '#t-svg fill') || r.probe.other['#t-svg fill'] !== r.probe.before['#t-svg fill']]]],

  ['mobile: phone basics at 375', 375, 'mobile.js', {}, (r) => [
    ['maximum-scale flagged', has(r.viewportMeta.issues, 'maximum-scale')], ['10px text', has(r.smallText, 'm-tiny')], ['14px input', has(r.smallInputs, 'm-input')],
    ['crowded icons', has(r.smallTargets, 'm-ico1') && has(r.smallTargets, 'm-ico2')], ['spaced icon passes', !has(r.smallTargets, 'm-lonely')],
    ['inline link exempt', !has(r.smallTargets, 'm-inline')], ['44px button fine', !has(r.smallTargets, 'm-big')]]],
];

const rows = [];
const tbody = document.querySelector('tbody');
for (const [title, width, file, opts, assert, scope] of [...cases, ...compatibilityCases]) {
  const tr = document.createElement('tr');
  let result;
  let checks;
  try {
    const f = await frameAt(width);
    const shadows = scope ? scope(f.contentWindow) : {};
    const fn = f.contentWindow.Function(...Object.keys(shadows), 'return (' + (await load(file)) + '\n)')(...Object.values(shadows));
    result = await fn(opts);
    checks = assert(result, f.contentDocument);
  } catch (e) {
    result = { error: String(e && e.stack || e) };
    checks = [['ran without throwing', false]];
  }
  const ok = checks.every(([, v]) => v);
  rows.push({ title, width, file, ok, failed: checks.filter(([, v]) => !v).map(([k]) => k), result: ok ? undefined : result });
  tr.className = ok ? 'pass' : 'fail';
  tr.innerHTML = `<td>${ok ? 'PASS' : 'FAIL'}</td><td>${file}</td><td>${width}</td><td>${title}</td><td>${checks.map(([k, v]) => `<span class="${v ? 'y' : 'n'}">${k}</span>`).join(' · ')}</td>`;
  tr.onclick = () => { document.getElementById('json').textContent = JSON.stringify(result, null, 2); };
  tbody.appendChild(tr);
}
const passed = rows.filter((r) => r.ok).length;
document.getElementById('summary').textContent = `${passed}/${rows.length} passed`;
window.__uiVerify = { done: true, passed, total: rows.length, failures: rows.filter((r) => !r.ok) };
