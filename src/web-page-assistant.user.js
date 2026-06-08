// ==UserScript==
// @name         Web Page Assistant
// @name:en      Web Page Assistant
// @name:zh      网页助手
// @name:zh-CN   网页助手
// @name:zh-TW   網頁助手
// @namespace    https://github.com/dzshzx/custom-user-js-scripts
// @version      0.2.5
// @description  Web page assistant for page refresh and optional copy, selection, context menu, drag, and unload limit unlocking.
// @description:en Web page assistant for page refresh and optional copy, selection, context menu, drag, and unload limit unlocking.
// @description:zh 网页助手：按页面或站点管理自动刷新，并可解除复制、选择、右键菜单、拖拽和离开确认限制。
// @description:zh-CN 网页助手：按页面或站点管理自动刷新，并可解除复制、选择、右键菜单、拖拽和离开确认限制。
// @description:zh-TW 網頁助手：按頁面或站點管理自動重新整理，並可解除複製、選取、右鍵選單、拖曳和離開確認限制。
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
// @downloadURL  https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/web-page-assistant.user.js
// @updateURL    https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/web-page-assistant.user.js
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  if (window.top !== window.self) return;

  const SCRIPT_NAME = 'Web Page Assistant';
  const ROOT_ID = 'page-auto-refresh-timer-root';
  const STYLE_ID = `${ROOT_ID}-style`;
  const UNLOCKER_STYLE_ID = `${ROOT_ID}-unlocker-style`;
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
  const DEFAULT_UNLOCKER_OPTIONS = {
    allowSelection: true,
    allowCopy: true,
    allowContextMenu: true,
    allowDrag: false,
    suppressBeforeUnload: false,
  };
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
  const PageAssistantSettings = createPageAssistantSettingsContract();
  const unlockerRuntime = createUnlockerRuntime();

  let settings = PageAssistantSettings.empty();
  let activeMatch = null;
  let activeUnlockerMatch = null;
  let root;
  let widget;
  let widgetButton;
  let widgetPosition = null;
  let dialog;
  let activeDialogTab = 'refresh';
  let countdownNodes = [];
  let hasRootListener = false;
  let webPageAssistantSession;
  let widgetLayoutRuntime;

  // WEB_PAGE_ASSISTANT_SETTINGS_CONTRACT_START
  function emptySettings() {
    return {
      version: 2,
      refresh: {
        pages: {},
        sites: {},
      },
      unlocker: {
        pages: {},
        sites: {},
      },
    };
  }

  function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function isValidIntervalMs(value) {
    return Number.isFinite(value) && value >= MIN_INTERVAL_MS && value <= MAX_INTERVAL_MS;
  }

  function emptyScopedSettings() {
    return {
      pages: {},
      sites: {},
    };
  }

  function normalizeRefreshSetting(value) {
    if (!isRecord(value)) return null;

    const intervalMs = Number(value.intervalMs);
    if (!isValidIntervalMs(intervalMs)) return null;

    return {
      intervalMs: Math.round(intervalMs),
      updatedAt: Number.isFinite(Number(value.updatedAt)) ? Number(value.updatedAt) : Date.now(),
    };
  }

  function normalizeUnlockerSetting(value) {
    if (!isRecord(value)) return null;

    const enabled = Boolean(value.enabled);
    const next = {
      enabled,
      allowSelection: value.allowSelection !== false,
      allowCopy: value.allowCopy !== false,
      allowContextMenu: value.allowContextMenu !== false,
      allowDrag: value.allowDrag === true,
      suppressBeforeUnload: value.suppressBeforeUnload === true,
      updatedAt: Number.isFinite(Number(value.updatedAt)) ? Number(value.updatedAt) : Date.now(),
    };

    return next;
  }

  function normalizeScopedSettings(value, normalizer) {
    const next = emptyScopedSettings();
    const source = isRecord(value) ? value : {};

    for (const [key, setting] of Object.entries(isRecord(source.pages) ? source.pages : {})) {
      const normalized = normalizer(setting);
      if (normalized) next.pages[key] = normalized;
    }

    for (const [key, setting] of Object.entries(isRecord(source.sites) ? source.sites : {})) {
      const normalized = normalizer(setting);
      if (normalized) next.sites[key] = normalized;
    }

    return next;
  }

  function normalizeSettings(value) {
    const next = emptySettings();
    const source = isRecord(value) ? value : {};
    const refreshSource = isRecord(source.refresh)
      ? source.refresh
      : { pages: source.pages, sites: source.sites };
    const unlockerSource = isRecord(source.unlocker) ? source.unlocker : {};

    next.refresh = normalizeScopedSettings(refreshSource, normalizeRefreshSetting);
    next.unlocker = normalizeScopedSettings(unlockerSource, normalizeUnlockerSetting);

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

  function hasUnlockerAction(setting) {
    return Boolean(
      setting?.enabled
        && (
          setting.allowSelection
          || setting.allowCopy
          || setting.allowContextMenu
          || setting.allowDrag
          || setting.suppressBeforeUnload
        ),
    );
  }

  function createPageAssistantSettingsContract() {
    return {
      MIN_INTERVAL_MS,
      MAX_INTERVAL_MS,
      DEFAULT_UNLOCKER_OPTIONS,
      empty: emptySettings,
      emptySettings,
      isValidIntervalMs,
      normalize: normalizeSettings,
      normalizeSettings,
      normalizeRefreshSetting,
      normalizeUnlockerSetting,
      hasUnlockerAction,
      defaultUnlockerSetting(overrides = {}) {
        return normalizeUnlockerSetting({
          enabled: true,
          ...DEFAULT_UNLOCKER_OPTIONS,
          ...overrides,
          updatedAt: Date.now(),
        });
      },
      resolveActiveRefresh(sourceSettings, keys) {
        const refreshSettings = normalizeScopedSettings(sourceSettings?.refresh, normalizeRefreshSetting);
        const pageSetting = normalizeRefreshSetting(refreshSettings.pages[keys.pageKey]);
        if (pageSetting) {
          return {
            scope: 'page',
            key: keys.pageKey,
            setting: pageSetting,
          };
        }

        const siteSetting = normalizeRefreshSetting(refreshSettings.sites[keys.siteKey]);
        if (siteSetting) {
          return {
            scope: 'site',
            key: keys.siteKey,
            setting: siteSetting,
          };
        }

        return null;
      },
      resolveActiveRefreshSetting(sourceSettings, keys) {
        return this.resolveActiveRefresh(sourceSettings, keys);
      },
      resolveActiveUnlocker(sourceSettings, keys) {
        const unlockerSettings = normalizeScopedSettings(sourceSettings?.unlocker, normalizeUnlockerSetting);
        const pageSetting = normalizeUnlockerSetting(unlockerSettings.pages[keys.pageKey]);
        if (hasUnlockerAction(pageSetting)) {
          return {
            scope: 'page',
            key: keys.pageKey,
            setting: pageSetting,
          };
        }

        const siteSetting = normalizeUnlockerSetting(unlockerSettings.sites[keys.siteKey]);
        if (hasUnlockerAction(siteSetting)) {
          return {
            scope: 'site',
            key: keys.siteKey,
            setting: siteSetting,
          };
        }

        return null;
      },
      resolveActiveUnlockerSetting(sourceSettings, keys) {
        return this.resolveActiveUnlocker(sourceSettings, keys);
      },
      getRefreshSetting(sourceSettings, scope, key) {
        const settingsSource = normalizeSettings(sourceSettings);
        const bucket = scope === 'site' ? settingsSource.refresh.sites : settingsSource.refresh.pages;
        return normalizeRefreshSetting(bucket[key]);
      },
      getUnlockerSetting(sourceSettings, scope, key) {
        const settingsSource = normalizeSettings(sourceSettings);
        const bucket = scope === 'site' ? settingsSource.unlocker.sites : settingsSource.unlocker.pages;
        return normalizeUnlockerSetting(bucket[key]);
      },
      setRefreshSetting(sourceSettings, scope, key, intervalMs, updatedAt = Date.now()) {
        const next = normalizeSettings(sourceSettings);
        const bucket = scope === 'site' ? next.refresh.sites : next.refresh.pages;
        bucket[key] = {
          intervalMs,
          updatedAt,
        };
        return normalizeSettings(next);
      },
      deleteRefreshSetting(sourceSettings, scope, key) {
        const next = normalizeSettings(sourceSettings);
        const bucket = scope === 'site' ? next.refresh.sites : next.refresh.pages;
        delete bucket[key];
        return next;
      },
      setUnlockerSetting(sourceSettings, scope, key, unlockerSetting, updatedAt = Date.now()) {
        const normalized = normalizeUnlockerSetting(unlockerSetting);
        if (!normalized) return normalizeSettings(sourceSettings);

        const next = normalizeSettings(sourceSettings);
        const bucket = scope === 'site' ? next.unlocker.sites : next.unlocker.pages;
        bucket[key] = {
          ...normalized,
          updatedAt,
        };
        return normalizeSettings(next);
      },
      deleteUnlockerSetting(sourceSettings, scope, key) {
        const next = normalizeSettings(sourceSettings);
        const bucket = scope === 'site' ? next.unlocker.sites : next.unlocker.pages;
        delete bucket[key];
        return next;
      },
    };
  }
  // WEB_PAGE_ASSISTANT_SETTINGS_CONTRACT_END

  function maybePromise(value) {
    return value && typeof value.then === 'function' ? value : Promise.resolve(value);
  }

  // WEB_PAGE_ASSISTANT_STORAGE_PORT_START
  function createWebPageAssistantStoragePort(adapters) {
    const {
      settingsContract,
      normalizeWidgetPosition: normalizePosition,
      storageKey,
      widgetPositionKey,
      fallbackStorageKey,
      fallbackWidgetPositionKey,
      gmGetValue,
      gmSetValue,
      gmRegisterMenuCommand,
      gmApi,
      localStorageAdapter,
      logger,
      toPromise,
    } = adapters;

    async function readPrimaryValue(key, fallbackValue) {
      if (typeof gmGetValue === 'function') {
        return {
          available: true,
          value: await toPromise(gmGetValue(key, fallbackValue)),
        };
      }

      if (gmApi && typeof gmApi.getValue === 'function') {
        return {
          available: true,
          value: await gmApi.getValue(key, fallbackValue),
        };
      }

      return { available: false, value: fallbackValue };
    }

    async function writePrimaryValue(key, value) {
      if (typeof gmSetValue === 'function') {
        await toPromise(gmSetValue(key, value));
        return true;
      }

      if (gmApi && typeof gmApi.setValue === 'function') {
        await gmApi.setValue(key, value);
        return true;
      }

      return false;
    }

    function readFallbackJson(key, normalizer, fallbackValue, warning) {
      try {
        return normalizer(JSON.parse(localStorageAdapter.getItem(key) || 'null')) || fallbackValue;
      } catch (error) {
        logger.warn(warning, error);
        return fallbackValue;
      }
    }

    function writeFallbackJson(key, value) {
      localStorageAdapter.setItem(key, JSON.stringify(value));
    }

    return {
      async readSettings() {
        try {
          const primary = await readPrimaryValue(storageKey, settingsContract.empty());
          if (primary.available) return settingsContract.normalize(primary.value);
        } catch (error) {
          logger.warn(`${SCRIPT_NAME}: failed to read userscript storage.`, error);
        }

        return readFallbackJson(
          fallbackStorageKey,
          settingsContract.normalize,
          settingsContract.empty(),
          `${SCRIPT_NAME}: failed to read fallback storage.`,
        );
      },
      async readWidgetPosition() {
        try {
          const primary = await readPrimaryValue(widgetPositionKey, null);
          if (primary.available) return normalizePosition(primary.value);
        } catch (error) {
          logger.warn(`${SCRIPT_NAME}: failed to read widget position.`, error);
        }

        return readFallbackJson(
          fallbackWidgetPositionKey,
          normalizePosition,
          null,
          `${SCRIPT_NAME}: failed to read fallback widget position.`,
        );
      },
      async writeSettings(nextSettings) {
        const normalized = settingsContract.normalize(nextSettings);

        try {
          if (await writePrimaryValue(storageKey, normalized)) return normalized;
        } catch (error) {
          logger.warn(`${SCRIPT_NAME}: failed to write userscript storage.`, error);
        }

        writeFallbackJson(fallbackStorageKey, normalized);
        return normalized;
      },
      async writeWidgetPosition(position) {
        const normalized = normalizePosition(position);
        if (!normalized) return null;

        try {
          if (await writePrimaryValue(widgetPositionKey, normalized)) return normalized;
        } catch (error) {
          logger.warn(`${SCRIPT_NAME}: failed to write widget position.`, error);
        }

        writeFallbackJson(fallbackWidgetPositionKey, normalized);
        return normalized;
      },
      registerSettingsMenu(label, callback) {
        try {
          if (typeof gmRegisterMenuCommand === 'function') {
            gmRegisterMenuCommand(label, callback);
            return true;
          }

          if (gmApi && typeof gmApi.registerMenuCommand === 'function') {
            gmApi.registerMenuCommand(label, callback);
            return true;
          }
        } catch (error) {
          logger.warn(`${SCRIPT_NAME}: failed to register menu command.`, error);
        }

        return false;
      },
    };
  }
  // WEB_PAGE_ASSISTANT_STORAGE_PORT_END

  const storagePort = createWebPageAssistantStoragePort({
    settingsContract: PageAssistantSettings,
    normalizeWidgetPosition,
    storageKey: STORAGE_KEY,
    widgetPositionKey: WIDGET_POSITION_KEY,
    fallbackStorageKey: FALLBACK_STORAGE_KEY,
    fallbackWidgetPositionKey: FALLBACK_WIDGET_POSITION_KEY,
    gmGetValue: typeof GM_getValue === 'function' ? GM_getValue : null,
    gmSetValue: typeof GM_setValue === 'function' ? GM_setValue : null,
    gmRegisterMenuCommand: typeof GM_registerMenuCommand === 'function' ? GM_registerMenuCommand : null,
    gmApi: typeof GM !== 'undefined' ? GM : null,
    localStorageAdapter: localStorage,
    logger: console,
    toPromise: maybePromise,
  });

  function resolveActiveSetting(sourceSettings = settings) {
    return PageAssistantSettings.resolveActiveRefresh(sourceSettings, {
      pageKey: currentPageKey,
      siteKey: currentSiteKey,
    });
  }

  function resolveActiveUnlockerSetting(sourceSettings = settings) {
    return PageAssistantSettings.resolveActiveUnlocker(sourceSettings, {
      pageKey: currentPageKey,
      siteKey: currentSiteKey,
    });
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
	        color: var(--part-text);
	        --part-text: oklch(22% 0.012 250);
	        --part-muted-text: oklch(48% 0.012 250);
	        --part-soft-text: oklch(35% 0.014 250);
	        --part-surface: oklch(98.8% 0.003 250);
	        --part-panel: oklch(96.4% 0.004 250);
	        --part-panel-strong: oklch(92.8% 0.006 250);
	        --part-field: oklch(99.4% 0.003 250);
	        --part-line: oklch(88% 0.006 250);
	        --part-line-strong: oklch(73% 0.01 250);
	        --part-action: oklch(24% 0.012 250);
	        --part-action-hover: oklch(18% 0.01 250);
	        --part-accent: oklch(52% 0.045 160);
	        --part-accent-strong: oklch(37% 0.038 160);
	        --part-accent-soft: oklch(94.5% 0.012 160);
	        --part-danger: oklch(45% 0.13 25);
	        --part-danger-soft: oklch(95% 0.02 25);
	        --part-shadow-soft: 0 10px 30px oklch(20% 0.01 250 / 0.12);
	        --part-shadow-strong: 0 24px 72px oklch(20% 0.012 250 / 0.24);
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

	      #${ROOT_ID} button,
	      #${ROOT_ID} input,
	      #${ROOT_ID} select {
	        color: inherit;
	      }

	      #${ROOT_ID} button:focus-visible,
	      #${ROOT_ID} input:focus-visible,
	      #${ROOT_ID} select:focus-visible {
	        outline: 2px solid var(--part-accent);
	        outline-offset: 2px;
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
	        border: 1px solid var(--part-line);
	        border-radius: 999px;
	        background: var(--part-surface);
	        color: var(--part-text);
	        box-shadow: var(--part-shadow-soft);
	        cursor: grab;
	        opacity: 0.72;
	        overflow: hidden;
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
	        background: var(--part-surface);
	        box-shadow: 0 14px 38px oklch(28% 0.03 242 / 0.2);
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
	        background: var(--part-action);
	        color: oklch(98.6% 0.003 250);
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
	        color: var(--part-text);
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
	        border: 1px solid var(--part-line);
	        border-radius: 8px;
	        background: var(--part-surface);
	        box-shadow: 0 18px 50px oklch(25% 0.035 242 / 0.2);
        opacity: 0;
        pointer-events: none;
        transform: translateY(8px) scale(0.98);
        transform-origin: var(--part-panel-origin, bottom right);
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
	        font-size: 15px;
	        font-weight: 750;
	      }

	      #${ROOT_ID} .part-subtitle {
	        margin: 4px 0 0;
	        color: var(--part-muted-text);
	        font-size: 12px;
	      }

      #${ROOT_ID} .part-widget-countdown {
        margin: 6px 0 6px;
        font-size: 22px;
        font-weight: 750;
	        color: var(--part-text);
        font-variant-numeric: tabular-nums;
      }

      #${ROOT_ID} .part-muted {
	        color: var(--part-muted-text);
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
	        padding: 7px 12px;
	        border-radius: 7px;
	        background: var(--part-action);
	        color: oklch(98.6% 0.003 250);
	        font-weight: 650;
	        transition:
	          background-color 140ms ease,
	          box-shadow 140ms ease,
	          transform 140ms ease;
	      }

	      #${ROOT_ID} .part-button:hover {
	        background: var(--part-action-hover);
	        box-shadow: 0 7px 18px oklch(20% 0.01 250 / 0.18);
	      }

	      #${ROOT_ID} .part-button:active {
	        transform: translateY(1px);
	      }

	      #${ROOT_ID} .part-button[data-variant="secondary"] {
	        background: var(--part-panel-strong);
	        color: var(--part-text);
	      }

	      #${ROOT_ID} .part-button[data-variant="danger"] {
	        background: var(--part-danger-soft);
	        color: var(--part-danger);
	      }

	      #${ROOT_ID} .part-button[data-variant="danger"]:hover {
	        background: oklch(91% 0.052 25);
	        box-shadow: none;
	      }

      #${ROOT_ID} .part-icon-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
	        width: 30px;
	        height: 30px;
	        border-radius: 7px;
	        background: var(--part-panel-strong);
	        color: var(--part-text);
	        font-size: 18px;
	        line-height: 1;
	        transition:
	          background-color 140ms ease,
	          transform 140ms ease;
	      }

	      #${ROOT_ID} .part-icon-button:hover {
	        background: var(--part-panel);
	        transform: translateY(-1px);
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
	        background: oklch(28% 0.025 242 / 0.42);
	      }

	      #${ROOT_ID} .part-dialog {
	        width: min(640px, 100%);
	        max-height: min(760px, calc(100vh - 36px));
	        overflow: auto;
	        border: 1px solid var(--part-line);
	        border-radius: 8px;
	        background: var(--part-surface);
	        box-shadow: var(--part-shadow-strong);
	      }

	      #${ROOT_ID} .part-dialog-header {
	        position: sticky;
	        top: 0;
	        display: block;
	        padding: 16px 18px 0;
	        border-bottom: 1px solid var(--part-line);
	        background: var(--part-surface);
	        z-index: 1;
	      }

	      #${ROOT_ID} .part-dialog-header-top {
	        display: flex;
	        align-items: flex-start;
	        justify-content: space-between;
	        gap: 12px;
	        padding-bottom: 14px;
	      }

	      #${ROOT_ID} .part-tabs {
	        display: flex;
	        align-items: center;
	        gap: 6px;
	        padding: 0 0 10px;
	      }

	      #${ROOT_ID} .part-tab {
	        min-height: 34px;
	        padding: 7px 12px;
	        border: 1px solid transparent;
	        border-radius: 7px;
	        background: transparent;
	        color: var(--part-muted-text);
	        font-weight: 700;
	        transition:
	          background-color 140ms ease,
	          border-color 140ms ease,
	          color 140ms ease;
	      }

	      #${ROOT_ID} .part-tab:hover {
	        background: var(--part-panel);
	        color: var(--part-text);
	      }

	      #${ROOT_ID} .part-tab[aria-selected="true"] {
	        border-color: var(--part-line-strong);
	        background: var(--part-panel-strong);
	        color: var(--part-text);
	      }

	      #${ROOT_ID} .part-tab-panel[hidden] {
	        display: none;
	      }

	      #${ROOT_ID} .part-dialog-body {
	        padding: 18px;
	      }

	      #${ROOT_ID} .part-section {
	        margin-top: 18px;
	        padding-top: 18px;
	        border-top: 1px solid var(--part-line);
	      }

	      #${ROOT_ID} .part-section:first-child {
	        margin-top: 0;
	        padding-top: 0;
	        border-top: 0;
	      }

	      #${ROOT_ID} .part-section-title {
	        margin: 0 0 8px;
	        font-size: 12px;
	        font-weight: 750;
	        color: var(--part-soft-text);
	        letter-spacing: 0;
	      }

	      #${ROOT_ID} .part-status-box {
	        padding: 12px;
	        border-radius: 8px;
	        background: var(--part-panel);
	        border: 1px solid var(--part-line);
	      }

      #${ROOT_ID} .part-key {
        display: block;
        margin-top: 4px;
        overflow-wrap: anywhere;
	        color: var(--part-muted-text);
	        font-size: 12px;
	      }

      #${ROOT_ID} .part-scope-grid {
        align-items: stretch;
        flex-wrap: wrap;
      }

      #${ROOT_ID} .part-scope-card {
	        flex: 1 1 210px;
	        display: block;
	        padding: 12px;
	        border: 1px solid var(--part-line);
	        border-radius: 8px;
	        background: var(--part-field);
	        transition:
	          border-color 140ms ease,
	          background-color 140ms ease,
	          box-shadow 140ms ease;
	      }

	      #${ROOT_ID} .part-scope-card:has(input:checked) {
	        border-color: var(--part-line-strong);
	        background: var(--part-panel);
	        box-shadow: inset 0 0 0 1px oklch(75% 0.01 250 / 0.18);
	      }

	      #${ROOT_ID} .part-scope-card input {
	        margin-right: 6px;
	        accent-color: var(--part-accent);
      }

      #${ROOT_ID} .part-presets {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 8px;
      }

      #${ROOT_ID} .part-preset {
        min-height: 36px;
        padding: 8px;
	        border: 1px solid var(--part-line);
	        border-radius: 7px;
	        background: var(--part-field);
	        color: var(--part-text);
	        font-weight: 650;
	        transition:
	          border-color 140ms ease,
	          background-color 140ms ease,
	          transform 140ms ease;
	      }

	      #${ROOT_ID} .part-preset:hover,
	      #${ROOT_ID} .part-preset:focus-visible {
	        border-color: var(--part-line-strong);
	        background: var(--part-panel);
	        outline: none;
	      }

	      #${ROOT_ID} .part-preset:active {
	        transform: translateY(1px);
	      }

      #${ROOT_ID} .part-custom-row {
        align-items: stretch;
        flex-wrap: wrap;
      }

      #${ROOT_ID} .part-custom-row input,
      #${ROOT_ID} .part-custom-row select {
        min-height: 36px;
	        border: 1px solid var(--part-line-strong);
	        border-radius: 7px;
	        background: var(--part-field);
	        color: var(--part-text);
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

	      #${ROOT_ID} .part-check-list {
	        display: grid;
	        grid-template-columns: repeat(2, minmax(0, 1fr));
	        gap: 8px;
	      }

	      #${ROOT_ID} .part-check-card {
	        display: flex;
	        align-items: flex-start;
	        gap: 8px;
	        min-height: 42px;
	        padding: 10px;
	        border: 1px solid var(--part-line);
	        border-radius: 7px;
	        background: var(--part-field);
	        transition:
	          border-color 140ms ease,
	          background-color 140ms ease,
	          box-shadow 140ms ease;
	      }

	      #${ROOT_ID} .part-check-card input {
	        margin-top: 2px;
	        accent-color: var(--part-accent);
	      }

	      #${ROOT_ID} .part-check-card:has(input:checked) {
	        border-color: var(--part-line-strong);
	        background: var(--part-panel);
	        box-shadow: inset 0 0 0 1px oklch(75% 0.01 250 / 0.18);
	      }

	      #${ROOT_ID} .part-message {
	        min-height: 20px;
	        margin-top: 10px;
	        color: var(--part-soft-text);
	        font-size: 13px;
	      }

	      #${ROOT_ID} .part-message[data-tone="error"] {
	        color: var(--part-danger);
	      }

      @media (max-width: 520px) {
	        #${ROOT_ID} .part-presets {
	          grid-template-columns: repeat(2, minmax(0, 1fr));
	        }

	        #${ROOT_ID} .part-check-list {
	          grid-template-columns: 1fr;
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
    return dialogContract.readSelectedScope(dialog);
  }

  function setMessage(text, tone = 'info') {
    const messageNode = dialog?.querySelector(dialogContract.roleSelector(dialogContract.roles.message));
    if (!messageNode) return;

    messageNode.textContent = text;
    messageNode.dataset.tone = tone;
  }

  function currentStatusText() {
    if (!activeMatch) return '当前未启用自动刷新。';
    return `${scopeLabel(activeMatch.scope)}已启用，每 ${formatInterval(activeMatch.setting.intervalMs)} 刷新一次。`;
  }

  function unlockerStatusText(setting = activeUnlockerMatch?.setting) {
    if (!setting?.enabled) return '当前未启用网页限制解除。';

    const labels = [];
    if (setting.allowSelection) labels.push('选择文本');
    if (setting.allowCopy) labels.push('复制/剪切');
    if (setting.allowContextMenu) labels.push('右键菜单');
    if (setting.allowDrag) labels.push('拖拽');
    if (setting.suppressBeforeUnload) labels.push('离开提示');

    if (!labels.length) return '网页限制解除已保存，但没有启用任何能力。';
    return `${scopeLabel(activeUnlockerMatch?.scope || getSelectedScope())}已启用：${labels.join('、')}。`;
  }

  function defaultUnlockerSetting(overrides = {}) {
    return PageAssistantSettings.defaultUnlockerSetting(overrides);
  }

  // WEB_PAGE_ASSISTANT_DIALOG_CONTRACT_START
  function createPageAssistantDialogContract(adapters) {
    const {
      settingsContract,
      defaultUnlockerSetting,
      formatInterval,
      defaultIntervalMs,
    } = adapters;
    const tabs = { refresh: 'refresh', unlocker: 'unlocker' };
    const roles = {
      status: 'status',
      pageKey: 'page-key',
      siteKey: 'site-key',
      presets: 'presets',
      customValue: 'custom-value',
      customUnit: 'custom-unit',
      message: 'message',
      unlockerStatus: 'unlocker-status',
      unlockerPageKey: 'unlocker-page-key',
      unlockerSiteKey: 'unlocker-site-key',
      unlockerEnabled: 'unlocker-enabled',
      unlockerSelection: 'unlocker-selection',
      unlockerCopy: 'unlocker-copy',
      unlockerContextMenu: 'unlocker-context-menu',
      unlockerDrag: 'unlocker-drag',
      unlockerBeforeUnload: 'unlocker-beforeunload',
    };
    const actions = {
      savePreset: 'save-preset',
      deletePage: 'delete-page',
      deleteSite: 'delete-site',
      deleteUnlockerPage: 'delete-unlocker-page',
      deleteUnlockerSite: 'delete-unlocker-site',
    };

    function roleSelector(role) {
      return `[data-part-role="${role}"]`;
    }

    function actionSelector(action) {
      return `[data-part-action="${action}"]`;
    }

    function normalizeTab(value, fallback = tabs.refresh) {
      return value === tabs.unlocker || value === tabs.refresh ? value : fallback;
    }

    function focusRoleForTab(tab) {
      return normalizeTab(tab) === tabs.unlocker ? roles.unlockerEnabled : roles.customValue;
    }

    function readSelectedScope(dialogNode) {
      const selected = dialogNode?.querySelector('input[name="part-scope"]:checked')?.value;
      return selected === 'site' ? 'site' : 'page';
    }

    function isChecked(dialogNode, role) {
      return dialogNode?.querySelector(roleSelector(role))?.checked === true;
    }

    function createViewModel(input) {
      const nextTab = normalizeTab(input.preferredTab, input.activeTab);
      const selectedScope = input.preferredScope
        || input.activeRefreshMatch?.scope
        || input.activeUnlockerMatch?.scope
        || 'page';
      const pageSetting = settingsContract.getRefreshSetting(input.settings, 'page', input.pageKey);
      const siteSetting = settingsContract.getRefreshSetting(input.settings, 'site', input.siteKey);
      const pageUnlockerSetting = settingsContract.getUnlockerSetting(input.settings, 'page', input.pageKey);
      const siteUnlockerSetting = settingsContract.getUnlockerSetting(input.settings, 'site', input.siteKey);
      const scopedUnlockerSetting = selectedScope === 'site' ? siteUnlockerSetting : pageUnlockerSetting;
      const defaultInterval = input.activeRefreshMatch?.setting.intervalMs || defaultIntervalMs;
      const customInterval = defaultInterval % (60 * 1000) === 0
        ? { value: String(defaultInterval / (60 * 1000)), unit: 'minutes' }
        : { value: String(Math.round(defaultInterval / 1000)), unit: 'seconds' };

      return {
        message: input.message || '',
        activeTab: nextTab,
        selectedScope,
        pageSetting,
        siteSetting,
        pageUnlockerSetting,
        siteUnlockerSetting,
        unlockerFormSetting: scopedUnlockerSetting || defaultUnlockerSetting({ enabled: false }),
        customInterval,
        statusText: input.statusText,
        unlockerStatusText: input.unlockerStatusText,
        pageRefreshText: `页面：${input.pageKey}${pageSetting ? `（${formatInterval(pageSetting.intervalMs)}）` : '（未设置）'}`,
        siteRefreshText: `站点：${input.siteKey}${siteSetting ? `（${formatInterval(siteSetting.intervalMs)}）` : '（未设置）'}`,
        pageUnlockerText: `页面：${input.pageKey}${pageUnlockerSetting ? '（已保存）' : '（未设置）'}`,
        siteUnlockerText: `站点：${input.siteKey}${siteUnlockerSetting ? '（已保存）' : '（未设置）'}`,
        focusRole: focusRoleForTab(nextTab),
      };
    }

    function applyModel(dialogNode, model, presets) {
      const textByRole = [
        [roles.status, model.statusText],
        [roles.pageKey, model.pageRefreshText],
        [roles.siteKey, model.siteRefreshText],
        [roles.unlockerStatus, model.unlockerStatusText],
        [roles.unlockerPageKey, model.pageUnlockerText],
        [roles.unlockerSiteKey, model.siteUnlockerText],
      ];
      for (const [role, text] of textByRole) {
        const node = dialogNode.querySelector(roleSelector(role));
        if (node) node.textContent = text;
      }

      const scopeInput = dialogNode.querySelector(`input[name="part-scope"][value="${model.selectedScope}"]`);
      if (scopeInput) scopeInput.checked = true;

      const presetsNode = dialogNode.querySelector(roleSelector(roles.presets));
      for (const preset of presets) {
        const presetButton = dialogNode.ownerDocument.createElement('button');
        presetButton.type = 'button';
        presetButton.className = 'part-preset';
        presetButton.dataset.partAction = actions.savePreset;
        presetButton.dataset.intervalMs = String(preset.ms);
        presetButton.textContent = preset.label;
        presetsNode.append(presetButton);
      }

      dialogNode.querySelector(roleSelector(roles.customValue)).value = model.customInterval.value;
      dialogNode.querySelector(roleSelector(roles.customUnit)).value = model.customInterval.unit;
      dialogNode.querySelector(actionSelector(actions.deletePage)).disabled = !model.pageSetting;
      dialogNode.querySelector(actionSelector(actions.deleteSite)).disabled = !model.siteSetting;
      dialogNode.querySelector(roleSelector(roles.unlockerEnabled)).checked = model.unlockerFormSetting.enabled;
      dialogNode.querySelector(roleSelector(roles.unlockerSelection)).checked = model.unlockerFormSetting.allowSelection;
      dialogNode.querySelector(roleSelector(roles.unlockerCopy)).checked = model.unlockerFormSetting.allowCopy;
      dialogNode.querySelector(roleSelector(roles.unlockerContextMenu)).checked = model.unlockerFormSetting.allowContextMenu;
      dialogNode.querySelector(roleSelector(roles.unlockerDrag)).checked = model.unlockerFormSetting.allowDrag;
      dialogNode.querySelector(roleSelector(roles.unlockerBeforeUnload)).checked = model.unlockerFormSetting.suppressBeforeUnload;
      dialogNode.querySelector(actionSelector(actions.deleteUnlockerPage)).disabled = !model.pageUnlockerSetting;
      dialogNode.querySelector(actionSelector(actions.deleteUnlockerSite)).disabled = !model.siteUnlockerSetting;
      dialogNode.querySelector(roleSelector(model.focusRole))?.focus();
    }

    function readUnlockerFormSetting(dialogNode) {
      return defaultUnlockerSetting({
        enabled: isChecked(dialogNode, roles.unlockerEnabled),
        allowSelection: isChecked(dialogNode, roles.unlockerSelection),
        allowCopy: isChecked(dialogNode, roles.unlockerCopy),
        allowContextMenu: isChecked(dialogNode, roles.unlockerContextMenu),
        allowDrag: isChecked(dialogNode, roles.unlockerDrag),
        suppressBeforeUnload: isChecked(dialogNode, roles.unlockerBeforeUnload),
      });
    }

    return {
      roles,
      tabs,
      actions,
      roleSelector,
      actionSelector,
      normalizeTab,
      focusRoleForTab,
      readSelectedScope,
      createViewModel,
      applyModel,
      readUnlockerFormSetting,
    };
  }
  // WEB_PAGE_ASSISTANT_DIALOG_CONTRACT_END

  const dialogContract = createPageAssistantDialogContract({
    settingsContract: PageAssistantSettings,
    defaultUnlockerSetting,
    formatInterval,
    defaultIntervalMs: 5 * 60 * 1000,
  });

  // WEB_PAGE_ASSISTANT_REFRESH_RUNTIME_START
  function createRefreshRuntime(adapters) {
    const {
      minIntervalMs,
      tickMs,
      now,
      setInterval: setTimer,
      clearInterval: clearTimer,
      reload,
      onStateChange,
    } = adapters;
    const emptyState = {
      activeMatch: null,
      targetTime: 0,
      remainingWhenPaused: 0,
      isPaused: false,
      isRefreshing: false,
      timerId: null,
    };
    let state = { ...emptyState };

    function clearActiveTimer() {
      if (!state.timerId) return;
      clearTimer(state.timerId);
      state = { ...state, timerId: null };
    }

    function snapshot() {
      const remainingMs = state.activeMatch
        ? state.isPaused
          ? state.remainingWhenPaused
          : Math.max(0, state.targetTime - now())
        : 0;
      return {
        activeMatch: state.activeMatch,
        isPaused: state.isPaused,
        isRefreshing: state.isRefreshing,
        remainingMs,
      };
    }

    function emit() {
      onStateChange(snapshot());
    }

    function tick() {
      if (!state.activeMatch || state.isPaused || state.isRefreshing) {
        emit();
        return;
      }

      const remainingMs = state.targetTime - now();
      emit();
      if (remainingMs > 0) return;

      state = { ...state, isRefreshing: true };
      clearActiveTimer();
      emit();
      reload();
    }

    function startTimer() {
      clearActiveTimer();
      if (!state.activeMatch || state.isPaused) {
        emit();
        return;
      }

      state = { ...state, timerId: setTimer(tick, tickMs) };
      tick();
    }

    function restart(activeMatch) {
      clearActiveTimer();
      if (!activeMatch) {
        state = { ...emptyState };
        emit();
        return;
      }

      state = {
        ...emptyState,
        activeMatch,
        targetTime: now() + activeMatch.setting.intervalMs,
      };
      startTimer();
    }

    function stop() {
      clearActiveTimer();
      state = { ...emptyState };
      emit();
    }

    function togglePause() {
      if (!state.activeMatch) return snapshot();

      if (state.isPaused) {
        state = {
          ...state,
          targetTime: now() + state.remainingWhenPaused,
          remainingWhenPaused: 0,
          isPaused: false,
        };
        startTimer();
        return snapshot();
      }

      state = {
        ...state,
        remainingWhenPaused: Math.max(minIntervalMs, state.targetTime - now()),
        isPaused: true,
      };
      clearActiveTimer();
      emit();
      return snapshot();
    }

    return {
      restart,
      stop,
      togglePause,
      getState: snapshot,
      tick,
    };
  }
  // WEB_PAGE_ASSISTANT_REFRESH_RUNTIME_END

  const refreshRuntime = createRefreshRuntime({
    minIntervalMs: MIN_INTERVAL_MS,
    tickMs: TICK_MS,
    now: () => Date.now(),
    setInterval: (handler, delay) => window.setInterval(handler, delay),
    clearInterval: (timer) => window.clearInterval(timer),
    reload: () => location.reload(),
    onStateChange(state) {
      activeMatch = state.activeMatch;
      updatePauseButton();
      updateCountdownText();
    },
  });

  // WEB_PAGE_ASSISTANT_SESSION_START
  function createWebPageAssistantSession(adapters) {
    const {
      settingsContract,
      storagePort,
      refreshRuntime,
      getSettings,
      setSettings,
      getActiveMatch,
      setActiveMatch,
      setActiveUnlockerMatch,
      getPageKey,
      getSiteKey,
      getSelectedScope,
      parseCustomInterval,
      readUnlockerFormSetting,
      resolveActiveSetting,
      resolveActiveUnlockerSetting,
      renderDialog,
      renderWidget,
      updatePauseButton,
      updateCountdownText,
      installUnlocker,
      setMessage,
      scopeLabel,
      formatInterval,
    } = adapters;
    const supportedActions = new Set([
      'open-settings',
      'switch-tab',
      'close-dialog',
      'toggle-pause',
      'save-preset',
      'save-custom',
      'delete-page',
      'delete-site',
      'save-unlocker',
      'delete-unlocker-page',
      'delete-unlocker-site',
      'disable-active',
    ]);

    function keyForScope(scope) {
      return scope === 'site' ? getSiteKey() : getPageKey();
    }

    function canHandle(action) {
      return supportedActions.has(action);
    }

    async function writeSettings(nextSettings) {
      const next = await storagePort.writeSettings(nextSettings);
      setSettings(next);
      return next;
    }

    function restartActiveCountdown() {
      refreshRuntime.restart(resolveActiveSetting(getSettings()));
      renderWidget();
      updatePauseButton();
      updateCountdownText();
    }

    function refreshUnlockerState() {
      const activeUnlockerMatch = resolveActiveUnlockerSetting(getSettings());
      setActiveUnlockerMatch(activeUnlockerMatch);
      installUnlocker(activeUnlockerMatch?.setting);
      return activeUnlockerMatch;
    }

    async function saveSetting(scope, intervalMs) {
      const next = settingsContract.setRefreshSetting(getSettings(), scope, keyForScope(scope), intervalMs);
      await writeSettings(next);
      restartActiveCountdown();
    }

    async function deleteSetting(scope) {
      const next = settingsContract.deleteRefreshSetting(getSettings(), scope, keyForScope(scope));
      await writeSettings(next);
      restartActiveCountdown();
    }

    async function saveUnlockerSetting(scope, unlockerSetting) {
      const normalized = settingsContract.normalizeUnlockerSetting(unlockerSetting);
      if (!normalized) return;

      const next = settingsContract.setUnlockerSetting(getSettings(), scope, keyForScope(scope), normalized);
      await writeSettings(next);
      refreshUnlockerState();
    }

    async function deleteUnlockerSetting(scope) {
      const next = settingsContract.deleteUnlockerSetting(getSettings(), scope, keyForScope(scope));
      await writeSettings(next);
      refreshUnlockerState();
    }

    async function dispatch(action, actionNode) {
      if (action === 'open-settings') {
        renderDialog('', null, 'refresh');
        return;
      }

      if (action === 'switch-tab') {
        renderDialog('', getSelectedScope(), actionNode.dataset.partTab);
        return;
      }

      if (action === 'close-dialog') {
        adapters.closeDialog();
        return;
      }

      if (action === 'toggle-pause') {
        refreshRuntime.togglePause();
        return;
      }

      if (action === 'save-preset') {
        const intervalMs = Number(actionNode.dataset.intervalMs);
        const scope = getSelectedScope();
        if (!settingsContract.isValidIntervalMs(intervalMs)) {
          setMessage('预设刷新时间无效。', 'error');
          return;
        }

        await saveSetting(scope, intervalMs);
        renderDialog(`已保存到${scopeLabel(scope)}：每 ${formatInterval(intervalMs)} 刷新一次。`, scope, 'refresh');
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
        renderDialog(`已保存到${scopeLabel(scope)}：每 ${formatInterval(parsed.intervalMs)} 刷新一次。`, scope, 'refresh');
        return;
      }

      if (action === 'delete-page') {
        await deleteSetting('page');
        renderDialog('已删除当前页面设置。', 'page', 'refresh');
        return;
      }

      if (action === 'delete-site') {
        await deleteSetting('site');
        renderDialog('已删除整个站点设置。', 'site', 'refresh');
        return;
      }

      if (action === 'save-unlocker') {
        const scope = getSelectedScope();
        const unlockerSetting = readUnlockerFormSetting();
        await saveUnlockerSetting(scope, unlockerSetting);
        renderDialog(unlockerSetting.enabled
          ? `已保存到${scopeLabel(scope)}：${adapters.unlockerStatusText(unlockerSetting)}`
          : `已保存到${scopeLabel(scope)}：网页限制解除关闭。`, scope, 'unlocker');
        return;
      }

      if (action === 'delete-unlocker-page') {
        await deleteUnlockerSetting('page');
        renderDialog('已删除当前页面限制解除设置。', 'page', 'unlocker');
        return;
      }

      if (action === 'delete-unlocker-site') {
        await deleteUnlockerSetting('site');
        renderDialog('已删除整个站点限制解除设置。', 'site', 'unlocker');
        return;
      }

      if (action === 'disable-active') {
        const activeMatch = getActiveMatch();
        if (!activeMatch) return;

        const disabledScope = activeMatch.scope;
        setActiveMatch(null);
        await deleteSetting(disabledScope);
        if (adapters.hasDialog()) renderDialog(`已停用${scopeLabel(disabledScope)}自动刷新。`, disabledScope, 'refresh');
      }
    }

    return {
      canHandle,
      dispatch,
      saveSetting,
      deleteSetting,
      saveUnlockerSetting,
      deleteUnlockerSetting,
      restartActiveCountdown,
      refreshUnlockerState,
    };
  }
  // WEB_PAGE_ASSISTANT_SESSION_END

  webPageAssistantSession = createWebPageAssistantSession({
    settingsContract: PageAssistantSettings,
    storagePort,
    refreshRuntime,
    getSettings: () => settings,
    setSettings(nextSettings) {
      settings = nextSettings;
    },
    getActiveMatch: () => activeMatch,
    setActiveMatch(nextActiveMatch) {
      activeMatch = nextActiveMatch;
    },
    setActiveUnlockerMatch(nextActiveUnlockerMatch) {
      activeUnlockerMatch = nextActiveUnlockerMatch;
    },
    getPageKey: () => currentPageKey,
    getSiteKey: () => currentSiteKey,
    getSelectedScope,
    parseCustomInterval,
    readUnlockerFormSetting,
    resolveActiveSetting,
    resolveActiveUnlockerSetting,
    renderDialog,
    renderWidget,
    updatePauseButton,
    updateCountdownText,
    installUnlocker,
    setMessage,
    closeDialog,
    hasDialog: () => Boolean(dialog),
    unlockerStatusText,
    scopeLabel,
    formatInterval,
  });

  function clampNumber(value, min, max) {
    return Math.min(Math.max(min, value), max);
  }

  // WEB_PAGE_ASSISTANT_WIDGET_LAYOUT_RUNTIME_START
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
            logger.warn(`${SCRIPT_NAME}: failed to persist widget position.`, error);
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
  // WEB_PAGE_ASSISTANT_WIDGET_LAYOUT_RUNTIME_END

  widgetLayoutRuntime = createWidgetLayoutRuntime({
    normalizeWidgetPosition,
    clampNumber,
    getViewportSize: () => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }),
    persistPosition: (positionToPersist) => storagePort.writeWidgetPosition(positionToPersist),
    onPositionChange(nextPosition) {
      widgetPosition = nextPosition;
    },
    setTimeout: (handler, delay) => window.setTimeout(handler, delay),
    logger: console,
    constants: {
      buttonSize: WIDGET_BUTTON_SIZE,
      widgetWidth: WIDGET_WIDTH,
      widgetHeight: WIDGET_HEIGHT,
      panelWidth: WIDGET_PANEL_WIDTH,
      panelGap: WIDGET_PANEL_GAP,
      safeMargin: WIDGET_SAFE_MARGIN,
      defaultOffset: DEFAULT_WIDGET_OFFSET,
    },
  });

  function createWidgetViewModel() {
    if (!activeMatch) return null;

    return {
      summary: currentStatusText(),
    };
  }

  function renderWidget() {
    ensureRoot();

    if (widget) {
      widget.remove();
      widget = null;
      widgetButton = null;
      countdownNodes = [];
    }

    const model = createWidgetViewModel();
    if (!model) return;

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
    widget.querySelector('[data-part-role="widget-summary"]').textContent = model.summary;
    widgetLayoutRuntime.attach(widget, widgetButton, widgetPosition);
    root.append(widget);
    widgetLayoutRuntime.applyPosition();
    updatePauseButton();
    updateCountdownText();
  }

  function createDialogViewModel(message = '', preferredScope = null, preferredTab = null) {
    return dialogContract.createViewModel({
      message,
      preferredScope,
      preferredTab,
      activeTab: activeDialogTab,
      activeRefreshMatch: activeMatch,
      activeUnlockerMatch,
      settings,
      pageKey: currentPageKey,
      siteKey: currentSiteKey,
      statusText: currentStatusText(),
      unlockerStatusText: unlockerStatusText(),
    });
  }

  function renderDialog(message = '', preferredScope = null, preferredTab = null) {
    ensureRoot();

    if (dialog) {
      dialog.remove();
      dialog = null;
    }

    const model = createDialogViewModel(message, preferredScope, preferredTab);
    activeDialogTab = model.activeTab;

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
        <div class="part-dialog-header-top">
          <div>
            <h2 class="part-title" id="part-dialog-title">网页助手</h2>
            <p class="part-subtitle">按页面或站点管理自动刷新与限制解除。</p>
          </div>
          <button type="button" class="part-icon-button" data-part-action="close-dialog" aria-label="关闭">
            <span class="part-close-icon" aria-hidden="true"></span>
          </button>
        </div>
        <div class="part-tabs" role="tablist" aria-label="网页助手功能">
          <button type="button" class="part-tab" role="tab" aria-selected="${model.activeTab === 'refresh'}" data-part-action="switch-tab" data-part-tab="refresh">自动刷新</button>
          <button type="button" class="part-tab" role="tab" aria-selected="${model.activeTab === 'unlocker'}" data-part-action="switch-tab" data-part-tab="unlocker">限制解除</button>
        </div>
	      </div>
	      <div class="part-dialog-body">
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

        <section class="part-tab-panel" data-part-tab-panel="refresh"${model.activeTab === 'refresh' ? '' : ' hidden'}>
          <section class="part-section">
            <p class="part-section-title">当前状态</p>
            <div class="part-status-box">
              <div data-part-role="status"></div>
              <span class="part-key" data-part-role="page-key"></span>
              <span class="part-key" data-part-role="site-key"></span>
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
        </section>

        <section class="part-tab-panel" data-part-tab-panel="unlocker"${model.activeTab === 'unlocker' ? '' : ' hidden'}>
	          <section class="part-section">
	            <p class="part-section-title">当前状态</p>
	            <div class="part-status-box">
	              <div data-part-role="unlocker-status"></div>
	              <span class="part-key" data-part-role="unlocker-page-key"></span>
	              <span class="part-key" data-part-role="unlocker-site-key"></span>
	            </div>
	          </section>

	          <section class="part-section">
	            <p class="part-section-title">解除能力</p>
	            <div class="part-row">
	              <label class="part-check-card">
	                <input type="checkbox" data-part-role="unlocker-enabled">
	                <span>启用当前范围的限制解除</span>
	              </label>
	            </div>
	            <div class="part-row part-check-list">
	              <label class="part-check-card">
	                <input type="checkbox" data-part-role="unlocker-selection">
	                <span>允许选择文本</span>
	              </label>
	              <label class="part-check-card">
	                <input type="checkbox" data-part-role="unlocker-copy">
	                <span>允许复制/剪切</span>
	              </label>
	              <label class="part-check-card">
	                <input type="checkbox" data-part-role="unlocker-context-menu">
	                <span>允许右键菜单</span>
	              </label>
	              <label class="part-check-card">
	                <input type="checkbox" data-part-role="unlocker-drag">
	                <span>允许拖拽</span>
	              </label>
	              <label class="part-check-card">
	                <input type="checkbox" data-part-role="unlocker-beforeunload">
	                <span>忽略离开页面提示</span>
	              </label>
	            </div>
	          </section>

	          <section class="part-section">
	            <p class="part-section-title">保存与删除</p>
	            <div class="part-dialog-actions">
	              <button type="button" class="part-button" data-part-action="save-unlocker">保存限制解除设置</button>
	              <button type="button" class="part-button" data-variant="danger" data-part-action="delete-unlocker-page">删除当前页面限制解除</button>
	              <button type="button" class="part-button" data-variant="danger" data-part-action="delete-unlocker-site">删除整个站点限制解除</button>
	            </div>
	          </section>
	        </section>

	        <div class="part-message" data-part-role="message" aria-live="polite"></div>
	      </div>
    `;

    dialog.append(panel);
    root.append(dialog);
    dialogContract.applyModel(dialog, model, PRESETS);
    setMessage(model.message);
  }

  function closeDialog() {
    if (!dialog) return;
    dialog.remove();
    dialog = null;
  }

  function parseCustomInterval() {
    const valueNode = dialog?.querySelector(dialogContract.roleSelector(dialogContract.roles.customValue));
    const unitNode = dialog?.querySelector(dialogContract.roleSelector(dialogContract.roles.customUnit));
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

  function readUnlockerFormSetting() {
    return dialogContract.readUnlockerFormSetting(dialog);
  }

  function restartActiveCountdown() {
    webPageAssistantSession.restartActiveCountdown();
  }

  function updateCountdownText() {
    if (!countdownNodes.length) return;

    const runtimeState = refreshRuntime.getState();
    if (!runtimeState.activeMatch) {
      for (const node of countdownNodes) {
        node.textContent = '--:--';
      }
      return;
    }

    const text = formatCountdown(runtimeState.remainingMs);
    for (const node of countdownNodes) {
      node.textContent = text;
    }
  }

  function updatePauseButton() {
    const pauseButton = widget?.querySelector('[data-part-action="toggle-pause"]');
    if (!pauseButton) return;
    pauseButton.textContent = refreshRuntime.getState().isPaused ? '继续' : '暂停';
  }

  function stopEvent(event) {
    if (root?.contains(event.target)) return;
    event.stopPropagation();
  }

  function stopBeforeUnload(event) {
    event.stopImmediatePropagation();
    event.returnValue = undefined;
    return undefined;
  }

  function createUnlockerRuntime() {
    const capabilitySpecs = [
      { option: 'allowSelection', target: () => document, type: 'selectstart', handler: stopEvent },
      { option: 'allowCopy', target: () => document, type: 'copy', handler: stopEvent },
      { option: 'allowCopy', target: () => document, type: 'cut', handler: stopEvent },
      { option: 'allowContextMenu', target: () => document, type: 'contextmenu', handler: stopEvent },
      { option: 'allowDrag', target: () => document, type: 'dragstart', handler: stopEvent },
      { option: 'suppressBeforeUnload', target: () => window, type: 'beforeunload', handler: stopBeforeUnload },
    ];
    let cleanupStack = [];

    function addListener(target, type, handler) {
      target.addEventListener(type, handler, true);
      cleanupStack.push(() => target.removeEventListener(type, handler, true));
    }

    function installSelectionStyle(setting) {
      if (!setting.allowSelection || document.getElementById(UNLOCKER_STYLE_ID)) return;

      const style = document.createElement('style');
      style.id = UNLOCKER_STYLE_ID;
      style.textContent = `
        html :not(#${ROOT_ID}):not(#${ROOT_ID} *) {
          -webkit-user-select: text !important;
          user-select: text !important;
        }
      `;
      document.documentElement.append(style);
    }

    return {
      install(setting) {
        this.uninstall();
        if (!hasUnlockerAction(setting)) return;

        installSelectionStyle(setting);
        for (const spec of capabilitySpecs) {
          if (setting[spec.option]) {
            addListener(spec.target(), spec.type, spec.handler);
          }
        }
      },
      uninstall() {
        for (const cleanup of cleanupStack) {
          cleanup();
        }
        cleanupStack = [];

        const style = document.getElementById(UNLOCKER_STYLE_ID);
        if (style) style.remove();
      },
    };
  }

  function installUnlocker(setting) {
    unlockerRuntime.install(setting);
  }

  function refreshUnlockerState() {
    webPageAssistantSession.refreshUnlockerState();
  }

  async function handleRootClick(event) {
    const actionNode = event.target?.closest?.('[data-part-action]');
    if (!actionNode || !root?.contains(actionNode)) return;

    const action = actionNode.dataset.partAction;
    if (!webPageAssistantSession.canHandle(action)) return;

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
      await webPageAssistantSession.dispatch(action, actionNode);
    } catch (error) {
      console.warn(`${SCRIPT_NAME}: action failed.`, error);
      setMessage('操作失败，请查看浏览器控制台。', 'error');
    }
  }

  function handleRootChange(event) {
    const target = event.target;
    if (!target?.matches?.('input[name="part-scope"]')) return;

    const selectedScope = getSelectedScope();
    renderDialog(`将保存到${scopeLabel(selectedScope)}。`, selectedScope, activeDialogTab);
  }

  function registerMenu() {
    storagePort.registerSettingsMenu('网页助手设置', () => onReady(() => renderDialog()));
  }

  async function init() {
    [settings, widgetPosition] = await Promise.all([
      storagePort.readSettings(),
      storagePort.readWidgetPosition(),
	    ]);
	    activeMatch = resolveActiveSetting(settings);
	    activeUnlockerMatch = resolveActiveUnlockerSetting(settings);
	    registerMenu();
	    window.addEventListener('resize', () => widgetLayoutRuntime.applyPosition());
	    refreshUnlockerState();

	    if (activeMatch) {
      onReady(restartActiveCountdown);
    }
  }

  init().catch((error) => {
    console.warn(`${SCRIPT_NAME}: failed to initialize.`, error);
  });
})();
