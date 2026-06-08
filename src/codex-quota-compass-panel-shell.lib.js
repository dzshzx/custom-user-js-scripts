(function attachCodexQuotaCompassPanelShellLib(globalObject) {
  'use strict';

  const LIB_NAME = 'CodexQuotaCompassPanelShellLib';
  const DEFAULT_BUTTON_POSITION = { top: 76, right: 24 };
  const BUTTON_FULL_WIDTH = 168;
  const BUTTON_HEIGHT = 42;
  const BUTTON_SAFE = 12;
  const BUTTON_DOCK_OFFSET = 8;
  const BUTTON_DOCK_THRESHOLD = 32;
  const PANEL_OPEN_ANIMATION_MS = 220;
  const PANEL_CLOSE_ANIMATION_MS = PANEL_OPEN_ANIMATION_MS * 2;
  const PANEL_OPEN_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
  const PANEL_CLOSE_EASING = 'cubic-bezier(0.64, 0, 0.78, 0)';

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function isDockSide(value) {
    return value === 'left' || value === 'right';
  }

  function createShellMarkup(labels = {}) {
    return `
      <button type="button" class="cqc-button" data-action="toggle" aria-expanded="false" aria-label="${escapeHtml(labels.buttonAriaOpen || '')}">
        <span class="cqc-dot" aria-hidden="true"></span>
        <span class="cqc-button-text">
          <span class="cqc-button-title">${escapeHtml(labels.buttonTitle || '')}</span>
          <span class="cqc-status" data-tone="idle">${escapeHtml(labels.statusIdle || '')}</span>
        </span>
      </button>
      <div class="cqc-panel" hidden>
        <div class="cqc-panel-header">
          <div class="cqc-panel-title">
            <span class="cqc-dot" aria-hidden="true"></span>
            <span>${escapeHtml(labels.panelTitle || '')}</span>
          </div>
          <div class="cqc-panel-actions">
            <button type="button" class="cqc-refresh" data-action="refresh">${escapeHtml(labels.actionRefresh || '')}</button>
            <button type="button" class="cqc-icon-button" data-action="close" aria-label="${escapeHtml(labels.closeAria || 'Close')}">
              <span class="cqc-close-icon" aria-hidden="true"></span>
            </button>
          </div>
        </div>
        <div class="cqc-content"></div>
      </div>
    `;
  }

  function shellStyles(rootId) {
    return `
      #${rootId} {
        color-scheme: light dark;
        font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
        --cqc-primary: #10a37f;
        --cqc-primary-soft: #34d399;
        --cqc-accent: #f59e0b;
        --cqc-surface: #ffffff;
        --cqc-surface-muted: #f8fafc;
        --cqc-text: #202123;
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        pointer-events: none;
      }

      #${rootId} * {
        box-sizing: border-box;
      }

      .cqc-button {
        position: fixed;
        z-index: 1;
        display: inline-flex;
        align-items: center;
        justify-content: flex-start;
        gap: 8px;
        width: ${BUTTON_FULL_WIDTH}px;
        min-width: ${BUTTON_HEIGHT}px;
        height: 42px;
        border: 1px solid rgba(0, 0, 0, 0.12);
        border-radius: 999px;
        padding: 0 14px;
        background: rgba(248, 250, 252, 0.95);
        color: var(--cqc-text);
        box-shadow: 0 8px 28px rgba(0, 0, 0, 0.14);
        cursor: pointer;
        pointer-events: auto;
        user-select: none;
        backdrop-filter: blur(18px);
        overflow: hidden;
        transition:
          width 160ms ease,
          padding 160ms ease,
          opacity 160ms ease,
          background-color 160ms ease,
          border-color 160ms ease,
          box-shadow 160ms ease;
      }

      .cqc-button:active,
      .cqc-button.is-dragging {
        cursor: grabbing;
      }

      .cqc-button.is-active {
        border-color: rgba(30, 64, 175, 0.45);
        box-shadow: 0 10px 32px rgba(30, 64, 175, 0.22);
      }

      .cqc-button:focus-visible,
      .cqc-refresh:focus-visible,
      .cqc-icon-button:focus-visible,
      .cqc-detail-footnote button:focus-visible {
        outline: 2px solid var(--cqc-primary-soft);
        outline-offset: 2px;
      }

      .cqc-button.is-docked {
        width: ${BUTTON_HEIGHT}px;
        gap: 0;
        padding: 0;
        justify-content: center;
        background: rgba(255, 255, 255, 0.62);
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
        opacity: 0.72;
      }

      .cqc-button.is-docked:hover,
      .cqc-button.is-docked:focus-visible,
      .cqc-button.is-docked.is-active,
      .cqc-button.is-docked.is-dragging {
        width: ${BUTTON_FULL_WIDTH}px;
        gap: 8px;
        padding: 0 14px;
        justify-content: flex-start;
        background: rgba(255, 255, 255, 0.94);
        opacity: 1;
      }

      .cqc-button.is-panel-source-hidden,
      .cqc-button.is-docked.is-panel-source-hidden {
        opacity: 0;
        pointer-events: none;
      }

      .cqc-button.is-docked.is-hover-locked {
        width: ${BUTTON_HEIGHT}px;
        gap: 0;
        padding: 0;
        justify-content: center;
        background: rgba(255, 255, 255, 0.62);
        opacity: 0.72;
      }

      .cqc-button.is-docked.is-hover-locked .cqc-button-text,
      .cqc-button.is-docked .cqc-button-text {
        max-width: 0;
        opacity: 0;
        transform: translateX(-4px);
      }

      .cqc-button-text {
        display: grid;
        gap: 1px;
        text-align: left;
        line-height: 1.1;
        max-width: 116px;
        overflow: hidden;
        transition:
          max-width 160ms ease,
          opacity 140ms ease,
          transform 160ms ease;
      }

      .cqc-button.is-docked:hover .cqc-button-text,
      .cqc-button.is-docked:focus-visible .cqc-button-text,
      .cqc-button.is-docked.is-active .cqc-button-text,
      .cqc-button.is-docked.is-dragging .cqc-button-text {
        max-width: 116px;
        opacity: 1;
        transform: translateX(0);
      }

      .cqc-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: var(--cqc-primary);
        box-shadow: 0 0 0 4px rgba(30, 64, 175, 0.14);
        flex: 0 0 auto;
      }

      .cqc-button-title {
        font-size: 13px;
        font-weight: 650;
      }

      .cqc-status {
        color: #6e6e80;
        font-size: 11px;
      }

      .cqc-status[data-tone="loading"] { color: #0f7f67; }
      .cqc-status[data-tone="success"] { color: var(--cqc-primary); }
      .cqc-status[data-tone="error"] { color: #d92d20; }

      .cqc-panel {
        position: fixed;
        z-index: 2;
        top: 88px;
        right: auto;
        width: min(560px, calc(100vw - 32px));
        height: auto;
        max-height: min(760px, calc(100vh - 24px));
        border: 1px solid rgba(0, 0, 0, 0.12);
        border-radius: 12px;
        background: var(--cqc-surface);
        color: var(--cqc-text);
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.22);
        overflow: hidden;
        pointer-events: auto;
        opacity: 0;
        transition:
          left ${PANEL_OPEN_ANIMATION_MS}ms ${PANEL_OPEN_EASING},
          top ${PANEL_OPEN_ANIMATION_MS}ms ${PANEL_OPEN_EASING},
          width ${PANEL_OPEN_ANIMATION_MS}ms ${PANEL_OPEN_EASING},
          height ${PANEL_OPEN_ANIMATION_MS}ms ${PANEL_OPEN_EASING},
          border-radius ${PANEL_OPEN_ANIMATION_MS}ms ${PANEL_OPEN_EASING},
          opacity 120ms ease;
      }

      .cqc-panel.is-open {
        opacity: 1;
      }

      .cqc-panel.is-closing {
        transition:
          left ${PANEL_CLOSE_ANIMATION_MS}ms ${PANEL_CLOSE_EASING},
          top ${PANEL_CLOSE_ANIMATION_MS}ms ${PANEL_CLOSE_EASING},
          width ${PANEL_CLOSE_ANIMATION_MS}ms ${PANEL_CLOSE_EASING},
          height ${PANEL_CLOSE_ANIMATION_MS}ms ${PANEL_CLOSE_EASING},
          border-radius ${PANEL_CLOSE_ANIMATION_MS}ms ${PANEL_CLOSE_EASING},
          opacity ${PANEL_CLOSE_ANIMATION_MS}ms ease;
      }

      .cqc-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-height: 48px;
        padding: 12px 14px;
        border-bottom: 1px solid rgba(0, 0, 0, 0.08);
        background: #f7f7f8;
        opacity: 0;
        transition: opacity 120ms ease 80ms;
      }

      .cqc-panel-title {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
        font-size: 14px;
        font-weight: 650;
      }

      .cqc-panel-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .cqc-icon-button,
      .cqc-refresh {
        border: 1px solid rgba(0, 0, 0, 0.12);
        border-radius: 8px;
        background: #ffffff;
        color: #202123;
        min-height: 32px;
        padding: 0 10px;
        font-size: 13px;
        cursor: pointer;
      }

      .cqc-icon-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        position: relative;
        width: 32px;
        height: 32px;
        min-height: 32px;
        padding: 0;
        font-size: 18px;
        line-height: 1;
      }

      .cqc-close-icon {
        position: relative;
        width: 14px;
        height: 14px;
        display: block;
        flex: 0 0 auto;
      }

      .cqc-close-icon::before,
      .cqc-close-icon::after {
        content: "";
        position: absolute;
        left: 50%;
        top: 50%;
        width: 14px;
        height: 2px;
        border-radius: 999px;
        background: currentColor;
        transform-origin: center;
      }

      .cqc-close-icon::before {
        transform: translate(-50%, -50%) rotate(45deg);
      }

      .cqc-close-icon::after {
        transform: translate(-50%, -50%) rotate(-45deg);
      }

      .cqc-refresh:hover,
      .cqc-icon-button:hover {
        background: #ececf1;
      }

      .cqc-content {
        height: calc(100% - 49px);
        overflow: auto;
        padding: 14px;
        opacity: 0;
        transition: opacity 120ms ease 100ms;
      }

      .cqc-panel.is-open .cqc-panel-header,
      .cqc-panel.is-open .cqc-content {
        opacity: 1;
      }

      @media (prefers-reduced-motion: reduce) {
        .cqc-button,
        .cqc-panel,
        .cqc-panel-header,
        .cqc-content {
          transition: none !important;
        }
      }

      @media (max-width: 720px) {
        .cqc-panel {
          width: calc(100vw - 24px);
          height: auto;
          max-height: calc(100vh - 24px);
        }

        .cqc-content {
          height: calc(100% - 49px);
        }
      }

      @media (prefers-color-scheme: dark) {
        .cqc-button,
        .cqc-panel,
        .cqc-icon-button,
        .cqc-refresh {
          background: #2f2f2f;
          color: #ececf1;
          border-color: rgba(255, 255, 255, 0.14);
        }

        .cqc-button.is-docked {
          background: rgba(47, 47, 47, 0.64);
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.24);
        }

        .cqc-button.is-docked:hover,
        .cqc-button.is-docked:focus-visible,
        .cqc-button.is-docked.is-active,
        .cqc-button.is-docked.is-dragging {
          background: rgba(47, 47, 47, 0.96);
        }

        .cqc-panel-header {
          background: #212121;
          border-color: rgba(255, 255, 255, 0.12);
        }

        .cqc-status {
          color: #b4b4b4;
        }

        .cqc-refresh:hover,
        .cqc-icon-button:hover {
          background: #3f3f3f;
        }
      }
    `;
  }

  function eventContainsNode(event, node) {
    if (!node) return false;
    const path = event.composedPath?.();
    return Array.isArray(path) ? path.includes(node) : node.contains(event.target);
  }

  function createFloatingPanelShell({
    rootId,
    labels = {},
    positionKey = `${rootId}:buttonPosition`,
    document: documentObject = globalObject.document,
    window: windowObject = globalObject,
    storage = globalObject.localStorage,
    onAction = () => {},
  } = {}) {
    if (!rootId) {
      throw new Error('Floating panel shell requires rootId.');
    }
    if (!documentObject?.createElement || !documentObject?.documentElement) {
      throw new Error('Floating panel shell requires a document adapter.');
    }
    if (!windowObject) {
      throw new Error('Floating panel shell requires a window adapter.');
    }

    let root = null;
    let panel = null;
    let button = null;
    let statusNode = null;
    let contentNode = null;
    let isPanelOpen = false;
    let buttonDockSide = null;
    let panelCloseTimer = null;
    let suppressNextButtonClick = false;

    function refs() {
      return { root, button, panel, statusNode, contentNode };
    }

    function setStatus(text, tone = 'idle') {
      if (!statusNode) return;
      statusNode.textContent = text;
      statusNode.dataset.tone = tone;
    }

    function syncPanelExpandedState() {
      button?.setAttribute?.('aria-expanded', isPanelOpen ? 'true' : 'false');
    }

    function loadButtonPosition() {
      try {
        const parsed = JSON.parse(storage?.getItem(positionKey) || 'null');
        if (
          parsed
          && Number.isFinite(parsed.left)
          && Number.isFinite(parsed.top)
        ) {
          return {
            left: parsed.left,
            top: parsed.top,
            dockSide: isDockSide(parsed.dockSide) ? parsed.dockSide : detectDockSide(parsed.left),
          };
        }
      } catch {
        // Ignore invalid persisted UI state.
      }

      return null;
    }

    function persistButtonPosition(left, top, dockSide = buttonDockSide) {
      const value = {
        left: Math.round(left),
        top: Math.round(top),
      };

      if (isDockSide(dockSide)) {
        value.dockSide = dockSide;
      }

      storage?.setItem(positionKey, JSON.stringify(value));
    }

    function setButtonDockSide(dockSide) {
      buttonDockSide = isDockSide(dockSide) ? dockSide : null;

      if (!button) return;

      button.classList.toggle('is-docked', Boolean(buttonDockSide));

      if (!buttonDockSide) {
        button.classList.remove('is-hover-locked');
      }

      if (buttonDockSide) {
        button.dataset.dockSide = buttonDockSide;
      } else {
        delete button.dataset.dockSide;
      }
    }

    function clampButtonPosition(left, top, options = {}) {
      const width = options.width || BUTTON_FULL_WIDTH;
      const height = options.height || BUTTON_HEIGHT;
      const safe = options.safe ?? BUTTON_SAFE;
      const maxLeft = Math.max(safe, windowObject.innerWidth - width - safe);
      const maxTop = Math.max(safe, windowObject.innerHeight - height - safe);

      return {
        left: Math.min(Math.max(safe, left), maxLeft),
        top: Math.min(Math.max(safe, top), maxTop),
      };
    }

    function dockedButtonPosition(dockSide, top) {
      const clamped = clampButtonPosition(0, top);

      return {
        left:
          dockSide === 'right'
            ? windowObject.innerWidth - BUTTON_DOCK_OFFSET - BUTTON_FULL_WIDTH
            : BUTTON_DOCK_OFFSET,
        top: clamped.top,
      };
    }

    function detectDockSide(left) {
      if (left <= BUTTON_DOCK_THRESHOLD) return 'left';
      if (windowObject.innerWidth - (left + BUTTON_FULL_WIDTH) <= BUTTON_DOCK_THRESHOLD) return 'right';
      return null;
    }

    function getExpandedButtonRect() {
      const rect = button?.getBoundingClientRect();
      const top = rect?.top ?? DEFAULT_BUTTON_POSITION.top;

      if (buttonDockSide === 'left') {
        return {
          left: BUTTON_DOCK_OFFSET,
          right: BUTTON_DOCK_OFFSET + BUTTON_FULL_WIDTH,
          top,
          bottom: top + BUTTON_HEIGHT,
          width: BUTTON_FULL_WIDTH,
          height: BUTTON_HEIGHT,
        };
      }

      if (buttonDockSide === 'right') {
        const right = windowObject.innerWidth - BUTTON_DOCK_OFFSET;
        return {
          left: right - BUTTON_FULL_WIDTH,
          right,
          top,
          bottom: top + BUTTON_HEIGHT,
          width: BUTTON_FULL_WIDTH,
          height: BUTTON_HEIGHT,
        };
      }

      return rect;
    }

    function applyButtonPosition(position) {
      if (!button) return;

      if (position) {
        const dockSide = isDockSide(position.dockSide) ? position.dockSide : null;
        const clamped = dockSide
          ? dockedButtonPosition(dockSide, position.top)
          : clampButtonPosition(position.left, position.top);

        setButtonDockSide(dockSide);
        button.style.top = `${clamped.top}px`;

        if (dockSide === 'right') {
          button.style.left = 'auto';
          button.style.right = `${BUTTON_DOCK_OFFSET}px`;
        } else {
          button.style.left = `${clamped.left}px`;
          button.style.right = 'auto';
        }

        return;
      }

      setButtonDockSide(null);
      button.style.top = `${DEFAULT_BUTTON_POSITION.top}px`;
      button.style.right = `${DEFAULT_BUTTON_POSITION.right}px`;
      button.style.left = 'auto';
    }

    function lockDockedButtonHover() {
      if (!button || !buttonDockSide) return;
      button.blur();
      button.classList.toggle('is-hover-locked', button.matches(':hover'));
    }

    function unlockDockedButtonHover() {
      button?.classList.remove('is-hover-locked');
    }

    function measurePanelNaturalHeight(measureWidth) {
      if (!panel || !Number.isFinite(measureWidth)) return BUTTON_HEIGHT;

      const clone = panel.cloneNode(true);
      clone.hidden = false;
      clone.classList.add('is-open');
      clone.classList.remove('is-closing');
      clone.style.cssText = [
        'position: fixed',
        'left: -9999px',
        'top: 0',
        `width: ${Math.round(measureWidth)}px`,
        'height: auto',
        'max-height: none',
        'min-height: 0',
        'visibility: hidden',
        'pointer-events: none',
        'opacity: 0',
        'transition: none',
        'transform: none',
      ].join(';');

      const cloneHeader = clone.querySelector('.cqc-panel-header');
      if (cloneHeader) {
        cloneHeader.style.opacity = '1';
        cloneHeader.style.transition = 'none';
      }

      const cloneContent = clone.querySelector('.cqc-content');
      if (cloneContent) {
        cloneContent.style.height = 'auto';
        cloneContent.style.maxHeight = 'none';
        cloneContent.style.overflow = 'visible';
        cloneContent.style.opacity = '1';
        cloneContent.style.transition = 'none';
      }

      (root || documentObject.documentElement).append(clone);
      const measuredHeight = Math.ceil(clone.getBoundingClientRect().height);
      clone.remove();

      return measuredHeight || BUTTON_HEIGHT;
    }

    function getPreferredPanelHeight(maxPanelHeight, fallbackHeight = BUTTON_HEIGHT, measureWidth) {
      const naturalHeight = measurePanelNaturalHeight(measureWidth);
      return Math.min(maxPanelHeight, Math.max(fallbackHeight, naturalHeight));
    }

    function getPanelTargetRect(sourceRect) {
      const safe = 12;
      const panelWidth = Math.min(560, windowObject.innerWidth - safe * 2);
      const maxPanelHeight = Math.min(760, windowObject.innerHeight - safe * 2);
      const panelHeight = getPreferredPanelHeight(maxPanelHeight, sourceRect.height, panelWidth);

      const left = Math.min(
        Math.max(safe, sourceRect.right - panelWidth),
        windowObject.innerWidth - panelWidth - safe,
      );
      const top = Math.min(
        Math.max(safe, sourceRect.top),
        windowObject.innerHeight - panelHeight - safe,
      );
      const originX = Math.min(
        Math.max(sourceRect.left + sourceRect.width / 2 - left, 24),
        panelWidth - 24,
      );
      const originY = Math.min(
        Math.max(sourceRect.top + sourceRect.height / 2 - top, 24),
        panelHeight - 24,
      );

      return {
        left,
        top,
        width: panelWidth,
        height: panelHeight,
        originX,
        originY,
        placement:
          sourceRect.top + sourceRect.height / 2 < top + panelHeight / 2
            ? 'below'
            : 'above',
      };
    }

    function applyPanelRect(rect, borderRadius) {
      if (!panel || !rect) return;

      panel.style.left = `${Math.round(rect.left)}px`;
      panel.style.top = `${Math.round(rect.top)}px`;
      panel.style.right = 'auto';
      panel.style.width = `${Math.round(rect.width)}px`;
      panel.style.height = `${Math.round(rect.height)}px`;
      panel.style.borderRadius = `${borderRadius}px`;
    }

    function positionPanelNearButton() {
      if (!panel || !button) return;

      const sourceRect = getExpandedButtonRect();
      if (!sourceRect) return;

      const targetRect = getPanelTargetRect(sourceRect);
      applyPanelRect(targetRect, 12);
      panel.style.transformOrigin = `${Math.round(targetRect.originX)}px ${Math.round(targetRect.originY)}px`;
      panel.dataset.placement = targetRect.placement;
    }

    function schedulePanelResize() {
      if (!isPanelOpen) return;
      windowObject.requestAnimationFrame(() => {
        if (isPanelOpen) positionPanelNearButton();
      });
    }

    function openPanel() {
      if (!panel || !button) return;

      windowObject.clearTimeout(panelCloseTimer);

      const sourceRect = getExpandedButtonRect();
      if (!sourceRect) return;

      isPanelOpen = true;
      syncPanelExpandedState();
      button.classList.add('is-active');
      panel.hidden = false;
      panel.classList.remove('is-open', 'is-closing');
      applyPanelRect(sourceRect, 999);
      button.classList.add('is-panel-source-hidden');

      const targetRect = getPanelTargetRect(sourceRect);
      panel.style.transformOrigin = `${Math.round(targetRect.originX)}px ${Math.round(targetRect.originY)}px`;
      panel.dataset.placement = targetRect.placement;

      windowObject.requestAnimationFrame(() => {
        if (!isPanelOpen) return;
        applyPanelRect(targetRect, 12);
        panel?.classList.add('is-open');
      });
    }

    function closePanel() {
      if (!panel) return;
      windowObject.clearTimeout(panelCloseTimer);

      isPanelOpen = false;
      syncPanelExpandedState();
      const sourceRect = getExpandedButtonRect();
      panel.classList.remove('is-open');
      panel.classList.add('is-closing');

      if (sourceRect) {
        applyPanelRect(sourceRect, 999);
        const panelRect = panel.getBoundingClientRect();
        const originX = sourceRect.left + sourceRect.width / 2 - panelRect.left;
        const originY = sourceRect.top + sourceRect.height / 2 - panelRect.top;
        panel.style.transformOrigin = `${Math.round(originX)}px ${Math.round(originY)}px`;
      }

      panelCloseTimer = windowObject.setTimeout(() => {
        if (!isPanelOpen && panel) {
          panel.hidden = true;
          panel.classList.remove('is-closing');
          button?.classList.remove('is-active', 'is-panel-source-hidden');
          lockDockedButtonHover();
        }
      }, PANEL_CLOSE_ANIMATION_MS);
    }

    function installShellStyles() {
      if (documentObject.getElementById(`${rootId}-shell-style`)) return;

      const style = documentObject.createElement('style');
      style.id = `${rootId}-shell-style`;
      style.textContent = shellStyles(rootId);
      documentObject.head.append(style);
    }

    function installDrag() {
      let dragState = null;

      button.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        unlockDockedButtonHover();

        const rect = getExpandedButtonRect() || button.getBoundingClientRect();
        button.classList.add('is-dragging');
        dragState = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          startLeft: rect.left,
          startTop: rect.top,
          moved: false,
        };
        button.setPointerCapture(event.pointerId);
      });

      button.addEventListener('pointermove', (event) => {
        if (!dragState || dragState.pointerId !== event.pointerId) return;

        const dx = event.clientX - dragState.startX;
        const dy = event.clientY - dragState.startY;
        if (Math.abs(dx) + Math.abs(dy) > 4) dragState.moved = true;

        if (dragState.moved && buttonDockSide) {
          setButtonDockSide(null);
        }

        const next = clampButtonPosition(
          dragState.startLeft + dx,
          dragState.startTop + dy,
        );
        applyButtonPosition(next);
        if (isPanelOpen) positionPanelNearButton();
      });

      function finishDrag(event) {
        if (!dragState || dragState.pointerId !== event.pointerId) return;

        const moved = dragState.moved;
        dragState = null;
        button.classList.remove('is-dragging');

        if (button.hasPointerCapture(event.pointerId)) {
          button.releasePointerCapture(event.pointerId);
        }

        const rect = button.getBoundingClientRect();

        if (moved) {
          const dockSide = detectDockSide(rect.left);
          const next = dockSide
            ? { ...dockedButtonPosition(dockSide, rect.top), dockSide }
            : clampButtonPosition(rect.left, rect.top);

          applyButtonPosition(next);
          persistButtonPosition(next.left, next.top, dockSide);

          if (isPanelOpen) positionPanelNearButton();
        } else {
          persistButtonPosition(rect.left, rect.top);
        }

        if (moved) {
          suppressNextButtonClick = true;
          windowObject.setTimeout(() => {
            suppressNextButtonClick = false;
          }, 0);
        }
      }

      button.addEventListener('pointerup', finishDrag);
      button.addEventListener('pointercancel', finishDrag);
      button.addEventListener('pointerenter', unlockDockedButtonHover);
      button.addEventListener('pointerleave', unlockDockedButtonHover);
    }

    function installOutsideClose() {
      documentObject.addEventListener(
        'pointerdown',
        (event) => {
          if (!isPanelOpen) return;
          if (eventContainsNode(event, root)) return;
          closePanel();
        },
        true,
      );
    }

    function mount() {
      if (documentObject.getElementById(rootId)) return null;

      installShellStyles();

      root = documentObject.createElement('div');
      root.id = rootId;
      root.innerHTML = createShellMarkup(labels);
      documentObject.documentElement.append(root);

      button = root.querySelector('.cqc-button');
      panel = root.querySelector('.cqc-panel');
      statusNode = root.querySelector('.cqc-status');
      contentNode = root.querySelector('.cqc-content');

      root.addEventListener('click', (event) => {
        const actionNode = event.target?.closest?.('[data-action]');
        const action = actionNode?.dataset?.action;
        if (!action) return;

        if (action === 'toggle' && suppressNextButtonClick) {
          suppressNextButtonClick = false;
          return;
        }

        onAction(action, event, actionNode);
      });

      windowObject.addEventListener('resize', () => {
        const rect = getExpandedButtonRect() || button.getBoundingClientRect();
        applyButtonPosition({
          left: rect.left,
          top: rect.top,
          dockSide: buttonDockSide,
        });
        if (isPanelOpen) positionPanelNearButton();
      });

      applyButtonPosition(loadButtonPosition());
      installDrag();
      installOutsideClose();
      setStatus(labels.statusIdle || '', 'idle');
      syncPanelExpandedState();

      return api;
    }

    const api = {
      mount,
      refs,
      setStatus,
      openPanel,
      closePanel,
      positionPanelNearButton,
      schedulePanelResize,
      isOpen: () => isPanelOpen,
    };

    return api;
  }

  globalObject[LIB_NAME] = Object.freeze({
    createFloatingPanelShell,
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
