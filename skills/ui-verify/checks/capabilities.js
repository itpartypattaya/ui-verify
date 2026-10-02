/*
 * ui-verify · capabilities — identify the evaluation context before running
 * checks. Probe API availability, not browser/tool names. This is a preflight,
 * not a layout acceptance result; it never changes the document.
 * Returns { ok: null, apis, availableModes, unavailableModes, notes, next }.
 */
() => {
  const apis = {};
  const probe = (api, test) => {
    try { apis[api] = !!test(); } catch { apis[api] = false; }
  };
  probe('DOM', () => typeof document !== 'undefined' && !!document.body && typeof getComputedStyle === 'function');
  probe('Number.parseFloat', () => typeof Number.parseFloat === 'function');
  probe('CSSOM', () => !!document.styleSheets);
  probe('matchMedia', () => typeof matchMedia === 'function');
  probe('document.createElement', () => typeof document.createElement === 'function');
  probe('document.createTreeWalker', () => typeof document.createTreeWalker === 'function');
  probe('document.createRange', () => typeof document.createRange === 'function');
  probe('hitTesting', () => typeof document.elementFromPoint === 'function' && typeof document.elementsFromPoint === 'function');
  probe('scrollTo', () => typeof scrollTo === 'function');
  probe('Canvas 2D', () => !!document.createElement('canvas').getContext('2d'));
  probe('fonts iterator', () => !!document.fonts && typeof document.fonts[Symbol.iterator] === 'function');
  probe('fonts load', () => typeof document.fonts.load === 'function');
  probe('fonts ready', () => !!document.fonts.ready);
  probe('timers', () => typeof setTimeout === 'function');
  probe('animation frames', () => typeof requestAnimationFrame === 'function');
  probe('performance', () => typeof performance !== 'undefined' && typeof performance.now === 'function' && typeof performance.getEntriesByType === 'function');
  probe('animations', () => typeof document.getAnimations === 'function');
  probe('Image', () => typeof Image === 'function');
  probe('theme mutation', () => typeof document.documentElement.setAttribute === 'function' && typeof document.documentElement.classList.add === 'function');
  probe('theme clone', () => typeof document.createTextNode === 'function' && typeof document.documentElement.cloneNode === 'function');
  const requirements = {
    settle: ['timers', 'animation frames', 'performance', 'fonts iterator', 'fonts ready', 'animations', 'matchMedia'],
    overflow: [], grid: ['Number.parseFloat'], rules: ['CSSOM', 'matchMedia'],
    'widths:listOnly': ['Number.parseFloat', 'CSSOM'],
    'widths:sweep': ['Number.parseFloat', 'CSSOM', 'document.createElement', 'timers'],
    'theme:probe': ['CSSOM', 'matchMedia'],
    'theme:cycle': ['CSSOM', 'matchMedia', 'theme mutation', 'theme clone', 'animation frames', 'timers', 'performance', 'animations', 'Number.parseFloat'],
    clipped: ['Number.parseFloat', 'document.createTreeWalker', 'document.createRange'],
    mobile: ['Number.parseFloat', 'document.createTreeWalker'],
    images: ['Number.parseFloat', 'document.createElement', 'Image', 'timers'],
    glyphs: ['document.createElement', 'Canvas 2D', 'fonts iterator', 'fonts load', 'timers'],
    contrast: ['Number.parseFloat', 'document.createElement', 'Canvas 2D', 'document.createTreeWalker', 'document.createRange', 'hitTesting', 'scrollTo', 'matchMedia'],
    visible: ['Number.parseFloat', 'document.createElement', 'hitTesting', 'scrollTo'],
  };
  const availableModes = [];
  const unavailableModes = {};
  for (const [mode, required] of Object.entries(requirements)) {
    const missing = ['DOM', ...required].filter(api => !apis[api]);
    if (missing.length) unavailableModes[mode] = missing;
    else availableModes.push(mode);
  }
  return {
    check: 'capabilities', ok: null, apis, availableModes, unavailableModes,
    notes: ['API availability only: stylesheet access, canvas pixels, font loading and layout readiness still need their own checks',
      'A read-only evaluate method cannot run checks that create nodes or switch themes; do not try to bypass it'],
    next: 'Run available modes; use full page JavaScript for unavailable checks (references/adapters.md)',
  };
}
