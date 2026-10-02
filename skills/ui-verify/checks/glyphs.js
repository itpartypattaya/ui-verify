/*
 * ui-verify · glyphs — are these characters really drawn by the intended font?
 *
 * A missing glyph raises no error: the browser silently borrows it from another
 * font, and it sits off the baseline or looks bolder. Font subsets drop arrows,
 * check marks and currency signs all the time.
 *
 * Method: wait for the font (document.fonts.load with the exact characters, so
 * unicode-range subsets load too), then measure each character in two stacks
 * with different fallbacks ("Family", monospace / "Family", serif). If the
 * family has the glyph both widths are equal; if it does not, each width equals
 * its fallback's. When the two fallbacks happen to agree the answer is
 * "unknown", not a guess.
 *
 * Options: { family, chars = '€£₽₸₺→←↑↓✓✕×≈≠≤≥…«»„“”—–№°±', weight = '400', style = 'normal' }
 *          or { selector } — family, weight, style and characters taken from that element.
 * Returns: { ok, family, familyAvailable, source ('web font' | 'installed font' | 'unavailable'), faces[], missing[], unknown[], present }
 * The width comparison is a heuristic; the exact answer is in the font file (e.g. fontTools).
 */
async (opts = {}) => {
  let { family = null, chars = null, weight = null, style = null } = opts;
  const { selector = null } = opts;
  if (selector) {
    const el = document.querySelector(selector);
    if (!el) return { check: 'glyphs', ok: null, error: `no element matches ${selector}` };
    const cs = getComputedStyle(el);
    family = family || cs.fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '');
    weight = weight || cs.fontWeight;
    style = style || cs.fontStyle;
    chars = chars || el.textContent;
  }
  if (!family) return { check: 'glyphs', ok: null, error: 'pass { family } or { selector }' };
  weight = weight || '400';
  style = style || 'normal';
  chars = [...new Set([...(chars || '€£₽₸₺→←↑↓✓✕×≈≠≤≥…«»„“”—–№°±')])].filter((c) => c.trim());

  const font = (stack) => `${style} ${weight} 72px ${stack}`;
  let loaded = [];
  try {
    loaded = await Promise.race([
      document.fonts.load(font(`"${family}"`), chars.join('')),
      new Promise((r) => setTimeout(() => r([]), 5000)),
    ]);
  } catch { /* invalid family string */ }
  const faces = [...document.fonts]
    .filter((f) => f.family.replace(/["']/g, '') === family)
    .map((f) => ({ status: f.status, weight: f.weight, style: f.style, unicodeRange: f.unicodeRange }));
  const webLoaded = loaded.length > 0 || faces.some((f) => f.status === 'loaded');

  const ctx = document.createElement('canvas').getContext('2d');
  const width = (stack, ch) => { ctx.font = font(stack); return ctx.measureText(ch).width; };
  const absent = `"__ui_verify_absent_${Math.random().toString(36).slice(2)}__"`;
  const eq = (a, b) => Math.abs(a - b) < 0.01;
  // is the family drawable at all? an installed (local) font is not in document.fonts but still renders
  const SAMPLE = 'mmmmmmmmmmlliI0Oo@WQ';
  const familyAvailable = webLoaded
    || !eq(width(`"${family}", monospace`, SAMPLE), width('monospace', SAMPLE))
    || !eq(width(`"${family}", serif`, SAMPLE), width('serif', SAMPLE));
  const source = webLoaded ? 'web font' : familyAvailable ? 'installed font' : 'unavailable';
  const missing = [];
  const unknown = [];
  let present = 0;
  for (const ch of chars) {
    const a1 = width(`"${family}", monospace`, ch);
    const a2 = width(`"${family}", serif`, ch);
    const b1 = width(`${absent}, monospace`, ch);
    const b2 = width(`${absent}, serif`, ch);
    if (eq(a1, b1) && eq(a2, b2)) {
      if (eq(b1, b2)) unknown.push(ch);
      else missing.push(ch);
    } else if (eq(a1, a2)) present++;
    else unknown.push(ch);
  }
  const out = {
    check: 'glyphs',
    ok: missing.length ? false : unknown.length ? null : true,
    family, weight, style,
    familyAvailable,
    source,
    faces,
    missing,
    unknown,
    present,
  };
  if (!familyAvailable) out.note = 'the family is not available at all (wrong name, failed web-font file, not installed) — every character is drawn by a fallback';
  else if (source === 'installed font') out.note = 'installed (local) font: other visitors may not have it — check the @font-face/web-font setup if that matters';
  if (unknown.length) out.unknownNote = 'both fallbacks draw these at the same width — cannot tell; check the font file (e.g. fontTools) or a zoomed screenshot';
  return out;
}
