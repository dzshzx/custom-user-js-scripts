(function attachCodexQuotaCompassPanelShellMarkupLib(globalObject) {
  'use strict';

  const LIB_NAME = 'CodexQuotaCompassPanelShellMarkupLib';

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
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

  globalObject.CodexQuotaCompassPanelShellMarkupLib = {
    createShellMarkup,
    name: LIB_NAME,
  };
}(globalThis));
