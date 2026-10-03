// ==UserScript==
// @name         Web Page Assistant
// @name:en      Web Page Assistant
// @name:zh      网页助手
// @name:zh-CN   网页助手
// @name:zh-TW   網頁助手
// @namespace    https://github.com/dzshzx/custom-user-js-scripts
// @version      0.3.9
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
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.registerMenuCommand
// @grant        GM.addValueChangeListener
// @grant        GM.removeValueChangeListener
// @run-at       document-idle
// @homepageURL  https://github.com/dzshzx/custom-user-js-scripts
// @supportURL   https://github.com/dzshzx/custom-user-js-scripts/issues
// @downloadURL  https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/dist/web-page-assistant.user.js
// @updateURL    https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/dist/web-page-assistant.user.js
// @license      MIT
// ==/UserScript==

import * as PageAssistantSettings from './web-page-assistant-settings.lib.ts';
import { createWebPageAssistantStoragePort } from './web-page-assistant-storage.lib.ts';
import { createWebPageAssistantSession } from './web-page-assistant-session.lib.ts';
import { createUnlockerRuntime } from './web-page-assistant-unlocker.lib.ts';
import { createWebPageAssistantView } from './web-page-assistant-view.lib.ts';
import type { WebPageAssistantView } from './web-page-assistant-view.lib.ts';
import type { WidgetPosition } from './web-page-assistant-storage.lib.ts';

(function () {
  'use strict';

  if (window.top !== window.self) return;

  const SCRIPT_NAME = 'Web Page Assistant';
  const ROOT_ID = 'page-auto-refresh-timer-root';
  const UNLOCKER_STYLE_ID = `${ROOT_ID}-unlocker-style`;
  const STORAGE_KEY = 'pageAutoRefreshTimerSettings';
  const WIDGET_POSITION_KEY = 'pageAutoRefreshTimerWidgetPosition';
  const keys = {
    pageKey: `${location.origin}${location.pathname}${location.search}`,
    siteKey: location.hostname,
  };

  function normalizeWidgetPosition(value: unknown): WidgetPosition | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const left = Number((value as { left?: unknown }).left);
    const top = Number((value as { top?: unknown }).top);
    if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
    return { left: Math.round(left), top: Math.round(top) };
  }

  function documentReady(): Promise<unknown> {
    if (document.readyState !== 'loading') return Promise.resolve();
    return new Promise((resolve) => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
  }

  const storage = createWebPageAssistantStoragePort({
    scriptName: SCRIPT_NAME,
    settingsContract: PageAssistantSettings,
    normalizeWidgetPosition,
    storageKey: STORAGE_KEY,
    widgetPositionKey: WIDGET_POSITION_KEY,
    fallbackStorageKey: `__${STORAGE_KEY}`,
    fallbackWidgetPositionKey: `__${WIDGET_POSITION_KEY}`,
    localStorageAdapter: localStorage,
    eventTarget: window,
    logger: console,
  });
  const unlocker = createUnlockerRuntime({
    hasUnlockerAction: PageAssistantSettings.hasUnlockerAction,
    rootContainsTarget: (target) => Boolean(document.getElementById(ROOT_ID)?.contains(target as Node | null)),
    getDocumentTarget: () => document,
    getWindowTarget: () => window,
    getStyle: () => document.getElementById(UNLOCKER_STYLE_ID),
    installStyle(cssText) {
      const style = document.createElement('style');
      style.id = UNLOCKER_STYLE_ID;
      style.textContent = cssText;
      document.documentElement.append(style);
    },
    removeStyle() {
      document.getElementById(UNLOCKER_STYLE_ID)?.remove();
    },
    rootId: ROOT_ID,
  });

  let widgetPosition: WidgetPosition | null = null;
  const interfaceReady = Promise.all([storage.readWidgetPosition(), documentReady()]).then(([position]) => {
    widgetPosition = position;
  });
  let view: WebPageAssistantView | undefined;
  const session = createWebPageAssistantSession({
    keys,
    storage,
    clock: {
      now: () => Date.now(),
      setInterval: (handler, delay) => window.setInterval(handler, delay),
      clearInterval: (timer) => window.clearInterval(timer),
    },
    reload: () => location.reload(),
    unlocker,
    ready: () => interfaceReady,
    onChange(snapshot, change) {
      view?.update(snapshot, change);
    },
  });
  view = createWebPageAssistantView({
    session,
    keys,
    document,
    window,
    positions: {
      get: () => widgetPosition,
      normalize: normalizeWidgetPosition,
      write: (position) => storage.writeWidgetPosition(position),
    },
    ready: () => session.start(),
    clock: {
      setTimeout: (handler, delay) => window.setTimeout(handler, delay),
      clearTimeout: (timer) => window.clearTimeout(timer as number | undefined),
    },
  });

  storage.registerSettingsMenu('网页助手设置', () => {
    view.openSettings().catch((error) => {
      console.warn(`${SCRIPT_NAME}: failed to open settings menu.`, error);
    });
  });
  window.addEventListener('pagehide', (event) => {
    if (event.persisted) return;
    view.dispose();
    session.dispose();
  });
  session.start().then((result) => {
    if (!result.ok && result.code !== 'application-failed') {
      console.warn(`${SCRIPT_NAME}: failed to initialize.`, result.state.applicationError || result.code);
    }
  });
})();
