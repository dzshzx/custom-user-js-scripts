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
  const { createShellMarkup } = globalObject.CodexQuotaCompassPanelShellMarkupLib || {};
  if (typeof createShellMarkup !== 'function') {
    throw new Error(`${LIB_NAME} requires CodexQuotaCompassPanelShellMarkupLib.`);
  }
  const { createShellStyles } = globalObject.CodexQuotaCompassPanelShellStylesLib || {};
  if (typeof createShellStyles !== 'function') {
    throw new Error(`${LIB_NAME} requires CodexQuotaCompassPanelShellStylesLib.`);
  }

  function isDockSide(value) {
    return value === 'left' || value === 'right';
  }

  function shellStyles(rootId) {
    return createShellStyles(rootId, {
      BUTTON_FULL_WIDTH,
      BUTTON_HEIGHT,
      PANEL_OPEN_ANIMATION_MS,
      PANEL_CLOSE_ANIMATION_MS,
      PANEL_OPEN_EASING,
      PANEL_CLOSE_EASING,
    });
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
