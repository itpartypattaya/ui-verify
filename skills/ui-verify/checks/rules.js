/*
 * ui-verify · rules — did my CSS rule apply, and if not, what beat it?
 *
 * grep over the build answers "is the string in a file". This answers "which
 * rules match this element right now": every matching rule from every readable
 * stylesheet (a cross-origin sheet the CSSOM hides is re-fetched when its server
 * allows CORS, e.g. Google Fonts), with its @media/@supports/@container/@layer context, whether that
 * context is active at the current width, !important, cascade-layer order and
 * specificity — sorted by the CSS cascade with the likely winner first, next to
 * the computed value. A candidate in a context that cannot be evaluated here
 * (@container, implicit @scope) is never named the winner.
 *
 * Options: { selector (required), props = [] (empty → every property the
 *            matching rules declare, up to 40), pseudo = null ('::before' …) }
 * Returns: { ok, el, computed{}, candidates{prop: [...]}, inactive[], unreadableSheets[], fetchedSheets[], notes[] }
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
    check: 'rules', ok: null, missingCapabilities,
    error: 'required browser APIs are unavailable: ' + missingCapabilities.join(', '),
    next: 'Run this check in a full page JavaScript context (Playwright/DevTools or Claude browser tools); see references/adapters.md',
  });
  needs('document.body', () => typeof document !== 'undefined' && !!document.body);
  needs('getComputedStyle', () => typeof getComputedStyle === 'function');
  needs('document.styleSheets', () => !!document.styleSheets);
  needs('matchMedia', () => typeof matchMedia === 'function');
  if (missingCapabilities.length) return unsupported();

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
  // specificity [ids, classes/attrs/pseudo-classes, types] of one complex selector;
  // :is()/:not()/:has() take their most specific argument, :where() counts zero
  const cmp3 = (x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
  const maxSpec = (list) => list.map(spec).sort((x, y) => cmp3(y, x))[0] || [0, 0, 0];
  function spec(s) {
    let a = 0;
    let b = 0;
    let c = 0;
    let i = 0;
    const word = (j) => { while (j < s.length && /[\w-]/.test(s[j])) j++; return j; };
    while (i < s.length) {
      const ch = s[i];
      if (ch === '#') { a++; i = word(i + 1); } else if (ch === '.') { b++; i = word(i + 1); } else if (ch === '[') {
        b++;
        const j = s.indexOf(']', i);
        i = j < 0 ? s.length : j + 1;
      } else if (ch === ':') {
        const pe = s[i + 1] === ':';
        let j = word(i + (pe ? 2 : 1));
        const nm = s.slice(i + (pe ? 2 : 1), j).toLowerCase();
        let args = null;
        if (s[j] === '(') {
          let d = 0;
          let k = j;
          for (; k < s.length; k++) {
            if (s[k] === '(') d++;
            else if (s[k] === ')' && !--d) break;
          }
          args = s.slice(j + 1, k);
          j = k + 1;
        }
        if (pe || /^(before|after|first-line|first-letter)$/.test(nm)) c++;
        else if (nm === 'where') { /* zero */ } else if (/^(is|not|has|matches|-webkit-any)$/.test(nm) && args !== null) {
          const m = maxSpec(splitList(args));
          a += m[0]; b += m[1]; c += m[2];
        } else if (/^nth-(last-)?child$/.test(nm) && args && / of /i.test(args)) {
          const m = maxSpec(splitList(args.split(/ of /i)[1]));
          a += m[0]; b += m[1] + 1; c += m[2];
        } else b++;
        i = j;
      } else if (/[a-zA-Z_]/.test(ch)) { c++; i = word(i); } else i++;
    }
    return [a, b, c];
  }
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
  const traversalErrors = [];
  let order = 0;
  let anon = 0;
  // cascade layers in order of first appearance, as a tree: "a.b" = sublayer b of a
  const kids = new Map([['', []]]);
  const register = (full) => {
    let parent = '';
    for (const part of full.split('.')) {
      const me = parent ? `${parent}.${part}` : part;
      if (!kids.get(parent).includes(part)) kids.get(parent).push(part);
      if (!kids.has(me)) kids.set(me, []);
      parent = me;
    }
  };
  // [index at each depth…, Infinity]: Infinity = "directly in this layer", which beats its sublayers
  const layerKey = (full) => {
    if (!full) return [Infinity];
    const key = [];
    let parent = '';
    for (const part of full.split('.')) {
      key.push(kids.get(parent).indexOf(part));
      parent = parent ? `${parent}.${part}` : part;
    }
    return key.concat(Infinity);
  };
  const short = (href) => (href ? href.replace(location.origin, '').split('?')[0].slice(-70) : 'inline <style>');
  const walk = (rules, ctx, sheet, parentSel, lp) => {
    for (const r of rules) {
      order++;
      if (r.type === 1) {
        let full = r.selectorText;
        if (parentSel) {
          full = splitList(r.selectorText).map((s) => (s.includes('&') ? s.replace(/&/g, `:is(${parentSel})`) : `:is(${parentSel}) ${s}`)).join(', ');
        }
        const scope = ctx.filter((c) => c.scope).pop();
        const testable = scope ? full.replace(/:scope\b/g, `:is(${scope.scope})`) : full;
        const hits = splitList(testable).filter(matchesTarget);
        if (hits.length) {
          const decl = [];
          for (let i = 0; i < r.style.length; i++) decl.push(r.style[i]);
          const best = hits.map((h) => ({ h, s: spec(h) })).sort((x, y) => cmp3(y.s, x.s))[0];
          found.push({
            selector: best.h,
            specificity: best.s,
            sheet: short(sheet.href),
            at: ctx.map((c) => `${c.type} ${c.text}`.trim()),
            layer: lp || null,
            active: ctx.some((c) => c.active === false) ? false : ctx.some((c) => c.active === null) ? null : true,
            style: r.style,
            decl,
            order,
          });
        }
        if (r.cssRules && r.cssRules.length) walk(r.cssRules, ctx, sheet, full, lp);
      } else if (r.type === 4) {
        walk(r.cssRules, [...ctx, { type: '@media', text: r.media.mediaText, active: matchMedia(r.media.mediaText).matches }], sheet, parentSel, lp);
      } else if (r.type === 12) {
        let ok = null;
        try { ok = CSS.supports(r.conditionText); } catch { /* unknown */ }
        walk(r.cssRules, [...ctx, { type: '@supports', text: r.conditionText, active: ok }], sheet, parentSel, lp);
      } else if (/^@container\b/i.test(r.cssText)) {
        walk(r.cssRules, [...ctx, { type: '@container', text: r.conditionText, active: null }], sheet, parentSel, lp);
      } else if (/^@scope\b/i.test(r.cssText)) {
        // active when the element sits inside a scope root and not below a scope limit
        let active = null;
        if (r.start) {
          let root = null;
          try { root = el.closest(r.start); } catch { /* unparsable */ }
          let limit = null;
          try { limit = r.end ? el.closest(r.end) : null; } catch { /* unparsable */ }
          active = !!root && !(limit && limit !== root && root.contains(limit));
        }
        walk(r.cssRules, [...ctx, { type: '@scope', text: `(${r.start || ':scope'})${r.end ? ` to (${r.end})` : ''}`, active, scope: r.start || null }], sheet, parentSel, lp);
      } else if (/^@layer\b/i.test(r.cssText) && !!r.cssRules) {
        const full = (lp ? `${lp}.` : '') + (r.name || `(anonymous ${++anon})`);
        register(full);
        walk(r.cssRules, [...ctx, { type: '@layer', text: full, active: true }], sheet, parentSel, full);
      } else if (/^@layer\b/i.test(r.cssText) && !r.cssRules) {
        for (const n of (r.nameList || r.cssText.replace(/^@layer\s+/i, '').replace(/;$/, '').split(',').map(n => n.trim()))) register((lp ? `${lp}.` : '') + n);
      } else if (r.type === 3 && r.styleSheet) {
        const media = r.media && r.media.mediaText;
        let layer = lp;
        if (r.layerName !== null && r.layerName !== undefined) {
          layer = (lp ? `${lp}.` : '') + (r.layerName || `(anonymous ${++anon})`);
          register(layer);
        }
        readSheet(r.styleSheet, [...ctx, { type: '@import', text: media || '', active: media ? matchMedia(media).matches : true }], layer);
      } else if (r.cssRules) {
        walk(r.cssRules, ctx, sheet, parentSel, lp);
      }
    }
  };
  // A cross-origin sheet without CORS hides its rules from the CSSOM, but CDNs such as Google
  // Fonts allow fetch: re-parse that text in a constructed sheet. Its @import rules are dropped.
  const recover = async (roots) => {
    const got = new Map();
    if (typeof fetch !== 'function' || typeof CSSStyleSheet !== 'function' || typeof setTimeout !== 'function') return got;
    const hidden = [];
    const gather = (s) => {
      let rules;
      try { rules = s.cssRules; } catch { if (s.href) hidden.push(s); return; }
      try { for (const r of rules) if (r.type === 3 && r.styleSheet) gather(r.styleSheet); } catch { /* reported by the walk */ }
    };
    roots.forEach(gather);
    await Promise.all(hidden.map(async (s) => {
      try {
        const res = await Promise.race([fetch(s.href), new Promise((_, no) => setTimeout(() => no(new Error('timeout')), 3000))]);
        if (!res.ok) return;
        const text = await res.text();
        const copy = new CSSStyleSheet();
        copy.replaceSync(text);
        got.set(s, { rules: copy.cssRules, imports: /@import/i.test(text) });
      } catch { /* stays unreadable */ }
    }));
    return got;
  };
  const roots = [...document.styleSheets, ...(document.adoptedStyleSheets || [])];
  const recovered = await recover(roots);
  const fetched = [];
  const readSheet = (sheet, ctx = [], lp = '') => {
    let rules;
    try { rules = sheet.cssRules; } catch {
      const got = recovered.get(sheet);
      if (!got) { unreadable.push(sheet.href || '(unknown)'); return; }
      rules = got.rules;
      fetched.push(short(sheet.href));
      if (got.imports) unreadable.push(`${sheet.href} (its @import rules — not followed after a fetch)`);
    }
    const media = sheet.media && sheet.media.mediaText;
    const c = media ? [...ctx, { type: '@media', text: media, active: matchMedia(media).matches }] : ctx;
    if (sheet.disabled) c.push({ type: 'disabled', text: 'stylesheet', active: false });
    try { walk(rules, c, sheet, null, lp); } catch (e) { traversalErrors.push({ sheet: short(sheet.href), error: String(e) }); }
  };
  roots.forEach((s) => readSheet(s));

  const inlineProps = pseudo ? [] : [...el.style];
  const wanted = props.length ? props : [...new Set([...inlineProps, ...found.flatMap((f) => f.decl)])].slice(0, 40);
  const cs = getComputedStyle(el, pseudo || null);
  const computed = {};
  const candidates = {};
  const notesFor = [];
  for (const p of wanted) {
    computed[p] = cs.getPropertyValue(p);
    const list = found
      .filter((f) => f.style.getPropertyValue(p) !== '')
      .map((f) => ({
        value: f.style.getPropertyValue(p),
        important: f.style.getPropertyPriority(p) === 'important',
        selector: f.selector, specificity: f.specificity.join(','), sheet: f.sheet,
        at: f.at.length ? f.at.join(' › ') : null, layer: f.layer,
        active: f.active === null ? 'unknown (@container/@scope)' : f.active,
        _spec: f.specificity, _layer: layerKey(f.layer), order: f.order,
      }));
    if (!pseudo && el.style.getPropertyValue(p)) {
      list.push({ value: el.style.getPropertyValue(p), important: el.style.getPropertyPriority(p) === 'important', selector: 'style="" (inline)', specificity: 'inline', sheet: 'inline', at: null, layer: null, active: true, inline: true, _spec: [0, 0, 0], _layer: [Infinity], order: Infinity });
    }
    // cascade (CSS Cascade 5): importance → inline → layers (normal: later wins; !important: earlier wins)
    // → specificity → source order. Unknown contexts are ranked as if active, but never named winner.
    const layerCmp = (x, y) => {
      for (let i = 0; i < Math.max(x.length, y.length); i++) {
        const a = x[i] ?? -1;
        const b = y[i] ?? -1;
        if (a !== b) return a > b ? 1 : -1;
      }
      return 0;
    };
    const stronger = (x, y) => {
      const ax = x.active === false ? 0 : 1;
      const ay = y.active === false ? 0 : 1;
      if (ax !== ay) return ay - ax;
      if (x.important !== y.important) return x.important ? -1 : 1;
      if (!!x.inline !== !!y.inline) return x.inline ? -1 : 1;
      const l = layerCmp(x._layer, y._layer);
      if (l) return x.important ? l : -l;
      const s = cmp3(x._spec, y._spec);
      if (s) return -s;
      return y.order - x.order;
    };
    list.sort(stronger);
    if (!unreadable.length && !traversalErrors.length && list[0] && list[0].active === true) list[0].likelyWinner = true;
    else if (list[0] && typeof list[0].active === 'string') notesFor.push(`${p}: the strongest candidate sits in an unresolved @container/@scope — no winner named`);
    candidates[p] = list.map(({ order: _o, _spec, _layer, inline: _i, ...c }) => c);
  }
  const inactive = found.filter((f) => f.active === false).map((f) => ({ selector: f.selector, at: f.at.join(' › '), sheet: f.sheet }));
  const notes = [...notesFor];
  if (el.getAnimations && el.getAnimations().length) notes.push('the element has running animations/transitions — they override the declarations listed here while they run');
  if (unreadable.length) notes.push('some stylesheet rules could not be accessed (cross-origin without CORS, or unavailable CSSOM) — computed values still include them, so no winner is named; the first candidate is only the strongest readable one');
  if (traversalErrors.length) notes.push('CSSOM traversal failed — candidates are partial and no winner is named');
  if (props.length && wanted.some((p) => !candidates[p].length)) notes.push('no rule declares some of the requested properties — the value is inherited or the initial value; check the parent');
  notes.push('state selectors (:hover, :focus, :checked) only match while that state is on; @scope proximity and shadow-DOM context are not ranked');
  if (pseudo && cs.content === 'none' && /before|after/.test(pseudo)) notes.push(`${pseudo} has content: none — the pseudo-element is not generated at all`);
  return {
    check: 'rules',
    ok: unreadable.length || traversalErrors.length ? null : true,
    traversalErrors,
    el: name(el),
    pseudo,
    width: innerWidth,
    computed,
    candidates,
    inactive: inactive.slice(0, 15),
    unreadableSheets: unreadable,
    fetchedSheets: fetched,
    notes,
  };
}
