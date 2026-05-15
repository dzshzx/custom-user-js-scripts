// ==UserScript==
// @name         Page Auto Refresh Timer
// @namespace    https://github.com/dzshzx/custom-user-js-scripts
// @version      0.1.0
// @description  Auto-refresh pages with presets, custom intervals, and per-page or per-site remembered settings.
// @author       dzshzx
// @match        *://*/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.registerMenuCommand
// @run-at       document-idle
// @homepageURL  https://github.com/dzshzx/custom-user-js-scripts
// @supportURL   https://github.com/dzshzx/custom-user-js-scripts/issues
// @downloadURL  https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/page-auto-refresh-timer.user.js
// @updateURL    https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/page-auto-refresh-timer.user.js
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  if (window.top !== window.self) return;

  const SCRIPT_NAME = 'Page Auto Refresh Timer';
  const ROOT_ID = 'page-auto-refresh-timer-root';
  const STYLE_ID = `${ROOT_ID}-style`;
  const STORAGE_KEY = 'pageAutoRefreshTimerSettings';
  const WIDGET_POSITION_KEY = 'pageAutoRefreshTimerWidgetPosition';
  const FALLBACK_STORAGE_KEY = `__${STORAGE_KEY}`;
  const FALLBACK_WIDGET_POSITION_KEY = `__${WIDGET_POSITION_KEY}`;
  const MIN_INTERVAL_MS = 1000;
  const MAX_INTERVAL_MS = 60 * 60 * 1000;
  const TICK_MS = 1000;
  const WIDGET_BUTTON_SIZE = 52;
  const WIDGET_WIDTH = 154;
  const WIDGET_HEIGHT = 60;
  const WIDGET_PANEL_WIDTH = 248;
  const WIDGET_PANEL_GAP = 8;
  const WIDGET_SAFE_MARGIN = 12;
  const DEFAULT_WIDGET_OFFSET = 18;
  const PRESETS = [
    { label: '30 秒', ms: 30 * 1000 },
    { label: '1 分钟', ms: 60 * 1000 },
    { label: '3 分钟', ms: 3 * 60 * 1000 },
    { label: '5 分钟', ms: 5 * 60 * 1000 },
    { label: '10 分钟', ms: 10 * 60 * 1000 },
    { label: '15 分钟', ms: 15 * 60 * 1000 },
    { label: '30 分钟', ms: 30 * 60 * 1000 },
    { label: '60 分钟', ms: 60 * 60 * 1000 },
  ];
  // Icons are sourced from Lucide (https://lucide.dev), ISC License.
  // Copyright (c) 2026 Lucide Icons and Contributors.
  const LUCIDE_REFRESH_CW_ICON_HTML = `
    <svg class="part-icon-svg lucide lucide-refresh-cw" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
      <path d="M21 3v5h-5"></path>
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
      <path d="M8 16H3v5"></path>
    </svg>
  `;
  const LUCIDE_SETTINGS_ICON_HTML = `
    <svg class="part-icon-svg lucide lucide-settings" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
      <circle cx="12" cy="12" r="3"></circle>
    </svg>
  `;

  const currentPageKey = `${location.origin}${location.pathname}${location.search}`;
  const currentSiteKey = location.hostname;

  let settings = emptySettings();
  let activeMatch = null;
  let root;
  let widget;
  let widgetButton;
  let widgetPosition = null;
  let suppressWidgetExpansion = false;
  let dialog;
  let countdownNodes = [];
  let targetTime = 0;
  let remainingWhenPaused = 0;
  let isPaused = false;
  let timerId = null;
  let isRefreshing = false;
  let hasRootListener = false;

  function emptySettings() {
    return {
      version: 1,
      pages: {},
      sites: {},
    };
  }

  function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function isValidIntervalMs(value) {
    return Number.isFinite(value) && value >= MIN_INTERVAL_MS && value <= MAX_INTERVAL_MS;
  }

  function normalizeSetting(value) {
    if (!isRecord(value)) return null;

    const intervalMs = Number(value.intervalMs);
    if (!isValidIntervalMs(intervalMs)) return null;

    return {
      intervalMs: Math.round(intervalMs),
      updatedAt: Number.isFinite(Number(value.updatedAt)) ? Number(value.updatedAt) : Date.now(),
    };
  }

  function normalizeSettings(value) {
    const next = emptySettings();
    const source = isRecord(value) ? value : {};

    for (const [key, setting] of Object.entries(isRecord(source.pages) ? source.pages : {})) {
      const normalized = normalizeSetting(setting);
      if (normalized) next.pages[key] = normalized;
    }

    for (const [key, setting] of Object.entries(isRecord(source.sites) ? source.sites : {})) {
      const normalized = normalizeSetting(setting);
      if (normalized) next.sites[key] = normalized;
    }

    return next;
  }

  function normalizeWidgetPosition(value) {
    if (!isRecord(value)) return null;

    const left = Number(value.left);
    const top = Number(value.top);
    if (!Number.isFinite(left) || !Number.isFinite(top)) return null;

    return {
      left: Math.round(left),
      top: Math.round(top),
    };
  }

  function maybePromise(value) {
    return value && typeof value.then === 'function' ? value : Promise.resolve(value);
  }

  async function readStoredSettings() {
    try {
      if (typeof GM_getValue === 'function') {
        return normalizeSettings(await maybePromise(GM_getValue(STORAGE_KEY, emptySettings())));
      }

      if (typeof GM !== 'undefined' && typeof GM.getValue === 'function') {
        return normalizeSettings(await GM.getValue(STORAGE_KEY, emptySettings()));
      }
    } catch (error) {
      console.warn(`${SCRIPT_NAME}: failed to read userscript storage.`, error);
    }

    try {
      return normalizeSettings(JSON.parse(localStorage.getItem(FALLBACK_STORAGE_KEY) || 'null'));
    } catch (error) {
      console.warn(`${SCRIPT_NAME}: failed to read fallback storage.`, error);
      return emptySettings();
    }
  }

  async function readStoredWidgetPosition() {
    try {
      if (typeof GM_getValue === 'function') {
        return normalizeWidgetPosition(await maybePromise(GM_getValue(WIDGET_POSITION_KEY, null)));
      }

      if (typeof GM !== 'undefined' && typeof GM.getValue === 'function') {
        return normalizeWidgetPosition(await GM.getValue(WIDGET_POSITION_KEY, null));
      }
    } catch (error) {
      console.warn(`${SCRIPT_NAME}: failed to read widget position.`, error);
    }

    try {
      return normalizeWidgetPosition(JSON.parse(localStorage.getItem(FALLBACK_WIDGET_POSITION_KEY) || 'null'));
    } catch (error) {
      console.warn(`${SCRIPT_NAME}: failed to read fallback widget position.`, error);
      return null;
    }
  }

  async function writeStoredSettings(nextSettings) {
    const normalized = normalizeSettings(nextSettings);

    try {
      if (typeof GM_setValue === 'function') {
        await maybePromise(GM_setValue(STORAGE_KEY, normalized));
        return normalized;
      }

      if (typeof GM !== 'undefined' && typeof GM.setValue === 'function') {
        await GM.setValue(STORAGE_KEY, normalized);
        return normalized;
      }
    } catch (error) {
      console.warn(`${SCRIPT_NAME}: failed to write userscript storage.`, error);
    }

    localStorage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  }

  async function writeStoredWidgetPosition(position) {
    const normalized = normalizeWidgetPosition(position);
    if (!normalized) return null;

    try {
      if (typeof GM_setValue === 'function') {
        await maybePromise(GM_setValue(WIDGET_POSITION_KEY, normalized));
        return normalized;
      }

      if (typeof GM !== 'undefined' && typeof GM.setValue === 'function') {
        await GM.setValue(WIDGET_POSITION_KEY, normalized);
        return normalized;
      }
    } catch (error) {
      console.warn(`${SCRIPT_NAME}: failed to write widget position.`, error);
    }

    localStorage.setItem(FALLBACK_WIDGET_POSITION_KEY, JSON.stringify(normalized));
    return normalized;
  }

  function resolveActiveSetting(sourceSettings = settings) {
    const pageSetting = normalizeSetting(sourceSettings.pages[currentPageKey]);
    if (pageSetting) {
      return {
        scope: 'page',
        key: currentPageKey,
        setting: pageSetting,
      };
    }

    const siteSetting = normalizeSetting(sourceSettings.sites[currentSiteKey]);
    if (siteSetting) {
      return {
        scope: 'site',
        key: currentSiteKey,
        setting: siteSetting,
      };
    }

    return null;
  }

  function onReady(callback) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', callback, { once: true });
      return;
    }

    callback();
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID} {
        position: fixed;
        z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 14px;
        line-height: 1.4;
        color: #152033;
      }

      #${ROOT_ID} *,
      #${ROOT_ID} *::before,
      #${ROOT_ID} *::after {
        box-sizing: border-box;
      }

      #${ROOT_ID} button,
      #${ROOT_ID} input,
      #${ROOT_ID} select {
        font: inherit;
      }

      #${ROOT_ID} button {
        border: 0;
        cursor: pointer;
      }

      #${ROOT_ID} button:disabled {
        cursor: not-allowed;
        opacity: 0.55;
      }

      #${ROOT_ID} .part-widget {
        position: fixed;
        right: 18px;
        bottom: 18px;
        width: 154px;
        height: 60px;
      }

      #${ROOT_ID} .part-widget.is-dragging {
        user-select: none;
      }

      #${ROOT_ID} .part-widget-panel-header,
      #${ROOT_ID} .part-dialog-header,
      #${ROOT_ID} .part-dialog-actions,
      #${ROOT_ID} .part-custom-row,
      #${ROOT_ID} .part-scope-grid {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      #${ROOT_ID} .part-widget-panel-header,
      #${ROOT_ID} .part-dialog-header {
        justify-content: space-between;
      }

      #${ROOT_ID} .part-widget-button {
        position: absolute;
        right: 0;
        bottom: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0;
        width: 52px;
        height: 52px;
        padding: 0;
        border: 1px solid rgba(15, 23, 42, 0.13);
        border-radius: 999px;
        background: rgba(248, 251, 255, 0.62);
        color: #152033;
        box-shadow: 0 8px 24px rgba(31, 44, 71, 0.15);
        cursor: grab;
        opacity: 0.66;
        overflow: hidden;
        backdrop-filter: blur(16px);
        transition:
          width 160ms ease,
          padding 160ms ease,
          opacity 160ms ease,
          background-color 160ms ease,
          box-shadow 160ms ease;
      }

      #${ROOT_ID} .part-widget-button:active {
        cursor: grabbing;
      }

      #${ROOT_ID} .part-widget:hover .part-widget-button,
      #${ROOT_ID} .part-widget:focus-within .part-widget-button,
      #${ROOT_ID} .part-widget.is-expanded .part-widget-button {
        justify-content: flex-start;
        gap: 8px;
        width: 154px;
        padding: 0 12px;
        background: rgba(248, 251, 255, 0.95);
        box-shadow: 0 12px 30px rgba(31, 44, 71, 0.2);
        opacity: 1;
      }

      #${ROOT_ID} .part-widget-button-icon {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 26px;
        min-width: 26px;
        height: 26px;
        border-radius: 999px;
        background: #0f766e;
        color: #ffffff;
        font-size: 16px;
        line-height: 1;
      }

      #${ROOT_ID} .part-icon-svg {
        display: block;
        width: 16px;
        height: 16px;
        fill: none;
        stroke: currentColor;
        stroke-width: 2.4;
        stroke-linecap: round;
        stroke-linejoin: round;
        pointer-events: none;
      }

      #${ROOT_ID} .part-widget-button-icon .part-icon-svg {
        width: 16px;
        height: 16px;
      }

      #${ROOT_ID} .part-widget-button-text {
        max-width: 0;
        overflow: hidden;
        opacity: 0;
        color: #0f766e;
        font-size: 16px;
        font-weight: 750;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
        transform: translateX(-4px);
        transition:
          max-width 160ms ease,
          opacity 140ms ease,
          transform 160ms ease;
      }

      #${ROOT_ID} .part-widget:hover .part-widget-button-text,
      #${ROOT_ID} .part-widget:focus-within .part-widget-button-text,
      #${ROOT_ID} .part-widget.is-expanded .part-widget-button-text {
        max-width: 84px;
        opacity: 1;
        transform: translateX(0);
      }

      #${ROOT_ID} .part-widget-panel {
        position: absolute;
        left: var(--part-panel-left, -94px);
        top: var(--part-panel-top, -140px);
        width: var(--part-panel-width, min(248px, calc(100vw - 24px)));
        padding: 10px;
        border: 1px solid rgba(63, 79, 105, 0.18);
        border-radius: 8px;
        background: rgba(248, 251, 255, 0.96);
        box-shadow: 0 16px 44px rgba(31, 44, 71, 0.22);
        opacity: 0;
        pointer-events: none;
        transform: translateY(8px) scale(0.98);
        transform-origin: var(--part-panel-origin, bottom right);
        backdrop-filter: blur(18px);
        transition:
          opacity 140ms ease,
          transform 160ms ease;
      }

      #${ROOT_ID} .part-widget:hover .part-widget-panel,
      #${ROOT_ID} .part-widget:focus-within .part-widget-panel,
      #${ROOT_ID} .part-widget.is-expanded .part-widget-panel {
        opacity: 1;
        pointer-events: auto;
        transform: translateY(0) scale(1);
      }

      #${ROOT_ID} .part-title {
        margin: 0;
        font-size: 14px;
        font-weight: 700;
      }

      #${ROOT_ID} .part-widget-countdown {
        margin: 6px 0 6px;
        font-size: 22px;
        font-weight: 750;
        color: #0f766e;
        font-variant-numeric: tabular-nums;
      }

      #${ROOT_ID} .part-muted {
        color: #66758c;
        font-size: 12px;
      }

      #${ROOT_ID} .part-row {
        margin-top: 10px;
      }

      #${ROOT_ID} .part-widget-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 8px;
      }

      #${ROOT_ID} .part-button {
        min-height: 34px;
        padding: 7px 10px;
        border-radius: 7px;
        background: #0f766e;
        color: #fff;
        font-weight: 650;
      }

      #${ROOT_ID} .part-button[data-variant="secondary"] {
        background: #e9eef6;
        color: #1f2a44;
      }

      #${ROOT_ID} .part-button[data-variant="danger"] {
        background: #fee2e2;
        color: #991b1b;
      }

      #${ROOT_ID} .part-icon-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 30px;
        height: 30px;
        border-radius: 7px;
        background: #e9eef6;
        color: #1f2a44;
        font-size: 18px;
        line-height: 1;
      }

      #${ROOT_ID} .part-icon-button .part-icon-svg {
        width: 16px;
        height: 16px;
      }

      #${ROOT_ID} .part-close-icon {
        position: relative;
        display: inline-block;
        width: 14px;
        height: 14px;
      }

      #${ROOT_ID} .part-close-icon::before,
      #${ROOT_ID} .part-close-icon::after {
        content: "";
        position: absolute;
        top: 6px;
        left: 1px;
        width: 12px;
        height: 2px;
        border-radius: 999px;
        background: currentColor;
      }

      #${ROOT_ID} .part-close-icon::before {
        transform: rotate(45deg);
      }

      #${ROOT_ID} .part-close-icon::after {
        transform: rotate(-45deg);
      }

      #${ROOT_ID} .part-backdrop {
        position: fixed;
        inset: 0;
        display: grid;
        place-items: center;
        padding: 18px;
        background: rgba(15, 23, 42, 0.38);
      }

      #${ROOT_ID} .part-dialog {
        width: min(560px, 100%);
        max-height: min(760px, calc(100vh - 36px));
        overflow: auto;
        border: 1px solid rgba(63, 79, 105, 0.18);
        border-radius: 8px;
        background: #ffffff;
        box-shadow: 0 24px 80px rgba(15, 23, 42, 0.28);
      }

      #${ROOT_ID} .part-dialog-header {
        position: sticky;
        top: 0;
        padding: 14px 16px;
        border-bottom: 1px solid #e7edf5;
        background: #ffffff;
      }

      #${ROOT_ID} .part-dialog-body {
        padding: 16px;
      }

      #${ROOT_ID} .part-section {
        margin-top: 16px;
      }

      #${ROOT_ID} .part-section:first-child {
        margin-top: 0;
      }

      #${ROOT_ID} .part-section-title {
        margin: 0 0 8px;
        font-size: 13px;
        font-weight: 750;
        color: #253149;
      }

      #${ROOT_ID} .part-status-box {
        padding: 10px;
        border-radius: 8px;
        background: #f2f6fb;
      }

      #${ROOT_ID} .part-key {
        display: block;
        margin-top: 4px;
        overflow-wrap: anywhere;
        color: #43536b;
        font-size: 12px;
      }

      #${ROOT_ID} .part-scope-grid {
        align-items: stretch;
        flex-wrap: wrap;
      }

      #${ROOT_ID} .part-scope-card {
        flex: 1 1 210px;
        display: block;
        padding: 10px;
        border: 1px solid #d8e2ef;
        border-radius: 8px;
        background: #fbfdff;
      }

      #${ROOT_ID} .part-scope-card input {
        margin-right: 6px;
      }

      #${ROOT_ID} .part-presets {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 8px;
      }

      #${ROOT_ID} .part-preset {
        min-height: 36px;
        padding: 8px;
        border: 1px solid #d8e2ef;
        border-radius: 7px;
        background: #ffffff;
        color: #1f2a44;
        font-weight: 650;
      }

      #${ROOT_ID} .part-preset:hover,
      #${ROOT_ID} .part-preset:focus-visible {
        border-color: #0f766e;
        outline: none;
      }

      #${ROOT_ID} .part-custom-row {
        align-items: stretch;
        flex-wrap: wrap;
      }

      #${ROOT_ID} .part-custom-row input,
      #${ROOT_ID} .part-custom-row select {
        min-height: 36px;
        border: 1px solid #ccd8e8;
        border-radius: 7px;
        background: #ffffff;
        color: #152033;
      }

      #${ROOT_ID} .part-custom-row input {
        width: 140px;
        padding: 7px 9px;
      }

      #${ROOT_ID} .part-custom-row select {
        padding: 7px 28px 7px 9px;
      }

      #${ROOT_ID} .part-dialog-actions {
        flex-wrap: wrap;
      }

      #${ROOT_ID} .part-message {
        min-height: 20px;
        margin-top: 10px;
        color: #0f766e;
        font-size: 13px;
      }

      #${ROOT_ID} .part-message[data-tone="error"] {
        color: #b91c1c;
      }

      @media (max-width: 520px) {
        #${ROOT_ID} .part-presets {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        #${ROOT_ID} .part-custom-row input,
        #${ROOT_ID} .part-custom-row select,
        #${ROOT_ID} .part-custom-row button {
          flex: 1 1 100%;
          width: 100%;
        }

        #${ROOT_ID} .part-widget {
          right: 12px;
          bottom: 12px;
        }
      }
    `;
    document.documentElement.append(style);
  }

  function ensureRoot() {
    installStyles();

    const existing = document.getElementById(ROOT_ID);
    if (existing) {
      root = existing;
    } else {
      root = document.createElement('div');
      root.id = ROOT_ID;
      document.documentElement.append(root);
    }

    if (!hasRootListener) {
      root.addEventListener('click', handleRootClick);
      root.addEventListener('change', handleRootChange);
      hasRootListener = true;
    }

    return root;
  }

  function formatInterval(ms) {
    const totalSeconds = Math.round(ms / 1000);
    if (totalSeconds < 60) return `${totalSeconds} 秒`;

    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return seconds ? `${minutes} 分钟 ${seconds} 秒` : `${minutes} 分钟`;
  }

  function formatCountdown(ms) {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  function scopeLabel(scope) {
    return scope === 'page' ? '当前页面' : '整个站点';
  }

  function getSelectedScope() {
    const selected = dialog?.querySelector('input[name="part-scope"]:checked')?.value;
    return selected === 'site' ? 'site' : 'page';
  }

  function setMessage(text, tone = 'info') {
    const messageNode = dialog?.querySelector('[data-part-role="message"]');
    if (!messageNode) return;

    messageNode.textContent = text;
    messageNode.dataset.tone = tone;
  }

  function currentStatusText() {
    if (!activeMatch) return '当前未启用自动刷新。';
    return `${scopeLabel(activeMatch.scope)}已启用，每 ${formatInterval(activeMatch.setting.intervalMs)} 刷新一次。`;
  }

  function defaultWidgetPosition() {
    return {
      left: window.innerWidth - WIDGET_WIDTH - DEFAULT_WIDGET_OFFSET,
      top: window.innerHeight - WIDGET_HEIGHT - DEFAULT_WIDGET_OFFSET,
    };
  }

  function clampWidgetPosition(position) {
    const source = normalizeWidgetPosition(position) || defaultWidgetPosition();
    const maxLeft = Math.max(WIDGET_SAFE_MARGIN, window.innerWidth - WIDGET_WIDTH - WIDGET_SAFE_MARGIN);
    const maxTop = Math.max(WIDGET_SAFE_MARGIN, window.innerHeight - WIDGET_HEIGHT - WIDGET_SAFE_MARGIN);

    return {
      left: Math.min(Math.max(WIDGET_SAFE_MARGIN, source.left), maxLeft),
      top: Math.min(Math.max(WIDGET_SAFE_MARGIN, source.top), maxTop),
    };
  }

  function clampNumber(value, min, max) {
    return Math.min(Math.max(min, value), max);
  }

  function positionWidgetPanel() {
    if (!widget) return;

    const panel = widget.querySelector('.part-widget-panel');
    if (!panel) return;

    const widgetRect = widget.getBoundingClientRect();
    const panelWidth = Math.min(
      WIDGET_PANEL_WIDTH,
      Math.max(WIDGET_BUTTON_SIZE, window.innerWidth - WIDGET_SAFE_MARGIN * 2),
    );
    const panelHeight = panel.offsetHeight;
    const maxLeft = Math.max(WIDGET_SAFE_MARGIN, window.innerWidth - panelWidth - WIDGET_SAFE_MARGIN);
    const panelLeft = clampNumber(
      widgetRect.right - panelWidth,
      WIDGET_SAFE_MARGIN,
      maxLeft,
    );

    const aboveTop = widgetRect.top - panelHeight - WIDGET_PANEL_GAP;
    const belowTop = widgetRect.top + WIDGET_HEIGHT + WIDGET_PANEL_GAP;
    const maxTop = Math.max(WIDGET_SAFE_MARGIN, window.innerHeight - panelHeight - WIDGET_SAFE_MARGIN);
    const shouldPlaceBelow = aboveTop < WIDGET_SAFE_MARGIN && belowTop <= maxTop;
    const panelTop = clampNumber(
      shouldPlaceBelow ? belowTop : aboveTop,
      WIDGET_SAFE_MARGIN,
      maxTop,
    );

    panel.style.setProperty('--part-panel-left', `${Math.round(panelLeft - widgetRect.left)}px`);
    panel.style.setProperty('--part-panel-top', `${Math.round(panelTop - widgetRect.top)}px`);
    panel.style.setProperty('--part-panel-width', `${Math.round(panelWidth)}px`);
    panel.style.setProperty('--part-panel-origin', shouldPlaceBelow ? 'top right' : 'bottom right');
  }

  function applyWidgetPosition(position = widgetPosition) {
    if (!widget) return;

    const next = clampWidgetPosition(position);
    widgetPosition = next;
    widget.style.left = `${next.left}px`;
    widget.style.top = `${next.top}px`;
    widget.style.right = 'auto';
    widget.style.bottom = 'auto';
    positionWidgetPanel();
  }

  function renderWidget() {
    ensureRoot();

    if (widget) {
      widget.remove();
      widget = null;
      widgetButton = null;
      countdownNodes = [];
    }

    if (!activeMatch) return;

    widget = document.createElement('section');
    widget.className = 'part-widget';
    widget.setAttribute('aria-live', 'polite');
    widget.innerHTML = `
      <button type="button" class="part-widget-button" aria-label="自动刷新倒计时，悬停或聚焦查看控制">
        <span class="part-widget-button-icon" aria-hidden="true">
          ${LUCIDE_REFRESH_CW_ICON_HTML}
        </span>
        <span class="part-widget-button-text" data-part-role="countdown">--:--</span>
      </button>
      <div class="part-widget-panel">
        <div class="part-widget-panel-header">
          <p class="part-title">自动刷新</p>
          <button type="button" class="part-icon-button" data-part-action="open-settings" aria-label="打开自动刷新设置">${LUCIDE_SETTINGS_ICON_HTML}</button>
        </div>
        <div class="part-widget-countdown" data-part-role="countdown">--:--</div>
        <div class="part-muted" data-part-role="widget-summary"></div>
        <div class="part-widget-actions">
          <button type="button" class="part-button" data-part-action="toggle-pause"></button>
          <button type="button" class="part-button" data-variant="danger" data-part-action="disable-active">停用</button>
        </div>
      </div>
    `;

    countdownNodes = [...widget.querySelectorAll('[data-part-role="countdown"]')];
    widgetButton = widget.querySelector('.part-widget-button');
    widget.querySelector('[data-part-role="widget-summary"]').textContent = currentStatusText();
    installWidgetExpansion();
    installWidgetDrag();
    root.append(widget);
    applyWidgetPosition();
    positionWidgetPanel();
    updatePauseButton();
    updateCountdownText();
  }

  function setWidgetExpanded(isExpanded) {
    if (!widget) return;
    if (suppressWidgetExpansion && isExpanded) return;
    widget.classList.toggle('is-expanded', isExpanded);
  }

  function installWidgetExpansion() {
    if (!widget) return;

    widget.addEventListener('mouseenter', () => setWidgetExpanded(true));
    widget.addEventListener('mouseleave', () => setWidgetExpanded(false));
    widget.addEventListener('focusin', () => setWidgetExpanded(true));
    widget.addEventListener('focusout', (event) => {
      if (!event.relatedTarget || !widget.contains(event.relatedTarget)) {
        setWidgetExpanded(false);
      }
    });
  }

  function installWidgetDrag() {
    if (!widget || !widgetButton) return;

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
        suppressWidgetExpansion = true;
        setWidgetExpanded(false);
      }

      if (!dragState.moved) return;

      applyWidgetPosition({
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
        const next = clampWidgetPosition({ left: rect.left, top: rect.top });
        applyWidgetPosition(next);
        writeStoredWidgetPosition(next).catch((error) => {
          console.warn(`${SCRIPT_NAME}: failed to persist widget position.`, error);
        });
      }

      window.setTimeout(() => {
        suppressWidgetExpansion = false;
      }, 0);
    }

    widgetButton.addEventListener('pointerup', finishDrag);
    widgetButton.addEventListener('pointercancel', finishDrag);
  }

  function renderDialog(message = '') {
    ensureRoot();

    if (dialog) {
      dialog.remove();
      dialog = null;
    }

    const pageSetting = normalizeSetting(settings.pages[currentPageKey]);
    const siteSetting = normalizeSetting(settings.sites[currentSiteKey]);
    const selectedScope = activeMatch?.scope || 'page';

    dialog = document.createElement('div');
    dialog.className = 'part-backdrop';
    dialog.dataset.partAction = 'close-dialog';

    const panel = document.createElement('section');
    panel.className = 'part-dialog';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'part-dialog-title');
    panel.dataset.partDialogPanel = 'true';

    panel.innerHTML = `
      <div class="part-dialog-header">
        <h2 class="part-title" id="part-dialog-title">页面定时刷新</h2>
        <button type="button" class="part-icon-button" data-part-action="close-dialog" aria-label="关闭">
          <span class="part-close-icon" aria-hidden="true"></span>
        </button>
      </div>
      <div class="part-dialog-body">
        <section class="part-section">
          <p class="part-section-title">当前状态</p>
          <div class="part-status-box">
            <div data-part-role="status"></div>
            <span class="part-key" data-part-role="page-key"></span>
            <span class="part-key" data-part-role="site-key"></span>
          </div>
        </section>

        <section class="part-section">
          <p class="part-section-title">保存范围</p>
          <div class="part-scope-grid">
            <label class="part-scope-card">
              <input type="radio" name="part-scope" value="page">
              当前页面
              <span class="part-key">只匹配当前完整页面地址。</span>
            </label>
            <label class="part-scope-card">
              <input type="radio" name="part-scope" value="site">
              整个站点
              <span class="part-key">匹配同一 hostname 下的页面。</span>
            </label>
          </div>
        </section>

        <section class="part-section">
          <p class="part-section-title">常用刷新时间</p>
          <div class="part-presets" data-part-role="presets"></div>
        </section>

        <section class="part-section">
          <p class="part-section-title">自定义刷新时间</p>
          <div class="part-custom-row">
            <input type="number" min="1" step="1" inputmode="decimal" data-part-role="custom-value" aria-label="自定义刷新时间">
            <select data-part-role="custom-unit" aria-label="自定义刷新时间单位">
              <option value="seconds">秒</option>
              <option value="minutes">分钟</option>
            </select>
            <button type="button" class="part-button" data-part-action="save-custom">保存自定义时间</button>
          </div>
          <div class="part-muted">有效范围：1 秒到 60 分钟。</div>
        </section>

        <section class="part-section">
          <p class="part-section-title">删除设置</p>
          <div class="part-dialog-actions">
            <button type="button" class="part-button" data-variant="danger" data-part-action="delete-page">删除当前页面设置</button>
            <button type="button" class="part-button" data-variant="danger" data-part-action="delete-site">删除整个站点设置</button>
          </div>
        </section>

        <div class="part-message" data-part-role="message" aria-live="polite"></div>
      </div>
    `;

    dialog.append(panel);
    root.append(dialog);

    dialog.querySelector('[data-part-role="status"]').textContent = currentStatusText();
    dialog.querySelector('[data-part-role="page-key"]').textContent = `页面：${currentPageKey}${pageSetting ? `（${formatInterval(pageSetting.intervalMs)}）` : '（未设置）'}`;
    dialog.querySelector('[data-part-role="site-key"]').textContent = `站点：${currentSiteKey}${siteSetting ? `（${formatInterval(siteSetting.intervalMs)}）` : '（未设置）'}`;

    const scopeInput = dialog.querySelector(`input[name="part-scope"][value="${selectedScope}"]`);
    if (scopeInput) scopeInput.checked = true;

    const presetsNode = dialog.querySelector('[data-part-role="presets"]');
    for (const preset of PRESETS) {
      const presetButton = document.createElement('button');
      presetButton.type = 'button';
      presetButton.className = 'part-preset';
      presetButton.dataset.partAction = 'save-preset';
      presetButton.dataset.intervalMs = String(preset.ms);
      presetButton.textContent = preset.label;
      presetsNode.append(presetButton);
    }

    const defaultInterval = activeMatch?.setting.intervalMs || 5 * 60 * 1000;
    const customValue = dialog.querySelector('[data-part-role="custom-value"]');
    const customUnit = dialog.querySelector('[data-part-role="custom-unit"]');
    if (defaultInterval % (60 * 1000) === 0) {
      customValue.value = String(defaultInterval / (60 * 1000));
      customUnit.value = 'minutes';
    } else {
      customValue.value = String(Math.round(defaultInterval / 1000));
      customUnit.value = 'seconds';
    }

    dialog.querySelector('[data-part-action="delete-page"]').disabled = !pageSetting;
    dialog.querySelector('[data-part-action="delete-site"]').disabled = !siteSetting;
    setMessage(message);
    customValue.focus();
  }

  function closeDialog() {
    if (!dialog) return;
    dialog.remove();
    dialog = null;
  }

  function parseCustomInterval() {
    const valueNode = dialog?.querySelector('[data-part-role="custom-value"]');
    const unitNode = dialog?.querySelector('[data-part-role="custom-unit"]');
    const amount = Number(valueNode?.value);
    const unit = unitNode?.value === 'minutes' ? 'minutes' : 'seconds';
    const ms = amount * (unit === 'minutes' ? 60 * 1000 : 1000);

    if (!Number.isFinite(amount) || amount <= 0) {
      return { error: '请输入大于 0 的刷新时间。' };
    }

    if (!isValidIntervalMs(ms)) {
      return { error: '自定义刷新时间必须在 1 秒到 60 分钟之间。' };
    }

    return { intervalMs: Math.round(ms) };
  }

  async function saveSetting(scope, intervalMs) {
    const next = normalizeSettings(settings);
    const bucket = scope === 'site' ? next.sites : next.pages;
    const key = scope === 'site' ? currentSiteKey : currentPageKey;

    bucket[key] = {
      intervalMs,
      updatedAt: Date.now(),
    };

    settings = await writeStoredSettings(next);
    restartActiveCountdown();
  }

  async function deleteSetting(scope) {
    const next = normalizeSettings(settings);
    if (scope === 'site') {
      delete next.sites[currentSiteKey];
    } else {
      delete next.pages[currentPageKey];
    }

    settings = await writeStoredSettings(next);
    restartActiveCountdown();
  }

  function stopTimer() {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function startTimer() {
    stopTimer();
    if (!activeMatch || isPaused) return;

    timerId = window.setInterval(tickCountdown, TICK_MS);
    tickCountdown();
  }

  function restartActiveCountdown() {
    activeMatch = resolveActiveSetting(settings);
    isPaused = false;
    remainingWhenPaused = 0;
    isRefreshing = false;

    if (!activeMatch) {
      stopTimer();
      renderWidget();
      return;
    }

    targetTime = Date.now() + activeMatch.setting.intervalMs;
    renderWidget();
    startTimer();
  }

  function updateCountdownText() {
    if (!countdownNodes.length) return;

    if (!activeMatch) {
      for (const node of countdownNodes) {
        node.textContent = '--:--';
      }
      return;
    }

    const remainingMs = isPaused
      ? remainingWhenPaused
      : Math.max(0, targetTime - Date.now());
    const text = formatCountdown(remainingMs);
    for (const node of countdownNodes) {
      node.textContent = text;
    }
  }

  function updatePauseButton() {
    const pauseButton = widget?.querySelector('[data-part-action="toggle-pause"]');
    if (!pauseButton) return;
    pauseButton.textContent = isPaused ? '继续' : '暂停';
  }

  function tickCountdown() {
    if (!activeMatch || isPaused || isRefreshing) return;

    const remainingMs = targetTime - Date.now();
    updateCountdownText();

    if (remainingMs <= 0) {
      isRefreshing = true;
      stopTimer();
      location.reload();
    }
  }

  function togglePause() {
    if (!activeMatch) return;

    if (isPaused) {
      targetTime = Date.now() + remainingWhenPaused;
      remainingWhenPaused = 0;
      isPaused = false;
      updatePauseButton();
      startTimer();
      return;
    }

    remainingWhenPaused = Math.max(MIN_INTERVAL_MS, targetTime - Date.now());
    isPaused = true;
    stopTimer();
    updatePauseButton();
    updateCountdownText();
  }

  async function handleRootClick(event) {
    const actionNode = event.target?.closest?.('[data-part-action]');
    if (!actionNode || !root?.contains(actionNode)) return;

    const action = actionNode.dataset.partAction;

    if (action === 'close-dialog' && dialog && actionNode === dialog && event.target === dialog) {
      closeDialog();
      return;
    }

    if (action === 'close-dialog' && dialog && actionNode === dialog) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    try {
      if (action === 'open-settings') {
        renderDialog();
        return;
      }

      if (action === 'close-dialog') {
        closeDialog();
        return;
      }

      if (action === 'toggle-pause') {
        togglePause();
        return;
      }

      if (action === 'save-preset') {
        const intervalMs = Number(actionNode.dataset.intervalMs);
        const scope = getSelectedScope();
        if (!isValidIntervalMs(intervalMs)) {
          setMessage('预设刷新时间无效。', 'error');
          return;
        }

        await saveSetting(scope, intervalMs);
        renderDialog(`已保存到${scopeLabel(scope)}：每 ${formatInterval(intervalMs)} 刷新一次。`);
        return;
      }

      if (action === 'save-custom') {
        const parsed = parseCustomInterval();
        if (parsed.error) {
          setMessage(parsed.error, 'error');
          return;
        }

        const scope = getSelectedScope();
        await saveSetting(scope, parsed.intervalMs);
        renderDialog(`已保存到${scopeLabel(scope)}：每 ${formatInterval(parsed.intervalMs)} 刷新一次。`);
        return;
      }

      if (action === 'delete-page') {
        await deleteSetting('page');
        renderDialog('已删除当前页面设置。');
        return;
      }

      if (action === 'delete-site') {
        await deleteSetting('site');
        renderDialog('已删除整个站点设置。');
        return;
      }

      if (action === 'disable-active') {
        if (!activeMatch) return;
        const disabledScope = activeMatch.scope;
        await deleteSetting(disabledScope);
        if (dialog) renderDialog(`已停用${scopeLabel(disabledScope)}自动刷新。`);
      }
    } catch (error) {
      console.warn(`${SCRIPT_NAME}: action failed.`, error);
      setMessage('操作失败，请查看浏览器控制台。', 'error');
    }
  }

  function handleRootChange(event) {
    const target = event.target;
    if (!target?.matches?.('input[name="part-scope"]')) return;

    setMessage(`将保存到${scopeLabel(getSelectedScope())}。`);
  }

  function registerMenu() {
    try {
      if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('Auto Refresh Settings', () => onReady(() => renderDialog()));
        return;
      }

      if (typeof GM !== 'undefined' && typeof GM.registerMenuCommand === 'function') {
        GM.registerMenuCommand('Auto Refresh Settings', () => onReady(() => renderDialog()));
      }
    } catch (error) {
      console.warn(`${SCRIPT_NAME}: failed to register menu command.`, error);
    }
  }

  async function init() {
    [settings, widgetPosition] = await Promise.all([
      readStoredSettings(),
      readStoredWidgetPosition(),
    ]);
    activeMatch = resolveActiveSetting(settings);
    registerMenu();
    window.addEventListener('resize', () => applyWidgetPosition());

    if (activeMatch) {
      onReady(restartActiveCountdown);
    }
  }

  init().catch((error) => {
    console.warn(`${SCRIPT_NAME}: failed to initialize.`, error);
  });
})();
