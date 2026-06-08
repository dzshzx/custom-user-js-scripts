(function attachWebPageAssistantWidgetLayoutLib(globalObject) {
  'use strict';

  const LIB_NAME = 'WebPageAssistantWidgetLayoutLib';

  function createWidgetLayoutRuntime(adapters) {
    const {
      normalizeWidgetPosition,
      clampNumber,
      getViewportSize,
      persistPosition,
      onPositionChange,
      setTimeout,
      logger,
      constants,
      scriptName = 'Web Page Assistant',
    } = adapters;
    let widget = null;
    let widgetButton = null;
    let position = null;
    let suppressExpansion = false;

    function defaultPosition() {
      const viewport = getViewportSize();
      return {
        left: viewport.width - constants.widgetWidth - constants.defaultOffset,
        top: viewport.height - constants.widgetHeight - constants.defaultOffset,
      };
    }

    function clampPosition(nextPosition) {
      const viewport = getViewportSize();
      const source = normalizeWidgetPosition(nextPosition) || defaultPosition();
      const maxLeft = Math.max(constants.safeMargin, viewport.width - constants.widgetWidth - constants.safeMargin);
      const maxTop = Math.max(constants.safeMargin, viewport.height - constants.widgetHeight - constants.safeMargin);

      return {
        left: Math.min(Math.max(constants.safeMargin, source.left), maxLeft),
        top: Math.min(Math.max(constants.safeMargin, source.top), maxTop),
      };
    }

    function positionPanel() {
      if (!widget) return null;

      const panel = widget.querySelector('.part-widget-panel');
      if (!panel) return null;

      const viewport = getViewportSize();
      const widgetRect = widget.getBoundingClientRect();
      const panelWidth = Math.min(
        constants.panelWidth,
        Math.max(constants.buttonSize, viewport.width - constants.safeMargin * 2),
      );
      const panelHeight = panel.offsetHeight;
      const maxLeft = Math.max(constants.safeMargin, viewport.width - panelWidth - constants.safeMargin);
      const panelLeft = clampNumber(
        widgetRect.right - panelWidth,
        constants.safeMargin,
        maxLeft,
      );

      const aboveTop = widgetRect.top - panelHeight - constants.panelGap;
      const belowTop = widgetRect.top + constants.widgetHeight + constants.panelGap;
      const maxTop = Math.max(constants.safeMargin, viewport.height - panelHeight - constants.safeMargin);
      const shouldPlaceBelow = aboveTop < constants.safeMargin && belowTop <= maxTop;
      const panelTop = clampNumber(
        shouldPlaceBelow ? belowTop : aboveTop,
        constants.safeMargin,
        maxTop,
      );
      const placement = {
        left: Math.round(panelLeft - widgetRect.left),
        top: Math.round(panelTop - widgetRect.top),
        width: Math.round(panelWidth),
        origin: shouldPlaceBelow ? 'top right' : 'bottom right',
      };

      panel.style.setProperty('--part-panel-left', `${placement.left}px`);
      panel.style.setProperty('--part-panel-top', `${placement.top}px`);
      panel.style.setProperty('--part-panel-width', `${placement.width}px`);
      panel.style.setProperty('--part-panel-origin', placement.origin);
      return placement;
    }

    function applyPosition(nextPosition = position) {
      if (!widget) return null;

      position = clampPosition(nextPosition);
      onPositionChange(position);
      widget.style.left = `${position.left}px`;
      widget.style.top = `${position.top}px`;
      widget.style.right = 'auto';
      widget.style.bottom = 'auto';
      positionPanel();
      return position;
    }

    function setExpanded(isExpanded) {
      if (!widget) return;
      if (suppressExpansion && isExpanded) return;
      widget.classList.toggle('is-expanded', isExpanded);
    }

    function installExpansion() {
      widget.addEventListener('mouseenter', () => setExpanded(true));
      widget.addEventListener('mouseleave', () => setExpanded(false));
      widget.addEventListener('focusin', () => setExpanded(true));
      widget.addEventListener('focusout', (event) => {
        if (!event.relatedTarget || !widget.contains(event.relatedTarget)) {
          setExpanded(false);
        }
      });
    }

    function installDrag() {
      let dragState = null;

      widgetButton.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;

        const rect = widget.getBoundingClientRect();
        dragState = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          startLeft: rect.left,
          startTop: rect.top,
          moved: false,
        };

        widget.classList.add('is-dragging');
        try {
          widgetButton.setPointerCapture(event.pointerId);
        } catch {
          // Some synthetic or older pointer implementations do not support capture.
        }
      });

      widgetButton.addEventListener('pointermove', (event) => {
        if (!dragState || dragState.pointerId !== event.pointerId) return;

        const dx = event.clientX - dragState.startX;
        const dy = event.clientY - dragState.startY;
        if (Math.abs(dx) + Math.abs(dy) > 4) {
          dragState.moved = true;
          suppressExpansion = true;
          setExpanded(false);
        }

        if (!dragState.moved) return;

        applyPosition({
          left: dragState.startLeft + dx,
          top: dragState.startTop + dy,
        });
      });

      function finishDrag(event) {
        if (!dragState || dragState.pointerId !== event.pointerId) return;

        const moved = dragState.moved;
        dragState = null;
        widget.classList.remove('is-dragging');

        try {
          if (widgetButton.hasPointerCapture(event.pointerId)) {
            widgetButton.releasePointerCapture(event.pointerId);
          }
        } catch {
          // Ignore pointer capture implementations that cannot report synthetic pointers.
        }

        if (moved) {
          const rect = widget.getBoundingClientRect();
          const next = clampPosition({ left: rect.left, top: rect.top });
          applyPosition(next);
          persistPosition(next).catch((error) => {
            logger.warn(`${scriptName}: failed to persist widget position.`, error);
          });
        }

        setTimeout(() => {
          suppressExpansion = false;
        }, 0);
      }

      widgetButton.addEventListener('pointerup', finishDrag);
      widgetButton.addEventListener('pointercancel', finishDrag);
    }

    function attach(nextWidget, nextWidgetButton, initialPosition) {
      widget = nextWidget;
      widgetButton = nextWidgetButton;
      if (initialPosition) position = normalizeWidgetPosition(initialPosition);
      installExpansion();
      installDrag();
    }

    function getPosition() {
      return position;
    }

    function isExpansionSuppressed() {
      return suppressExpansion;
    }

    return {
      attach,
      applyPosition,
      positionPanel,
      setExpanded,
      clampPosition,
      getPosition,
      isExpansionSuppressed,
    };
  }

  globalObject[LIB_NAME] = Object.freeze({
    createWidgetLayoutRuntime,
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
