import { iconSvg } from './shared-icons.lib.js';

const TOAST_LIMIT = 3;
const DEFAULT_DURATION_MS = 4000;
const ERROR_DURATION_MS = 6000;
const EXIT_ANIMATION_MS = 160;

const TONE_ICONS = {
  success: 'check',
  error: 'alert-triangle',
  progress: 'loader',
};

const TOAST_CSS = `
.wk-toasts {
  position: fixed;
  right: 16px;
  bottom: 16px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  pointer-events: none;
}

.wk-toast {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: min(360px, calc(100vw - 32px));
  padding: 10px 14px;
  border: 1px solid var(--wk-border);
  border-radius: var(--wk-radius-ctl);
  background: var(--wk-surface);
  color: var(--wk-text);
  box-shadow: var(--wk-shadow-pop);
  font-size: var(--wk-fs-md);
  line-height: 1.4;
  pointer-events: auto;
  animation: wk-toast-in 160ms ease-out;
  transition: opacity 160ms ease, transform 160ms ease;
}

.wk-toast.is-leaving {
  opacity: 0;
  transform: translateY(8px);
}

.wk-toast-icon {
  display: inline-flex;
  flex: none;
}

.wk-toast[data-tone="success"] .wk-toast-icon {
  color: var(--wk-accent);
}

.wk-toast[data-tone="error"] .wk-toast-icon {
  color: var(--wk-danger);
}

.wk-toast[data-tone="progress"] .wk-toast-icon {
  color: var(--wk-text-muted);
}

.wk-toast .wk-spin {
  animation: wk-spin 0.9s linear infinite;
}

@keyframes wk-toast-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes wk-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .wk-toast {
    animation: none;
    transition: none;
  }

  .wk-toast .wk-spin {
    animation: none;
  }
}
`.trim();

function createToaster({ root } = {}) {
  if (!root?.append) {
    throw new Error('shared-toast: createToaster requires a root element.');
  }
  const documentObject = root.ownerDocument ?? globalThis.document;
  if (!documentObject?.createElement) {
    throw new Error('shared-toast: root must expose ownerDocument.');
  }
  const timers = new Set();

  const container = documentObject.createElement('div');
  container.className = 'wk-toasts';
  container.setAttribute('role', 'status');
  container.setAttribute('aria-live', 'polite');
  root.append(container);

  function schedule(callback, delay) {
    const timer = setTimeout(() => {
      timers.delete(timer);
      callback();
    }, delay);
    timers.add(timer);
  }

  function dismiss(toast) {
    if (!toast.parentNode) return;
    toast.classList.add('is-leaving');
    schedule(() => toast.remove(), EXIT_ANIMATION_MS);
  }

  function enforceLimit() {
    while (container.children.length > TOAST_LIMIT) {
      container.firstElementChild?.remove();
    }
  }

  function setTone(toast, tone) {
    toast.dataset.tone = tone;
    const iconNode = toast.querySelector('.wk-toast-icon');
    const iconName = TONE_ICONS[tone];
    if (iconName) {
      iconNode.innerHTML = iconSvg(iconName);
      iconNode.classList.toggle('wk-spin', tone === 'progress');
      iconNode.hidden = false;
    } else {
      iconNode.innerHTML = '';
      iconNode.classList.remove('wk-spin');
      iconNode.hidden = true;
    }
  }

  function setMessage(toast, message) {
    toast.querySelector('.wk-toast-message').textContent = String(message ?? '');
  }

  function buildToast({ message, tone }) {
    const toast = documentObject.createElement('div');
    toast.className = 'wk-toast';
    const iconNode = documentObject.createElement('span');
    iconNode.className = 'wk-toast-icon';
    const messageNode = documentObject.createElement('span');
    messageNode.className = 'wk-toast-message';
    toast.append(iconNode, messageNode);
    setTone(toast, tone);
    setMessage(toast, message);
    return toast;
  }

  function autoDismiss(toast, duration) {
    if (Number.isFinite(duration) && duration > 0) {
      schedule(() => dismiss(toast), duration);
    }
  }

  function show({ message, tone = 'info', duration } = {}) {
    const resolvedTone = ['success', 'error', 'info'].includes(tone) ? tone : 'info';
    const toast = buildToast({ message, tone: resolvedTone });
    container.append(toast);
    enforceLimit();
    autoDismiss(toast, duration ?? (resolvedTone === 'error' ? ERROR_DURATION_MS : DEFAULT_DURATION_MS));
    return toast;
  }

  function showProgress({ message } = {}) {
    const toast = buildToast({ message, tone: 'progress' });
    container.append(toast);
    enforceLimit();

    let settled = false;
    function settle(tone, nextMessage, duration) {
      if (settled) return;
      settled = true;
      if (nextMessage != null) setMessage(toast, nextMessage);
      setTone(toast, tone);
      autoDismiss(toast, duration);
    }

    return {
      update(nextMessage) {
        if (!settled) setMessage(toast, nextMessage);
      },
      done(successMessage) {
        settle('success', successMessage, DEFAULT_DURATION_MS);
      },
      fail(errorMessage) {
        settle('error', errorMessage, ERROR_DURATION_MS);
      },
    };
  }

  function destroy() {
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    container.remove();
  }

  return {
    cssText: TOAST_CSS,
    show,
    showProgress,
    destroy,
  };
}

export {
  createToaster,
};
