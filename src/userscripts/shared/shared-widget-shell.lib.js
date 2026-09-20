const BUTTON_SAFE_MARGIN = 12;
const DOCK_THRESHOLD = 32;
const DOCK_OFFSET = 8;
const PANEL_SAFE_MARGIN = 12;
const PANEL_GAP = 8;
const DRAG_THRESHOLD_PX = 4;
const FALLBACK_BUTTON_SIZE = 44;
const PANEL_ANIMATION_MS = 200;
const PANEL_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function isDockSide(value) {
  return value === 'left' || value === 'right';
}

function appendClasses(el, classes) {
  const list = String(classes ?? '').split(/\s+/).filter(Boolean);
  if (list.length) el.classList.add(...list);
}

function eventContainsNode(event, node) {
  if (!node) return false;
  const path = event.composedPath?.();
  return Array.isArray(path) ? path.includes(node) : node.contains(event.target);
}

const WIDGET_SHELL_CSS = `
.wk-widget-button {
  position: fixed;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 40px;
  padding: 8px 16px;
  border: 1px solid var(--wk-border-strong);
  border-radius: var(--wk-radius-pill);
  background: var(--wk-surface);
  color: var(--wk-text);
  box-shadow: var(--wk-shadow-pop);
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: var(--wk-fs-md);
  line-height: 1.3;
  cursor: pointer;
  user-select: none;
  touch-action: none;
  transition: opacity 160ms ease, transform 160ms ease;
}

.wk-widget-button.is-dragging {
  cursor: grabbing;
  transition: none;
}

.wk-widget-button[data-wk-docked="left"],
.wk-widget-button[data-wk-docked="right"] {
  opacity: 0.55;
  transform: scale(0.72);
}

.wk-widget-button[data-wk-docked="left"] {
  transform-origin: left center;
}

.wk-widget-button[data-wk-docked="right"] {
  transform-origin: right center;
}

.wk-widget-button[data-wk-docked]:hover,
.wk-widget-button[data-wk-docked]:focus-visible {
  opacity: 1;
  transform: none;
}

.wk-widget-panel {
  position: fixed;
  z-index: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--wk-border);
  border-radius: var(--wk-radius-panel);
  background: var(--wk-surface);
  color: var(--wk-text);
  box-shadow: var(--wk-shadow-panel);
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: var(--wk-fs-md);
  line-height: 1.45;
  opacity: 0;
  transform: scale(0.92);
  pointer-events: none;
  transition:
    opacity ${PANEL_ANIMATION_MS}ms ${PANEL_EASING},
    transform ${PANEL_ANIMATION_MS}ms ${PANEL_EASING};
}

.wk-widget-panel[hidden] {
  display: none;
}

.wk-widget-panel.is-open {
  opacity: 1;
  transform: scale(1);
  pointer-events: auto;
}

.wk-widget-header {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--wk-border);
}

.wk-widget-body {
  flex: 1;
  overflow: auto;
  padding: 12px 16px;
}

@media (prefers-reduced-motion: reduce) {
  .wk-widget-button,
  .wk-widget-panel {
    transition: none;
  }
}
`.trim();

function createWidgetShell({
  root,
  buttonId,
  buttonAriaLabel,
  buttonContent,
  buttonClass,
  panelClass,
  panelWidth = 560,
  panelMaxHeight = 760,
  storage,
  positionKey,
  defaultPosition = { top: 76, right: 24 },
  dock = true,
  onOpen,
  onClose,
  renderPanelHeader,
  renderPanelBody,
} = {}) {
  if (!root?.append) {
    throw new Error('shared-widget-shell: createWidgetShell requires a root element.');
  }
  const documentObject = root.ownerDocument ?? globalThis.document;
  if (!documentObject?.createElement) {
    throw new Error('shared-widget-shell: root must expose ownerDocument.');
  }
  const windowObject = documentObject.defaultView ?? globalThis.window ?? globalThis;
  const scheduleTimeout = typeof windowObject.setTimeout === 'function'
    ? windowObject.setTimeout.bind(windowObject)
    : (callback, ms) => setTimeout(callback, ms);
  const cancelTimeout = typeof windowObject.clearTimeout === 'function'
    ? windowObject.clearTimeout.bind(windowObject)
    : (timer) => clearTimeout(timer);
  const requestFrame = typeof windowObject.requestAnimationFrame === 'function'
    ? windowObject.requestAnimationFrame.bind(windowObject)
    : (callback) => scheduleTimeout(callback, 16);

  const buttonEl = documentObject.createElement('button');
  buttonEl.type = 'button';
  if (buttonId) buttonEl.id = buttonId;
  buttonEl.className = 'wk-widget-button';
  appendClasses(buttonEl, buttonClass);
  if (buttonAriaLabel) buttonEl.setAttribute('aria-label', buttonAriaLabel);
  buttonEl.setAttribute('aria-expanded', 'false');
  if (buttonContent != null) {
    if (typeof buttonContent === 'string') {
      buttonEl.innerHTML = buttonContent;
    } else {
      buttonEl.append(buttonContent);
    }
  }

  const panelEl = documentObject.createElement('div');
  panelEl.className = 'wk-widget-panel';
  appendClasses(panelEl, panelClass);
  if (buttonId) panelEl.id = `${buttonId}-panel`;
  panelEl.hidden = true;

  const headerEl = documentObject.createElement('div');
  headerEl.className = 'wk-widget-header';
  const bodyEl = documentObject.createElement('div');
  bodyEl.className = 'wk-widget-body';
  panelEl.append(headerEl, bodyEl);
  renderPanelHeader?.(headerEl);
  renderPanelBody?.(bodyEl);

  root.append(buttonEl, panelEl);

  let position = { left: 0, top: 0, dockSide: null };
  let isOpenState = false;
  let suppressNextClick = false;
  let closeTimer = null;

  function measureButton() {
    const rect = buttonEl.getBoundingClientRect?.();
    return {
      width: rect?.width || buttonEl.offsetWidth || FALLBACK_BUTTON_SIZE,
      height: rect?.height || buttonEl.offsetHeight || FALLBACK_BUTTON_SIZE,
    };
  }

  function clampPosition(left, top) {
    const { width, height } = measureButton();
    const maxLeft = Math.max(BUTTON_SAFE_MARGIN, windowObject.innerWidth - width - BUTTON_SAFE_MARGIN);
    const maxTop = Math.max(BUTTON_SAFE_MARGIN, windowObject.innerHeight - height - BUTTON_SAFE_MARGIN);
    return {
      left: Math.min(Math.max(BUTTON_SAFE_MARGIN, left), maxLeft),
      top: Math.min(Math.max(BUTTON_SAFE_MARGIN, top), maxTop),
    };
  }

  function dockedPosition(dockSide, top) {
    const { width } = measureButton();
    const clamped = clampPosition(0, top);
    return {
      left: dockSide === 'right'
        ? windowObject.innerWidth - DOCK_OFFSET - width
        : DOCK_OFFSET,
      top: clamped.top,
    };
  }

  function detectDockSide(left) {
    const { width } = measureButton();
    if (left <= DOCK_THRESHOLD) return 'left';
    if (windowObject.innerWidth - (left + width) <= DOCK_THRESHOLD) return 'right';
    return null;
  }

  function resolveDefaultPosition() {
    const { width } = measureButton();
    const top = Number.isFinite(defaultPosition?.top) ? defaultPosition.top : 76;
    const right = Number.isFinite(defaultPosition?.right) ? defaultPosition.right : 24;
    return clampPosition(windowObject.innerWidth - right - width, top);
  }

  function applyPosition(next) {
    const dockSide = dock && isDockSide(next?.dockSide) ? next.dockSide : null;
    const resolved = dockSide
      ? dockedPosition(dockSide, next?.top ?? position.top)
      : clampPosition(next?.left ?? position.left, next?.top ?? position.top);
    position = { ...resolved, dockSide };

    if (dockSide) {
      buttonEl.dataset.wkDocked = dockSide;
    } else {
      delete buttonEl.dataset.wkDocked;
    }
    buttonEl.style.top = `${Math.round(resolved.top)}px`;
    if (dockSide === 'right') {
      buttonEl.style.left = 'auto';
      buttonEl.style.right = `${DOCK_OFFSET}px`;
    } else {
      buttonEl.style.left = `${Math.round(resolved.left)}px`;
      buttonEl.style.right = 'auto';
    }
    return position;
  }

  async function persistPosition() {
    if (!storage?.set || !positionKey) return;
    const value = { left: Math.round(position.left), top: Math.round(position.top) };
    if (position.dockSide) value.dockSide = position.dockSide;
    try {
      await storage.set(positionKey, JSON.stringify(value));
    } catch {
      // Position persistence is best-effort.
    }
  }

  async function restorePosition() {
    if (!storage?.get || !positionKey) return;
    try {
      const raw = await storage.get(positionKey);
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (parsed && Number.isFinite(parsed.left) && Number.isFinite(parsed.top)) {
        applyPosition({
          left: parsed.left,
          top: parsed.top,
          dockSide: isDockSide(parsed.dockSide) ? parsed.dockSide : null,
        });
        if (isOpenState) positionPanel();
      }
    } catch {
      // Ignore invalid persisted UI state.
    }
  }

  function positionPanel() {
    const safe = PANEL_SAFE_MARGIN;
    const { width: buttonWidth, height: buttonHeight } = measureButton();
    const width = Math.min(panelWidth, windowObject.innerWidth - safe * 2);
    const maxHeight = Math.min(panelMaxHeight, windowObject.innerHeight - safe * 2);
    const height = Math.min(maxHeight, panelEl.offsetHeight || maxHeight);
    const maxLeft = Math.max(safe, windowObject.innerWidth - width - safe);
    const left = Math.min(Math.max(safe, position.left + buttonWidth - width), maxLeft);
    const belowTop = position.top + buttonHeight + PANEL_GAP;
    const aboveTop = position.top - height - PANEL_GAP;
    const fitsBelow = belowTop + height <= windowObject.innerHeight - safe;
    const maxTop = Math.max(safe, windowObject.innerHeight - height - safe);
    const top = fitsBelow
      ? Math.min(belowTop, maxTop)
      : Math.min(Math.max(safe, aboveTop), maxTop);

    panelEl.style.left = `${Math.round(left)}px`;
    panelEl.style.top = `${Math.round(top)}px`;
    panelEl.style.width = `${Math.round(width)}px`;
    panelEl.style.maxHeight = `${Math.round(maxHeight)}px`;

    const originX = Math.min(Math.max(position.left + buttonWidth / 2 - left, 24), width - 24);
    const originY = Math.min(Math.max(position.top + buttonHeight / 2 - top, 24), height - 24);
    panelEl.style.transformOrigin = `${Math.round(originX)}px ${Math.round(originY)}px`;
    panelEl.dataset.wkPlacement = fitsBelow ? 'below' : 'above';
  }

  function syncExpanded() {
    buttonEl.setAttribute('aria-expanded', isOpenState ? 'true' : 'false');
  }

  function open() {
    if (isOpenState) return;
    isOpenState = true;
    cancelTimeout(closeTimer);
    panelEl.hidden = false;
    panelEl.classList.remove('is-open');
    positionPanel();
    buttonEl.classList.add('is-active');
    syncExpanded();
    requestFrame(() => {
      if (isOpenState) panelEl.classList.add('is-open');
    });
    const focusTarget = panelEl.querySelector(FOCUSABLE_SELECTOR);
    focusTarget?.focus?.();
    onOpen?.();
  }

  function close() {
    if (!isOpenState) return;
    isOpenState = false;
    panelEl.classList.remove('is-open');
    buttonEl.classList.remove('is-active');
    syncExpanded();
    if (panelEl.contains(documentObject.activeElement)) {
      buttonEl.focus?.();
    }
    closeTimer = scheduleTimeout(() => {
      if (!isOpenState) panelEl.hidden = true;
    }, PANEL_ANIMATION_MS);
    onClose?.();
  }

  function toggle() {
    if (isOpenState) {
      close();
    } else {
      open();
    }
  }

  function installDrag() {
    let dragState = null;

    buttonEl.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      dragState = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startLeft: position.left,
        startTop: position.top,
        moved: false,
      };
      buttonEl.classList.add('is-dragging');
      try {
        buttonEl.setPointerCapture?.(event.pointerId);
      } catch {
        // Some synthetic or older pointer implementations do not support capture.
      }
    });

    buttonEl.addEventListener('pointermove', (event) => {
      if (!dragState || dragState.pointerId !== event.pointerId) return;
      const dx = event.clientX - dragState.startX;
      const dy = event.clientY - dragState.startY;
      if (Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD_PX) dragState.moved = true;
      if (!dragState.moved) return;
      applyPosition({
        left: dragState.startLeft + dx,
        top: dragState.startTop + dy,
        dockSide: null,
      });
      if (isOpenState) positionPanel();
    });

    function finishDrag(event) {
      if (!dragState || dragState.pointerId !== event.pointerId) return;
      const moved = dragState.moved;
      dragState = null;
      buttonEl.classList.remove('is-dragging');
      try {
        if (buttonEl.hasPointerCapture?.(event.pointerId)) {
          buttonEl.releasePointerCapture(event.pointerId);
        }
      } catch {
        // Ignore pointer capture implementations that cannot report synthetic pointers.
      }
      if (!moved) return;

      const dockSide = dock ? detectDockSide(position.left) : null;
      applyPosition({ ...position, dockSide });
      persistPosition();
      if (isOpenState) positionPanel();

      suppressNextClick = true;
      scheduleTimeout(() => {
        suppressNextClick = false;
      }, 0);
    }

    buttonEl.addEventListener('pointerup', finishDrag);
    buttonEl.addEventListener('pointercancel', finishDrag);
  }

  function onDocumentPointerDown(event) {
    if (!isOpenState) return;
    if (eventContainsNode(event, panelEl) || eventContainsNode(event, buttonEl)) return;
    close();
  }

  function onDocumentKeydown(event) {
    if (!isOpenState) return;
    if (event.key === 'Escape') close();
  }

  function onWindowResize() {
    applyPosition(position);
    if (isOpenState) positionPanel();
  }

  buttonEl.addEventListener('click', () => {
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }
    toggle();
  });
  documentObject.addEventListener('pointerdown', onDocumentPointerDown, true);
  documentObject.addEventListener('keydown', onDocumentKeydown);
  windowObject.addEventListener?.('resize', onWindowResize);

  applyPosition(resolveDefaultPosition());
  installDrag();
  restorePosition();

  function destroy() {
    cancelTimeout(closeTimer);
    isOpenState = false;
    syncExpanded();
    documentObject.removeEventListener('pointerdown', onDocumentPointerDown, true);
    documentObject.removeEventListener('keydown', onDocumentKeydown);
    windowObject.removeEventListener?.('resize', onWindowResize);
    buttonEl.remove();
    panelEl.remove();
  }

  // Re-measure and re-place the panel after the body content changes size.
  function reposition() {
    if (isOpenState) positionPanel();
  }

  return {
    cssText: WIDGET_SHELL_CSS,
    buttonEl,
    panelEl,
    open,
    close,
    toggle,
    reposition,
    isOpen: () => isOpenState,
    destroy,
  };
}

export {
  createWidgetShell,
};
