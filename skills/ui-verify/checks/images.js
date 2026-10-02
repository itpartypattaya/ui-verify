/*
 * ui-verify · images — broken, stretched, blurry, oversized, unsized, alt-less.
 *
 * Per <img> (incl. <picture>, via currentSrc):
 *  - broken      complete but naturalWidth 0 (404, wrong type, CORS)
 *  - distorted   object-fit: fill and rendered aspect ≠ file aspect (> 2 %)
 *  - blurry      shown at more device pixels than the file has (× devicePixelRatio);
 *                for srcset images the file's own pixels are read (naturalWidth is
 *                density-corrected: a 400px file picked as "2x" reports 200)
 *  - oversized   file ≥ 2.5× the pixels it is shown at (wasted bytes; srcset/sizes)
 *  - noDimensions no space reserved before the file arrives (no width/height
 *                attributes, no aspect-ratio, no definite CSS size) → layout shift
 *  - noAlt       alt attribute missing (alt="" is fine for decorative images)
 *  - pending     not loaded yet (lazy below the fold is normal)
 * SVG sources are skipped for pixel checks. CSS background images are not covered.
 *
 * Options: { max = 20, blurry = 1.5, oversized = 2.5 }
 * Returns: { ok, counts{}, broken[], distorted[], blurry[], oversized[], noDimensions[], noAlt[], pending[] }
 */
async (opts = {}) => {
  // Probe capabilities before measuring or changing the page. Browser-tool
  // evaluation can expose a read-only DOM rather than a complete window.
  const missingCapabilities = [];
  const needs = (api, test) => {
    try { if (test()) return; } catch { /* unavailable in this context */ }
    missingCapabilities.push(api);
  };
  const unsupported = () => ({
    check: 'images', ok: null, missingCapabilities,
    error: 'required browser APIs are unavailable: ' + missingCapabilities.join(', '),
    next: 'Run this check in a full page JavaScript context (Playwright/DevTools or Claude browser tools); see references/adapters.md',
  });
  needs('document.body', () => typeof document !== 'undefined' && !!document.body);
  needs('getComputedStyle', () => typeof getComputedStyle === 'function');
  needs('Number.parseFloat', () => typeof Number.parseFloat === 'function');
  needs('document.createElement', () => typeof document.createElement === 'function');
  needs('Image', () => typeof Image === 'function');
  needs('setTimeout', () => typeof setTimeout === 'function');
  if (missingCapabilities.length) return unsupported();
  const parseFloat = Number.parseFloat;

  // 1.5, not 1: at Windows' common 125 % scaling every 1:1 image is "upscaled" by 1.25 and looks fine
  const { max = 20, blurry: upTol = 1.5, oversized: downTol = 2.5 } = opts;
  const name = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    const c = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean) : [];
    if (c.length) s += '.' + c.slice(0, 3).join('.') + (c.length > 3 ? '…' : '');
    if (!el.id && !c.length && el.parentElement) { const a = el.parentElement.closest('[id]'); if (a) s = '#' + a.id + ' ' + s; }
    return s;
  };
  const dpr = devicePixelRatio || 1;
  const L = { broken: [], distorted: [], blurry: [], oversized: [], noDimensions: [], noAlt: [], pending: [] };
  // does the layout keep room for the image before its file arrives? a src-less, alt-less clone
  // in the same spot answers it: 0×0 unless attributes or CSS give it a size
  const reserved = (img) => {
    if (img.hasAttribute('width') && img.hasAttribute('height')) return true;
    if (getComputedStyle(img).aspectRatio !== 'auto') return true;
    const c = img.cloneNode(false);
    for (const a of ['src', 'srcset', 'alt', 'loading']) c.removeAttribute(a); // keep id/class: CSS may size it by them
    c.style.visibility = 'hidden';
    img.after(c);
    const r = c.getBoundingClientRect();
    c.remove();
    return r.width > 0 && r.height > 0;
  };
  // pixels of the file itself (naturalWidth is density-corrected for srcset candidates)
  const filePx = async (img) => {
    const dense = img.hasAttribute('srcset') || (img.parentElement && img.parentElement.tagName === 'PICTURE');
    if (!dense || !img.currentSrc) return [img.naturalWidth, img.naturalHeight, false];
    // a plain src (no srcset) reports the file's own size; onload, not decode(): decode() can stall in hidden tabs
    const i = new Image();
    if (img.crossOrigin !== null) i.crossOrigin = img.crossOrigin; // same request mode → served from the same cache entry
    i.referrerPolicy = img.referrerPolicy;
    i.src = img.currentSrc;
    if (!i.complete) await Promise.race([new Promise((r) => { i.onload = r; i.onerror = r; }), new Promise((r) => setTimeout(r, 3000))]);
    return i.naturalWidth ? [i.naturalWidth, i.naturalHeight, true] : [img.naturalWidth, img.naturalHeight, false];
  };
  for (const img of document.images) {
    const src = img.currentSrc || img.getAttribute('src') || '';
    const file = src.startsWith('data:') ? src.slice(0, 30) + '…' : src.split('#')[0].split('?')[0].split('/').pop().slice(0, 60);
    const id = { el: name(img), src: file };
    if (!img.hasAttribute('alt')) L.noAlt.push(id);
    if (img.getClientRects().length && !reserved(img)) L.noDimensions.push(id);
    if (!img.complete) { L.pending.push({ ...id, lazy: img.loading === 'lazy' }); continue; }
    if (!img.naturalWidth) { if (src) L.broken.push(id); continue; }
    if (!img.getClientRects().length) continue;
    const cs = getComputedStyle(img);
    const r = img.getBoundingClientRect();
    const px = (a) => parseFloat(cs[a]) || 0;
    const w = r.width - px('paddingLeft') - px('paddingRight') - px('borderLeftWidth') - px('borderRightWidth');
    const h = r.height - px('paddingTop') - px('paddingBottom') - px('borderTopWidth') - px('borderBottomWidth');
    if (w < 2 || h < 2) continue;
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    const [fw, fh, decoded] = await filePx(img);
    const shown = `${Math.round(w)}×${Math.round(h)}`;
    const natural = `${fw}×${fh}${decoded && fw !== nw ? ` file (reported ${nw}×${nh})` : ''}`;
    const svg = /\.svg$/i.test(file) || src.startsWith('data:image/svg');
    if (!svg && nh && cs.objectFit === 'fill') {
      const stretch = w / h / (nw / nh);
      if (Math.abs(stretch - 1) > 0.02) L.distorted.push({ ...id, shown, natural, stretch: +stretch.toFixed(2), fix: 'object-fit: cover (or contain), or matching width/height' });
    }
    // drawn width in CSS px (object-fit works on the density-corrected size), then device px per file px
    let drawn = w;
    if (cs.objectFit === 'cover') drawn = nw * Math.max(w / nw, h / nh);
    else if (cs.objectFit === 'contain') drawn = nw * Math.min(w / nw, h / nh);
    else if (cs.objectFit === 'none') drawn = nw;
    else if (cs.objectFit === 'scale-down') drawn = nw * Math.min(1, Math.min(w / nw, h / nh));
    const need = (drawn * dpr) / fw;
    if (!svg && need > upTol && w >= 48) L.blurry.push({ ...id, shown, natural, dpr, upscaledBy: +need.toFixed(2), fix: `serve ≥ ${Math.ceil((fw * need) / 10) * 10}px wide (srcset)` });
    if (!svg && need < 1 / downTol && fw > 400) L.oversized.push({ ...id, shown, natural, dpr, timesTooBig: +(1 / need).toFixed(1) });
  }
  const counts = Object.fromEntries(Object.entries(L).map(([k, v]) => [k, v.length]));
  const out = { check: 'images', ok: !counts.broken && !counts.distorted && !counts.blurry, total: document.images.length, dpr, counts };
  for (const [k, v] of Object.entries(L)) if (v.length) out[k] = v.slice(0, max);
  if (dpr === 1) out.note = 'devicePixelRatio is 1 — "blurry" is judged for a standard screen; on a 2× phone/retina screen more images will look soft';
  return out;
}
