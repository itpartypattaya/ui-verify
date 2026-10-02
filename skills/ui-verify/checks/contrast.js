/*
 * ui-verify · contrast — WCAG 2 contrast of text against what is really under it.
 *
 * Not "first non-transparent background of a parent": the check hit-tests each
 * line of the text (document.elementsFromPoint), walks every layer beneath it —
 * siblings, overlays, translucent panels, gradients, image pixels — and
 * composites them back together, including group opacity of ancestors.
 * Any CSS colour works (oklch, lab, color-mix, color(srgb …)): colours are
 * normalised through a 1×1 canvas instead of a regex.
 *
 * - Gradients are judged on their worst colour, including the colours between
 *   stops (a black→white gradient passes through the text's own grey).
 * - Over an <img>/<video> (same-origin or CORS) the pixels under each line are
 *   read, about one per CSS pixel (up to 256×16, nearest-neighbour, so thin
 *   details are not averaged away); transparent pixels show the layers below.
 *   pass = every sampled pixel passes, fail = more than 10 % of them fail, in
 *   between = inconclusive.
 * - When the pixels cannot be read (cross-origin, CSS background image,
 *   canvas), the bound over ANY colour underneath is computed — exactly for
 *   opaque text, in steps of 5 grey levels for translucent text: if even the
 *   worst case passes, the overlay guarantees legibility; otherwise the
 *   answer is "inconclusive" with a range — never a made-up number.
 * - Effects the maths does not model (filter, mix-blend-mode, backdrop-filter,
 *   large positioned ::before/::after overlays, transparent text fill) make the
 *   answer inconclusive; the estimate is still reported.
 *
 * Options: { selector = null (scan the whole page), level = 'AA' | 'AAA',
 *            max = 15, scroll = true (scroll each element into view; window and
 *            inner scrollers are restored), limit = 800 (max elements),
 *            lines = 6 (max line boxes measured per element) }
 * Returns: { ok, checked, passed, failed[] (grouped), inconclusive[], skipped, notes }
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
    check: 'contrast', ok: null, missingCapabilities,
    error: 'required browser APIs are unavailable: ' + missingCapabilities.join(', '),
    next: 'Run this check in a full page JavaScript context (Playwright/DevTools or Claude browser tools); see references/adapters.md',
  });
  needs('document.body', () => typeof document !== 'undefined' && !!document.body);
  needs('getComputedStyle', () => typeof getComputedStyle === 'function');
  needs('Number.parseFloat', () => typeof Number.parseFloat === 'function');
  needs('document.createElement', () => typeof document.createElement === 'function');
  needs('Canvas 2D', () => !!document.createElement('canvas').getContext('2d'));
  needs('document.createTreeWalker', () => typeof document.createTreeWalker === 'function');
  needs('document.createRange', () => typeof document.createRange === 'function');
  needs('document.elementsFromPoint', () => typeof document.elementsFromPoint === 'function');
  needs('scrollTo', () => typeof scrollTo === 'function');
  needs('matchMedia', () => typeof matchMedia === 'function');
  if (missingCapabilities.length) return unsupported();
  const parseFloat = Number.parseFloat;

  const { selector = null, level = 'AA', max = 15, scroll = true, limit = 800, lines = 6 } = opts;
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

  // ---- colour: any CSS colour string → [r, g, b, a] (straight alpha), sRGB 0–255
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const viaCanvas = (s) => {
    // two sentinels, so a colour equal to one of them is not mistaken for "not understood"
    for (const sentinel of ['#010203', '#030201']) {
      ctx.fillStyle = sentinel;
      ctx.fillStyle = s;
      if (ctx.fillStyle !== sentinel) {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillRect(0, 0, 1, 1);
        const d = ctx.getImageData(0, 0, 1, 1).data;
        return [d[0], d[1], d[2], d[3] / 255];
      }
    }
    return null;
  };
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
    const c = viaCanvas(s);
    return c ? [c[0], c[1], c[2], a * c[3]] : null;
  };
  const COLOR = /(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\((?:[^()]|\([^()]*\))*\)|#[\da-f]{3,8}\b|\btransparent\b/gi;
  const splitTop = (s) => {
    const out = [];
    let depth = 0;
    let cur = '';
    for (const ch of s || '') {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && !depth) { out.push(cur.trim()); cur = ''; } else cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  };
  // gradient → its stop colours plus 5 interpolated colours between each pair
  const gradient = (img) => {
    const cs = (img.match(COLOR) || []).map(rgba).filter(Boolean);
    if (cs.length < 2) return cs;
    const out = [cs[0]];
    for (let i = 1; i < cs.length; i++) {
      const a = cs[i - 1];
      const b = cs[i];
      for (let t = 1; t <= 5; t++) out.push(a.map((v, k) => v + ((b[k] - v) * t) / 6));
      out.push(b);
    }
    return out;
  };
  // premultiplied compositing
  const pm = (c) => [c[0] * c[3], c[1] * c[3], c[2] * c[3], c[3]];
  const over = (top, bot) => top.map((v, i) => v + (1 - top[3]) * bot[i]);
  const scale = (p, k) => p.map((v) => v * k);
  const straight = (p) => (p[3] > 0 ? [p[0] / p[3], p[1] / p[3], p[2] / p[3], 1] : [0, 0, 0, 0]);
  const css = (p) => `rgb(${straight(p).slice(0, 3).map(Math.round).join(', ')})`;
  const lum = (p) => {
    const [r, g, b] = straight(p).slice(0, 3).map((v) => {
      v /= 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  // too many colour combinations: keep evenly spaced quantiles of the background luminance,
  // so the darkest and the brightest (a thin bright line) survive and shares stay representative
  const cap = (list, n = 512) => {
    if (list.length <= n) return list;
    const s = list.map((p) => [lum(p.B), p]).sort((a, b) => a[0] - b[0]);
    return Array.from({ length: n }, (_, i) => s[Math.round((i * (s.length - 1)) / (n - 1))][1]);
  };
  const own = (n) => parseFloat(getComputedStyle(n).opacity);
  const canvasColor = (() => {
    const d = document.createElement('div');
    d.style.backgroundColor = 'Canvas';
    de.appendChild(d);
    const c = rgba(getComputedStyle(d).backgroundColor);
    d.remove();
    return c && c[3] ? [c[0], c[1], c[2], 1] : [255, 255, 255, 1];
  })();
  const MEDIA = /^(IMG|VIDEO|CANVAS|IFRAME|OBJECT|EMBED|PICTURE)$/;
  const BLACK = [0, 0, 0, 1];
  const WHITE = [255, 255, 255, 1];

  // effects the compositing maths does not model
  const effectsOf = (n) => {
    const cs = getComputedStyle(n);
    const out = [];
    const f = cs.filter.replace(/drop-shadow\((?:[^()]|\([^()]*\))*\)/g, '').trim(); // shadows alone keep colours
    if (f && f !== 'none') out.push(`filter: ${cs.filter.slice(0, 40)}`);
    if (cs.mixBlendMode !== 'normal') out.push(`mix-blend-mode: ${cs.mixBlendMode}`);
    if (cs.backdropFilter && cs.backdropFilter !== 'none') out.push('backdrop-filter');
    const r = n.getBoundingClientRect();
    for (const p of ['::before', '::after']) {
      const ps = getComputedStyle(n, p);
      if (ps.content === 'none' || !/absolute|fixed/.test(ps.position) || parseFloat(ps.opacity) === 0) continue;
      const bg = rgba(ps.backgroundColor);
      if (!((bg && bg[3] > 0) || ps.backgroundImage !== 'none')) continue;
      if (parseFloat(ps.width) >= r.width * 0.5 && parseFloat(ps.height) >= r.height * 0.5) out.push(`${p} overlay with a background`);
    }
    return out.map((e) => `${name(n)}: ${e}`);
  };

  // the real pixels of an <img>/<video> under a rect (same-origin or CORS), straight alpha
  // object-position → offset of the drawn image inside the content box ("free" = box − drawn size)
  const len = (v, free) => (/%$/.test(v) ? (free * parseFloat(v)) / 100 : parseFloat(v));
  const one = (t, free) => {
    if (/^(left|top)$/.test(t)) return 0;
    if (t === 'center') return free / 2;
    if (/^(right|bottom)$/.test(t)) return free;
    const c = t.match(/^calc\(\s*([-\d.]+)%\s*([+-])\s*([-\d.]+)px\s*\)$/);
    if (c) return (free * parseFloat(c[1])) / 100 + (c[2] === '+' ? 1 : -1) * parseFloat(c[3]);
    return len(t, free);
  };
  const objectOffset = (s, fx, fy) => {
    const t = s.match(/calc\([^)]*\)|\S+/g) || [];
    if (t.length === 4) {
      const a = [t[0], t[1]];
      const b = [t[2], t[3]];
      const [xp, yp] = /^(top|bottom)$/.test(t[0]) ? [b, a] : [a, b];
      const edge = ([kw, off], free) => (/^(right|bottom)$/.test(kw) ? free - len(off, free) : len(off, free));
      return [edge(xp, fx), edge(yp, fy)];
    }
    return [one(t[0] || 'center', fx), one(t[1] || 'center', fy)];
  };
  const pixels = (m, rect) => {
    const nw = m.naturalWidth || m.videoWidth;
    const nh = m.naturalHeight || m.videoHeight;
    if (!nw || !nh || (m.tagName === 'IMG' && !m.complete)) return { why: 'image not loaded yet' };
    const cs = getComputedStyle(m);
    if (cs.transform !== 'none') return { why: 'transformed image — pixel mapping not modelled' };
    const b = m.getBoundingClientRect();
    const px = (k) => parseFloat(cs[k]) || 0;
    const r = {
      left: b.left + px('borderLeftWidth') + px('paddingLeft'),
      top: b.top + px('borderTopWidth') + px('paddingTop'),
      width: b.width - px('borderLeftWidth') - px('borderRightWidth') - px('paddingLeft') - px('paddingRight'),
      height: b.height - px('borderTopWidth') - px('borderBottomWidth') - px('paddingTop') - px('paddingBottom'),
    };
    let sx = r.width / nw;
    let sy = r.height / nh;
    if (cs.objectFit === 'cover') sx = sy = Math.max(sx, sy);
    else if (cs.objectFit === 'contain') sx = sy = Math.min(sx, sy);
    else if (cs.objectFit === 'none') sx = sy = 1;
    else if (cs.objectFit === 'scale-down') sx = sy = Math.min(1, sx, sy);
    let [ox, oy] = objectOffset(cs.objectPosition, r.width - nw * sx, r.height - nh * sy);
    if (Number.isNaN(ox)) ox = (r.width - nw * sx) / 2;
    if (Number.isNaN(oy)) oy = (r.height - nh * sy) / 2;
    const x0 = Math.max(0, (Math.max(rect.left, r.left) - r.left - ox) / sx);
    const y0 = Math.max(0, (Math.max(rect.top, r.top) - r.top - oy) / sy);
    const x1 = Math.min(nw, (Math.min(rect.right, r.left + r.width) - r.left - ox) / sx);
    const y1 = Math.min(nh, (Math.min(rect.bottom, r.top + r.height) - r.top - oy) / sy);
    if (x1 - x0 < 1 || y1 - y0 < 1) return { why: 'text is not over the visible part of the image' };
    // about one sample per CSS pixel of the line box (up to 256×16), nearest-neighbour, so thin
    // bright details are sampled instead of being averaged away by downscaling
    const cw = Math.max(4, Math.min(256, Math.ceil(Math.min(rect.width, r.width))));
    const ch = Math.max(2, Math.min(16, Math.ceil(Math.min(rect.height, r.height))));
    const c = document.createElement('canvas');
    c.width = cw;
    c.height = ch;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingEnabled = false;
    try {
      g.drawImage(m, x0, y0, x1 - x0, y1 - y0, 0, 0, cw, ch);
      const d = g.getImageData(0, 0, cw, ch).data;
      const out = [];
      for (let i = 0; i < d.length; i += 4) out.push([d[i], d[i + 1], d[i + 2], d[i + 3] / 255]);
      return { colors: out };
    } catch {
      return { why: 'cross-origin image without CORS — its pixels cannot be read' };
    }
  };

  // ---- one line box of the text
  const measureAt = (el, rect, fgs) => {
    const notes = [];
    const unsure = [];
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    let method = 'stack';
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

    // opacity groups: the text's ancestors with opacity < 1, inner → outer
    const groups = [];
    for (let n = el; n; n = n.parentElement) if (own(n) < 0.999) groups.push(n);
    const k = groups.length;
    const levelOf = (n) => groups.filter((g) => g.contains(n)).length;
    const factorOf = (n) => {
      let f = 1;
      for (let m = n; m && !m.contains(el); m = m.parentElement) f *= own(m);
      return f;
    };
    const cs0 = getComputedStyle(el);
    const clipText = /text/.test(cs0.backgroundClip || cs0.webkitBackgroundClip || '');

    const layers = [];
    let ended = false;
    let unknown = null;
    let pixelMode = false;
    const push = (colors, n) => {
      const f = factorOf(n);
      layers.push({ colors: colors.map((c) => pm([c[0], c[1], c[2], c[3] * f])), level: levelOf(n), opaque: f >= 0.999 && colors.every((c) => c[3] >= 0.999) });
      const L = layers[layers.length - 1];
      return L.opaque && L.level === 0;
    };
    for (const n of chain) {
      const ancestor = n.contains(el);
      if (!ancestor && (MEDIA.test(n.tagName) || n.namespaceURI === 'http://www.w3.org/2000/svg')) {
        if (/^(IMG|VIDEO)$/.test(n.tagName)) {
          const p = pixels(n, rect);
          if (p.colors) {
            pixelMode = true;
            unsure.push(...effectsOf(n));
            if (push(p.colors, n)) { ended = true; break; }
            continue; // transparent pixels: keep walking to what is below
          }
          notes.push(p.why);
        }
        unknown = `<${n.tagName.toLowerCase()}> ${name(n)} under the text`;
        break;
      }
      unsure.push(...effectsOf(n));
      if (n === el && clipText) continue;
      const cs = getComputedStyle(n);
      let stop = false;
      for (const img of splitTop(cs.backgroundImage)) {
        if (img === 'none') continue;
        if (!/gradient/.test(img)) { unknown = `background image on ${name(n)}`; stop = true; break; }
        const g = gradient(img);
        if (g.length) push(g, n);
      }
      if (stop) break;
      const bc = rgba(cs.backgroundColor);
      if (bc && bc[3] > 0.001 && push([bc], n)) { ended = true; break; }
    }

    // composite top → bottom, leaving opacity groups as we pass below them
    let pairs = fgs.map((c) => ({ T: pm(c), B: [0, 0, 0, 0] }));
    let cur = k;
    const exitTo = (lv) => {
      while (cur > lv) {
        const op = own(groups[k - cur]);
        pairs = pairs.map((p) => ({ T: scale(p.T, op), B: scale(p.B, op) }));
        cur--;
      }
    };
    for (const L of layers) {
      exitTo(L.level);
      pairs = cap(pairs.flatMap((p) => L.colors.map((c) => ({ T: over(p.T, c), B: over(p.B, c) }))));
    }
    exitTo(0);

    const out = [];
    if (unknown) {
      // anything can be underneath: extremes black and white bound the background luminance exactly
      for (const p of pairs) {
        if (p.T[3] >= 0.999) {
          const T = over(p.T, BLACK);
          const Bb = over(p.B, BLACK);
          const Bw = over(p.B, WHITE);
          const rb = ratio(T, Bb);
          const rw = ratio(T, Bw);
          const crosses = (lum(T) - lum(Bb)) * (lum(T) - lum(Bw)) <= 0;
          out.push({ r: crosses ? 1 : Math.min(rb, rw), T, B: rb <= rw ? Bb : Bw, crosses });
          out.push({ r: Math.max(rb, rw), T, B: rb > rw ? Bb : Bw });
        } else {
          for (let g = 0; g <= 255; g += 5) {
            const base = [g, g, g, 1];
            const T = over(p.T, base);
            const B = over(p.B, base);
            out.push({ r: ratio(T, B), T, B });
          }
        }
      }
    } else {
      for (const p of pairs) {
        const T = ended ? p.T : over(p.T, canvasColor);
        const B = ended ? p.B : over(p.B, canvasColor);
        out.push({ r: ratio(T, B), T, B });
      }
    }
    out.sort((a, b) => a.r - b.r);
    return { out, method, notes, unsure, unknown, pixelMode };
  };

  const measure = (el) => {
    const cs = getComputedStyle(el);
    const size = parseFloat(cs.fontSize);
    const weight = parseFloat(cs.fontWeight) || 400;
    const large = size >= 24 || (size >= 18.665 && weight >= 700); // 18pt, or 14pt bold
    const required = level === 'AAA' ? (large ? 4.5 : 7) : (large ? 3 : 4.5);
    const base = { el: name(el), text: text(el), required, large, fontSize: cs.fontSize, fontWeight: cs.fontWeight };
    if (el.closest(':disabled, [aria-disabled="true"]')) return { ...base, status: 'exempt (disabled)' };

    const clipText = /text/.test(cs.backgroundClip || cs.webkitBackgroundClip || '');
    let fgs = [];
    if (clipText) fgs = splitTop(cs.backgroundImage).filter((i) => /gradient/.test(i)).flatMap(gradient);
    else {
      const c = rgba(cs.webkitTextFillColor) || rgba(cs.color);
      if (c && c[3] > 0) fgs = [c];
    }
    if (!fgs.length) {
      return { ...base, status: 'inconclusive', notes: [clipText ? 'text is painted with an image (background-clip: text) — colour unknown' : 'text fill is transparent (stroke/outline-only text?) — not measurable as colour'] };
    }

    const rects = [];
    for (const tn of el.childNodes) {
      if (tn.nodeType !== 3 || !tn.nodeValue.trim()) continue;
      const rg = document.createRange();
      rg.selectNodeContents(tn);
      for (const r of rg.getClientRects()) if (r.width > 0 && r.height > 0 && rects.length < lines) rects.push(r);
    }
    if (!rects.length) rects.push(el.getBoundingClientRect());

    const rank = { fail: 0, inconclusive: 1, pass: 2 };
    let worst = null;
    for (const rect of rects) {
      const m = measureAt(el, rect, fgs);
      const lo = m.out[0];
      const hi = m.out[m.out.length - 1];
      const failShare = m.out.filter((o) => o.r < required).length / m.out.length;
      const notes = [...m.notes];
      let status;
      if (m.unknown) status = lo.r >= required ? 'pass' : 'inconclusive';
      else if (m.pixelMode) {
        status = failShare === 0 ? 'pass' : failShare > 0.1 ? 'fail' : 'inconclusive';
        notes.push(`image pixels under the text: ${Math.round(failShare * 100)} % of the sampled area fails`);
      } else status = lo.r >= required ? 'pass' : 'fail';
      if (m.unsure.length) {
        if (status !== 'inconclusive') notes.push(`would be "${status}" without the unmodelled effects`);
        status = 'inconclusive';
      }
      const res = {
        ...base,
        status: m.unknown && status === 'pass' ? 'pass (guaranteed by the overlay, whatever is underneath)' : status,
        ratio: +lo.r.toFixed(2),
        fg: css(lo.T),
        bg: lo.crosses ? 'any — the background can match the text' : css(lo.B),
        method: m.pixelMode ? 'stack+pixels' : m.method,
      };
      if (m.out.length > 1) res.range = [+lo.r.toFixed(2), +hi.r.toFixed(2)];
      if (m.unknown) res.unknown = m.unknown;
      if (m.unsure.length) res.unmodelled = [...new Set(m.unsure)];
      if (cs.textShadow !== 'none' || parseFloat(cs.webkitTextStrokeWidth) > 0) notes.push('text-shadow/stroke present — may read better than the number says');
      if (notes.length) res.notes = [...new Set(notes)];
      const s = res.status.split(' ')[0];
      if (!worst || rank[s] < rank[worst.status.split(' ')[0]] || (rank[s] === rank[worst.status.split(' ')[0]] && res.ratio < worst.ratio)) worst = res;
    }
    if (rects.length > 1) worst.lines = rects.length;
    return worst;
  };

  // ---- targets
  let targets = [];
  const textParentOf = (el) => {
    const w = document.createTreeWalker(el, 4 /* SHOW_TEXT */, { acceptNode: (t) => (t.nodeValue.trim() ? 1 : 3) });
    const t = w.nextNode();
    return t ? t.parentElement : el;
  };
  if (selector) targets = [...document.querySelectorAll(selector)].slice(0, limit).map(textParentOf);
  else {
    const seen = new Set();
    const w = document.createTreeWalker(document.body, 4 /* SHOW_TEXT */, { acceptNode: (t) => (t.nodeValue.trim() ? 1 : 3) });
    for (let t; (t = w.nextNode()) && seen.size < limit;) {
      const p = t.parentElement;
      if (p && !/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|OPTION|TEXTAREA|TITLE)$/.test(p.tagName) && p.namespaceURI !== 'http://www.w3.org/2000/svg') seen.add(p);
    }
    targets = [...seen];
  }
  if (!targets.length) return { check: 'contrast', ok: null, error: selector ? `no element matches ${selector}` : 'no text found' };

  // scroll positions of the window and of every scroller we may move, restored at the end
  const saved = new Map();
  const remember = (el) => {
    for (let n = el.parentElement; n; n = n.parentElement) {
      if (!saved.has(n) && (n.scrollHeight > n.clientHeight || n.scrollWidth > n.clientWidth)) saved.set(n, [n.scrollLeft, n.scrollTop]);
    }
  };
  const sx = scrollX;
  const sy = scrollY;
  const force = document.createElement('style');
  force.textContent = '*, *::before, *::after { pointer-events: auto !important }'; // elementsFromPoint skips pointer-events: none
  const results = [];
  const skipped = { invisible: 0, examples: [] };
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
          remember(el);
          el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
        }
      }
      results.push(measure(el));
    }
  } finally {
    force.remove();
    for (const [n, [l, t]] of saved) { n.scrollLeft = l; n.scrollTop = t; }
    scrollTo({ left: sx, top: sy, behavior: 'instant' });
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
