/*
 * ui-verify · rules — did my CSS rule apply, and if not, what beat it?
 *
 * grep over the build answers "is the string in a file". This answers "which
 * rules match this element right now": every matching rule from every readable
 * stylesheet, with its @media/@supports/@container/@layer context, whether that
 * context is active at the current width, !important and approximate
 * specificity — sorted with the likely winner first, next to the computed value.
 *
 * Options: { selector (required), props = [] (empty → every property the
 *            matching rules declare, up to 40), pseudo = null ('::before' …) }
 * Returns: { ok, el, computed{}, candidates{prop: [...]}, inactive[], unreadableSheets[], notes[] }
 */
(opts = {}) => {
  const { selector, props = [], pseudo = null } = opts;
  const el = selector && document.querySelector(selector);
  if (!el) return { check: 'rules', ok: null, error: `no element matches ${selector}` };
  const name = (n) => {
    let s = n.tagName.toLowerCase();
    if (n.id) s += '#' + n.id;
    const c = typeof n.className === 'string' ? n.className.trim().split(/\s+/).filter(Boolean) : [];
    if (c.length) s += '.' + c.slice(0, 3).join('.') + (c.length > 3 ? '…' : '');
    if (!n.id && !c.length && n.parentElement) { const a = n.parentElement.closest('[id]'); if (a) s = '#' + a.id + ' ' + s; }
    return s;
  };
  const PSEUDO_EL = /::?(before|after|placeholder|marker|selection|first-line|first-letter|backdrop|file-selector-button)\s*$/i;
  const splitList = (s) => {
    const out = [];
    let depth = 0;
    let cur = '';
    for (const ch of s) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && !depth) { out.push(cur.trim()); cur = ''; } else cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  };
  // approximate specificity [ids, classes/attrs/pseudo-classes, types]
  const spec = (s) => {
    s = s.replace(/:where\((?:[^()]|\([^()]*\))*\)/g, '').replace(/:(is|not|has)\(/g, '(');
    const pe = (s.match(/::[\w-]+|:(before|after|first-line|first-letter)\b/g) || []).length;
    s = s.replace(/::[\w-]+|:(before|after|first-line|first-letter)\b/g, '');
    const a = (s.match(/#[\w-]+/g) || []).length;
    const b = (s.match(/\.[\w-]+|\[[^\]]*\]|:[\w-]+/g) || []).length;
    const c = (s.replace(/"[^"]*"|'[^']*'|\[[^\]]*\]/g, '').match(/(^|[\s>+~(])[a-z][\w-]*/gi) || []).length + pe;
    return [a, b, c];
  };
  const matchesTarget = (sel) => {
    const pm = sel.match(PSEUDO_EL);
    const base = pm ? sel.slice(0, pm.index).trim() || '*' : sel;
    const want = pseudo ? pseudo.replace(/^:+/, '') : null;
    const got = pm ? pm[1].toLowerCase() : null;
    if (want !== got) return false;
    try { return el.matches(base); } catch { return false; }
  };

  const found = [];
  const unreadable = [];
  let order = 0;
  const short = (href) => (href ? href.replace(location.origin, '').split('?')[0].slice(-70) : 'inline <style>');
  const walk = (rules, ctx, sheet, parentSel) => {
    for (const r of rules) {
      order++;
      if (r instanceof CSSStyleRule) {
        let full = r.selectorText;
        if (parentSel) {
          full = splitList(r.selectorText).map((s) => (s.includes('&') ? s.replace(/&/g, `:is(${parentSel})`) : `:is(${parentSel}) ${s}`)).join(', ');
        }
        const hits = splitList(full).filter(matchesTarget);
        if (hits.length) {
          const decl = [];
          for (let i = 0; i < r.style.length; i++) decl.push(r.style[i]);
          found.push({
            selector: hits.sort((x, y) => String(spec(y)) > String(spec(x)) ? 1 : -1)[0],
            specificity: spec(hits[0]),
            sheet: short(sheet.href),
            at: ctx.map((c) => `${c.type} ${c.text}`.trim()),
            layer: ctx.filter((c) => c.type === '@layer').map((c) => c.text).join('.') || null,
            active: ctx.every((c) => c.active !== false),
            unknownContext: ctx.some((c) => c.active === null),
            style: r.style,
            decl,
            order,
          });
        }
        if (r.cssRules && r.cssRules.length) walk(r.cssRules, ctx, sheet, full);
      } else if (r instanceof CSSMediaRule) {
        walk(r.cssRules, [...ctx, { type: '@media', text: r.media.mediaText, active: matchMedia(r.media.mediaText).matches }], sheet, parentSel);
      } else if (r instanceof CSSSupportsRule) {
        let ok = null;
        try { ok = CSS.supports(r.conditionText); } catch { /* unknown */ }
        walk(r.cssRules, [...ctx, { type: '@supports', text: r.conditionText, active: ok }], sheet, parentSel);
      } else if (window.CSSContainerRule && r instanceof CSSContainerRule) {
        walk(r.cssRules, [...ctx, { type: '@container', text: r.conditionText, active: null }], sheet, parentSel);
      } else if (window.CSSLayerBlockRule && r instanceof CSSLayerBlockRule) {
        walk(r.cssRules, [...ctx, { type: '@layer', text: r.name || '(anonymous)', active: true }], sheet, parentSel);
      } else if (r instanceof CSSImportRule && r.styleSheet) {
        const media = r.media && r.media.mediaText;
        readSheet(r.styleSheet, [...ctx, { type: '@import', text: media || '', active: media ? matchMedia(media).matches : true }]);
      } else if (r.cssRules) {
        walk(r.cssRules, ctx, sheet, parentSel);
      }
    }
  };
  const readSheet = (sheet, ctx = []) => {
    let rules;
    try { rules = sheet.cssRules; } catch { unreadable.push(sheet.href || '(unknown)'); return; }
    const media = sheet.media && sheet.media.mediaText;
    const c = media ? [...ctx, { type: '@media', text: media, active: matchMedia(media).matches }] : ctx;
    if (sheet.disabled) c.push({ type: 'disabled', text: 'stylesheet', active: false });
    walk(rules, c, sheet, null);
  };
  [...document.styleSheets, ...(document.adoptedStyleSheets || [])].forEach((s) => readSheet(s));

  const wanted = props.length ? props : [...new Set(found.flatMap((f) => f.decl))].slice(0, 40);
  const cs = getComputedStyle(el, pseudo || null);
  const computed = {};
  const candidates = {};
  for (const p of wanted) {
    computed[p] = cs.getPropertyValue(p);
    const list = found
      .filter((f) => f.style.getPropertyValue(p) !== '')
      .map((f) => ({
        value: f.style.getPropertyValue(p),
        important: f.style.getPropertyPriority(p) === 'important',
        selector: f.selector, specificity: f.specificity.join(','), sheet: f.sheet,
        at: f.at.length ? f.at.join(' › ') : null, layer: f.layer,
        active: f.unknownContext && f.active ? 'unknown (@container)' : f.active,
        order: f.order,
      }));
    if (!pseudo && el.style.getPropertyValue(p)) {
      list.push({ value: el.style.getPropertyValue(p), important: el.style.getPropertyPriority(p) === 'important', selector: 'style="" (inline)', specificity: 'inline', sheet: 'inline', at: null, layer: null, active: true, order: Infinity });
    }
    // cascade order (approx.): active → !important → inline → unlayered beats layered (normal) → specificity → source order
    const rank = (c) => [c.active === true ? 1 : 0, c.important ? 1 : 0, c.specificity === 'inline' ? 1 : 0, c.layer ? (c.important ? 1 : 0) : (c.important ? 0 : 1), ...(c.specificity === 'inline' ? [0, 0, 0] : c.specificity.split(',').map(Number)), c.order];
    list.sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return rb[i] - ra[i];
      return 0;
    });
    if (list[0] && list[0].active === true) list[0].likelyWinner = true;
    candidates[p] = list.map(({ order: _o, ...c }) => c);
  }
  const inactive = found.filter((f) => !f.active).map((f) => ({ selector: f.selector, at: f.at.join(' › '), sheet: f.sheet }));
  const notes = [];
  if (unreadable.length) notes.push('some stylesheets are cross-origin without CORS — their rules are invisible here but the browser still applies them');
  if (props.length && wanted.some((p) => !candidates[p].length)) notes.push('no rule declares some of the requested properties — the value is inherited or the initial value; check the parent');
  notes.push('state selectors (:hover, :focus, :checked) only match while that state is on; specificity is approximate');
  if (pseudo && cs.content === 'none' && /before|after/.test(pseudo)) notes.push(`${pseudo} has content: none — the pseudo-element is not generated at all`);
  return {
    check: 'rules',
    ok: true,
    el: name(el),
    pseudo,
    width: innerWidth,
    computed,
    candidates,
    inactive: inactive.slice(0, 15),
    unreadableSheets: unreadable,
    notes,
  };
}
