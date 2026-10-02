/*
 * ui-verify · contrast — WCAG 2 contrast of text against what is really under it.
 *
 * Not "first non-transparent background of a parent": the check hit-tests the
 * text (document.elementsFromPoint), walks every layer beneath it — siblings,
 * overlays, translucent panels, gradients — and composites them back together.
 * Any CSS colour works (oklch, lab, color-mix, color(srgb …)): colours are
 * normalised through a 1×1 canvas instead of a regex.
 *
 * Text over an <img>/<video>: the pixels under the text are read from the image
 * itself (same-origin or CORS) and composited with the overlays above it —
 * ratio = 10th percentile, range = [darkest, lightest]. When the pixels cannot
 * be read (cross-origin, CSS background-image, canvas), the text is tested
 * against every grey from black to white under the same overlays: if even the
 * worst case passes, the overlay guarantees legibility; otherwise the result is
 * "inconclusive" with a range — never a made-up number.
 *
 * Options: { selector = null (scan the whole page), level = 'AA' | 'AAA',
 *            max = 15, scroll = true (scroll each element into view, restored after),
 *            limit = 800 (max elements scanned) }
 * Returns: { ok, checked, passed, failed[] (grouped), inconclusive[], skipped, notes }
 */
(opts = {}) => {
  const { selector = null, level = 'AA', max = 15, scroll = true, limit = 800 } = opts;
  const de = document.documentElement;
  const name = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    const c = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean) : [];
    if (c.length) s += '.' + c.slice(0, 3).join('.') + (c.length > 3 ? '…' : '');
    if (!el.id && !c.length && el.parentElement) { const a = el.parentElement.closest('[id]'); if (a) s = '#' + a.id + ' ' + s; }
    return s;
  };
  const text = (el) => (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);

  // ---- colour: any CSS colour string → [r, g, b, a], sRGB 0–255
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const rgba = (s) => {
    s = (s || '').trim();
    if (!s || s === 'transparent' || s === 'none') return [0, 0, 0, 0];
    let m = s.match(/^rgba?\(([^)]*)\)$/i);
    if (m) {
      const p = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
      return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
    }
    let a = 1;
    const am = s.match(/\/\s*([\d.]+)(%?)\s*\)$/);
    if (am) { a = parseFloat(am[1]) / (am[2] ? 100 : 1); s = s.slice(0, am.index).trimEnd() + ')'; }
    m = s.match(/^color\(srgb\s+([-\d.e]+)\s+([-\d.e]+)\s+([-\d.e]+)\)$/i);
    if (m) return [m[1], m[2], m[3]].map((v) => Math.min(255, Math.max(0, v * 255))).concat(a);
    ctx.fillStyle = '#010203';
    ctx.fillStyle = s;
    if (ctx.fillStyle === '#010203') return null; // the canvas did not understand it either
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], (a * d[3]) / 255];
  };
  const COLOR = /(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\((?:[^()]|\([^()]*\))*\)|#[\da-f]{3,8}\b|\btransparent\b/gi;
  const stops = (img) => (img.match(COLOR) || []).map(rgba).filter(Boolean);
  const css = (c) => `rgb(${c.slice(0, 3).map(Math.round).join(', ')})`;
  const over = (f, b) => [0, 1, 2].map((i) => f[3] * f[i] + (1 - f[3]) * b[i]).concat(1);
  const lum = (c) => {
    const [r, g, b] = c.slice(0, 3).map((v) => {
      v /= 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  const opacityOf = (el) => {
    let o = 1;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity);
    return o;
  };
  const canvasColor = (() => {
    const d = document.createElement('div');
    d.style.backgroundColor = 'Canvas';
    de.appendChild(d);
    const c = rgba(getComputedStyle(d).backgroundColor);
    d.remove();
    return c && c[3] ? c : [255, 255, 255, 1];
  })();
  const MEDIA = /^(IMG|VIDEO|CANVAS|IFRAME|OBJECT|EMBED|PICTURE)$/;
  const GREYS = [0, 32, 64, 96, 128, 160, 192, 224, 255].map((v) => [v, v, v, 1]);

  // ---- layers under the text, top → bottom
  const layersOf = (chain, el, ownBgIsText) => {
    const layers = [];
    const notes = [];
    let base = null;
    let unknown = null;
    let media = null;
    for (const n of chain) {
      if (n !== el && !n.contains(el) && (MEDIA.test(n.tagName) || n instanceof SVGElement)) {
        unknown = `<${n.tagName.toLowerCase()}> ${name(n)} under the text`;
        if (/^(IMG|VIDEO)$/.test(n.tagName)) media = n;
        break;
      }
      const cs = getComputedStyle(n);
      const op = opacityOf(n);
      if (cs.mixBlendMode !== 'normal' || cs.backdropFilter !== 'none' || (cs.filter !== 'none' && n !== el)) {
        notes.push(`${name(n)} uses blend/filter — real colours differ`);
      }
      for (const p of ['::before', '::after']) {
        const ps = getComputedStyle(n, p);
        if (ps.content !== 'none' && /absolute|fixed/.test(ps.position) && ((rgba(ps.backgroundColor) || [0, 0, 0, 0])[3] > 0 || ps.backgroundImage !== 'none')) {
          notes.push(`${name(n)}${p} is a positioned overlay with a background — not included in the number`);
        }
      }
      if (n === el && ownBgIsText) continue;
      if (/url\(/.test(cs.backgroundImage)) { unknown = `background image on ${name(n)}`; break; }
      if (/gradient/.test(cs.backgroundImage)) {
        const s = stops(cs.backgroundImage).map((c) => [c[0], c[1], c[2], c[3] * op]);
        if (s.length) layers.push(s);
      }
      const bc = rgba(cs.backgroundColor);
      if (bc && bc[3] * op > 0.001) {
        const c = [bc[0], bc[1], bc[2], bc[3] * op];
        if (c[3] >= 0.999) { base = c; break; }
        layers.push([c]);
      }
    }
    return { layers, base, unknown, media, notes };
  };

  // ---- the real pixels of an <img>/<video> under the text rect (same-origin or CORS only)
  const pixels = (m, rect) => {
    const nw = m.naturalWidth || m.videoWidth;
    const nh = m.naturalHeight || m.videoHeight;
    if (!nw || !nh || (m.tagName === 'IMG' && !m.complete)) return { why: 'image not loaded yet' };
    const r = m.getBoundingClientRect();
    const cs = getComputedStyle(m);
    let sx = r.width / nw;
    let sy = r.height / nh;
    if (cs.objectFit === 'cover') sx = sy = Math.max(sx, sy);
    else if (cs.objectFit === 'contain') sx = sy = Math.min(sx, sy);
    else if (cs.objectFit === 'none') sx = sy = 1;
    else if (cs.objectFit === 'scale-down') sx = sy = Math.min(1, sx, sy);
    const [px, py] = cs.objectPosition.split(/\s+/);
    const off = (v, free) => (v && v.endsWith('%') ? (free * parseFloat(v)) / 100 : parseFloat(v) || 0);
    const ox = off(px, r.width - nw * sx);
    const oy = off(py, r.height - nh * sy);
    const x0 = Math.max(0, (Math.max(rect.left, r.left) - r.left - ox) / sx);
    const y0 = Math.max(0, (Math.max(rect.top, r.top) - r.top - oy) / sy);
    const x1 = Math.min(nw, (Math.min(rect.right, r.right) - r.left - ox) / sx);
    const y1 = Math.min(nh, (Math.min(rect.bottom, r.bottom) - r.top - oy) / sy);
    if (x1 - x0 < 1 || y1 - y0 < 1) return { why: 'text is not over the visible part of the image' };
    const c = document.createElement('canvas');
    c.width = 24;
    c.height = 8;
    const g = c.getContext('2d', { willReadFrequently: true });
    try {
      g.drawImage(m, x0, y0, x1 - x0, y1 - y0, 0, 0, 24, 8);
      const d = g.getImageData(0, 0, 24, 8).data;
      const out = [];
      for (let i = 0; i < d.length; i += 4) out.push(over([d[i], d[i + 1], d[i + 2], d[i + 3] / 255], canvasColor));
      return { colors: out, filtered: cs.filter !== 'none' || parseFloat(cs.opacity) < 1 };
    } catch {
      return { why: 'cross-origin image without CORS — its pixels cannot be read; zoom a screenshot instead' };
    }
  };

  const measure = (el) => {
    const cs = getComputedStyle(el);
    const tn = [...el.childNodes].find((n) => n.nodeType === 3 && n.nodeValue.trim());
    let rect = null;
    if (tn) {
      const range = document.createRange();
      range.selectNodeContents(tn);
      rect = [...range.getClientRects()].find((r) => r.width > 0 && r.height > 0) || null;
    }
    if (!rect) rect = el.getBoundingClientRect();
    let x = rect.left + rect.width / 2;
    let y = rect.top + rect.height / 2;
    let method = 'stack';
    const notes = [];
    let chain = null;
    if (x >= 0 && y >= 0 && x < innerWidth && y < innerHeight) {
      const stack = document.elementsFromPoint(x, y);
      const i = stack.indexOf(el);
      if (i >= 0) {
        chain = stack.slice(i);
        const above = stack.slice(0, i).filter((n) => !el.contains(n));
        if (above.length) notes.push(`something lies above the text: ${above.slice(0, 2).map(name).join(', ')} — check visible.js`);
      } else notes.push('text is not hit-testable at its own position (clipped or covered) — used ancestors');
    } else notes.push('outside the viewport — used ancestors only; siblings/overlays beneath are not seen');
    if (!chain) {
      method = 'ancestors';
      chain = [];
      for (let n = el; n; n = n.parentElement) chain.push(n);
    }
    const clipText = /text/.test(cs.backgroundClip || cs.webkitBackgroundClip || '');
    const L = layersOf(chain, el, clipText);
    notes.push(...L.notes);
    const opT = opacityOf(el);
    if (opT < 0.999) notes.push(`opacity ${+opT.toFixed(2)} on the text or an ancestor — number is approximate`);
    let fgs;
    if (clipText) fgs = stops(cs.backgroundImage);
    else {
      const fill = rgba(cs.webkitTextFillColor);
      fgs = [fill && fill[3] > 0 ? fill : rgba(cs.color)];
    }
    fgs = fgs.filter(Boolean).map((c) => [c[0], c[1], c[2], c[3] * opT]);
    if (cs.textShadow !== 'none' || parseFloat(cs.webkitTextStrokeWidth) > 0) notes.push('text-shadow/stroke present — may read better than the number says');

    let pix = null;
    if (L.media) {
      const p = pixels(L.media, rect);
      if (p.colors) {
        pix = p.colors;
        method = 'stack+pixels';
        notes.push('measured on the image pixels under the text: ratio = 10th percentile (a few bright/dark specks do not decide), range = [darkest, lightest]');
        if (p.filtered) notes.push('the image has a filter/opacity — pixels are read unfiltered');
      } else notes.push(p.why);
    }
    let bgs = L.base ? [L.base] : pix || (L.unknown ? GREYS : [canvasColor]);
    for (let i = L.layers.length - 1; i >= 0; i--) {
      bgs = L.layers[i].flatMap((s) => bgs.map((u) => over(s, u)));
      if (bgs.length > 256) bgs = bgs.filter((_, k) => k % Math.ceil(bgs.length / 256) === 0);
    }
    const all = [];
    for (const f of fgs) for (const b of bgs) all.push({ r: ratio(f[3] < 1 ? over(f, b) : f, b), f, b });
    all.sort((p, q) => p.r - q.r);
    const worst = (pix ? all[Math.floor(all.length * 0.1)] : all[0]) || { r: Infinity };
    const best = all.length ? all[all.length - 1].r : 0;
    const lowest = all.length ? all[0].r : Infinity;
    const size = parseFloat(cs.fontSize);
    const weight = parseFloat(cs.fontWeight) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const required = level === 'AAA' ? (large ? 4.5 : 7) : (large ? 3 : 4.5);
    const r2 = (v) => +v.toFixed(2);
    const res = {
      el: name(el), text: text(el),
      ratio: r2(worst.r), required, large,
      fg: worst.f ? css(worst.f) : cs.color, bg: worst.b ? css(worst.b) : null,
      fontSize: cs.fontSize, fontWeight: cs.fontWeight, method,
    };
    if (bgs.length > 1 || fgs.length > 1) res.range = [r2(lowest), r2(best)];
    if (L.unknown) res.unknown = L.unknown;
    if (notes.length) res.notes = [...new Set(notes)];
    const guess = L.unknown && !pix; // nothing but the grey sweep to go on
    if (el.closest(':disabled, [aria-disabled="true"]')) res.status = 'exempt (disabled)';
    else if (worst.r >= required) res.status = guess ? 'pass (guaranteed by the overlay, whatever the image)' : 'pass';
    else res.status = guess ? 'inconclusive' : 'fail';
    return res;
  };

  // ---- targets
  let targets = [];
  const textParentOf = (el) => {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (t) => (t.nodeValue.trim() ? 1 : 3) });
    const t = w.nextNode();
    return t ? t.parentElement : el;
  };
  if (selector) targets = [...document.querySelectorAll(selector)].slice(0, limit).map(textParentOf);
  else {
    const seen = new Set();
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: (t) => (t.nodeValue.trim() ? 1 : 3) });
    for (let t; (t = w.nextNode()) && seen.size < limit;) {
      const p = t.parentElement;
      if (p && !/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|OPTION|TEXTAREA|TITLE)$/.test(p.tagName) && !(p instanceof SVGElement)) seen.add(p);
    }
    targets = [...seen];
  }
  if (!targets.length) return { check: 'contrast', ok: null, error: selector ? `no element matches ${selector}` : 'no text found' };

  const sx = scrollX;
  const sy = scrollY;
  const force = document.createElement('style');
  force.textContent = '*, *::before, *::after { pointer-events: auto !important }'; // elementsFromPoint skips pointer-events: none
  const results = [];
  const skipped = { invisible: 0, examples: [] };
  let scrolled = false;
  document.head.appendChild(force);
  try {
    for (const el of new Set(targets)) {
      const vis = el.checkVisibility
        ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true, checkOpacity: true, checkVisibilityCSS: true })
        : el.getClientRects().length > 0;
      if (!vis) {
        skipped.invisible++;
        if (skipped.examples.length < 5) skipped.examples.push(name(el));
        continue;
      }
      if (scroll && innerHeight) {
        const r = el.getBoundingClientRect();
        if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) {
          el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
          scrolled = true;
        }
      }
      results.push(measure(el));
    }
  } finally {
    force.remove();
    if (scrolled) scrollTo({ left: sx, top: sy, behavior: 'instant' });
  }

  const group = (list) => {
    const m = new Map();
    for (const r of list) {
      const k = [r.ratio, r.fg, r.bg, r.fontSize, r.fontWeight].join('|');
      if (!m.has(k)) m.set(k, { ...r, count: 0, examples: [] });
      const g = m.get(k);
      g.count++;
      if (g.examples.length < 3) g.examples.push(`${r.el} "${r.text}"`);
    }
    return [...m.values()].map(({ el, text: _t, ...g }) => g).sort((a, b) => a.ratio - b.ratio);
  };
  const failed = results.filter((r) => r.status === 'fail');
  const inconclusive = results.filter((r) => r.status === 'inconclusive');
  const out = {
    check: 'contrast',
    ok: failed.length ? false : inconclusive.length ? null : true,
    level,
    theme: (de.dataset.theme || de.className || (matchMedia('(prefers-color-scheme: dark)').matches ? 'prefers dark' : 'prefers light')).toString().slice(0, 60),
    checked: results.length,
    passed: results.filter((r) => r.status.startsWith('pass')).length,
    failed: group(failed).slice(0, max),
    failedTotal: failed.length,
    inconclusive: inconclusive.slice(0, max),
    skipped,
  };
  if (selector) out.results = results.slice(0, max);
  if (skipped.invisible) out.notes = ['invisible elements were skipped (opacity 0 / visibility hidden) — reveal-on-scroll content: scroll through the page first, then re-run'];
  return out;
}
