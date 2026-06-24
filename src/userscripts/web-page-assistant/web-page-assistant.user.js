// ==UserScript==
// @name         Web Page Assistant
// @name:en      Web Page Assistant
// @name:zh      网页助手
// @name:zh-CN   网页助手
// @name:zh-TW   網頁助手
// @namespace    https://github.com/dzshzx/custom-user-js-scripts
// @version      0.2.9
// @description  Web page assistant for page refresh and optional copy, selection, context menu, drag, and unload limit unlocking.
// @description:en Web page assistant for page refresh and optional copy, selection, context menu, drag, and unload limit unlocking.
// @description:zh 网页助手：按页面或站点管理自动刷新，并可解除复制、选择、右键菜单、拖拽和离开确认限制。
// @description:zh-CN 网页助手：按页面或站点管理自动刷新，并可解除复制、选择、右键菜单、拖拽和离开确认限制。
// @description:zh-TW 網頁助手：按頁面或站點管理自動重新整理，並可解除複製、選取、右鍵選單、拖曳和離開確認限制。
// @author       dzshzx
// @match        *://*/*
// @require      https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/userscripts/web-page-assistant/web-page-assistant-settings.lib.js
// @require      https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/userscripts/web-page-assistant/web-page-assistant-storage.lib.js
// @require      https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/userscripts/web-page-assistant/web-page-assistant-refresh.lib.js
// @require      https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/userscripts/web-page-assistant/web-page-assistant-presentation-base-styles.lib.js
// @require      https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/userscripts/web-page-assistant/web-page-assistant-presentation-dialog-styles.lib.js
// @require      https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/userscripts/web-page-assistant/web-page-assistant-presentation.lib.js
// @require      https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/userscripts/web-page-assistant/web-page-assistant-session.lib.js
// @require      https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/userscripts/web-page-assistant/web-page-assistant-widget-layout.lib.js
// @require      https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/userscripts/web-page-assistant/web-page-assistant-unlocker.lib.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.registerMenuCommand
// @run-at       document-idle
// @homepageURL  https://github.com/dzshzx/custom-user-js-scripts
// @supportURL   https://github.com/dzshzx/custom-user-js-scripts/issues
// @downloadURL  https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/userscripts/web-page-assistant/web-page-assistant.user.js
// @updateURL    https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/userscripts/web-page-assistant/web-page-assistant.user.js
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  if (window.top !== window.self) return;

  const SCRIPT_NAME = 'Web Page Assistant';
  const ROOT_ID = 'page-auto-refresh-timer-root';
  const STYLE_ID = `${ROOT_ID}-style`;
  const DIALOG_STYLE_ID = `${ROOT_ID}-dialog-style`;
  const UNLOCKER_STYLE_ID = `${ROOT_ID}-unlocker-style`;
  const STORAGE_KEY = 'pageAutoRefreshTimerSettings';
  const WIDGET_POSITION_KEY = 'pageAutoRefreshTimerWidgetPosition';
  const FALLBACK_STORAGE_KEY = `__${STORAGE_KEY}`;
  const FALLBACK_WIDGET_POSITION_KEY = `__${WIDGET_POSITION_KEY}`;
  const PageAssistantSettings = globalThis.WebPageAssistantSettingsLib;
  if (!PageAssistantSettings) {
    throw new Error(`${SCRIPT_NAME}: WebPageAssistantSettingsLib is not loaded.`);
  }
  const WebPageAssistantStorage = globalThis.WebPageAssistantStorageLib;
  if (!WebPageAssistantStorage) {
    throw new Error(`${SCRIPT_NAME}: WebPageAssistantStorageLib is not loaded.`);
  }
  const { createWebPageAssistantStoragePort } = WebPageAssistantStorage;
  const WebPageAssistantRefresh = globalThis.WebPageAssistantRefreshLib;
  if (!WebPageAssistantRefresh) {
    throw new Error(`${SCRIPT_NAME}: WebPageAssistantRefreshLib is not loaded.`);
  }
  const { createRefreshRuntime } = WebPageAssistantRefresh;
  const WebPageAssistantPresentationBaseStyles = globalThis.WebPageAssistantPresentationBaseStylesLib;
  if (!WebPageAssistantPresentationBaseStyles?.installAssistantBaseStyles) {
    throw new Error(`${SCRIPT_NAME}: WebPageAssistantPresentationBaseStylesLib is not loaded.`);
  }
  const { installAssistantBaseStyles } = WebPageAssistantPresentationBaseStyles;
  const WebPageAssistantPresentationDialogStyles = globalThis.WebPageAssistantPresentationDialogStylesLib;
  if (!WebPageAssistantPresentationDialogStyles?.installAssistantDialogStyles) {
    throw new Error(`${SCRIPT_NAME}: WebPageAssistantPresentationDialogStylesLib is not loaded.`);
  }
  const { installAssistantDialogStyles } = WebPageAssistantPresentationDialogStyles;
  const WebPageAssistantPresentation = globalThis.WebPageAssistantPresentationLib;
  if (!WebPageAssistantPresentation?.createPageAssistantDialogContract) {
    throw new Error(`${SCRIPT_NAME}: WebPageAssistantPresentationLib is not loaded.`);
  }
  const {
    createPageAssistantDialogContract,
    createWidgetElement,
    createDialogElement,
  } = WebPageAssistantPresentation;
  const WebPageAssistantSession = globalThis.WebPageAssistantSessionLib;
  if (!WebPageAssistantSession?.createWebPageAssistantSession) {
    throw new Error(`${SCRIPT_NAME}: WebPageAssistantSessionLib is not loaded.`);
  }
  const { createWebPageAssistantSession } = WebPageAssistantSession;
  const WebPageAssistantWidgetLayout = globalThis.WebPageAssistantWidgetLayoutLib;
  if (!WebPageAssistantWidgetLayout?.createWidgetLayoutRuntime) {
    throw new Error(`${SCRIPT_NAME}: WebPageAssistantWidgetLayoutLib is not loaded.`);
  }
  const { createWidgetLayoutRuntime } = WebPageAssistantWidgetLayout;
  const WebPageAssistantUnlocker = globalThis.WebPageAssistantUnlockerLib;
  if (!WebPageAssistantUnlocker?.createUnlockerRuntime) {
    throw new Error(`${SCRIPT_NAME}: WebPageAssistantUnlockerLib is not loaded.`);
  }
  const { createUnlockerRuntime } = WebPageAssistantUnlocker;
  const MIN_INTERVAL_MS = PageAssistantSettings.MIN_INTERVAL_MS;
  const MAX_INTERVAL_MS = PageAssistantSettings.MAX_INTERVAL_MS;
  const isValidIntervalMs = PageAssistantSettings.isValidIntervalMs;
  const hasUnlockerAction = PageAssistantSettings.hasUnlockerAction;
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
  const currentPageKey = `${location.origin}${location.pathname}${location.search}`;
  const currentSiteKey = location.hostname;

  let settings = PageAssistantSettings.emptySettings();
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
  let unlockerRuntime;
  let initialStateReady = Promise.resolve();

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

  function resolveActiveSetting(sourceSettings = settings) {
    return PageAssistantSettings.resolveActiveRefreshSetting(sourceSettings, {
      pageKey: currentPageKey,
      siteKey: currentSiteKey,
    });
  }

  function resolveActiveUnlockerSetting(sourceSettings = settings) {
    return PageAssistantSettings.resolveActiveUnlockerSetting(sourceSettings, {
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

    const renderedWidget = createWidgetElement({
      documentObject: document,
      model,
    });
    widget = renderedWidget.widget;
    widgetButton = renderedWidget.widgetButton;
    countdownNodes = renderedWidget.countdownNodes;
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

    dialog = createDialogElement({
      documentObject: document,
      model,
    });
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

  async function init() {
    registerMenu();

    [settings, widgetPosition] = await Promise.all([
      storagePort.readSettings(),
      storagePort.readWidgetPosition(),
    ]);
    activeMatch = resolveActiveSetting(settings);
    activeUnlockerMatch = resolveActiveUnlockerSetting(settings);
    window.addEventListener('resize', () => widgetLayoutRuntime.applyPosition());
    refreshUnlockerState();

    if (activeMatch) {
      onReady(restartActiveCountdown);
    }
  }

  initialStateReady = init();
  initialStateReady.catch((error) => {
    console.warn(`${SCRIPT_NAME}: failed to initialize.`, error);
  });
})();
