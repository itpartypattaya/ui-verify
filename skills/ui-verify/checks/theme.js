/*
 * ui-verify · theme — which theme mechanism the page uses, and does a
 * switch there-and-back return every colour exactly?
 *
 * Detects: class on <html>/<body> (Tailwind/shadcn/next-themes `dark`),
 * data-theme / data-bs-theme / data-mode / data-color-mode attributes, or only
 * prefers-color-scheme (cannot be switched from the page — emulate it with the
 * browser tool instead).
 *
 * { cycle: true } switches to the other theme and back, waiting for
 * transitions, and compares the first and last probe character by character.
 * Anything that does not come back is "stuck" — a real bug, not a glitch.
 * Colours a transition froze at the old theme's value are "stale" (probe
 * re-read with transitions off): the light-dark() + transition bug.
 * The page's own toggle may also persist to localStorage etc.; for the user
 * flow click the real toggle and use probe-only runs between clicks.
 *
 * Options: { selectors = ['body','h1','p','a','button'], cycle = false, to = null ('dark'|'light'), timeout = 2000 }
 * Returns: { ok, mechanism, current, probe, (cycle) changed, unchanged[], stuck[], stale[] }
 */
async (opts = {}) => {
  const { selectors = ['body', 'h1', 'p', 'a', 'button'], cycle = false, to = null, timeout = 2000 } = opts;
  const de = document.documentElement;
  const body = document.body;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const frames = () => Promise.race([new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))), wait(200)]);
  const settle = async () => {
    await frames();
    const t0 = performance.now();
    const busy = () => (document.getAnimations ? document.getAnimations() : [])
      .some((a) => a.playState === 'running' && a.effect && a.effect.getComputedTiming().endTime !== Infinity);
    while (busy() && performance.now() - t0 < timeout) await wait(50);
    await frames();
  };
  const ATTRS = ['data-theme', 'data-bs-theme', 'data-mode', 'data-color-mode', 'data-color-scheme'];
  // validate every selector before touching the page
  for (const s of selectors) {
    try { document.querySelector(s); } catch { return { check: 'theme', ok: null, error: `invalid selector: ${s}` }; }
  }

  // ---- detect
  let mech = null;
  for (const n of [de, body]) {
    const a = ATTRS.find((x) => n.hasAttribute(x));
    if (a) { mech = { type: 'attribute', node: n, attr: a }; break; }
  }
  if (!mech) {
    for (const n of [de, body]) {
      if (n.classList.contains('dark') || n.classList.contains('light')) { mech = { type: 'class', node: n }; break; }
    }
  }
  const sheetText = [];
  for (const s of document.styleSheets) {
    try { for (const r of s.cssRules) sheetText.push(r.cssText); } catch { /* cross-origin */ }
  }
  const css = sheetText.join('\n');
  const usesMedia = /prefers-color-scheme/.test(css);
  const usesLightDark = /light-dark\(/.test(css);
  if (!mech) {
    const attr = ATTRS.find((a) => css.includes(`[${a}`));
    if (attr) mech = { type: 'attribute', node: de, attr, note: 'attribute not set now — inferred from stylesheets' };
    else if (/(^|[\s,]):?(is|where)?\(?\.dark\b/m.test(css) || /\.dark[\s,{:]/.test(css)) mech = { type: 'class', node: de, note: 'class not set now — inferred from stylesheets' };
    else if (usesMedia || usesLightDark) mech = { type: 'media' };
    else mech = { type: 'none' };
  }
  const current = () => {
    if (mech.type === 'attribute') return mech.node.getAttribute(mech.attr) || '(unset)';
    if (mech.type === 'class') return mech.node.classList.contains('dark') ? 'dark' : 'light';
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark (system)' : 'light (system)';
  };
  const probe = () => {
    const out = {};
    for (const s of selectors) {
      const el = document.querySelector(s);
      if (!el) continue;
      const cs = getComputedStyle(el);
      out[`${s} color`] = cs.color;
      out[`${s} background`] = cs.backgroundColor;
      out[`${s} border`] = cs.borderTopColor;
      if (el instanceof SVGElement) { out[`${s} fill`] = cs.fill; out[`${s} stroke`] = cs.stroke; } // icons
    }
    return out;
  };
  const describe = {
    type: mech.type,
    where: mech.node ? `${mech.node.tagName.toLowerCase()}${mech.attr ? `[${mech.attr}]` : mech.type === 'class' ? '.dark' : ''}` : null,
    note: mech.note || (mech.type === 'media' ? 'theme follows prefers-color-scheme only — switch it by emulating the media feature in the browser tool' : mech.type === 'none' ? 'no theme mechanism found' : null),
    usesLightDark,
    usesMedia,
  };
  const saved = { cls: de.className, bcls: body.className, attr: mech.attr ? mech.node.getAttribute(mech.attr) : null };
  const apply = (t) => {
    if (mech.type === 'attribute') mech.node.setAttribute(mech.attr, t);
    else if (mech.type === 'class') { mech.node.classList.remove('dark', 'light'); mech.node.classList.add(t); }
  };
  const restore = () => {
    de.className = saved.cls;
    body.className = saved.bcls;
    if (mech.attr) {
      if (saved.attr === null) mech.node.removeAttribute(mech.attr);
      else mech.node.setAttribute(mech.attr, saved.attr);
    }
  };
  const switchable = mech.type === 'attribute' || mech.type === 'class';

  if (!cycle && !to) return { check: 'theme', ok: true, mechanism: describe, current: current(), probe: probe() };
  if (!switchable) return { check: 'theme', ok: null, mechanism: describe, current: current(), probe: probe(), error: 'cannot switch from inside the page — emulate prefers-color-scheme with the browser tool, then probe again' };

  if (to && !cycle) {
    apply(to);
    await settle();
    return { check: 'theme', ok: true, mechanism: describe, current: current(), probe: probe(), note: 'theme left switched — run with { cycle: true } or reload to restore' };
  }

  // what a transitioned colour SHOULD be: a shallow clone (with a text node, so :empty and
  // friends still match) with transitions off, inserted next to the element and removed again.
  // Turning transitions off on the original would itself "repair" (and then break) the page.
  // Only properties that actually have a transition are compared — elsewhere the clone adds
  // nothing but its own selector-context differences (:nth-child, sibling selectors).
  const PROPS = { color: ['color'], background: ['background-color', 'background'], border: ['border-top-color', 'border-color', 'border-top', 'border'], fill: ['fill'], stroke: ['stroke'] };
  const transitioned = (cs, key) => {
    const names = cs.transitionProperty.split(',').map((t) => t.trim());
    const durs = cs.transitionDuration.split(',').map((t) => parseFloat(t) || 0);
    return names.some((n, i) => durs[i % durs.length] > 0 && (n === 'all' || PROPS[key].includes(n)));
  };
  const noTransition = () => {
    const out = {};
    for (const s of selectors) {
      const el = document.querySelector(s);
      if (!el || el === de || el === body) continue;
      const cs0 = getComputedStyle(el);
      const keys = Object.keys(PROPS).filter((k) => (el instanceof SVGElement || !/fill|stroke/.test(k)) && transitioned(cs0, k));
      if (!keys.length) continue;
      const c = el.cloneNode(false);
      if (el.childNodes.length) c.appendChild(document.createTextNode('x'));
      c.style.setProperty('transition', 'none', 'important');
      el.after(c);
      const cs = getComputedStyle(c);
      const read = { color: cs.color, background: cs.backgroundColor, border: cs.borderTopColor, fill: cs.fill, stroke: cs.stroke };
      for (const k of keys) out[`${s} ${k}`] = read[k];
      c.remove();
    }
    return out;
  };
  let first;
  let start;
  let other;
  let mid;
  let midTrue;
  let back;
  try {
    first = probe();
    start = current();
    other = /dark/.test(start) ? 'light' : 'dark';
    apply(other);
    await settle();
    mid = probe();
    midTrue = noTransition();
  } finally {
    restore();
  }
  await settle();
  back = probe();
  const keys = Object.keys(first);
  const stuck = keys.filter((k) => back[k] !== first[k]).map((k) => ({ prop: k, before: first[k], other: mid[k], after: back[k] }));
  const stale = Object.keys(midTrue).filter((k) => mid[k] !== midTrue[k]).map((k) => ({ prop: k, shown: mid[k], shouldBe: midTrue[k] }));
  for (const k of Object.keys(midTrue)) mid[k] = midTrue[k];
  const changed = keys.filter((k) => mid[k] !== first[k]); // mid now holds the true values for stale keys
  const unchanged = keys.filter((k) => mid[k] === first[k]);
  const out = {
    check: 'theme',
    ok: stuck.length || stale.length ? false : changed.length ? true : null,
    mechanism: describe,
    themes: [start, other],
    changed: changed.length,
    unchanged,
    stuck,
    stale,
    probe: { before: first, other: mid },
  };
  if (!changed.length) out.error = 'switching changed none of the probed colours — wrong mechanism, or these elements are meant to look the same in both themes';
  if (stale.length) {
    out.hint = 'a transition kept the old theme colour: Chromium (seen in 152) does not update a transitioned property whose value comes from light-dark() when color-scheme changes. '
      + 'Fix: disable transitions while switching — add a class on <html> with `* { transition: none !important }`, switch, remove the class after two requestAnimationFrame callbacks; or drop the transition on that property';
  }
  return out;
}
