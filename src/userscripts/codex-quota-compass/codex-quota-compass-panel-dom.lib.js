(function attachCodexQuotaCompassPanelDomLib(globalObject) {
  'use strict';

  const LIB_NAME = 'CodexQuotaCompassPanelDomLib';

  // DOM read/write helpers for the quota panel content area. Kept separate from
  // the renderer (which only builds HTML strings) so the renderer stays
  // DOM-free and testable without a DOM, while these helpers can be exercised
  // with a DOM library.

  // Swaps only the active view body in place and updates the tab highlight,
  // so switching tabs never rebuilds metrics or replays the open animation.
  function applyActiveView(contentNode, rendered = {}) {
    const activePanelView = rendered.activePanelView;
    if (!contentNode) return activePanelView;

    const detailsNode = contentNode.querySelector('.cqc-details');
    if (detailsNode) {
      detailsNode.innerHTML = rendered.html || '';
    }

    contentNode.querySelectorAll('.cqc-tab').forEach((tab) => {
      tab.classList.toggle('is-active', tab.dataset.view === activePanelView);
    });

    return activePanelView;
  }

  // Reads the sync form fields, or null when the form is not rendered.
  function readSyncFormValues(contentNode) {
    const form = contentNode?.querySelector?.('[data-sync-form]');
    if (!form) return null;

    return {
      token: form.querySelector('[data-field="token"]')?.value || '',
      gistId: form.querySelector('[data-field="gistId"]')?.value || '',
      enabled: Boolean(form.querySelector('[data-field="enabled"]')?.checked),
    };
  }

  // True while the user is typing in a sync form field, so background refreshes
  // can avoid clobbering a half-entered token or gist id.
  function isSyncFormEditing(contentNode, activeElement) {
    if (!activeElement || !contentNode?.contains?.(activeElement)) return false;
    if (!activeElement.closest?.('[data-sync-form]')) return false;
    return activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA';
  }

  globalObject[LIB_NAME] = Object.freeze({
    applyActiveView,
    readSyncFormValues,
    isSyncFormEditing,
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
