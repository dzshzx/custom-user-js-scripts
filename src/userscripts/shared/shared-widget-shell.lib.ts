import { autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/dom';
import type { ComputePositionReturn, Placement, ReferenceElement, Strategy } from '@floating-ui/dom';

export type DockSide = 'left' | 'right';

export interface AnchorPosition {
  left: number;
  top: number;
  dockSide: DockSide | null;
}

// What applyPosition accepts: missing coordinates keep the current ones and an
// unknown dockSide counts as undocked.
export interface AnchorPositionInput {
  left?: number;
  top?: number;
  dockSide?: unknown;
}

export interface WidgetSize {
  width?: number;
  height?: number;
}

export interface WidgetTimers {
  setTimeout(callback: () => void, ms?: number): number;
  clearTimeout(timer: number | null | undefined): void;
}

const BUTTON_SAFE_MARGIN = 12;
const DOCK_THRESHOLD = 32;
const DOCK_OFFSET = 8;
const PANEL_SAFE_MARGIN = 12;
const PANEL_GAP = 8;
const DRAG_THRESHOLD_PX = 4;
const HOVER_INTENT_MS = 150;
const FALLBACK_BUTTON_SIZE = 44;
const PANEL_ANIMATION_MS = 200;
const PANEL_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function isDockSide(value: unknown): value is DockSide {
  return value === 'left' || value === 'right';
}

function appendClasses(el: Element, classes: unknown) {
  const list = String(classes ?? '')
    .split(/\s+/)
    .filter(Boolean);
  if (list.length) el.classList.add(...list);
}

function eventContainsNode(event: Event, node: Node | null | undefined) {
  if (!node) return false;
  const path = event.composedPath?.();
  return Array.isArray(path) ? path.includes(node) : node.contains(event.target as Node | null);
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

function windowTimers(windowObject: Window | null | undefined): WidgetTimers {
  return {
    setTimeout:
      typeof windowObject?.setTimeout === 'function'
        ? windowObject.setTimeout.bind(windowObject)
        : (callback: () => void, ms?: number) => setTimeout(callback, ms),
    clearTimeout:
      typeof windowObject?.clearTimeout === 'function'
        ? windowObject.clearTimeout.bind(windowObject)
        : (timer: number | null | undefined) => clearTimeout(timer as number | undefined),
  };
}

/**
 * Owns a fixed-position anchor's place on screen: viewport clamping, pointer
 * drag with capture, edge docking and the post-drag click suppression. The
 * anchor is the element that moves; the handle is where the drag starts (the
 * same node for a plain floating button). Persistence stays with the caller
 * through `onDrop`, so each script keeps its own storage key and value shape.
 */
export interface DragAnchorOptions {
  anchorEl: HTMLElement;
  handleEl?: HTMLElement;
  draggingEl?: HTMLElement;
  windowObject: Window;
  measure?: () => WidgetSize | null | undefined;
  dock?: boolean;
  timers?: WidgetTimers;
  onDragStart?: () => void;
  onMove?: (position: AnchorPosition) => void;
  onDrop?: (position: AnchorPosition) => void;
}

export interface DragAnchor {
  applyPosition(next?: AnchorPositionInput | null): AnchorPosition;
  clampPosition(left: number, top: number): { left: number; top: number };
  getPosition(): AnchorPosition;
  isDragSuppressed(): boolean;
  destroy(): void;
}

function createDragAnchor(
  {
    anchorEl,
    handleEl = anchorEl,
    draggingEl = anchorEl,
    windowObject,
    measure,
    dock = true,
    timers = windowTimers(windowObject),
    onDragStart,
    onMove,
    onDrop,
  }: DragAnchorOptions = {} as DragAnchorOptions,
): DragAnchor {
  let position: AnchorPosition = { left: 0, top: 0, dockSide: null };
  let dragState: {
    pointerId: number;
    startX: number;
    startY: number;
    startLeft: number;
    startTop: number;
    moved: boolean;
  } | null = null;
  let suppressed = false;
  let suppressionTimer: number | null = null;
  const cleanups: Array<() => void> = [];

  const size = () => {
    const measured: WidgetSize = measure?.() || {};
    return {
      width: measured.width || FALLBACK_BUTTON_SIZE,
      height: measured.height || FALLBACK_BUTTON_SIZE,
    };
  };

  function clampPosition(left: number, top: number) {
    const { width, height } = size();
    const maxLeft = Math.max(BUTTON_SAFE_MARGIN, windowObject.innerWidth - width - BUTTON_SAFE_MARGIN);
    const maxTop = Math.max(BUTTON_SAFE_MARGIN, windowObject.innerHeight - height - BUTTON_SAFE_MARGIN);
    return {
      left: Math.min(Math.max(BUTTON_SAFE_MARGIN, left), maxLeft),
      top: Math.min(Math.max(BUTTON_SAFE_MARGIN, top), maxTop),
    };
  }

  function dockedPosition(dockSide: DockSide, top: number) {
    const { width } = size();
    return {
      left: dockSide === 'right' ? windowObject.innerWidth - DOCK_OFFSET - width : DOCK_OFFSET,
      top: clampPosition(0, top).top,
    };
  }

  function detectDockSide(left: number): DockSide | null {
    const { width } = size();
    if (left <= DOCK_THRESHOLD) return 'left';
    if (windowObject.innerWidth - (left + width) <= DOCK_THRESHOLD) return 'right';
    return null;
  }

  function applyPosition(next: AnchorPositionInput | null | undefined = position): AnchorPosition {
    const dockSide = dock && isDockSide(next?.dockSide) ? next.dockSide : null;
    const resolved = dockSide
      ? dockedPosition(dockSide, next?.top ?? position.top)
      : clampPosition(next?.left ?? position.left, next?.top ?? position.top);
    position = { ...resolved, dockSide };

    if (dockSide) {
      anchorEl.dataset.wkDocked = dockSide;
    } else {
      delete anchorEl.dataset.wkDocked;
    }
    anchorEl.style.top = `${Math.round(resolved.top)}px`;
    anchorEl.style.bottom = 'auto';
    if (dockSide === 'right') {
      anchorEl.style.left = 'auto';
      anchorEl.style.right = `${DOCK_OFFSET}px`;
    } else {
      anchorEl.style.left = `${Math.round(resolved.left)}px`;
      anchorEl.style.right = 'auto';
    }
    onMove?.(position);
    return position;
  }

  function listen<K extends keyof HTMLElementEventMap>(type: K, handler: (event: HTMLElementEventMap[K]) => void) {
    handleEl.addEventListener(type, handler);
    cleanups.push(() => handleEl.removeEventListener(type, handler));
  }

  function releaseCapture(pointerId: number) {
    try {
      if (handleEl.hasPointerCapture?.(pointerId)) handleEl.releasePointerCapture(pointerId);
    } catch {
      // Ignore pointer capture implementations that cannot report synthetic pointers.
    }
  }

  listen('pointerdown', (event) => {
    if (event.button !== 0) return;
    dragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: position.left,
      startTop: position.top,
      moved: false,
    };
    draggingEl.classList.add('is-dragging');
    try {
      handleEl.setPointerCapture?.(event.pointerId);
    } catch {
      // Some synthetic or older pointer implementations do not support capture.
    }
  });

  listen('pointermove', (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    const dx = event.clientX - dragState.startX;
    const dy = event.clientY - dragState.startY;
    if (!dragState.moved && Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD_PX) {
      dragState.moved = true;
      suppressed = true;
      onDragStart?.();
    }
    if (!dragState.moved) return;
    applyPosition({ left: dragState.startLeft + dx, top: dragState.startTop + dy, dockSide: null });
  });

  function finishDrag(event: PointerEvent) {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    const moved = dragState.moved;
    dragState = null;
    draggingEl.classList.remove('is-dragging');
    releaseCapture(event.pointerId);
    if (!moved) return;

    applyPosition({ ...position, dockSide: dock ? detectDockSide(position.left) : null });
    onDrop?.(position);

    // The click that trails a drag must not count as activation.
    timers.clearTimeout(suppressionTimer);
    suppressionTimer = timers.setTimeout(() => {
      suppressionTimer = null;
      suppressed = false;
    }, 0);
  }

  listen('pointerup', finishDrag);
  listen('pointercancel', finishDrag);

  return {
    applyPosition,
    clampPosition,
    getPosition: () => position,
    isDragSuppressed: () => suppressed,
    destroy() {
      if (dragState) releaseCapture(dragState.pointerId);
      dragState = null;
      draggingEl.classList.remove('is-dragging');
      timers.clearTimeout(suppressionTimer);
      suppressionTimer = null;
      suppressed = false;
      for (const cleanup of cleanups.splice(0)) cleanup();
    },
  };
}

/**
 * Hover/focus disclosure for a compact widget: hover expands after a short
 * intent delay (leaving first cancels it); coarse pointers without hover
 * toggle with a click on the trigger instead. Focus inside expands, focus
 * leaving collapses. `is-expanded` goes on the container.
 */
export interface HoverExpansionOptions {
  container: HTMLElement;
  trigger: HTMLElement;
  isCoarsePointer?: () => boolean;
  isSuppressed?: () => boolean;
  hoverIntentMs?: number;
  timers: WidgetTimers;
}

export interface HoverExpansion {
  setExpanded(isExpanded: boolean): void;
  destroy(): void;
}

function createHoverExpansion(
  {
    container,
    trigger,
    isCoarsePointer = () => false,
    isSuppressed = () => false,
    hoverIntentMs = HOVER_INTENT_MS,
    timers,
  }: HoverExpansionOptions = {} as HoverExpansionOptions,
): HoverExpansion {
  let hoverTimer: number | null = null;
  let active = true;
  const cleanups: Array<() => void> = [];

  function listen<K extends keyof HTMLElementEventMap>(
    target: HTMLElement,
    type: K,
    handler: (event: HTMLElementEventMap[K]) => void,
  ) {
    const guarded = (event: HTMLElementEventMap[K]) => {
      if (active) handler(event);
    };
    target.addEventListener(type, guarded);
    cleanups.push(() => target.removeEventListener(type, guarded));
  }

  function setExpanded(isExpanded: boolean) {
    if (isExpanded && isSuppressed()) return;
    container.classList.toggle('is-expanded', isExpanded);
  }

  function cancelHover() {
    timers.clearTimeout(hoverTimer);
    hoverTimer = null;
  }

  if (isCoarsePointer()) {
    listen(trigger, 'click', () => {
      if (isSuppressed()) return;
      setExpanded(!container.classList.contains('is-expanded'));
    });
  } else {
    listen(container, 'mouseenter', () => {
      cancelHover();
      hoverTimer = timers.setTimeout(() => {
        hoverTimer = null;
        if (active) setExpanded(true);
      }, hoverIntentMs);
    });
    listen(container, 'mouseleave', () => {
      cancelHover();
      setExpanded(false);
    });
  }
  listen(container, 'focusin', () => setExpanded(true));
  listen(container, 'focusout', (event) => {
    if (!event.relatedTarget || !container.contains(event.relatedTarget as Node)) setExpanded(false);
  });

  return {
    setExpanded,
    destroy() {
      active = false;
      cancelHover();
      container.classList.remove('is-expanded');
      for (const cleanup of cleanups.splice(0)) cleanup();
    },
  };
}

/**
 * Places a panel against its reference with @floating-ui/dom: the preferred
 * side flips when it does not fit and the panel shifts to stay inside the
 * viewport margin. `start()` keeps it placed while the reference moves or
 * resizes (autoUpdate); `update()` places it once. `apply` receives the
 * floating-ui result and writes the coordinates the host CSS expects.
 */
export interface PanelPlacementOptions {
  reference: ReferenceElement;
  floating: HTMLElement;
  placement?: Placement;
  strategy?: Strategy;
  gap?: number;
  margin?: number;
  apply: (result: ComputePositionReturn) => void;
}

export interface PanelPlacement {
  update(): Promise<ComputePositionReturn | null>;
  start(): void;
  stop(): void;
}

function createPanelPlacement(
  {
    reference,
    floating,
    placement = 'bottom-end',
    strategy = 'fixed',
    gap = PANEL_GAP,
    margin = PANEL_SAFE_MARGIN,
    apply,
  }: PanelPlacementOptions = {} as PanelPlacementOptions,
): PanelPlacement {
  let stopAutoUpdate: (() => void) | null = null;
  let generation = 0;

  async function update() {
    const current = ++generation;
    const result = await computePosition(reference, floating, {
      placement,
      strategy,
      middleware: [
        offset(gap),
        flip({ padding: margin, flipAlignment: false }),
        shift({ padding: margin, crossAxis: true }),
      ],
    });
    // A newer update or stop() supersedes this one.
    if (current !== generation) return null;
    apply(result);
    return result;
  }

  function stop() {
    generation += 1;
    stopAutoUpdate?.();
    stopAutoUpdate = null;
  }

  return {
    update,
    start() {
      stop();
      stopAutoUpdate = autoUpdate(reference, floating, () => {
        update().catch(() => {});
      });
    },
    stop,
  };
}

type PersistedPosition = { left: number; top: number; dockSide?: DockSide };

export interface WidgetShellStorage {
  get?(key: string): unknown;
  set?(key: string, value: string): unknown;
}

export interface WidgetShellOptions {
  root: HTMLElement;
  buttonId?: string;
  buttonAriaLabel?: string;
  buttonContent?: string | Node | null;
  buttonClass?: string;
  panelClass?: string;
  panelWidth?: number;
  panelMaxHeight?: number;
  storage?: WidgetShellStorage | null;
  positionKey?: string;
  // Non-finite values fall back to the defaults.
  defaultPosition?: { top: number; right: number };
  dock?: boolean;
  onOpen?: () => void;
  onClose?: () => void;
  renderPanelHeader?: (headerEl: HTMLDivElement) => void;
  renderPanelBody?: (bodyEl: HTMLDivElement) => void;
}

export interface WidgetShell {
  cssText: string;
  buttonEl: HTMLButtonElement;
  panelEl: HTMLDivElement;
  open(): void;
  close(): void;
  toggle(): void;
  reposition(): Promise<ComputePositionReturn | null>;
  isOpen(): boolean;
  destroy(): void;
}

function createWidgetShell(
  {
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
  }: WidgetShellOptions = {} as WidgetShellOptions,
): WidgetShell {
  if (!root?.append) {
    throw new Error('shared-widget-shell: createWidgetShell requires a root element.');
  }
  const documentObject = root.ownerDocument ?? globalThis.document;
  if (!documentObject?.createElement) {
    throw new Error('shared-widget-shell: root must expose ownerDocument.');
  }
  const windowObject = documentObject.defaultView ?? globalThis.window ?? globalThis;
  const timers = windowTimers(windowObject);
  const scheduleTimeout = timers.setTimeout;
  const cancelTimeout = timers.clearTimeout;
  const requestFrame =
    typeof windowObject.requestAnimationFrame === 'function'
      ? windowObject.requestAnimationFrame.bind(windowObject)
      : (callback: () => void) => scheduleTimeout(callback, 16);

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

  let isOpenState = false;
  let closeTimer: number | null = null;

  function measureButton() {
    const rect = buttonEl.getBoundingClientRect?.();
    return {
      width: rect?.width || buttonEl.offsetWidth || FALLBACK_BUTTON_SIZE,
      height: rect?.height || buttonEl.offsetHeight || FALLBACK_BUTTON_SIZE,
    };
  }

  const anchor = createDragAnchor({
    anchorEl: buttonEl,
    windowObject,
    measure: measureButton,
    dock,
    timers,
    onMove() {
      if (isOpenState) positionPanel();
    },
    onDrop() {
      persistPosition();
    },
  });

  const placement = createPanelPlacement({
    reference: buttonEl,
    floating: panelEl,
    placement: 'bottom-end',
    strategy: 'fixed',
    apply({ x, y, placement: side }) {
      const position = anchor.getPosition();
      const { width: buttonWidth, height: buttonHeight } = measureButton();
      const width = panelEl.offsetWidth || Number.parseFloat(panelEl.style.width) || panelWidth;
      const height = panelEl.offsetHeight || Number.parseFloat(panelEl.style.maxHeight) || panelMaxHeight;
      panelEl.style.left = `${Math.round(x)}px`;
      panelEl.style.top = `${Math.round(y)}px`;
      const originX = Math.min(Math.max(position.left + buttonWidth / 2 - x, 24), width - 24);
      const originY = Math.min(Math.max(position.top + buttonHeight / 2 - y, 24), height - 24);
      panelEl.style.transformOrigin = `${Math.round(originX)}px ${Math.round(originY)}px`;
      panelEl.dataset.wkPlacement = side.startsWith('top') ? 'above' : 'below';
    },
  });

  function resolveDefaultPosition() {
    const { width } = measureButton();
    const top = Number.isFinite(defaultPosition?.top) ? defaultPosition.top : 76;
    const right = Number.isFinite(defaultPosition?.right) ? defaultPosition.right : 24;
    return { left: windowObject.innerWidth - right - width, top };
  }

  async function persistPosition() {
    if (!storage?.set || !positionKey) return;
    const position = anchor.getPosition();
    const value: PersistedPosition = { left: Math.round(position.left), top: Math.round(position.top) };
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
        anchor.applyPosition({
          left: parsed.left,
          top: parsed.top,
          dockSide: isDockSide(parsed.dockSide) ? parsed.dockSide : null,
        });
      }
    } catch {
      // Ignore invalid persisted UI state.
    }
  }

  // Size is decided here; floating-ui decides where it goes (flip below/above,
  // shift inside the safe margin) and applies it asynchronously.
  function positionPanel() {
    const safe = PANEL_SAFE_MARGIN;
    const width = Math.min(panelWidth, windowObject.innerWidth - safe * 2);
    const maxHeight = Math.min(panelMaxHeight, windowObject.innerHeight - safe * 2);
    panelEl.style.width = `${Math.round(width)}px`;
    panelEl.style.maxHeight = `${Math.round(maxHeight)}px`;
    return placement.update().catch(() => null);
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
    placement.start();
    buttonEl.classList.add('is-active');
    syncExpanded();
    requestFrame(() => {
      if (isOpenState) panelEl.classList.add('is-open');
    });
    const focusTarget = panelEl.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    focusTarget?.focus?.();
    onOpen?.();
  }

  function close() {
    if (!isOpenState) return;
    isOpenState = false;
    placement.stop();
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

  function onDocumentPointerDown(event: PointerEvent) {
    if (!isOpenState) return;
    if (eventContainsNode(event, panelEl) || eventContainsNode(event, buttonEl)) return;
    close();
  }

  function onDocumentKeydown(event: KeyboardEvent) {
    if (!isOpenState) return;
    if (event.key === 'Escape') close();
  }

  function onWindowResize() {
    anchor.applyPosition();
  }

  buttonEl.addEventListener('click', () => {
    if (anchor.isDragSuppressed()) return;
    toggle();
  });
  documentObject.addEventListener('pointerdown', onDocumentPointerDown, true);
  documentObject.addEventListener('keydown', onDocumentKeydown);
  windowObject.addEventListener?.('resize', onWindowResize);

  anchor.applyPosition(resolveDefaultPosition());
  restorePosition();

  function destroy() {
    cancelTimeout(closeTimer);
    isOpenState = false;
    placement.stop();
    anchor.destroy();
    syncExpanded();
    documentObject.removeEventListener('pointerdown', onDocumentPointerDown, true);
    documentObject.removeEventListener('keydown', onDocumentKeydown);
    windowObject.removeEventListener?.('resize', onWindowResize);
    buttonEl.remove();
    panelEl.remove();
  }

  // Re-measure and re-place the panel after the body content changes size.
  function reposition() {
    return isOpenState ? positionPanel() : Promise.resolve(null);
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

export { createWidgetShell, createDragAnchor, createHoverExpansion, createPanelPlacement };
