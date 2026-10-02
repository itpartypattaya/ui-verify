/*
 * ui-verify · images — broken, stretched, blurry, oversized, unsized, alt-less.
 *
 * Per <img> (incl. <picture>, via currentSrc):
 *  - broken      complete but naturalWidth 0 (404, wrong type, CORS)
 *  - distorted   object-fit: fill and rendered aspect ≠ file aspect (> 2 %)
 *  - blurry      shown at more device pixels than the file has (× devicePixelRatio)
 *  - oversized   file ≥ 2.5× the pixels it is shown at (wasted bytes; srcset/sizes)
 *  - noDimensions no width/height attributes and no CSS aspect-ratio → layout shift while loading
 *  - noAlt       alt attribute missing (alt="" is fine for decorative images)
 *  - pending     not loaded yet (lazy below the fold is normal)
 * SVG sources are skipped for pixel checks. CSS background images are not covered.
 *
 * Options: { max = 20, blurry = 1.5, oversized = 2.5 }
 * Returns: { ok, counts{}, broken[], distorted[], blurry[], oversized[], noDimensions[], noAlt[], pending[] }
 */
(opts = {}) => {
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
  for (const img of document.images) {
    const src = img.currentSrc || img.getAttribute('src') || '';
    const file = src.startsWith('data:') ? src.slice(0, 30) + '…' : src.split('#')[0].split('?')[0].split('/').pop().slice(0, 60);
    const id = { el: name(img), src: file };
    if (!img.hasAttribute('alt')) L.noAlt.push(id);
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
    const shown = `${Math.round(w)}×${Math.round(h)}`;
    const natural = `${nw}×${nh}`;
    const svg = /\.svg$/i.test(file) || src.startsWith('data:image/svg');
    if (!svg && nh && cs.objectFit === 'fill') {
      const stretch = w / h / (nw / nh);
      if (Math.abs(stretch - 1) > 0.02) L.distorted.push({ ...id, shown, natural, stretch: +stretch.toFixed(2), fix: 'object-fit: cover (or contain), or matching width/height' });
    }
    let scale = w / nw;
    if (cs.objectFit === 'cover') scale = Math.max(w / nw, h / nh);
    else if (cs.objectFit === 'contain') scale = Math.min(w / nw, h / nh);
    else if (cs.objectFit === 'none') scale = 1;
    else if (cs.objectFit === 'scale-down') scale = Math.min(1, Math.min(w / nw, h / nh));
    const need = scale * dpr;
    if (!svg && need > upTol && w >= 48) L.blurry.push({ ...id, shown, natural, dpr, upscaledBy: +need.toFixed(2), fix: `serve ≥ ${Math.ceil((nw * need) / 10) * 10}px wide (srcset)` });
    if (!svg && need < 1 / downTol && nw > 400) L.oversized.push({ ...id, shown, natural, dpr, timesTooBig: +(1 / need).toFixed(1) });
    const hasDims = img.hasAttribute('width') && img.hasAttribute('height');
    if (!hasDims && cs.aspectRatio === 'auto') L.noDimensions.push({ ...id, shown });
  }
  const counts = Object.fromEntries(Object.entries(L).map(([k, v]) => [k, v.length]));
  const out = { check: 'images', ok: !counts.broken && !counts.distorted && !counts.blurry, total: document.images.length, dpr, counts };
  for (const [k, v] of Object.entries(L)) if (v.length) out[k] = v.slice(0, max);
  if (dpr === 1) out.note = 'devicePixelRatio is 1 — "blurry" is judged for a standard screen; on a 2× phone/retina screen more images will look soft';
  return out;
}
