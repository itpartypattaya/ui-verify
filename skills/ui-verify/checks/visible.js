/*
 * ui-verify · visible — can the user actually see (and click) this element?
 *
 * Geometry and computed styles are blind to this: a box with perfect size,
 * colour and opacity 1 can sit entirely under a picture. So when "the numbers
 * are green but the screen is empty", run this.
 *
 * Checks, in order: rendered at all (display), visibility, opacity of the
 * element and its ancestors, zero size, clipping by ancestors' overflow, inside
 * the viewport; then hit-tests 5 points (centre + 4 inner points) with
 * pointer-events forced on, so transparent decorative overlays are seen too,
 * and says whether what lies on top is opaque. The click target at the centre
 * is reported separately (real pointer-events).
 *
 * Options: { selector (required), scroll = true, max = 10 }
 * Returns: { ok, results: [{ el, verdict, reasons[], coveredBy[], points, clickTarget, clickable, hint }] }
 */
(opts = {}) => {
  const { selector, scroll = true, max = 10 } = opts;
  const name = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    const c = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean) : [];
    if (c.length) s += '.' + c.slice(0, 3).join('.') + (c.length > 3 ? '…' : '');
    if (!el.id && !c.length && el.parentElement) { const a = el.parentElement.closest('[id]'); if (a) s = '#' + a.id + ' ' + s; }
    return s;
  };
  if (!innerWidth) return { check: 'visible', ok: null, error: 'viewport is 0 — set an explicit viewport size first (see settle.js)' };
  const els = selector ? [...document.querySelectorAll(selector)].slice(0, max) : [];
  if (!els.length) return { check: 'visible', ok: null, error: `no element matches ${selector}` };

  const alpha = (s) => {
    const m = (s || '').match(/[\d.]+/g);
    if (!m || s === 'transparent') return 0;
    const slash = s.match(/\/\s*([\d.]+)(%?)\s*\)$/);
    if (slash) return parseFloat(slash[1]) / (slash[2] ? 100 : 1);
    return /^rgba/.test(s) && m.length > 3 ? +m[3] : 1;
  };
  const opacityOf = (el) => {
    let o = 1;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity);
    return o;
  };
  const opaque = (n) => {
    if (/^(IMG|VIDEO|CANVAS|IFRAME|OBJECT|EMBED)$/.test(n.tagName)) return true;
    const cs = getComputedStyle(n);
    if (opacityOf(n) < 0.5) return false;
    if (alpha(cs.backgroundColor) >= 0.9 || /url\(/.test(cs.backgroundImage)) return true;
    return ['::before', '::after'].some((p) => {
      const ps = getComputedStyle(n, p);
      return ps.content !== 'none' && (alpha(ps.backgroundColor) >= 0.9 || /url\(/.test(ps.backgroundImage));
    });
  };
  // visible part of el after ancestors' overflow clipping (respects absolute/fixed escaping static clippers)
  const clipRect = (el) => {
    const r = el.getBoundingClientRect();
    let box = { l: r.left, t: r.top, r: r.right, b: r.bottom };
    let by = null;
    let needPositioned = /absolute/.test(getComputedStyle(el).position);
    if (getComputedStyle(el).position === 'fixed') return { box, by };
    for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      const pc = getComputedStyle(p);
      const positioned = pc.position !== 'static';
      if (!(needPositioned && !positioned) && (pc.overflowX !== 'visible' || pc.overflowY !== 'visible')) {
        const pr = p.getBoundingClientRect();
        const nb = { l: Math.max(box.l, pr.left), t: Math.max(box.t, pr.top), r: Math.min(box.r, pr.right), b: Math.min(box.b, pr.bottom) };
        if ((nb.r - nb.l) * (nb.b - nb.t) < (box.r - box.l) * (box.b - box.t) - 1) by = by || name(p);
        box = nb;
      }
      if (positioned) needPositioned = pc.position === 'absolute';
      if (pc.position === 'fixed') break;
    }
    return { box, by };
  };

  const sx = scrollX;
  const sy = scrollY;
  let scrolled = false;
  const force = document.createElement('style');
  force.textContent = '*, *::before, *::after { pointer-events: auto !important }';
  const results = [];
  try {
    for (const el of els) {
      const cs = getComputedStyle(el);
      const reasons = [];
      const res = { el: name(el), text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40) };
      if (!el.getClientRects().length) {
        results.push({ ...res, verdict: 'hidden', reasons: ['not rendered: display: none on it or an ancestor (or display: contents)'] });
        continue;
      }
      if (cs.visibility !== 'visible') reasons.push(`visibility: ${cs.visibility}`);
      const op = opacityOf(el);
      if (op < 0.05) reasons.push(`opacity ${+op.toFixed(2)} (own × ancestors)`);
      if (cs.clipPath !== 'none') reasons.push(`clip-path: ${cs.clipPath.slice(0, 40)} — check the shape`);
      let r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) reasons.push(`zero size ${Math.round(r.width)}×${Math.round(r.height)}`);
      if (scroll && (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth)) {
        el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
        scrolled = true;
      }
      const { box, by } = clipRect(el);
      const area = Math.max(0, r.width) * Math.max(0, r.height);
      r = el.getBoundingClientRect();
      const vis = Math.max(0, box.r - box.l) * Math.max(0, box.b - box.t);
      if (area > 1 && vis / area < 0.5) reasons.push(`clipped by overflow of ${by} — ${Math.round((100 * vis) / area)}% left`);
      const v = { l: Math.max(box.l, 0), t: Math.max(box.t, 0), r: Math.min(box.r, innerWidth), b: Math.min(box.b, innerHeight) };
      if (v.r - v.l < 1 || v.b - v.t < 1) {
        reasons.push('outside the viewport' + (scroll ? ' even after scrolling (off-canvas, transformed away, or inside a scroller)' : ' — pass scroll: true'));
        results.push({ ...res, verdict: 'hidden', reasons });
        continue;
      }
      const w = v.r - v.l;
      const h = v.b - v.t;
      const pts = [[0.5, 0.5], [0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]].map(([fx, fy]) => [v.l + w * fx, v.t + h * fy]);
      const click = document.elementFromPoint(pts[0][0], pts[0][1]);
      document.head.appendChild(force);
      const covers = new Map();
      let coveredPts = 0;
      let opaquePts = 0;
      for (const [x, y] of pts) {
        const stack = document.elementsFromPoint(x, y);
        const i = stack.indexOf(el);
        const above = (i === -1 ? stack.slice(0, 1) : stack.slice(0, i)).filter((n) => !el.contains(n) && !n.contains(el));
        if (!above.length) continue;
        coveredPts++;
        if (above.some(opaque)) opaquePts++;
        for (const n of above) {
          const k = name(n);
          if (!covers.has(k)) {
            const ncs = getComputedStyle(n);
            covers.set(k, { el: k, opaque: opaque(n), position: ncs.position, zIndex: ncs.zIndex });
          }
        }
      }
      force.remove();
      const interactive = el.matches('a[href], button, input, select, textarea, summary, label, [role="button"], [role="link"], [tabindex]');
      const clickable = interactive ? !!click && (click === el || el.contains(click)) : null;
      let verdict = reasons.length ? 'hidden' : 'visible';
      if (verdict === 'visible' && opaquePts >= 3) verdict = 'covered';
      else if (verdict === 'visible' && opaquePts > 0) verdict = 'partly-covered';
      const out = {
        ...res, verdict, reasons,
        points: `${coveredPts}/5 points have something on top (${opaquePts} opaque)`,
        coveredBy: [...covers.values()].slice(0, 4),
        clickTarget: click ? name(click) : null,
        clickable,
        position: cs.position, zIndex: cs.zIndex,
      };
      if (verdict !== 'visible' && verdict !== 'hidden' && cs.position === 'static' && [...covers.values()].some((c) => c.position !== 'static')) {
        out.hint = 'non-positioned (static) boxes paint below positioned siblings, and z-index does nothing on static — give it position: relative (and a z-index if needed)';
      }
      if (clickable === false && verdict === 'visible') out.hint = `visible, but clicks at its centre go to ${out.clickTarget} — a transparent layer on top (check pointer-events)`;
      results.push(out);
    }
  } finally {
    force.remove();
    if (scrolled) scrollTo({ left: sx, top: sy, behavior: 'instant' });
  }
  return { check: 'visible', ok: results.every((x) => x.verdict === 'visible' && x.clickable !== false), results };
}
