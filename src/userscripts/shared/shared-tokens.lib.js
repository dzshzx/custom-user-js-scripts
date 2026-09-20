const SAFE_COLOR_PATTERN = /^[#a-zA-Z0-9(),.\s%/+-]+$/;
const UNSAFE_SELECTOR_CHARS = /[{};<@\\]/;
const COLOR_SCHEME_QUERY = '(prefers-color-scheme: dark)';

// Dynamic values land inside a CSS text block: reject anything that could
// break out of a declaration or ruleset.
function assertSafeColor(value, name) {
  const color = String(value ?? '').trim();
  if (!color || !SAFE_COLOR_PATTERN.test(color)) {
    throw new Error(`shared-tokens: invalid ${name} color ${JSON.stringify(value)}`);
  }
  return color;
}

function assertSafeSelector(value) {
  const selector = String(value ?? '').trim();
  if (!selector || UNSAFE_SELECTOR_CHARS.test(selector)) {
    throw new Error(`shared-tokens: invalid rootSelector ${JSON.stringify(value)}`);
  }
  return selector;
}

function buildTokenCss({ rootSelector, accent, accentDark } = {}) {
  const root = assertSafeSelector(rootSelector);
  const lightAccent = assertSafeColor(accent, 'accent');
  const darkAccent = accentDark == null ? lightAccent : assertSafeColor(accentDark, 'accentDark');

  return `
${root} {
  --wk-surface: oklch(99.2% 0.002 250);
  --wk-surface-muted: oklch(96.8% 0.003 250);
  --wk-surface-sunken: oklch(97.8% 0.003 250);
  --wk-text: oklch(23% 0.012 250);
  --wk-text-muted: oklch(47% 0.012 250);
  --wk-border: oklch(24% 0.012 250 / 0.10);
  --wk-border-strong: oklch(24% 0.012 250 / 0.16);
  --wk-danger: oklch(52% 0.19 27);
  --wk-warning: oklch(55% 0.13 75);
  --wk-accent: ${lightAccent};
  --wk-shadow-panel: 0 24px 80px oklch(20% 0.02 250 / 0.22);
  --wk-shadow-pop: 0 8px 28px oklch(20% 0.02 250 / 0.14);
  --wk-fs-sm: 12px;
  --wk-fs-md: 13px;
  --wk-fs-lg: 15px;
  --wk-fs-xl: 20px;
  --wk-fs-hero: 28px;
  --wk-radius-ctl: 8px;
  --wk-radius-panel: 12px;
  --wk-radius-pill: 999px;
  color-scheme: light dark;
}

${root}[data-wk-theme="dark"] {
  --wk-surface: oklch(25% 0.012 250);
  --wk-surface-muted: oklch(21% 0.010 250);
  --wk-surface-sunken: oklch(23% 0.011 250);
  --wk-text: oklch(93% 0.008 250);
  --wk-text-muted: oklch(74% 0.010 250);
  --wk-border: oklch(95% 0.01 250 / 0.12);
  --wk-border-strong: oklch(95% 0.01 250 / 0.18);
  --wk-danger: oklch(68% 0.18 27);
  --wk-warning: oklch(75% 0.13 80);
  --wk-accent: ${darkAccent};
  --wk-shadow-panel: 0 24px 80px oklch(10% 0.01 250 / 0.50);
  --wk-shadow-pop: 0 8px 28px oklch(10% 0.01 250 / 0.35);
}

${root} *,
${root} *::before,
${root} *::after {
  box-sizing: border-box;
}

${root} button,
${root} input,
${root} select,
${root} textarea {
  font: inherit;
  color: inherit;
}

${root} :focus-visible {
  outline: 2px solid var(--wk-accent);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  ${root} *,
  ${root} *::before,
  ${root} *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
`.trim();
}

function systemPrefersDark() {
  try {
    const matchMedia = globalThis.window?.matchMedia;
    if (typeof matchMedia === 'function') {
      return Boolean(matchMedia.call(globalThis.window, COLOR_SCHEME_QUERY).matches);
    }
  } catch {
    // Fall through to the light default.
  }
  return false;
}

function resolveTheme(detectHost) {
  if (typeof detectHost === 'function') {
    try {
      const detected = detectHost();
      if (detected === 'light' || detected === 'dark') return detected;
    } catch {
      // Host probes are best-effort; fall back to the media query.
    }
  }
  return systemPrefersDark() ? 'dark' : 'light';
}

function applyTheme(root, { detectHost, observeHost = false } = {}) {
  if (!root) {
    throw new Error('shared-tokens: applyTheme requires a root element.');
  }

  const apply = () => {
    root.dataset.wkTheme = resolveTheme(detectHost);
  };
  apply();

  let media = null;
  const onChange = () => apply();
  try {
    const matchMedia = globalThis.window?.matchMedia;
    if (typeof matchMedia === 'function') {
      media = matchMedia.call(globalThis.window, COLOR_SCHEME_QUERY);
      if (typeof media?.addEventListener === 'function') {
        media.addEventListener('change', onChange);
      } else if (typeof media?.addListener === 'function') {
        media.addListener(onChange);
      } else {
        media = null;
      }
    }
  } catch {
    media = null;
  }

  // Hosts that signal theme through a class or inline color-scheme on
  // <html> (e.g. chatgpt.com) never fire a media change, so watch those
  // attributes when asked.
  let observer = null;
  if (observeHost) {
    try {
      const documentObject = root.ownerDocument ?? globalThis.document;
      const windowObject = documentObject?.defaultView ?? globalThis.window;
      const MutationObserverImpl = windowObject?.MutationObserver ?? globalThis.MutationObserver;
      const hostElement = documentObject?.documentElement;
      if (typeof MutationObserverImpl === 'function' && hostElement && hostElement !== root) {
        observer = new MutationObserverImpl(onChange);
        observer.observe(hostElement, { attributes: true, attributeFilter: ['class', 'style'] });
      }
    } catch {
      observer = null;
    }
  }

  return () => {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (!media) return;
    if (typeof media.removeEventListener === 'function') {
      media.removeEventListener('change', onChange);
    } else if (typeof media.removeListener === 'function') {
      media.removeListener(onChange);
    }
    media = null;
  };
}

export {
  applyTheme,
  buildTokenCss,
  resolveTheme,
};
