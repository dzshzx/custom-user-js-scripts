// ==UserScript==
// @name         Web Page Assistant
// @name:en      Web Page Assistant
// @name:zh      网页助手
// @name:zh-CN   网页助手
// @name:zh-TW   網頁助手
// @namespace    https://github.com/dzshzx/custom-user-js-scripts
// @version      0.3.2
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
// @downloadURL  https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/dist/web-page-assistant.user.js
// @updateURL    https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/dist/web-page-assistant.user.js
// @license      MIT
// ==/UserScript==

import * as PageAssistantSettings from './web-page-assistant-settings.lib.js';
import { createWebPageAssistantStoragePort } from './web-page-assistant-storage.lib.js';
import { installAssistantBaseStyles } from './web-page-assistant-presentation-base-styles.lib.js';
import { installAssistantDialogStyles } from './web-page-assistant-presentation-dialog-styles.lib.js';
import {
  createPageAssistantDialogContract,
  createWidgetElement,
  createDialogElement,
  isCoarsePointer,
} from './web-page-assistant-presentation.lib.js';
import { createWebPageAssistantSession } from './web-page-assistant-session.lib.js';
import { createWidgetLayoutRuntime } from './web-page-assistant-widget-layout.lib.js';
import { createUnlockerRuntime } from './web-page-assistant-unlocker.lib.js';
import { buildTokenCss, applyTheme } from '../shared/shared-tokens.lib.js';

(function () {
  'use strict';

  if (window.top !== window.self) return;

  const SCRIPT_NAME = 'Web Page Assistant';
  const ROOT_ID = 'page-auto-refresh-timer-root';
  const STYLE_ID = `${ROOT_ID}-style`;
  const TOKEN_STYLE_ID = `${ROOT_ID}-token-style`;
  const DIALOG_STYLE_ID = `${ROOT_ID}-dialog-style`;
  const UNLOCKER_STYLE_ID = `${ROOT_ID}-unlocker-style`;
  const STORAGE_KEY = 'pageAutoRefreshTimerSettings';
  const WIDGET_POSITION_KEY = 'pageAutoRefreshTimerWidgetPosition';
  const FALLBACK_STORAGE_KEY = `__${STORAGE_KEY}`;
  const FALLBACK_WIDGET_POSITION_KEY = `__${WIDGET_POSITION_KEY}`;
  const MAX_INTERVAL_MS = PageAssistantSettings.MAX_INTERVAL_MS;
  const isValidIntervalMs = PageAssistantSettings.isValidIntervalMs;
  const hasUnlockerAction = PageAssistantSettings.hasUnlockerAction;
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
  const currentPageKey = `${location.origin}${location.pathname}${location.search}`;
  const currentSiteKey = location.hostname;

  let root;
  let widget;
  let widgetButton;
  let widgetPosition = null;
  let dialog;
  let activeDialogTab = 'refresh';
  let countdownNodes = [];
  let widgetStatusNode = null;
  let lastWidgetStatusText = '';
  let dialogReturnFocus = null;
  let inertedElements = [];
  let themeCleanup = null;
  let hasRootListener = false;
  let webPageAssistantSession;
  let widgetLayoutRuntime;
  let unlockerRuntime;
  let initialStateReady = Promise.resolve();

  // WPA runs on arbitrary hosts, so there is no host theme probe: the shared
  // tokens resolve via the prefers-color-scheme media query.
  const TOKEN_CSS = buildTokenCss({
    rootSelector: `#${ROOT_ID}`,
    accent: 'oklch(55% 0.10 160)',
    accentDark: 'oklch(70% 0.12 160)',
  });
  const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  const WRITE_ACTIONS = new Set([
    'save-preset',
    'save-custom',
    'delete-page',
    'delete-site',
    'save-unlocker',
    'delete-unlocker-page',
    'delete-unlocker-site',
    'disable-active',
  ]);

  function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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

  const storagePort = createWebPageAssistantStoragePort({
    scriptName: SCRIPT_NAME,
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
  });

  function onReady(callback) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', callback, { once: true });
      return;
    }

    callback();
  }

  function installStyles() {
    if (!document.getElementById(TOKEN_STYLE_ID)) {
      const tokenStyle = document.createElement('style');
      tokenStyle.id = TOKEN_STYLE_ID;
      tokenStyle.textContent = TOKEN_CSS;
      document.documentElement.append(tokenStyle);
    }
    installAssistantBaseStyles({
      documentObject: document,
      rootId: ROOT_ID,
      styleId: STYLE_ID,
    });
    installAssistantDialogStyles({
      documentObject: document,
      rootId: ROOT_ID,
      styleId: DIALOG_STYLE_ID,
    });
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

    if (!themeCleanup) {
      themeCleanup = applyTheme(root);
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
    const activeMatch = webPageAssistantSession.getState().refresh.activeMatch;
    if (!activeMatch) return '当前未启用自动刷新。';
    return `${scopeLabel(activeMatch.scope)}已启用，每 ${formatInterval(activeMatch.setting.intervalMs)} 刷新一次。`;
  }

  function unlockerStatusText() {
    const activeUnlockerMatch = webPageAssistantSession.getState().appliedUnlocker;
    const setting = activeUnlockerMatch?.setting;
    return unlockerRuntime.describe(setting, scopeLabel(activeUnlockerMatch?.scope || getSelectedScope()));
  }

  function defaultUnlockerSetting(overrides = {}) {
    return PageAssistantSettings.defaultUnlockerSetting(overrides);
  }

  const dialogContract = createPageAssistantDialogContract({
    settingsContract: PageAssistantSettings,
    defaultUnlockerSetting,
    formatInterval,
    defaultIntervalMs: 5 * 60 * 1000,
  });

  function clampNumber(value, min, max) {
    return Math.min(Math.max(min, value), max);
  }

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
    clearTimeout: (timer) => window.clearTimeout(timer),
    isCoarsePointer: () => isCoarsePointer(window),
    logger: console,
    scriptName: SCRIPT_NAME,
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

  // The widget is always rendered: with no active refresh setting it stays as
  // a dimmed idle dot whose panel offers the settings entry.
  function createWidgetViewModel() {
    return {
      enabled: Boolean(webPageAssistantSession.getState().refresh.activeMatch),
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
      widgetStatusNode = null;
    }

    const renderedWidget = createWidgetElement({
      documentObject: document,
      model: createWidgetViewModel(),
    });
    widget = renderedWidget.widget;
    widgetButton = renderedWidget.widgetButton;
    countdownNodes = renderedWidget.countdownNodes;
    widgetStatusNode = renderedWidget.statusNode;
    lastWidgetStatusText = '';
    widgetLayoutRuntime.attach(widget, widgetButton, widgetPosition);
    root.append(widget);
    widgetLayoutRuntime.applyPosition();
    updatePauseButton();
    updateCountdownText();
    updateWidgetStatusText();
  }

  function createDialogViewModel(message = '', preferredScope = null, preferredTab = null) {
    return dialogContract.createViewModel({
      message,
      preferredScope,
      preferredTab,
      activeTab: activeDialogTab,
      activeRefreshMatch: webPageAssistantSession.getState().refresh.activeMatch,
      activeUnlockerMatch: webPageAssistantSession.getState().appliedUnlocker,
      settings: webPageAssistantSession.getState().settings,
      pageKey: currentPageKey,
      siteKey: currentSiteKey,
      statusText: currentStatusText(),
      unlockerStatusText: unlockerStatusText(),
    });
  }

  function captureDialogState() {
    if (!dialog) return null;

    const panel = dialog.querySelector('.part-dialog');
    let focusSelector = null;
    const active = document.activeElement;
    if (active && dialog.contains(active)) {
      const roleNode = active.closest?.('[data-part-role]');
      const actionNode = active.closest?.('[data-part-action]');
      if (roleNode) {
        focusSelector = dialogContract.roleSelector(roleNode.dataset.partRole);
      } else if (active.matches?.('input[name="part-scope"]')) {
        focusSelector = `input[name="part-scope"][value="${active.value}"]`;
      } else if (actionNode) {
        focusSelector = dialogContract.actionSelector(actionNode.dataset.partAction);
        for (const [datasetKey, attribute] of [['partTab', 'data-part-tab'], ['intervalMs', 'data-interval-ms']]) {
          if (actionNode.dataset[datasetKey]) {
            focusSelector += `[${attribute}="${actionNode.dataset[datasetKey]}"]`;
          }
        }
      }
    }

    return {
      scrollTop: panel?.scrollTop || 0,
      focusSelector,
    };
  }

  // The whole dialog tree is rebuilt on tab/scope/save changes; keep the
  // panel scroll offset and the focused control across the rebuild.
  function restoreDialogState(preserved) {
    if (!preserved || !dialog) return;
    const panel = dialog.querySelector('.part-dialog');
    if (panel && preserved.scrollTop) panel.scrollTop = preserved.scrollTop;
    if (preserved.focusSelector) {
      dialog.querySelector(preserved.focusSelector)?.focus?.();
    }
  }

  function applyBackgroundInert() {
    if (inertedElements.length) return;
    for (const child of Array.from(document.body?.children || [])) {
      if (child === root) continue;
      child.setAttribute('inert', '');
      inertedElements.push(child);
    }
  }

  function releaseBackgroundInert() {
    for (const element of inertedElements) {
      element.removeAttribute('inert');
    }
    inertedElements = [];
  }

  function handleDialogKeydown(event) {
    if (!dialog) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeDialog();
      return;
    }

    if (event.key !== 'Tab') return;
    const panel = dialog.querySelector('.part-dialog');
    if (!panel) return;
    const focusables = [...panel.querySelectorAll(FOCUSABLE_SELECTOR)]
      .filter((element) => !element.disabled && !element.closest('[hidden]'));
    if (!focusables.length) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !panel.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }

  function renderDialog(message = '', preferredScope = null, preferredTab = null) {
    ensureRoot();

    const preserved = captureDialogState();
    if (!dialog) {
      // Opening (not rebuilding): remember the trigger to return focus to.
      // GM menu opens land on the page body, so fall back to the widget button.
      const active = document.activeElement;
      dialogReturnFocus = active && root.contains(active) ? active : (widgetButton || null);
      applyBackgroundInert();
    } else {
      dialog.remove();
      dialog = null;
    }

    const model = createDialogViewModel(message, preferredScope, preferredTab);
    activeDialogTab = model.activeTab;

    dialog = createDialogElement({
      documentObject: document,
      model,
    });
    dialog.addEventListener('keydown', handleDialogKeydown);
    root.append(dialog);
    dialogContract.applyModel(dialog, model, PRESETS);
    restoreDialogState(preserved);
    setMessage(model.message);
  }

  function closeDialog() {
    if (!dialog) return;
    try {
      dialog.remove();
      dialog = null;
    } finally {
      releaseBackgroundInert();
      const returnTarget = dialogReturnFocus;
      dialogReturnFocus = null;
      if (returnTarget && returnTarget.isConnected !== false) {
        returnTarget.focus?.();
      }
    }
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

  function updateCountdownText() {
    if (!countdownNodes.length) return;

    const runtimeState = webPageAssistantSession.getState().refresh;
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

  // Full-sentence widget status for the visually-hidden live region. The text
  // only changes on lifecycle transitions (enable/pause/resume/disable), so
  // assistive technology is not spammed by the per-second countdown.
  function widgetStatusText() {
    const runtimeState = webPageAssistantSession.getState().refresh;
    if (!runtimeState.activeMatch) return '当前未启用自动刷新。';
    if (runtimeState.isPaused) {
      const remaining = formatInterval(Math.max(1000, Math.ceil(runtimeState.remainingMs / 1000) * 1000));
      return `自动刷新已暂停，剩余 ${remaining}。`;
    }
    return `${scopeLabel(runtimeState.activeMatch.scope)}自动刷新已启用，每 ${formatInterval(runtimeState.activeMatch.setting.intervalMs)} 刷新一次。`;
  }

  function updateWidgetStatusText() {
    if (!widgetStatusNode) return;
    const text = widgetStatusText();
    if (text === lastWidgetStatusText) return;
    lastWidgetStatusText = text;
    widgetStatusNode.textContent = text;
  }

  function updatePauseButton() {
    const pauseButton = widget?.querySelector('[data-part-action="toggle-pause"]');
    if (!pauseButton) return;
    pauseButton.textContent = webPageAssistantSession.getState().refresh.isPaused ? '继续' : '暂停';
  }

  unlockerRuntime = createUnlockerRuntime({
    hasUnlockerAction,
    rootContainsTarget: (target) => Boolean(root?.contains(target)),
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
      const style = document.getElementById(UNLOCKER_STYLE_ID);
      if (style) style.remove();
    },
    rootId: ROOT_ID,
  });

  async function dispatchAction(action, node) {
    if (action === 'open-settings') return renderDialog('', null, 'refresh');
    if (action === 'switch-tab') return renderDialog('', getSelectedScope(), node.dataset.partTab);
    if (action === 'close-dialog') return closeDialog();
    let scope = getSelectedScope();
    let command = { type: action, scope };
    let tab = 'refresh';
    let message = '';
    if (action === 'save-preset' || action === 'save-custom') {
      const parsed = action === 'save-custom' ? parseCustomInterval() : { intervalMs: Number(node.dataset.intervalMs) };
      if (parsed.error) throw new Error(parsed.error);
      command = { type: 'save-refresh', scope, intervalMs: parsed.intervalMs };
      message = `已保存到${scopeLabel(scope)}：每 ${formatInterval(parsed.intervalMs)} 刷新一次。`;
    } else if (action === 'delete-page' || action === 'delete-site') {
      scope = action === 'delete-page' ? 'page' : 'site';
      command = { type: 'delete-refresh', scope };
      message = `已删除${scopeLabel(scope)}设置。`;
    } else if (action === 'save-unlocker') {
      command.setting = readUnlockerFormSetting();
      tab = 'unlocker';
      message = `已保存到${scopeLabel(scope)}。`;
    } else if (action.startsWith('delete-unlocker-')) {
      scope = action.endsWith('page') ? 'page' : 'site';
      command = { type: 'delete-unlocker', scope };
      tab = 'unlocker';
      message = `已删除${scopeLabel(scope)}限制解除设置。`;
    }
    const result = await webPageAssistantSession.dispatch(command);
    if (!result.ok) {
      if (result.persisted && dialog) renderDialog('', result.scope || scope, tab);
      const reasons = { 'invalid-input': '设置无效。', 'not-ready': '设置尚未读取完成。', disposed: '会话已结束。', 'storage-failed': '设置保存失败。', 'application-failed': '设置已保存，但应用失败。' };
      throw new Error(`${reasons[result.code] || '操作失败。'}${result.message || result.state.applicationError || ''}`);
    }
    if (action === 'toggle-pause') return;
    if (action === 'disable-active') {
      scope = result.scope || scope;
      message = `已停用${scopeLabel(scope)}自动刷新。`;
    }
    if (dialog) renderDialog(message, scope, tab);
  }

  async function handleRootClick(event) {
    const actionNode = event.target?.closest?.('[data-part-action]');
    if (!actionNode || !root?.contains(actionNode)) return;

    const action = actionNode.dataset.partAction;
    if (!WRITE_ACTIONS.has(action) && !['open-settings', 'switch-tab', 'close-dialog', 'toggle-pause'].includes(action)) return;

    if (action === 'close-dialog' && dialog && actionNode === dialog && event.target === dialog) {
      closeDialog();
      return;
    }

    if (action === 'close-dialog' && dialog && actionNode === dialog) {
      return;
    }

    // The idle widget's collapsed button opens settings on click; swallow the
    // click that trails a drag gesture.
    if (
      action === 'open-settings'
      && actionNode.classList.contains('part-widget-button')
      && widgetLayoutRuntime.isExpansionSuppressed()
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const isWrite = WRITE_ACTIONS.has(action);
    const pendingLabel = isWrite ? actionNode.textContent : null;
    if (isWrite) {
      actionNode.disabled = true;
      actionNode.textContent = '处理中…';
    }

    try {
      await dispatchAction(action, actionNode);
    } catch (error) {
      console.warn(`${SCRIPT_NAME}: action failed.`, error);
      if (isWrite && actionNode.isConnected !== false) {
        actionNode.disabled = false;
        actionNode.textContent = pendingLabel;
      }
      setMessage(`操作失败：${error?.message || error}`, 'error');
    }
  }

  function handleRootChange(event) {
    const target = event.target;
    if (!target?.matches?.('input[name="part-scope"]')) return;

    const selectedScope = getSelectedScope();
    renderDialog(`将保存到${scopeLabel(selectedScope)}。`, selectedScope, activeDialogTab);
  }

  function openSettingsFromMenu() {
    onReady(() => {
      initialStateReady
        .then(() => renderDialog())
        .catch((error) => {
          console.warn(`${SCRIPT_NAME}: failed to open settings menu.`, error);
        });
    });
  }

  function registerMenu() {
    storagePort.registerSettingsMenu('网页助手设置', openSettingsFromMenu);
  }

  webPageAssistantSession = createWebPageAssistantSession({
    keys: { pageKey: currentPageKey, siteKey: currentSiteKey },
    storage: storagePort,
    clock: {
      now: () => Date.now(),
      setInterval: (handler, delay) => window.setInterval(handler, delay),
      clearInterval: (timer) => window.clearInterval(timer),
    },
    reload: () => location.reload(),
    unlocker: unlockerRuntime,
    async ready() {
      const [position] = await Promise.all([
        storagePort.readWidgetPosition(),
        new Promise((resolve) => onReady(resolve)),
      ]);
      widgetPosition = position;
    },
    onChange(state, { kind, area }) {
      if (state.lifecycle !== 'ready') return;
      if (kind === 'lifecycle' || area === 'refresh') renderWidget();
      updatePauseButton();
      updateCountdownText();
      updateWidgetStatusText();
    },
  });
  registerMenu();
  window.addEventListener('resize', () => widgetLayoutRuntime.applyPosition());
  window.addEventListener('pagehide', (event) => {
    if (!event.persisted) webPageAssistantSession.dispose();
  });
  initialStateReady = webPageAssistantSession.start();
  initialStateReady.catch((error) => {
    console.warn(`${SCRIPT_NAME}: failed to initialize.`, error);
  });
})();
