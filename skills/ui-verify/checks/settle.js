/*
 * ui-verify · settle — is the page ready to be measured at all?
 *
 * Run this first. A 0-wide viewport (hidden preview pane), web fonts still
 * loading or a transition halfway through all produce numbers that look like
 * data and are not. ok:false → fix the blockers, then measure.
 *
 * Options: { timeout = 3000 } — ms to wait for fonts and finite animations.
 * Returns: { ok, blockers[], notes[], viewport, fonts, images, animations, failedResources, context }
 */
async (opts = {}) => {
  const { timeout = 3000 } = opts;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // rAF never fires in a hidden tab, so every frame wait is raced against a timer
  const frames = () => Promise.race([new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))), wait(200)]);
  const finite = () => (document.getAnimations ? document.getAnimations() : [])
    .filter((a) => a.playState === 'running' && a.effect && a.effect.getComputedTiming().endTime !== Infinity);

  const t0 = performance.now();
  await Promise.race([document.fonts.ready, wait(timeout)]);
  while (finite().length && performance.now() - t0 < timeout) await wait(100);
  await frames();

  const de = document.documentElement;
  const imgs = [...document.images];
  const pending = imgs.filter((i) => !i.complete);
  const pendingEager = pending.filter((i) => i.loading !== 'lazy');
  const broken = imgs.filter((i) => i.complete && !i.naturalWidth && (i.currentSrc || i.getAttribute('src')));
  const running = document.getAnimations ? document.getAnimations().filter((a) => a.playState === 'running') : [];
  const infinite = running.filter((a) => a.effect && a.effect.getComputedTiming().endTime === Infinity).length;
  const failedFonts = [...document.fonts].filter((f) => f.status === 'error').map((f) => f.family.replace(/["']/g, ''));
  // responseStatus exists in Chromium; cross-origin entries without Timing-Allow-Origin report 0 and are skipped
  const failedResources = performance.getEntriesByType('resource')
    .filter((e) => typeof e.responseStatus === 'number' && e.responseStatus >= 400)
    .map((e) => ({ status: e.responseStatus, type: e.initiatorType, url: e.name.slice(0, 160) }));

  const themeAttrs = ['data-theme', 'data-bs-theme', 'data-mode', 'data-color-mode', 'data-color-scheme'];
  const nodes = [de, document.body].filter(Boolean);
  const context = {
    url: location.href,
    prefersDark: matchMedia('(prefers-color-scheme: dark)').matches,
    colorScheme: getComputedStyle(de).colorScheme,
    themeAttr: nodes.flatMap((n) => themeAttrs.filter((a) => n.hasAttribute(a)).map((a) => `${n.tagName.toLowerCase()}[${a}="${n.getAttribute(a)}"]`)),
    themeClass: nodes.flatMap((n) => [...n.classList].filter((c) => /^(dark|light)(-mode|-theme)?$|^theme-/.test(c)).map((c) => `${n.tagName.toLowerCase()}.${c}`)),
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  };

  const blockers = [];
  const notes = [];
  if (!innerWidth || !innerHeight) blockers.push(`viewport is ${innerWidth}×${innerHeight} (hidden preview pane?) — set an explicit viewport size; geometry measured now is fiction`);
  if (document.readyState !== 'complete') blockers.push(`document.readyState is "${document.readyState}"`);
  if (document.fonts.status !== 'loaded') blockers.push('web fonts are still loading — text metrics will change');
  if (pendingEager.length) blockers.push(`${pendingEager.length} image(s) still loading`);
  const left = finite().length;
  if (left) blockers.push(`${left} finite animation(s)/transition(s) still running — measure after they end`);
  if (document.visibilityState !== 'visible') notes.push('document is hidden: screenshots may be blank or stale; JS measurements are fine once the viewport is non-zero');
  if (infinite) notes.push(`${infinite} infinite animation(s) running (spinners, marquees) — geometry of those elements changes over time`);
  if (pending.length - pendingEager.length) notes.push(`${pending.length - pendingEager.length} lazy image(s) not loaded yet (normal below the fold)`);
  if (broken.length) notes.push(`${broken.length} broken image(s) — run images.js`);
  if (failedFonts.length) notes.push(`font files failed to load: ${[...new Set(failedFonts)].join(', ')}`);
  if (failedResources.length) notes.push(`${failedResources.length} resource(s) returned HTTP ≥ 400 — a missing stylesheet or font explains "everything moved"`);

  return {
    check: 'settle',
    ok: blockers.length === 0,
    blockers,
    notes,
    viewport: { width: innerWidth, height: innerHeight, clientWidth: de.clientWidth, dpr: devicePixelRatio, visibility: document.visibilityState },
    fonts: { status: document.fonts.status, failed: [...new Set(failedFonts)] },
    images: { total: imgs.length, pending: pending.length, pendingEager: pendingEager.length, broken: broken.length },
    animations: { running: running.length, infinite },
    failedResources: failedResources.slice(0, 10),
    context,
  };
}
