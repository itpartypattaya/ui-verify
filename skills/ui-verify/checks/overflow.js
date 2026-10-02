/*
 * ui-verify · overflow — does the page scroll sideways, and who is pushing it?
 *
 * Lists the OUTERMOST elements that stick out of the viewport. Elements inside
 * a legitimate scroller or clipper (carousel, table wrapper, overflow: hidden)
 * and fixed-position layers are ignored — they do not widen the page.
 * Run it at the width where it breaks; overflow often lives between breakpoints
 * (widths.js finds those widths).
 *
 * Options: { max = 10, tolerance = 1 }
 * Only the side that scrolls counts (right in LTR, left in RTL); boxes sticking
 * out of the other side are cut off without a scrollbar and are listed in
 * offscreenOtherSide instead.
 *
 * Returns: { ok, scrollWidth, clientWidth, overflowPx, masked, culprits[], offscreenOtherSide[] }
 */
(opts = {}) => {
  const { max = 10, tolerance = 1 } = opts;
  const de = document.documentElement;
  const name = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    const c = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean) : [];
    if (c.length) s += '.' + c.slice(0, 3).join('.') + (c.length > 3 ? '…' : '');
    if (!el.id && !c.length && el.parentElement) { const a = el.parentElement.closest('[id]'); if (a) s = '#' + a.id + ' ' + s; }
    return s;
  };
  if (!innerWidth) return { check: 'overflow', ok: null, error: 'viewport is 0 — set an explicit viewport size first (see settle.js)' };

  const vw = de.clientWidth;
  const clips = (n) => getComputedStyle(n).overflowX !== 'visible';
  const ignored = (el) => {
    for (let n = el; n && n !== de; n = n.parentElement) {
      if (getComputedStyle(n).position === 'fixed') return true;
      if (n !== el && n !== document.body && clips(n)) return true;
    }
    return false;
  };

  // only the inline-end side scrolls (right in LTR, left in RTL); sticking out of the start side
  // cuts content off without a scrollbar, so it is listed separately, not called overflow
  const rtl = getComputedStyle(de).direction === 'rtl';
  const d = de.getBoundingClientRect();
  const out = [];
  const other = [];
  for (const el of document.body.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const left = r.left - d.left;
    const right = r.right - d.left;
    const pastEnd = rtl ? left < -tolerance : right > vw + tolerance;
    const pastStart = rtl ? right > vw + tolerance : left < -tolerance;
    if (!pastEnd && !pastStart) continue;
    if (ignored(el)) continue;
    (pastEnd ? out : other).push({ el, left, right, width: r.width });
  }
  const outermost = (list) => {
    const set = new Set(list.map((o) => o.el));
    return list.filter((o) => {
      for (let p = o.el.parentElement; p; p = p.parentElement) if (set.has(p)) return false;
      return true;
    });
  };
  const outer = outermost(out);

  const culprits = outer.slice(0, max).map((o) => {
    const cs = getComputedStyle(o.el);
    const parent = o.el.parentElement;
    const pw = parent ? parent.clientWidth : vw;
    const inner = out
      .filter((d) => d.el !== o.el && o.el.contains(d.el) && d.width > o.el.clientWidth + tolerance)
      .slice(0, 3)
      .map((d) => ({ el: name(d.el), width: Math.round(d.width) }));
    return {
      el: name(o.el),
      text: (o.el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40),
      side: rtl ? 'left' : 'right',
      left: Math.round(o.left),
      right: Math.round(o.right),
      width: Math.round(o.width),
      parentWidth: pw,
      why: o.width > pw + tolerance
        ? 'wider than its container (fixed width, min-content of a long word/table/pre/image, or a grid/flex item without min-width: 0)'
        : 'shifted out (left/right offset, transform, negative margin, 100vw with a scrollbar)',
      style: { width: cs.width, minWidth: cs.minWidth, maxWidth: cs.maxWidth, position: cs.position, transform: cs.transform, whiteSpace: cs.whiteSpace },
      widerChildren: inner,
    };
  });

  const bodyX = getComputedStyle(document.body).overflowX;
  const htmlX = getComputedStyle(de).overflowX;
  const masked = htmlX !== 'visible' ? `html { overflow-x: ${htmlX} }` : bodyX !== 'visible' ? `body { overflow-x: ${bodyX} }` : null;

  return {
    check: 'overflow',
    ok: de.scrollWidth <= vw + tolerance && culprits.length === 0,
    viewport: innerWidth,
    clientWidth: vw,
    scrollWidth: de.scrollWidth,
    overflowPx: Math.max(0, de.scrollWidth - vw),
    masked: masked && culprits.length ? `${masked} hides the scrollbar, but the culprits below are cut off, not fixed` : masked,
    culprits,
    total: outer.length,
    offscreenOtherSide: outermost(other).slice(0, max).map((o) => ({ el: name(o.el), left: Math.round(o.left), right: Math.round(o.right), note: 'sticks out of the non-scrolling side — cut off, no scrollbar (fine for decorations)' })),
  };
}
