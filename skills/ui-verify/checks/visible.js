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
  // Probe capabilities before measuring or changing the page. Browser-tool
  // evaluation can expose a read-only DOM rather than a complete window.
  const missingCapabilities = [];
  const needs = (api, test) => {
    try { if (test()) return; } catch { /* unavailable in this context */ }
    missingCapabilities.push(api);
  };
  const unsupported = () => ({
    check: 'visible', ok: null, missingCapabilities,
    error: 'required browser APIs are unavailable: ' + missingCapabilities.join(', '),
    next: 'Run this check in a full page JavaScript context (Playwright/DevTools or Claude browser tools); see references/adapters.md',
  });
  needs('document.body', () => typeof document !== 'undefined' && !!document.body);
  needs('getComputedStyle', () => typeof getComputedStyle === 'function');
  needs('Number.parseFloat', () => typeof Number.parseFloat === 'function');
  needs('document.createElement', () => typeof document.createElement === 'function');
  needs('document.elementFromPoint', () => typeof document.elementFromPoint === 'function');
  needs('document.elementsFromPoint', () => typeof document.elementsFromPoint === 'function');
  needs('scrollTo', () => typeof scrollTo === 'function');
  if (missingCapabilities.length) return unsupported();
  const parseFloat = Number.parseFloat;

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
  // mean alpha of an image's pixels (same-origin/CORS); null when unreadable
  const alphaCache = new Map();
  const imgAlpha = (img) => {
    if (alphaCache.has(img)) return alphaCache.get(img);
    let a = null;
    try {
      const c = document.createElement('canvas');
      c.width = 8;
      c.height = 8;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0, 8, 8);
      const d = g.getImageData(0, 0, 8, 8).data;
      let s = 0;
      for (let i = 3; i < d.length; i += 4) s += d[i];
      a = s / (64 * 255);
    } catch { /* cross-origin or not decoded */ }
    alphaCache.set(img, a);
    return a;
  };
  // true = hides what is below, false = see-through, null = cannot tell (e.g. cross-origin PNG)
  const opaque = (n) => {
    if (opacityOf(n) < 0.5) return false;
    if (/^(VIDEO|CANVAS|IFRAME|OBJECT|EMBED)$/.test(n.tagName)) return true;
    if (n.tagName === 'IMG') {
      if (/\.jpe?g(\?|#|$)/i.test(n.currentSrc || '')) return true;
      const a = imgAlpha(n);
      return a === null ? null : a >= 0.5;
    }
    const cs = getComputedStyle(n);
    if (alpha(cs.backgroundColor) >= 0.9 || /url\(/.test(cs.backgroundImage)) return true;
    return ['::before', '::after'].some((p) => {
      const ps = getComputedStyle(n, p);
      return ps.content !== 'none' && (alpha(ps.backgroundColor) >= 0.9 || /url\(/.test(ps.backgroundImage));
    });
  };
  // ancestors that become the containing block of position: fixed descendants
  const fixedCB = (pc) => pc.transform !== 'none' || pc.filter !== 'none' || pc.perspective !== 'none'
    || (pc.backdropFilter && pc.backdropFilter !== 'none') || (pc.containerType && pc.containerType !== 'normal')
    || /paint|layout|strict|content/.test(pc.contain) || /transform|filter|perspective|backdrop-filter|contain/.test(pc.willChange);
  // visible part of el after ancestors' overflow clipping, per axis. An overflow box clips only
  // descendants whose containing-block chain passes through it: absolute boxes escape static
  // clippers up to their positioned ancestor, fixed boxes escape everything up to a
  // transformed/filtered/contained ancestor (or the viewport).
  const clipRect = (el) => {
    const r = el.getBoundingClientRect();
    let box = { l: r.left, t: r.top, r: r.right, b: r.bottom };
    let by = null;
    const modeOf = (pos) => (pos === 'fixed' ? 'fixed' : pos === 'absolute' ? 'abs' : 'flow');
    let mode = modeOf(getComputedStyle(el).position);
    for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      const pc = getComputedStyle(p);
      const applies = mode === 'flow' || (mode === 'abs' && (pc.position !== 'static' || fixedCB(pc))) || (mode === 'fixed' && fixedCB(pc));
      if (!applies) continue;
      if (pc.overflowX !== 'visible' || pc.overflowY !== 'visible') {
        const pr = p.getBoundingClientRect();
        const nb = { ...box };
        if (pc.overflowX !== 'visible') { nb.l = Math.max(box.l, pr.left); nb.r = Math.min(box.r, pr.right); }
        if (pc.overflowY !== 'visible') { nb.t = Math.max(box.t, pr.top); nb.b = Math.min(box.b, pr.bottom); }
        const area = (q) => Math.max(0, q.r - q.l) * Math.max(0, q.b - q.t);
        if (area(nb) < area(box) - 1) by = by || name(p);
        box = nb;
      }
      mode = modeOf(pc.position);
    }
    return { box, by };
  };

  const sx = scrollX;
  const sy = scrollY;
  // window and every inner scroller scrollIntoView may move, restored at the end
  const saved = new Map();
  const remember = (el) => {
    for (let n = el.parentElement; n; n = n.parentElement) {
      if (!saved.has(n) && (n.scrollHeight > n.clientHeight || n.scrollWidth > n.clientWidth)) saved.set(n, [n.scrollLeft, n.scrollTop]);
    }
  };
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
      const notes = [];
      if (cs.clipPath !== 'none') notes.push(`clip-path: ${cs.clipPath.slice(0, 40)} — the shape is not modelled; check that the hit points fall inside it`);
      let r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) reasons.push(`zero size ${Math.round(r.width)}×${Math.round(r.height)}`);
      if (scroll && (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth)) {
        remember(el);
        el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
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
      let unsurePts = 0;
      for (const [x, y] of pts) {
        const stack = document.elementsFromPoint(x, y);
        const i = stack.indexOf(el);
        const above = (i === -1 ? stack.slice(0, 1) : stack.slice(0, i)).filter((n) => !el.contains(n) && !n.contains(el));
        if (!above.length) continue;
        coveredPts++;
        const o = above.map(opaque);
        if (o.includes(true)) opaquePts++;
        else if (o.includes(null)) unsurePts++;
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
      else if (verdict === 'visible' && unsurePts > 0) {
        verdict = 'possibly-covered';
        notes.push('an image with unreadable pixels (cross-origin) lies on top — it may be transparent there; zoom a screenshot');
      }
      const out = {
        ...res, verdict, reasons,
        points: `${coveredPts}/5 points have something on top (${opaquePts} opaque${unsurePts ? `, ${unsurePts} unknown` : ''})`,
        coveredBy: [...covers.values()].slice(0, 4),
        clickTarget: click ? name(click) : null,
        clickable,
        position: cs.position, zIndex: cs.zIndex,
      };
      if (notes.length) out.notes = notes;
      const flexItem = el.parentElement && /flex|grid/.test(getComputedStyle(el.parentElement).display);
      if (/covered/.test(verdict) && cs.position === 'static' && !flexItem && [...covers.values()].some((c) => c.position !== 'static')) {
        out.hint = 'a static box (not a flex/grid item) paints below positioned siblings, and z-index does nothing on it — give it position: relative (and a z-index if needed)';
      }
      if (clickable === false && verdict === 'visible') out.hint = `visible, but clicks at its centre go to ${out.clickTarget} — a transparent layer on top (check pointer-events)`;
      results.push(out);
    }
  } finally {
    force.remove();
    for (const [n, [l, t]] of saved) { n.scrollLeft = l; n.scrollTop = t; }
    scrollTo({ left: sx, top: sy, behavior: 'instant' });
  }
  const ok = results.some((x) => x.verdict !== 'visible' && x.verdict !== 'possibly-covered') || results.some((x) => x.clickable === false)
    ? false
    : results.some((x) => x.verdict === 'possibly-covered') ? null : true;
  return { check: 'visible', ok, results };
}
