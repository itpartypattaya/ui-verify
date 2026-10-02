/*
 * ui-verify · clipped — text that is cut off or spills out of its box.
 *
 * Works from the text itself: the line boxes of every text node (Range rects)
 * are compared with (a) its own block box — text sticking out = "spills"
 * (long word in a narrow button, too much copy in a fixed-height card) — and
 * (b) every ancestor that clips (overflow: hidden/clip) — text beyond it is
 * "clipped", i.e. invisible. Scroll containers stop the search (text there is
 * reachable). Intentional truncation (text-overflow: ellipsis, line-clamp) and
 * visually-hidden helpers (.sr-only) are counted separately, not reported.
 *
 * Options: { max = 15, tolerance = 2, limit = 3000 }
 * Returns: { ok, issues[], intentional{} }
 */
(opts = {}) => {
  const { max = 15, tolerance = 2, limit = 3000 } = opts;
  const name = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    const c = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean) : [];
    if (c.length) s += '.' + c.slice(0, 3).join('.') + (c.length > 3 ? '…' : '');
    if (!el.id && !c.length && el.parentElement) { const a = el.parentElement.closest('[id]'); if (a) s = '#' + a.id + ' ' + s; }
    return s;
  };
  if (!innerWidth) return { check: 'clipped', ok: null, error: 'viewport is 0 — set an explicit viewport size first (see settle.js)' };
  const blockOf = (el) => {
    for (let n = el; n; n = n.parentElement) if (!/^(inline|contents)$/.test(getComputedStyle(n).display)) return n;
    return document.body;
  };
  const padBox = (n) => {
    const r = n.getBoundingClientRect();
    const cs = getComputedStyle(n);
    return { l: r.left + parseFloat(cs.borderLeftWidth), r: r.right - parseFloat(cs.borderRightWidth), t: r.top + parseFloat(cs.borderTopWidth), b: r.bottom - parseFloat(cs.borderBottomWidth) };
  };
  const beyond = (rects, box, tolY) => {
    let x = 0;
    let y = 0;
    for (const r of rects) {
      x = Math.max(x, box.l - r.left, r.right - box.r);
      y = Math.max(y, box.t - r.top, r.bottom - box.b);
    }
    return { x: x > tolerance ? Math.round(x) : 0, y: y > tolY ? Math.round(y) : 0 };
  };

  const issues = new Map();
  const intentional = { ellipsis: 0, lineClamp: 0, visuallyHidden: 0 };
  const counted = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: (t) => (t.nodeValue.trim() ? 1 : 3) });
  let n = 0;
  for (let t; (t = walker.nextNode()) && n < limit; n++) {
    const p = t.parentElement;
    if (!p || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|OPTION|TEXTAREA|TITLE)$/.test(p.tagName) || p instanceof SVGElement) continue;
    if (p.checkVisibility && !p.checkVisibility({ visibilityProperty: true, checkVisibilityCSS: true })) continue;
    const range = document.createRange();
    range.selectNodeContents(t);
    const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
    if (!rects.length) continue;
    const fs = parseFloat(getComputedStyle(p).fontSize) || 16;
    const tolY = Math.max(tolerance, fs * 0.3); // glyph boxes exceed tight line-heights a little
    const block = blockOf(p);
    const text = t.nodeValue.trim().replace(/\s+/g, ' ').slice(0, 40);

    // (b) clipping ancestors, nearest first
    let clippedBy = null;
    for (let a = block; a && a !== document.documentElement; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.position === 'fixed') break;
      const ox = cs.overflowX;
      const oy = cs.overflowY;
      if (/auto|scroll/.test(ox) || /auto|scroll/.test(oy)) break;
      if (ox === 'visible' && oy === 'visible') continue;
      const ar = a.getBoundingClientRect();
      if (ar.width <= 2 || ar.height <= 2 || cs.clip !== 'auto' || /inset\(50%/.test(cs.clipPath)) {
        if (!counted.has(a)) { counted.add(a); intentional.visuallyHidden++; }
        clippedBy = 'intentional';
        break;
      }
      const o = beyond(rects, padBox(a), tolY);
      // only the axis that clips hides anything: overflow-x: clip leaves vertical overflow visible
      if (ox === 'visible') o.x = 0;
      if (oy === 'visible') o.y = 0;
      if (o.x || o.y) {
        if (cs.textOverflow === 'ellipsis' || (cs.webkitLineClamp && cs.webkitLineClamp !== 'none')) {
          if (!counted.has(a)) { counted.add(a); intentional[cs.textOverflow === 'ellipsis' ? 'ellipsis' : 'lineClamp']++; }
          clippedBy = 'intentional';
          break;
        }
        const k = 'clipped|' + name(a);
        if (!issues.has(k)) {
          issues.set(k, {
            kind: 'clipped', box: name(a), text, hiddenPx: o,
            boxSize: `${Math.round(ar.width)}×${Math.round(ar.height)}`,
            style: { overflow: `${ox} ${oy}`, height: cs.height, maxHeight: cs.maxHeight, whiteSpace: cs.whiteSpace },
          });
        }
        clippedBy = a;
        break;
      }
    }
    if (clippedBy) continue;

    // (a) spilling out of its own block box (overflow: visible all the way)
    const bcs = getComputedStyle(block);
    if (bcs.overflowX === 'visible' && bcs.overflowY === 'visible' && block !== document.body) {
      const o = beyond(rects, padBox(block), tolY);
      if (o.x || o.y) {
        const k = 'spills|' + name(block);
        if (!issues.has(k)) {
          const br = block.getBoundingClientRect();
          issues.set(k, {
            kind: 'spills', box: name(block), text, outsidePx: o,
            boxSize: `${Math.round(br.width)}×${Math.round(br.height)}`,
            style: { width: bcs.width, height: bcs.height, whiteSpace: bcs.whiteSpace, overflowWrap: bcs.overflowWrap, wordBreak: bcs.wordBreak },
            hint: o.x ? 'unbreakable word/URL or nowrap — overflow-wrap: anywhere (or min-width: 0 on a flex/grid parent)' : 'fixed height smaller than the text — use min-height, or let it grow',
          });
        }
      }
    }
  }
  const list = [...issues.values()];
  return { check: 'clipped', ok: list.length === 0, issues: list.slice(0, max), total: list.length, intentional, scannedTextNodes: n };
}
