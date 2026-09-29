import { render } from 'preact';
import { Icon } from './shared-icons.lib.jsx';

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

// Rendering is a pure function of the toast list; the imperative API below only
// mutates that list and re-renders synchronously (preact's top-level render()
// commits before returning), so callers still get live DOM nodes back.
function ToastItem({ toast }) {
  const iconName = TONE_ICONS[toast.tone];
  const iconClass = toast.tone === 'progress' ? 'wk-toast-icon wk-spin' : 'wk-toast-icon';
  return (
    <div className={toast.leaving ? 'wk-toast is-leaving' : 'wk-toast'} data-tone={toast.tone} data-toast-id={toast.id}>
      <span className={iconClass} hidden={!iconName}>
        {iconName ? <Icon name={iconName} /> : null}
      </span>
      <span className="wk-toast-message">{toast.message}</span>
    </div>
  );
}

function ToastList({ toasts }) {
  return toasts.map((toast) => <ToastItem key={toast.id} toast={toast} />);
}

function createToaster({ root } = {}) {
  if (!root?.append) {
    throw new Error('shared-toast: createToaster requires a root element.');
  }
  const documentObject = root.ownerDocument ?? globalThis.document;
  if (!documentObject?.createElement) {
    throw new Error('shared-toast: root must expose ownerDocument.');
  }
  const timers = new Set();
  let toasts = [];
  let nextId = 1;
  let destroyed = false;

  const container = documentObject.createElement('div');
  container.className = 'wk-toasts';
  container.setAttribute('role', 'status');
  container.setAttribute('aria-live', 'polite');
  root.append(container);

  function commit(nextToasts) {
    if (destroyed) return;
    toasts = nextToasts;
    render(<ToastList toasts={toasts} />, container);
  }

  function patch(id, changes) {
    commit(toasts.map((toast) => (toast.id === id ? { ...toast, ...changes } : toast)));
  }

  function has(id) {
    return toasts.some((toast) => toast.id === id);
  }

  function nodeFor(id) {
    return container.querySelector(`[data-toast-id="${id}"]`);
  }

  function schedule(callback, delay) {
    const timer = setTimeout(() => {
      timers.delete(timer);
      callback();
    }, delay);
    timers.add(timer);
  }

  function dismiss(id) {
    if (!has(id)) return;
    patch(id, { leaving: true });
    schedule(() => commit(toasts.filter((toast) => toast.id !== id)), EXIT_ANIMATION_MS);
  }

  function add({ message, tone }) {
    const id = nextId;
    nextId += 1;
    // Oldest toasts beyond the limit are dropped immediately.
    commit([...toasts, { id, tone, message: String(message ?? ''), leaving: false }].slice(-TOAST_LIMIT));
    return id;
  }

  function autoDismiss(id, duration) {
    if (Number.isFinite(duration) && duration > 0) {
      schedule(() => dismiss(id), duration);
    }
  }

  function show({ message, tone = 'info', duration } = {}) {
    const resolvedTone = ['success', 'error', 'info'].includes(tone) ? tone : 'info';
    const id = add({ message, tone: resolvedTone });
    autoDismiss(id, duration ?? (resolvedTone === 'error' ? ERROR_DURATION_MS : DEFAULT_DURATION_MS));
    return nodeFor(id);
  }

  function showProgress({ message } = {}) {
    const id = add({ message, tone: 'progress' });

    let settled = false;
    function settle(tone, nextMessage, duration) {
      if (settled) return;
      settled = true;
      patch(id, nextMessage != null ? { tone, message: String(nextMessage) } : { tone });
      autoDismiss(id, duration);
    }

    return {
      update(nextMessage) {
        if (!settled) patch(id, { message: String(nextMessage ?? '') });
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
    render(null, container);
    destroyed = true;
    container.remove();
  }

  return {
    cssText: TOAST_CSS,
    show,
    showProgress,
    destroy,
  };
}

export { ToastList, createToaster };
