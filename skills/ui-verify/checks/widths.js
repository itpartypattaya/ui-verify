/*
 * ui-verify · widths — sweep the widths that matter, not just "mobile" and
 * "desktop".
 *
 * Layout bugs live between breakpoints (e.g. only at 1024–1039px). This reads
 * the page's own breakpoints from its stylesheets (min-/max-width and range
 * syntax, px/em/rem) and tests each edge (bp−1, bp, bp+1), common device
 * widths, and a grid every `step` px (default 40) for bugs no breakpoint
 * announces (scripts, container queries, fluid maths). A failure island
 * narrower than `step` that touches none of these widths can still be missed.
 *
 *  - { listOnly: true } → just the list of widths. Use it when you drive the
 *    viewport with your browser tool (resize → overflow.js → next width).
 *  - default → sweeps inside a hidden same-origin <iframe> of this page,
 *    resizing it to each width, and reports horizontal overflow per width.
 *    Works even when the preview pane itself is hidden. The page is loaded once
 *    more (its scripts run again: analytics, sockets) — prefer the listOnly
 *    loop on production sites. Fails if the page forbids framing
 *    (X-Frame-Options / CSP frame-ancestors) — then use listOnly.
 *  - { run: '<source of another check>' } → also runs that check inside the
 *    iframe at every width (e.g. the text of clipped.js).
 *
 * Options: { widths = null, extra = [], step = 40, height = 900, listOnly = false, run = null, runOpts = {}, pause = 100 }
 * Every boundary between a passing and a failing width is then bisected, so a
 * range like "1024–1039" is exact to the pixel, not "somewhere between tests".
 *
 * ok is null when a width could not be measured or the extra check could not decide.
 *
 * Returns: { ok, breakpoints[], tested, failingRanges[], ranges[{ range, overflowPx, culprits, run }], unmeasured[], undecided[] }
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
    check: 'widths', ok: null, missingCapabilities,
    error: 'required browser APIs are unavailable: ' + missingCapabilities.join(', '),
    next: 'Run this check in a full page JavaScript context (Playwright/DevTools or Claude browser tools); see references/adapters.md',
  });
  needs('document.body', () => typeof document !== 'undefined' && !!document.body);
  needs('getComputedStyle', () => typeof getComputedStyle === 'function');
  needs('Number.parseFloat', () => typeof Number.parseFloat === 'function');
  needs('document.styleSheets', () => !!document.styleSheets);
  if (missingCapabilities.length) return unsupported();
  const parseFloat = Number.parseFloat;

  const { widths: given = null, extra = [], step = 40, height = 900, listOnly = false, run = null, runOpts = {}, pause = 100 } = opts;
  const COMMON = [320, 360, 375, 390, 414, 768, 1024, 1280, 1440, 1920];
  const bps = new Set();
  const mins = new Set();
  const maxs = new Set();
  const unreadable = [];
  const traversalErrors = [];
  let sheetsRead = 0;
  const collect = (text) => {
    if (!text) return;
    const exact = (v, u) => parseFloat(v) * (u === 'px' ? 1 : 16);
    const px = (v, u) => Math.round(exact(v, u)); // em/rem in media queries = initial font size
    for (const m of text.matchAll(/(min|max)-width\s*:\s*([\d.]+)(px|em|rem)/g)) {
      bps.add(px(m[2], m[3]));
      (m[1] === 'min' ? mins : maxs).add(exact(m[2], m[3]));
    }
    for (const m of text.matchAll(/width\s*[<>]=?\s*([\d.]+)(px|em|rem)/g)) bps.add(px(m[1], m[2]));
    for (const m of text.matchAll(/([\d.]+)(px|em|rem)\s*[<>]=?\s*width/g)) bps.add(px(m[1], m[2]));
  };
  const walk = (rules) => {
    for (const r of rules) {
      if (r.type === 4) collect(r.media.mediaText);
      if (r.type === 3) {
        collect(r.media && r.media.mediaText);
        if (r.styleSheet) read(r.styleSheet);
      }
      if (r.cssRules) walk(r.cssRules);
    }
  };
  const read = (s) => {
    collect(s.media && s.media.mediaText);
    let rules;
    try { rules = s.cssRules; } catch (e) { unreadable.push({ sheet: s.href || 'inline <style>', error: String(e) }); return; }
    try { walk(rules); sheetsRead++; } catch (e) { traversalErrors.push({ sheet: s.href || 'inline <style>', error: String(e) }); }
  };
  [...document.styleSheets, ...(document.adoptedStyleSheets || [])].forEach(read);
  document.querySelectorAll('source[media], link[media]').forEach((n) => collect(n.media));
  const breakpoints = [...bps].filter((v) => v >= 200 && v <= 3000).sort((a, b) => a - b);
  // max-width: 1039px + min-width: 1040px leaves 1039.01–1039.99 uncovered; at fractional zoom
  // (Windows 125 %, browser zoom) the viewport really lands there and neither rule applies
  const gaps = [...maxs].filter((x) => Number.isInteger(x) && mins.has(x + 1)).sort((a, b) => a - b).map((x) => `${x}px/${x + 1}px`);
  const grid = step > 0 ? Array.from({ length: Math.floor((1920 - 320) / step) + 1 }, (_, i) => 320 + i * step) : [];
  const widths = given || [...new Set([...COMMON, ...grid, ...extra, ...breakpoints.flatMap((b) => [b - 1, b, b + 1])])]
    .filter((v) => v >= 280 && v <= 2560)
    .sort((a, b) => a - b);
  const gapNote = gaps.length ? 'max-width N / min-width N+1 pairs leave a gap at fractional zoom — use range syntax (width < N+1px / width >= N+1px), which leaves none; max-width: N.98px only narrows it to 0.02px' : undefined;
  const cssCoverage = { complete: !unreadable.length && !traversalErrors.length, sheetsRead, unreadable: unreadable.length, traversalErrors: traversalErrors.length };
  const coverage = { breakpoints, gaps, gapNote, widths, cssCoverage, unreadableSheets: unreadable, traversalErrors };
  if (listOnly) return {
    check: 'widths', ok: null, mode: 'listOnly', tested: 0, ...coverage,
    note: 'planning only — no viewport was resized or measured; empty breakpoints/gaps prove nothing when cssCoverage.complete is false',
    next: 'Resize with the browser tool, run settle.js then overflow.js at each width, and report those measurements separately',
  };
  needs('document.createElement', () => typeof document.createElement === 'function');
  needs('setTimeout', () => typeof setTimeout === 'function');
  if (missingCapabilities.length) return { ...unsupported(), ...coverage, mode: 'sweep', tested: 0 };


  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const f = document.createElement('iframe');
  f.setAttribute('aria-hidden', 'true');
  f.style.cssText = `position:fixed;left:0;top:0;width:${widths[0]}px;height:${height}px;border:0;opacity:0;pointer-events:none;z-index:-2147483647`;
  f.src = location.href;
  const loaded = new Promise((res) => { f.onload = () => res(true); setTimeout(() => res(false), 20000); });
  document.body.appendChild(f);
  const results = [];
  try {
    if (!(await loaded)) return { check: 'widths', ok: null, breakpoints, widths, error: 'iframe did not load in 20 s — use { listOnly: true } and resize with the browser tool' };
    let w;
    let d;
    try { w = f.contentWindow; d = w.document; } catch { d = null; }
    if (!d || !d.body || d.URL === 'about:blank') return { check: 'widths', ok: null, breakpoints, widths, error: 'page refuses to be framed (X-Frame-Options / CSP) — use { listOnly: true } and resize with the browser tool' };
    await Promise.race([d.fonts.ready, wait(3000)]);
    const fn = run ? w.eval('(' + run + '\n)') : null;
    const name = (el) => {
      let s = el.tagName.toLowerCase();
      if (el.id) s += '#' + el.id;
      const c = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean) : [];
      if (c.length) s += '.' + c.slice(0, 3).join('.') + (c.length > 3 ? '…' : '');
      if (!el.id && !c.length && el.parentElement) { const a = el.parentElement.closest('[id]'); if (a) s = '#' + a.id + ' ' + s; }
      return s;
    };
    const overflowAt = () => {
      const de = d.documentElement;
      const vw = de.clientWidth;
      const gcs = (n) => w.getComputedStyle(n);
      const ignored = (el) => {
        for (let n = el; n && n !== de; n = n.parentElement) {
          if (gcs(n).position === 'fixed') return true;
          if (n !== el && n !== d.body && gcs(n).overflowX !== 'visible') return true;
        }
        return false;
      };
      // only the side that scrolls counts: right in LTR, left in RTL (same rule as overflow.js)
      const rtl = gcs(de).direction === 'rtl';
      const dr = de.getBoundingClientRect();
      const out = [];
      for (const el of d.body.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const past = rtl ? r.left - dr.left < -1 : r.right - dr.left > vw + 1;
        if (past && !ignored(el)) out.push({ el, right: r.right - dr.left, width: r.width });
      }
      const set = new Set(out.map((o) => o.el));
      const outer = out.filter((o) => { for (let p = o.el.parentElement; p; p = p.parentElement) if (set.has(p)) return false; return true; });
      return {
        overflowPx: Math.max(0, de.scrollWidth - vw),
        culprits: outer.slice(0, 3).map((o) => ({ el: name(o.el), right: Math.round(o.right), width: Math.round(o.width) })),
      };
    };
    const at = async (width) => {
      f.style.width = `${width}px`;
      void f.offsetWidth; // force the parent layout so the frame gets its new size
      // never measure before the frame confirms the width (throttled/hidden tabs apply it late)
      for (let t = 0; t < 40 && w.innerWidth !== width; t++) await wait(25);
      // a hidden tab renders no frames, so the page's own resize handlers would not run before we
      // measure; fire the event the browser would have fired (only in this iframe copy)
      try { w.dispatchEvent(new w.Event('resize')); } catch { /* ignore */ }
      await wait(pause);
      if (w.innerWidth !== width) {
        const row = { width, overflowPx: 0, culprits: [], error: `frame stuck at ${w.innerWidth}px` };
        results.push(row);
        return row;
      }
      const row = { width, ...overflowAt() };
      if (fn) {
        try { row.run = await fn(runOpts); } catch (e) { row.run = { error: String(e) }; }
      }
      results.push(row);
      return row;
    };
    const fails = (r) => r.overflowPx > 0 || r.culprits.length > 0 || (r.run && r.run.ok === false);
    const first = [];
    for (const width of widths) first.push(await at(width));
    // bisect every pass/fail boundary between neighbouring widths, so ranges are exact to the pixel
    let edges = 0;
    for (let i = 1; i < first.length && edges < 10; i++) {
      const a = first[i - 1];
      const b = first[i];
      if (fails(a) === fails(b) || b.width - a.width < 2) continue;
      edges++;
      let lo = a.width;
      let hi = b.width;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (fails(await at(mid)) === fails(a)) lo = mid; else hi = mid;
      }
    }
  } finally {
    f.remove();
  }
  const byWidth = new Map(results.map((r) => [r.width, r]));
  results.length = 0;
  results.push(...[...byWidth.values()].sort((a, b) => a.width - b.width));
  const unmeasured = results.filter((r) => r.error).map((r) => r.width);
  const undecided = results.filter((r) => !r.error && r.run && (r.run.ok === null || r.run.error)).map((r) => r.width);
  const measured = results.filter((r) => !r.error);
  results.length = 0;
  results.push(...measured);
  const ranges = [];
  let open = null;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.overflowPx > 0 || r.culprits.length > 0 || (r.run && r.run.ok === false)) {
      // an end is exact only when the neighbouring pixel was measured and passed; the edge of the tested span is not
      if (!open) open = { from: r.width, to: r.width, sample: r, exactFrom: i > 0 && results[i - 1].width === r.width - 1 };
      open.to = r.width;
      open.exactTo = i < results.length - 1 && results[i + 1].width === r.width + 1;
    } else if (open) { ranges.push(open); open = null; }
  }
  if (open) ranges.push(open);
  const fmt = (g) => (g.from === g.to ? `${g.from}` : `${g.exactFrom ? '' : '≤'}${g.from}–${g.exactTo ? '' : '≥'}${g.to}`);
  return {
    check: 'widths',
    ok: ranges.length ? false : unmeasured.length || undecided.length || !cssCoverage.complete ? null : true,
    mode: 'sweep',
    cssCoverage,
    traversalErrors,
    breakpoints,
    tested: results.length,
    unmeasured: unmeasured.slice(0, 20),
    undecided: undecided.slice(0, 20),
    failingRanges: ranges.map(fmt),
    ranges: ranges.slice(0, 10).map((g) => ({ range: fmt(g), overflowPx: g.sample.overflowPx, culprits: g.sample.culprits, run: g.sample.run })),
    dpr: devicePixelRatio,
    gaps,
    gapNote,
    unreadableSheets: unreadable,
    note: 'measured in a hidden iframe copy of the page; range ends are exact (bisected) unless marked ≤/≥ (edge of the tested span). '
      + (Number.isInteger(devicePixelRatio) ? '' : `devicePixelRatio ${devicePixelRatio} is fractional: a frame of N px may really be N.2 px wide, so a max-width: N rule can already be off at N. `)
      + 'Confirm with your browser tool + overflow.js at a width inside the range',
  };
}
