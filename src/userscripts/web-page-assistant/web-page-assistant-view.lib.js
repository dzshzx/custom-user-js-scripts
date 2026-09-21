import * as PageAssistantSettings from './web-page-assistant-settings.lib.js';
import { installAssistantBaseStyles } from './web-page-assistant-presentation-base-styles.lib.js';
import { installAssistantDialogStyles } from './web-page-assistant-presentation-dialog-styles.lib.js';
import {
  createPageAssistantDialogContract,
  createWidgetElement,
  createDialogElement,
  isCoarsePointer,
} from './web-page-assistant-presentation.lib.js';
import { createWidgetLayoutRuntime } from './web-page-assistant-widget-layout.lib.js';
import { buildTokenCss, applyTheme } from '../shared/shared-tokens.lib.js';

const SCRIPT_NAME = 'Web Page Assistant';
const ROOT_ID = 'page-auto-refresh-timer-root';
const STYLE_ID = `${ROOT_ID}-style`;
const TOKEN_STYLE_ID = `${ROOT_ID}-token-style`;
const DIALOG_STYLE_ID = `${ROOT_ID}-dialog-style`;
const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
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
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function scopeLabel(scope) {
  return scope === 'page' ? '当前页面' : '整个站点';
}

function unlockerStatusText(snapshot, scope) {
  const setting = snapshot.appliedUnlocker?.setting;
  if (!setting?.enabled) return '当前未启用网页限制解除。';
  const labels = [
    ['allowSelection', '选择文本'],
    ['allowCopy', '复制/剪切'],
    ['allowContextMenu', '右键菜单'],
    ['allowDrag', '拖拽'],
    ['suppressBeforeUnload', '离开提示'],
  ].filter(([option]) => setting[option]).map(([, label]) => label);
  if (!labels.length) return '网页限制解除已保存，但没有启用任何能力。';
  return `${scopeLabel(snapshot.appliedUnlocker?.scope || scope)}已启用：${labels.join('、')}。`;
}

function createWebPageAssistantView({
  session,
  keys,
  document: documentObject,
  window: windowObject,
  positions,
  ready,
  clock,
}) {
  const timers = {
    setTimeout: clock?.setTimeout || windowObject.setTimeout.bind(windowObject),
    clearTimeout: clock?.clearTimeout || windowObject.clearTimeout.bind(windowObject),
  };
  const dialogContract = createPageAssistantDialogContract({
    settingsContract: PageAssistantSettings,
    defaultUnlockerSetting: PageAssistantSettings.defaultUnlockerSetting,
    formatInterval,
    defaultIntervalMs: 5 * 60 * 1000,
  });
  const tokenCss = buildTokenCss({
    rootSelector: `#${ROOT_ID}`,
    accent: 'oklch(55% 0.10 160)',
    accentDark: 'oklch(70% 0.12 160)',
  });

  let latestSnapshot = session.getState();
  let root = null;
  let widget = null;
  let widgetButton = null;
  let countdownNodes = [];
  let widgetStatusNode = null;
  let lastWidgetStatusText = '';
  let widgetPosition = positions.get?.() || null;
  let hasMountedWidget = false;
  let dialog = null;
  let activeDialogTab = 'refresh';
  let dialogGeneration = 0;
  let editRevision = 0;
  let dialogReturnFocus = null;
  let themeCleanup = null;
  let inertObserver = null;
  let inertOwnership = new Map();
  let initializationError = null;
  let disposed = false;
  let openPromise = null;
  let pendingOpenIntent = null;
  const pendingSubmissions = new Set();
  const pendingActionTokens = new WeakMap();
  const ownedStyleIds = new Set();
  let finishDisposed;
  const disposedPromise = new Promise((resolve) => { finishDisposed = resolve; });

  const layout = createWidgetLayoutRuntime({
    normalizeWidgetPosition: positions.normalize,
    clampNumber(value, min, max) { return Math.min(Math.max(min, value), max); },
    getViewportSize: () => ({ width: windowObject.innerWidth, height: windowObject.innerHeight }),
    persistPosition: async (position) => positions.write(position),
    onPositionChange(position) { widgetPosition = position; },
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    isCoarsePointer: () => isCoarsePointer(windowObject),
    logger: console,
    scriptName: SCRIPT_NAME,
    constants: {
      buttonSize: 52,
      widgetWidth: 154,
      widgetHeight: 60,
      panelWidth: 248,
      panelGap: 8,
      safeMargin: 12,
      defaultOffset: 18,
    },
  });

  function currentStatusText(snapshot = latestSnapshot) {
    const activeMatch = snapshot.refresh.activeMatch;
    if (!activeMatch) return '当前未启用自动刷新。';
    return `${scopeLabel(activeMatch.scope)}已启用，每 ${formatInterval(activeMatch.setting.intervalMs)} 刷新一次。`;
  }

  function widgetStatusText(snapshot = latestSnapshot) {
    const runtimeState = snapshot.refresh;
    if (!runtimeState.activeMatch) return '当前未启用自动刷新。';
    if (runtimeState.isPaused) {
      const remaining = formatInterval(Math.max(1000, Math.ceil(runtimeState.remainingMs / 1000) * 1000));
      return `自动刷新已暂停，剩余 ${remaining}。`;
    }
    return `${scopeLabel(runtimeState.activeMatch.scope)}自动刷新已启用，每 ${formatInterval(runtimeState.activeMatch.setting.intervalMs)} 刷新一次。`;
  }

  function installStyles() {
    if (!documentObject.getElementById(TOKEN_STYLE_ID)) {
      const tokenStyle = documentObject.createElement('style');
      tokenStyle.id = TOKEN_STYLE_ID;
      tokenStyle.textContent = tokenCss;
      documentObject.documentElement.append(tokenStyle);
      ownedStyleIds.add(TOKEN_STYLE_ID);
    }
    if (!documentObject.getElementById(STYLE_ID)) ownedStyleIds.add(STYLE_ID);
    installAssistantBaseStyles({ documentObject, rootId: ROOT_ID, styleId: STYLE_ID });
    if (!documentObject.getElementById(DIALOG_STYLE_ID)) ownedStyleIds.add(DIALOG_STYLE_ID);
    installAssistantDialogStyles({ documentObject, rootId: ROOT_ID, styleId: DIALOG_STYLE_ID });
  }

  function ensureRoot() {
    if (disposed) return null;
    if (root && root.isConnected !== false) return root;
    installStyles();
    root = documentObject.getElementById(ROOT_ID);
    if (!root) {
      root = documentObject.createElement('div');
      root.id = ROOT_ID;
      documentObject.documentElement.append(root);
    }
    themeCleanup ||= applyTheme(root);
    root.addEventListener('click', handleRootClick);
    root.addEventListener('change', handleRootChange);
    root.addEventListener('input', handleRootInput);
    windowObject.addEventListener('resize', handleResize);
    return root;
  }

  function createWidgetViewModel() {
    return {
      enabled: Boolean(latestSnapshot.refresh.activeMatch),
      summary: currentStatusText(),
    };
  }

  function renderWidget() {
    if (disposed || latestSnapshot.lifecycle !== 'ready') return;
    ensureRoot();
    if (!hasMountedWidget) widgetPosition = positions.get?.() || widgetPosition;
    const returnToWidget = dialogReturnFocus === widgetButton;
    widget?.remove();
    const rendered = createWidgetElement({ documentObject, model: createWidgetViewModel() });
    widget = rendered.widget;
    widgetButton = rendered.widgetButton;
    countdownNodes = rendered.countdownNodes;
    widgetStatusNode = rendered.statusNode;
    lastWidgetStatusText = '';
    layout.attach(widget, widgetButton, widgetPosition);
    root.append(widget);
    layout.applyPosition();
    hasMountedWidget = true;
    if (returnToWidget) dialogReturnFocus = widgetButton;
    updatePauseButton();
    updateCountdownText();
    updateWidgetStatusText();
  }

  function getSelectedScope() {
    return dialogContract.readSelectedScope(dialog);
  }

  function createDialogViewModel(message = '', preferredScope = null, preferredTab = null) {
    return dialogContract.createViewModel({
      message,
      preferredScope,
      preferredTab,
      activeTab: activeDialogTab,
      activeRefreshMatch: latestSnapshot.refresh.activeMatch,
      activeUnlockerMatch: latestSnapshot.appliedUnlocker,
      settings: latestSnapshot.settings,
      pageKey: keys.pageKey,
      siteKey: keys.siteKey,
      statusText: currentStatusText(),
      unlockerStatusText: unlockerStatusText(latestSnapshot, preferredScope || getSelectedScope()),
    });
  }

  function captureDialogState() {
    if (!dialog) return null;
    const panel = dialog.querySelector('.part-dialog');
    let focusSelector = null;
    const active = documentObject.activeElement;
    if (active && dialog.contains(active)) {
      const roleNode = active.closest?.('[data-part-role]');
      const actionNode = active.closest?.('[data-part-action]');
      if (roleNode) focusSelector = dialogContract.roleSelector(roleNode.dataset.partRole);
      else if (active.matches?.('input[name="part-scope"]')) {
        focusSelector = `input[name="part-scope"][value="${active.value}"]`;
      } else if (actionNode) {
        focusSelector = dialogContract.actionSelector(actionNode.dataset.partAction);
        for (const [datasetKey, attribute] of [['partTab', 'data-part-tab'], ['intervalMs', 'data-interval-ms']]) {
          if (actionNode.dataset[datasetKey]) focusSelector += `[${attribute}="${actionNode.dataset[datasetKey]}"]`;
        }
      }
    }
    return { scrollTop: panel?.scrollTop || 0, focusSelector };
  }

  function restoreDialogState(preserved) {
    if (!preserved || !dialog) return;
    const panel = dialog.querySelector('.part-dialog');
    if (panel && preserved.scrollTop) panel.scrollTop = preserved.scrollTop;
    if (preserved.focusSelector) dialog.querySelector(preserved.focusSelector)?.focus?.();
  }

  function processInertMutations(records) {
    for (const record of records) {
      const ownership = inertOwnership.get(record.target);
      if (ownership) ownership.changed = true;
    }
  }

  function applyBackgroundInert() {
    if (inertObserver || inertOwnership.size) return;
    const owned = [];
    for (const child of Array.from(documentObject.body?.children || [])) {
      if (child === root || child.hasAttribute('inert')) continue;
      child.setAttribute('inert', '');
      inertOwnership.set(child, { changed: false });
      owned.push(child);
    }
    const Observer = windowObject.MutationObserver;
    if (!Observer || !owned.length) return;
    inertObserver = new Observer(processInertMutations);
    for (const element of owned) {
      inertObserver.observe(element, { attributes: true, attributeFilter: ['inert'], attributeOldValue: true });
    }
  }

  function releaseBackgroundInert() {
    if (inertObserver) {
      processInertMutations(inertObserver.takeRecords());
      inertObserver.disconnect();
      inertObserver = null;
    }
    for (const [element, ownership] of inertOwnership) {
      if (!ownership.changed && element.getAttribute('inert') === '') element.removeAttribute('inert');
    }
    inertOwnership = new Map();
  }

  function setMessage(text, tone = 'info') {
    const messageNode = dialog?.querySelector(dialogContract.roleSelector(dialogContract.roles.message));
    if (!messageNode) return;
    messageNode.textContent = text;
    messageNode.dataset.tone = tone;
  }

  function disableDialogWrites() {
    if (!dialog) return;
    for (const action of WRITE_ACTIONS) {
      for (const node of dialog.querySelectorAll(dialogContract.actionSelector(action))) node.disabled = true;
    }
  }

  function renderDialog({ message = '', tone = 'info', scope = null, tab = null } = {}) {
    if (disposed) return;
    ensureRoot();
    const preserved = captureDialogState();
    if (!dialog) {
      const active = documentObject.activeElement;
      dialogReturnFocus = active && root.contains(active) ? active : (widgetButton || null);
      applyBackgroundInert();
    } else {
      dialog.remove();
      dialog = null;
    }
    const model = createDialogViewModel(message, scope, tab);
    activeDialogTab = model.activeTab;
    dialog = createDialogElement({ documentObject, model });
    dialogGeneration += 1;
    editRevision = 0;
    dialog.addEventListener('keydown', handleDialogKeydown);
    root.append(dialog);
    dialogContract.applyModel(dialog, model, PRESETS);
    restoreDialogState(preserved);
    setMessage(initializationError || model.message, initializationError ? 'error' : tone);
    if (initializationError) disableDialogWrites();
  }

  function closeDialog({ restoreFocus = true } = {}) {
    if (!dialog) return;
    dialogGeneration += 1;
    dialog.remove();
    dialog = null;
    releaseBackgroundInert();
    const returnTarget = dialogReturnFocus;
    dialogReturnFocus = null;
    if (restoreFocus && returnTarget?.isConnected !== false) returnTarget?.focus?.();
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
    const active = documentObject.activeElement;
    if (event.shiftKey && (active === first || !panel.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }

  function updateDialogStatus() {
    if (!dialog) return;
    const model = createDialogViewModel('', getSelectedScope(), activeDialogTab);
    for (const [role, text] of [
      [dialogContract.roles.status, model.statusText],
      [dialogContract.roles.pageKey, model.pageRefreshText],
      [dialogContract.roles.siteKey, model.siteRefreshText],
      [dialogContract.roles.unlockerStatus, model.unlockerStatusText],
      [dialogContract.roles.unlockerPageKey, model.pageUnlockerText],
      [dialogContract.roles.unlockerSiteKey, model.siteUnlockerText],
    ]) {
      const node = dialog.querySelector(dialogContract.roleSelector(role));
      if (node) node.textContent = text;
    }
  }

  function parseCustomInterval() {
    const valueNode = dialog?.querySelector(dialogContract.roleSelector(dialogContract.roles.customValue));
    const unitNode = dialog?.querySelector(dialogContract.roleSelector(dialogContract.roles.customUnit));
    const amount = Number(valueNode?.value);
    const unit = unitNode?.value === 'minutes' ? 'minutes' : 'seconds';
    const ms = amount * (unit === 'minutes' ? 60 * 1000 : 1000);
    if (!Number.isFinite(amount) || amount <= 0) return { error: '请输入大于 0 的刷新时间。' };
    if (!PageAssistantSettings.isValidIntervalMs(ms)) return { error: '自定义刷新时间必须在 1 秒到 60 分钟之间。' };
    return { intervalMs: Math.round(ms) };
  }

  function updateCountdownText() {
    if (!countdownNodes.length) return;
    const text = latestSnapshot.refresh.activeMatch ? formatCountdown(latestSnapshot.refresh.remainingMs) : '--:--';
    for (const node of countdownNodes) node.textContent = text;
  }

  function updatePauseButton() {
    const pauseButton = widget?.querySelector('[data-part-action="toggle-pause"]');
    if (pauseButton) pauseButton.textContent = latestSnapshot.refresh.isPaused ? '继续' : '暂停';
  }

  function updateWidgetStatusText() {
    if (!widgetStatusNode) return;
    const text = widgetStatusText();
    if (text === lastWidgetStatusText) return;
    lastWidgetStatusText = text;
    widgetStatusNode.textContent = text;
  }

  function operationError(result) {
    const reasons = {
      'invalid-input': '设置无效。',
      'not-ready': '设置尚未读取完成。',
      disposed: '会话已结束。',
      'storage-failed': '设置保存失败。',
      'application-failed': '设置已保存，但应用失败。',
    };
    return `${reasons[result.code] || '操作失败。'}${result.message || result.state.applicationError || ''}`;
  }

  async function dispatchAction(action, node) {
    if (action === 'open-settings') return openSettings({ tab: 'refresh' });
    if (action === 'switch-tab') return renderDialog({ scope: getSelectedScope(), tab: node.dataset.partTab });
    if (action === 'close-dialog') return closeDialog();
    if (initializationError) throw new Error(initializationError);
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
      command.setting = dialogContract.readUnlockerFormSetting(dialog);
      tab = 'unlocker';
      message = `已保存到${scopeLabel(scope)}。`;
    } else if (action.startsWith('delete-unlocker-')) {
      scope = action.endsWith('page') ? 'page' : 'site';
      command = { type: 'delete-unlocker', scope };
      tab = 'unlocker';
      message = `已删除${scopeLabel(scope)}限制解除设置。`;
    }
    const submission = { generation: dialogGeneration, revision: editRevision, dialog };
    if (WRITE_ACTIONS.has(action)) pendingSubmissions.add(submission);
    let result;
    try {
      result = await session.dispatch(command);
    } finally {
      pendingSubmissions.delete(submission);
    }
    latestSnapshot = result.state;
    const sameDialog = dialog === submission.dialog && dialogGeneration === submission.generation;
    const sameDraft = sameDialog && editRevision === submission.revision;
    if (!result.ok) {
      const error = operationError(result);
      if (sameDraft && result.persisted) renderDialog({ message: error, tone: 'error', scope: result.scope || scope, tab });
      else if (sameDialog) {
        updateDialogStatus();
        setMessage(`操作失败：${error}`, 'error');
      }
      throw new Error(error);
    }
    if (action === 'toggle-pause') return result;
    if (action === 'disable-active') {
      scope = result.scope || scope;
      message = `已停用${scopeLabel(scope)}自动刷新。`;
    }
    if (sameDraft) renderDialog({ message, scope, tab });
    else if (sameDialog) {
      updateDialogStatus();
      setMessage(message);
    }
    return result;
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
    if (action === 'close-dialog' && dialog && actionNode === dialog) return;
    if (action === 'open-settings' && actionNode.classList.contains('part-widget-button') && layout.isExpansionSuppressed()) return;
    event.preventDefault();
    event.stopPropagation();
    const isWrite = WRITE_ACTIONS.has(action);
    const pendingLabel = isWrite ? actionNode.textContent : null;
    const actionDialog = dialog;
    const actionGeneration = dialogGeneration;
    const actionToken = {};
    if (isWrite) {
      pendingActionTokens.set(actionNode, actionToken);
      actionNode.disabled = true;
      actionNode.textContent = '处理中…';
    }
    try {
      await dispatchAction(action, actionNode);
    } catch (error) {
      if (disposed) return;
      console.warn(`${SCRIPT_NAME}: action failed.`, error);
      if (
        dialog === actionDialog
        && dialogGeneration === actionGeneration
        && !dialog?.querySelector('[data-part-role="message"]')?.textContent
      ) {
        setMessage(`操作失败：${error?.message || error}`, 'error');
      }
    } finally {
      if (isWrite && pendingActionTokens.get(actionNode) === actionToken) {
        pendingActionTokens.delete(actionNode);
        if (!disposed && actionNode.isConnected !== false) {
          actionNode.disabled = false;
          actionNode.textContent = pendingLabel;
        }
      }
    }
  }

  function handleRootInput(event) {
    if (dialog?.contains(event.target)) editRevision += 1;
  }

  function handleRootChange(event) {
    const target = event.target;
    if (!target?.matches?.('input[name="part-scope"]')) return;
    const selectedScope = getSelectedScope();
    renderDialog({ message: `将保存到${scopeLabel(selectedScope)}。`, scope: selectedScope, tab: activeDialogTab });
  }

  function handleResize() {
    if (!disposed) layout.applyPosition();
  }

  function update(snapshot, change = {}) {
    latestSnapshot = snapshot;
    if (disposed) return;
    if (snapshot.lifecycle === 'error') {
      initializationError = `初始化失败：${snapshot.applicationError || '设置读取失败。'}`;
      if (dialog) {
        setMessage(initializationError, 'error');
        disableDialogWrites();
      }
      return;
    }
    if (snapshot.lifecycle !== 'ready') return;
    initializationError = null;
    if (change.kind === 'lifecycle' || (change.kind === 'settings' && change.area === 'refresh')) renderWidget();
    updatePauseButton();
    updateCountdownText();
    updateWidgetStatusText();
    if (!dialog) return;
    updateDialogStatus();
    if (change.kind === 'settings' && pendingSubmissions.size === 0 && editRevision === 0) {
      renderDialog({ scope: getSelectedScope(), tab: activeDialogTab });
    }
  }

  function mergeIntent(next = {}) {
    pendingOpenIntent = {
      tab: next.tab ?? pendingOpenIntent?.tab ?? null,
      scope: next.scope ?? pendingOpenIntent?.scope ?? null,
    };
  }

  function openSettings(options = {}) {
    if (disposed) return Promise.resolve({ ok: false, code: 'disposed' });
    mergeIntent(options);
    if (openPromise) return openPromise;
    const opening = (async () => {
      let startup;
      try {
        startup = await Promise.race([
          Promise.resolve().then(() => ready()),
          disposedPromise,
        ]);
      } catch (error) {
        startup = { ok: false, code: 'storage-failed', message: String(error?.message || error), state: session.getState() };
      }
      if (disposed || startup?.code === 'disposed') return { ok: false, code: 'disposed' };
      if (startup?.state) latestSnapshot = startup.state;
      if (!startup?.ok && latestSnapshot.lifecycle !== 'ready') {
        initializationError = `初始化失败：${startup?.message || latestSnapshot.applicationError || '设置读取失败。'}`;
      }
      const intent = pendingOpenIntent || {};
      pendingOpenIntent = null;
      renderDialog({ scope: intent.scope, tab: intent.tab });
      return initializationError ? { ok: false, code: startup?.code || 'initialization-failed' } : { ok: true };
    })();
    const wrapped = opening.finally(() => {
      if (openPromise === wrapped) openPromise = null;
    });
    openPromise = wrapped;
    return wrapped;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    finishDisposed({ ok: false, code: 'disposed' });
    pendingOpenIntent = null;
    pendingSubmissions.clear();
    closeDialog({ restoreFocus: false });
    layout.dispose();
    windowObject.removeEventListener('resize', handleResize);
    if (root) {
      root.removeEventListener('click', handleRootClick);
      root.removeEventListener('change', handleRootChange);
      root.removeEventListener('input', handleRootInput);
    }
    themeCleanup?.();
    themeCleanup = null;
    root?.remove();
    root = null;
    widget = null;
    widgetButton = null;
    countdownNodes = [];
    widgetStatusNode = null;
    for (const styleId of ownedStyleIds) documentObject.getElementById(styleId)?.remove();
    ownedStyleIds.clear();
  }

  return { update, openSettings, dispose };
}

export { createWebPageAssistantView };
