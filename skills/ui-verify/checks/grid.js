/*
 * ui-verify · grid — repeated items (cards, tiles, covers) that should be the
 * same size and are not.
 *
 * Two modes:
 *  - { cells: '.card', inner: '.card img' } — sizes of exactly these elements;
 *  - no selectors — auto: every grid/flex container with ≥ 3 card-like children
 *    (≥ 100×60, not bare images/controls) of the same tag+class signature is
 *    checked for differing widths, differing heights within a row, and
 *    differing media (first img/video) sizes. Widths of content-sized flex items
 *    (flex: 0 1 auto: pills, tags) are not compared — they differ on purpose;
 *    use selector mode when such items are meant to be equal.
 * One size per list = even. Several = defect, and the outliers are named.
 *
 * Options: { cells, inner, tolerance = 1, max = 10, minW = 100, minH = 60 }
 * Returns: { ok, groups[] } (auto) or { ok, cells[], inner[] } (selectors)
 */
(opts = {}) => {
  const { cells = null, inner = null, tolerance = 1, max = 10, minW = 100, minH = 60 } = opts;
  const name = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    const c = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean) : [];
    if (c.length) s += '.' + c.slice(0, 3).join('.') + (c.length > 3 ? '…' : '');
    if (!el.id && !c.length && el.parentElement) { const a = el.parentElement.closest('[id]'); if (a) s = '#' + a.id + ' ' + s; }
    return s;
  };
  if (!innerWidth) return { check: 'grid', ok: null, error: 'viewport is 0 — set an explicit viewport size first (see settle.js)' };
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return { el, w: r.width, h: r.height, top: Math.round(r.top + scrollY) };
  };
  const same = (a, b) => Math.abs(a - b) <= tolerance;
  // cluster numbers within tolerance → [{ value, count, els }], most common first
  const cluster = (items, key) => {
    const out = [];
    for (const it of items) {
      const c = out.find((o) => same(o.value, it[key]));
      if (c) { c.count++; c.els.push(it.el); } else out.push({ value: it[key], count: 1, els: [it.el] });
    }
    return out.sort((a, b) => b.count - a.count);
  };
  const sizes = (els) => {
    const m = new Map();
    for (const el of els) {
      const b = box(el);
      const k = `${Math.round(b.w)}×${Math.round(b.h)}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(el);
    }
    return [...m].map(([size, list]) => ({ size, count: list.length, examples: list.slice(0, 3).map(name) })).sort((a, b) => b.count - a.count);
  };
  const hint = (el) => {
    const cs = getComputedStyle(el);
    const wider = el.scrollWidth > el.clientWidth + 1;
    return {
      minWidth: cs.minWidth,
      contentWiderThanBox: wider,
      fix: cs.minWidth === 'auto' ? 'grid/flex items default to min-width: auto (= min-content). Set min-width: 0 on the item — and on nested flex/grid children if the wide content is deeper' : null,
    };
  };

  if (cells || inner) {
    const c = cells ? sizes([...document.querySelectorAll(cells)]) : [];
    const i = inner ? sizes([...document.querySelectorAll(inner)]) : [];
    return { check: 'grid', ok: c.length <= 1 && i.length <= 1, cells: c, inner: i };
  }

  const sig = (el) => el.tagName + '.' + [...el.classList].sort().join('.');
  const groups = [];
  for (const parent of document.body.querySelectorAll('*')) {
    const d = getComputedStyle(parent).display;
    if (!/grid|flex/.test(d)) continue;
    // bare images/media in a row are usually a gallery of mixed sizes on purpose; cards are what should match
    const kids = [...parent.children]
      .filter((el) => !/^(IMG|PICTURE|VIDEO|CANVAS|SVG|IFRAME|INPUT|BUTTON|SELECT|TEXTAREA)$/i.test(el.tagName))
      .map(box)
      .filter((b) => b.w >= minW && b.h >= minH);
    if (kids.length < 3) continue;
    const bySig = new Map();
    for (const k of kids) {
      const s = sig(k.el);
      if (!bySig.has(s)) bySig.set(s, []);
      bySig.get(s).push(k);
    }
    for (const items of bySig.values()) {
      if (items.length < 3) continue;
      const problems = [];
      const outliers = new Set();
      // content-sized flex items (flex: 0 1 auto — pills, tags, nav links) differ in width on purpose
      const contentSized = d.includes('flex') && items.every((it) => {
        const ics = getComputedStyle(it.el);
        return ics.flexBasis === 'auto' && parseFloat(ics.flexGrow) === 0;
      });
      const widths = cluster(items, 'w');
      if (widths.length > 1 && !contentSized) {
        problems.push(`widths differ: ${widths.map((w) => `${Math.round(w.value)}px ×${w.count}`).join(', ')}`);
        widths.slice(1).forEach((w) => w.els.forEach((e) => outliers.add(e)));
      }
      for (const row of cluster(items, 'top')) {
        const inRow = items.filter((it) => row.els.includes(it.el));
        const hs = cluster(inRow, 'h');
        if (hs.length > 1) {
          problems.push(`heights differ in the row at y=${Math.round(row.value)}: ${hs.map((h) => `${Math.round(h.value)}px ×${h.count}`).join(', ')}`);
          hs.slice(1).forEach((h) => h.els.forEach((e) => outliers.add(e)));
        }
      }
      const media = items
        .map((it) => ({ it, m: it.el.querySelector('img, video, picture, svg') }))
        .filter((x) => x.m)
        .map((x) => ({ ...box(x.m), card: x.it.el }));
      if (media.length >= 3) {
        const mw = cluster(media, 'w');
        const mh = cluster(media, 'h');
        if (mw.length > 1 || mh.length > 1) {
          problems.push(`media sizes differ: ${[...new Set(media.map((m) => `${Math.round(m.w)}×${Math.round(m.h)}`))].join(', ')}`);
          [...mw.slice(1), ...mh.slice(1)].forEach((g) => g.els.forEach((e) => outliers.add(media.find((m) => m.el === e).card)));
        }
      }
      if (!problems.length) continue;
      const pcs = getComputedStyle(parent);
      groups.push({
        container: name(parent),
        display: d,
        template: d.includes('grid') ? pcs.gridTemplateColumns : `${pcs.flexDirection} ${pcs.flexWrap}`,
        items: items.length,
        item: name(items[0].el),
        problems,
        outliers: [...outliers].slice(0, 5).map((el) => ({ el: name(el), size: `${Math.round(box(el).w)}×${Math.round(box(el).h)}`, ...hint(el) })),
      });
      if (groups.length >= max) break;
    }
    if (groups.length >= max) break;
  }
  return { check: 'grid', ok: groups.length === 0, groups };
}
