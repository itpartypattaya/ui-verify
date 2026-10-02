/*
 * ui-verify · mobile — the phone basics. Run at a phone width (360–414 px).
 *
 *  - <meta name="viewport">: present, width=device-width, zoom not disabled
 *  - text smaller than 12px
 *  - form fields under 16px font: iOS Safari zooms the page on focus
 *  - tap targets under 24×24 CSS px (WCAG 2.2 SC 2.5.8, AA), with the standard's
 *    exceptions: inline links inside a sentence, and small targets with enough
 *    spacing (a 24px circle around each does not touch another target);
 *    plus a count of targets under 44×44 (comfortable size, WCAG 2.5.5 AAA / Apple HIG)
 *
 * Options: { minText = 12, minInput = 16, target = 24, comfortable = 44, max = 15 }
 * Returns: { ok, width, viewportMeta{}, smallText[], smallInputs[], smallTargets[], under44 }
 */
(opts = {}) => {
  const { minText = 12, minInput = 16, target = 24, comfortable = 44, max = 15 } = opts;
  const name = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    const c = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean) : [];
    if (c.length) s += '.' + c.slice(0, 3).join('.') + (c.length > 3 ? '…' : '');
    if (!el.id && !c.length && el.parentElement) { const a = el.parentElement.closest('[id]'); if (a) s = '#' + a.id + ' ' + s; }
    return s;
  };
  if (!innerWidth) return { check: 'mobile', ok: null, error: 'viewport is 0 — set an explicit viewport size first (see settle.js)' };
  const visible = (el) => (el.checkVisibility
    ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true, checkOpacity: true, checkVisibilityCSS: true })
    : el.getClientRects().length > 0);
  const text = (el) => (el.textContent || el.value || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 30);

  // ---- viewport meta
  const meta = document.querySelector('meta[name="viewport"]');
  const vm = { content: meta ? meta.content : null, issues: [] };
  if (!meta) vm.issues.push('missing — phones lay the page out at ~980px and zoom it out');
  else {
    const kv = Object.fromEntries(meta.content.split(/[,;]/).map((s) => s.split('=').map((x) => (x || '').trim().toLowerCase())).filter((p) => p[0]));
    if (kv.width !== 'device-width') vm.issues.push(`width=${kv.width || '(not set)'} — use width=device-width`);
    if (kv['user-scalable'] === 'no' || kv['user-scalable'] === '0') vm.issues.push('user-scalable=no blocks pinch-zoom (WCAG 1.4.4)');
    if (kv['maximum-scale'] && parseFloat(kv['maximum-scale']) < 2) vm.issues.push(`maximum-scale=${kv['maximum-scale']} limits zoom (WCAG 1.4.4)`);
  }

  // ---- small text
  const sizes = new Map();
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: (t) => (t.nodeValue.trim() ? 1 : 3) });
  const seen = new Set();
  for (let t; (t = w.nextNode());) {
    const p = t.parentElement;
    if (!p || seen.has(p) || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|OPTION|TITLE)$/.test(p.tagName) || p instanceof SVGElement) continue;
    seen.add(p);
    if (!visible(p)) continue;
    const fs = parseFloat(getComputedStyle(p).fontSize);
    if (fs >= minText) continue;
    const k = `${+fs.toFixed(1)}px`;
    if (!sizes.has(k)) sizes.set(k, { fontSize: k, count: 0, examples: [] });
    const g = sizes.get(k);
    g.count++;
    if (g.examples.length < 3) g.examples.push(`${name(p)} "${text(p)}"`);
  }
  const smallText = [...sizes.values()].sort((a, b) => parseFloat(a.fontSize) - parseFloat(b.fontSize));

  // ---- inputs that trigger iOS zoom
  const smallInputs = [...document.querySelectorAll('input, select, textarea, [contenteditable]:not([contenteditable="false"])')]
    .filter((el) => !/^(hidden|checkbox|radio|range|color|file|submit|button|reset|image)$/i.test(el.type || '') && visible(el))
    .filter((el) => parseFloat(getComputedStyle(el).fontSize) < minInput)
    .map((el) => ({ el: name(el), type: el.type || el.tagName.toLowerCase(), fontSize: getComputedStyle(el).fontSize }));

  // ---- tap targets
  const SEL = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, label[for], [role="button"], [role="link"], [role="checkbox"], [role="tab"], [role="menuitem"], [tabindex]:not([tabindex="-1"])';
  const all = [...document.querySelectorAll(SEL)].filter((el) => visible(el) && !(el.parentElement && el.parentElement.closest(SEL)));
  const T = all.map((el) => {
    const r = el.getBoundingClientRect();
    return { el, r, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  }).filter((t) => t.r.width > 0 && t.r.height > 0 && t.r.right > 0 && t.r.left < innerWidth);
  const small = T.filter((t) => t.r.width < target || t.r.height < target);
  const dist = (t, r) => Math.hypot(Math.max(r.left - t.cx, 0, t.cx - r.right), Math.max(r.top - t.cy, 0, t.cy - r.bottom));
  const smallTargets = [];
  for (const t of small) {
    const cs = getComputedStyle(t.el);
    if (t.el.tagName === 'A' && cs.display === 'inline' && t.el.parentElement && (t.el.parentElement.textContent || '').trim().length > (t.el.textContent || '').trim().length + 10) continue; // inline link in a sentence
    const radius = target / 2;
    const crowded = T.some((o) => o !== t && (dist(t, o.r) < radius || (small.includes(o) && Math.hypot(o.cx - t.cx, o.cy - t.cy) < target)));
    if (!crowded) continue; // spacing exception
    smallTargets.push({ el: name(t.el), text: text(t.el), size: `${Math.round(t.r.width)}×${Math.round(t.r.height)}` });
  }
  const under44 = T.filter((t) => t.r.width < comfortable || t.r.height < comfortable).length;

  const phone = innerWidth <= 600;
  const out = {
    check: 'mobile',
    ok: !vm.issues.length && !smallText.length && !smallTargets.length && (!phone || !smallInputs.length),
    width: innerWidth,
    viewportMeta: vm,
    smallText,
    smallInputs: smallInputs.slice(0, max),
    smallTargets: smallTargets.slice(0, max),
    smallTargetsTotal: smallTargets.length,
    targets: T.length,
    under44,
  };
  if (!phone) out.note = `viewport is ${innerWidth}px — run at a phone width (360–414) for meaningful results; input zoom is only judged there`;
  return out;
}
