import * as PageAssistantSettings from './web-page-assistant-settings.lib.ts';
import { installAssistantBaseStyles } from './web-page-assistant-presentation-base-styles.lib.ts';
import { installAssistantDialogStyles } from './web-page-assistant-presentation-dialog-styles.lib.ts';
import {
  createPageAssistantDialogContract,
  createWidgetElement,
  createDialogElement,
  isCoarsePointer,
} from './web-page-assistant-presentation.lib.ts';
import { createDragAnchor, createHoverExpansion, createPanelPlacement } from '../shared/shared-widget-shell.lib.ts';
import { buildTokenCss, applyTheme } from '../shared/shared-tokens.lib.ts';
import type { DragAnchor, HoverExpansion, PanelPlacement, WidgetTimers } from '../shared/shared-widget-shell.lib.ts';
import type { DialogTab } from './web-page-assistant-presentation.lib.ts';
import type { Scope, ScopeKeys, UnlockerOption, UnlockerSetting } from './web-page-assistant-settings.lib.ts';
import type {
  SessionChange,
  SessionCommand,
  SessionResult,
  SessionResultCode,
  SessionState,
  WebPageAssistantSession,
} from './web-page-assistant-session.lib.ts';
import type { WidgetPosition } from './web-page-assistant-storage.lib.ts';

export interface WidgetPositionStore {
  get?: () => WidgetPosition | null;
  normalize: (value: unknown) => WidgetPosition | null;
  write: (position: WidgetPosition) => Promise<unknown>;
}

/** What opening the settings waits for: the session start result, or a failure stand-in. */
export interface StartupOutcome {
  ok: boolean;
  code?: string | null;
  message?: string;
  state?: SessionState;
}

export interface OpenSettingsResult {
  ok: boolean;
  code?: string | null;
}

export interface OpenSettingsOptions {
  tab?: DialogTab | null;
  scope?: Scope | null;
}

export interface WebPageAssistantViewOptions {
  session: Pick<WebPageAssistantSession, 'getState' | 'dispatch'>;
  keys: ScopeKeys;
  document: Document;
  window: Window;
  positions: WidgetPositionStore;
  ready: () => StartupOutcome | Promise<StartupOutcome>;
  clock?: Partial<WidgetTimers> | null;
}

export interface WebPageAssistantView {
  update(snapshot: SessionState, change?: Partial<SessionChange>): void;
  openSettings(options?: OpenSettingsOptions): Promise<OpenSettingsResult>;
  dispose(): void;
}

type Btn = HTMLButtonElement;
type MessageTone = 'info' | 'error';

interface RenderDialogOptions {
  message?: string;
  tone?: MessageTone;
  scope?: Scope | null;
  tab?: string | null;
}

interface OpenIntent {
  tab: DialogTab | null;
  scope: Scope | null;
}

interface PreservedDialogState {
  scrollTop: number;
  focusSelector: string | null;
}

interface CustomIntervalResult {
  error?: string;
  intervalMs?: number;
}

/** Commands built from DOM actions; the session validates the shape at runtime. */
interface ViewCommand {
  type: string;
  scope: Scope;
  intervalMs?: number;
  setting?: UnlockerSetting | null;
}

interface Submission {
  generation: number;
  revision: number;
  dialog: HTMLDialogElement | null;
}

interface WidgetShellParts {
  anchor: DragAnchor;
  expansion: HoverExpansion;
  placement: PanelPlacement | null;
  panel: HTMLElement | null;
}

const SCRIPT_NAME = 'Web Page Assistant';
const ROOT_ID = 'page-auto-refresh-timer-root';
const STYLE_ID = `${ROOT_ID}-style`;
const TOKEN_STYLE_ID = `${ROOT_ID}-token-style`;
const DIALOG_STYLE_ID = `${ROOT_ID}-dialog-style`;
// Widget footprint from the base styles (.part-widget) and the compact panel.
const WIDGET_SIZE = { width: 154, height: 60 };
const WIDGET_DEFAULT_OFFSET = 18;
const PANEL_WIDTH = 248;
const PANEL_MIN_WIDTH = 52;
const PANEL_SAFE_MARGIN = 12;
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

function formatInterval(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds} 秒`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds ? `${minutes} 分钟 ${seconds} 秒` : `${minutes} 分钟`;
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function scopeLabel(scope: Scope | null | undefined): string {
  return scope === 'page' ? '当前页面' : '整个站点';
}

function unlockerStatusText(snapshot: SessionState, scope: Scope | null | undefined): string {
  const setting = snapshot.appliedUnlocker?.setting;
  if (!setting?.enabled) return '当前未启用网页限制解除。';
  const labels = [
    ['allowSelection', '选择文本'],
    ['allowCopy', '复制/剪切'],
    ['allowContextMenu', '右键菜单'],
    ['allowDrag', '拖拽'],
    ['suppressBeforeUnload', '离开提示'],
  ]
    .filter(([option]) => setting[option as UnlockerOption])
    .map(([, label]) => label);
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
}: WebPageAssistantViewOptions): WebPageAssistantView {
  const timers: WidgetTimers = {
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
  let root: HTMLElement | null = null;
  let widget: HTMLElement | null = null;
  let widgetButton: HTMLButtonElement | null = null;
  let countdownNodes: HTMLElement[] = [];
  let widgetStatusNode: HTMLElement | null = null;
  let lastWidgetStatusText = '';
  let widgetPosition: WidgetPosition | null = positions.get?.() || null;
  let hasMountedWidget = false;
  let dialog: HTMLDialogElement | null = null;
  let activeDialogTab: DialogTab = 'refresh';
  let dialogGeneration = 0;
  let editRevision = 0;
  let dialogReturnFocus: HTMLElement | null = null;
  let themeCleanup: (() => void) | null = null;
  let initializationError: string | null = null;
  let disposed = false;
  let openPromise: Promise<OpenSettingsResult> | null = null;
  let pendingOpenIntent: OpenIntent | null = null;
  const pendingSubmissions = new Set<Submission>();
  const pendingActionTokens = new WeakMap<Element, object>();
  const ownedStyleIds = new Set<string>();
  let finishDisposed: (value: OpenSettingsResult) => void;
  const disposedPromise = new Promise<OpenSettingsResult>((resolve) => {
    finishDisposed = resolve;
  });

  let widgetShell: WidgetShellParts | null = null;

  function defaultWidgetPosition(): WidgetPosition {
    return {
      left: windowObject.innerWidth - WIDGET_SIZE.width - WIDGET_DEFAULT_OFFSET,
      top: windowObject.innerHeight - WIDGET_SIZE.height - WIDGET_DEFAULT_OFFSET,
    };
  }

  function sizeWidgetPanel(panel: HTMLElement) {
    const width = Math.min(PANEL_WIDTH, Math.max(PANEL_MIN_WIDTH, windowObject.innerWidth - PANEL_SAFE_MARGIN * 2));
    panel.style.setProperty('--part-panel-width', `${Math.round(width)}px`);
  }

  // The widget rides on the shared kit: drag and clamping from the drag
  // anchor (no edge docking), hover/focus disclosure, and panel placement
  // through floating-ui against the widget box.
  function attachWidgetShell() {
    detachWidgetShell();
    const panel = widget!.querySelector<HTMLElement>('.part-widget-panel');
    const anchor = createDragAnchor({
      anchorEl: widget!,
      handleEl: widgetButton!,
      windowObject,
      measure: () => WIDGET_SIZE,
      dock: false,
      timers,
      onDragStart() {
        expansion.setExpanded(false);
      },
      onMove(position) {
        widgetPosition = { left: position.left, top: position.top };
        placement?.update().catch(() => {});
      },
      onDrop(position) {
        positions.write({ left: Math.round(position.left), top: Math.round(position.top) }).catch((error) => {
          console.warn(`${SCRIPT_NAME}: failed to persist widget position.`, error);
        });
      },
    });
    const expansion = createHoverExpansion({
      container: widget!,
      trigger: widgetButton!,
      isCoarsePointer: () => isCoarsePointer(windowObject),
      isSuppressed: () => anchor.isDragSuppressed(),
      timers,
    });
    const placement = panel
      ? createPanelPlacement({
          reference: widget!,
          floating: panel,
          placement: 'top-end',
          strategy: 'absolute',
          apply({ x, y, placement: side }) {
            panel.style.setProperty('--part-panel-left', `${Math.round(x)}px`);
            panel.style.setProperty('--part-panel-top', `${Math.round(y)}px`);
            panel.style.setProperty('--part-panel-origin', side.startsWith('bottom') ? 'top right' : 'bottom right');
          },
        })
      : null;
    widgetShell = { anchor, expansion, placement, panel };
  }

  function detachWidgetShell() {
    if (!widgetShell) return;
    widgetShell.placement?.stop();
    widgetShell.expansion.destroy();
    widgetShell.anchor.destroy();
    widgetShell = null;
  }

  function placeWidget() {
    if (!widgetShell) return;
    const position = positions.normalize(widgetPosition) || defaultWidgetPosition();
    widgetShell.anchor.applyPosition({ left: position.left, top: position.top });
    if (widgetShell.panel) sizeWidgetPanel(widgetShell.panel);
    widgetShell.placement?.update().catch(() => {});
  }

  function currentStatusText(snapshot: SessionState = latestSnapshot): string {
    const activeMatch = snapshot.refresh.activeMatch;
    if (!activeMatch) return '当前未启用自动刷新。';
    return `${scopeLabel(activeMatch.scope)}已启用，每 ${formatInterval(activeMatch.setting.intervalMs)} 刷新一次。`;
  }

  function widgetStatusText(snapshot: SessionState = latestSnapshot): string {
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

  function ensureRoot(): HTMLElement | null {
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
    root!.append(widget);
    attachWidgetShell();
    placeWidget();
    widgetShell!.placement?.start();
    hasMountedWidget = true;
    if (returnToWidget) dialogReturnFocus = widgetButton;
    updatePauseButton();
    updateCountdownText();
    updateWidgetStatusText();
  }

  function getSelectedScope() {
    return dialogContract.readSelectedScope(dialog);
  }

  function createDialogViewModel(
    message = '',
    preferredScope: Scope | null = null,
    preferredTab: string | null = null,
  ) {
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

  function captureDialogState(): PreservedDialogState | null {
    if (!dialog) return null;
    const panel = dialog.querySelector('.part-dialog');
    let focusSelector: string | null = null;
    const active = documentObject.activeElement;
    if (active && dialog.contains(active)) {
      const roleNode = active.closest?.<HTMLElement>('[data-part-role]');
      const actionNode = active.closest?.<HTMLElement>('[data-part-action]');
      if (roleNode) focusSelector = dialogContract.roleSelector(roleNode.dataset.partRole!);
      else if (active.matches?.('input[name="part-scope"]')) {
        focusSelector = `input[name="part-scope"][value="${(active as HTMLInputElement).value}"]`;
      } else if (actionNode) {
        focusSelector = dialogContract.actionSelector(actionNode.dataset.partAction!);
        for (const [datasetKey, attribute] of [
          ['partTab', 'data-part-tab'],
          ['intervalMs', 'data-interval-ms'],
        ]) {
          if (actionNode.dataset[datasetKey]) focusSelector += `[${attribute}="${actionNode.dataset[datasetKey]}"]`;
        }
      }
    }
    return { scrollTop: panel?.scrollTop || 0, focusSelector };
  }

  function restoreDialogState(preserved: PreservedDialogState | null) {
    if (!preserved || !dialog) return;
    const panel = dialog.querySelector('.part-dialog');
    if (panel && preserved.scrollTop) panel.scrollTop = preserved.scrollTop;
    if (preserved.focusSelector) dialog.querySelector<HTMLElement>(preserved.focusSelector)?.focus?.();
  }

  function setMessage(text: string, tone: MessageTone = 'info') {
    const messageNode = dialog?.querySelector<HTMLElement>(dialogContract.roleSelector(dialogContract.roles.message));
    if (!messageNode) return;
    messageNode.textContent = text;
    messageNode.dataset.tone = tone;
  }

  function disableDialogWrites() {
    if (!dialog) return;
    for (const action of WRITE_ACTIONS) {
      for (const node of dialog.querySelectorAll<Btn>(dialogContract.actionSelector(action))) node.disabled = true;
    }
  }

  function renderDialog({ message = '', tone = 'info', scope = null, tab = null }: RenderDialogOptions = {}) {
    if (disposed) return;
    ensureRoot();
    const preserved = captureDialogState();
    if (!dialog) {
      const active = documentObject.activeElement;
      dialogReturnFocus = active && root!.contains(active) ? (active as HTMLElement) : widgetButton || null;
    } else {
      dialog.remove();
      dialog = null;
    }
    const model = createDialogViewModel(message, scope, tab);
    activeDialogTab = model.activeTab;
    dialog = createDialogElement({ documentObject, model });
    dialogGeneration += 1;
    editRevision = 0;
    // Native modal dialog: the platform makes the rest of the page inert
    // (including nodes added later) and turns Escape into a `cancel` event.
    dialog.addEventListener('cancel', handleDialogCancel);
    root!.append(dialog);
    dialog.showModal?.();
    dialogContract.applyModel(dialog, model, PRESETS);
    restoreDialogState(preserved);
    setMessage(initializationError || model.message, initializationError ? 'error' : tone);
    if (initializationError) disableDialogWrites();
  }

  function closeDialog({ restoreFocus = true }: { restoreFocus?: boolean } = {}) {
    if (!dialog) return;
    dialogGeneration += 1;
    const closing = dialog;
    dialog = null;
    if (closing.open) closing.close?.();
    closing.remove();
    const returnTarget = dialogReturnFocus;
    dialogReturnFocus = null;
    if (restoreFocus && returnTarget?.isConnected !== false) returnTarget?.focus?.();
  }

  function handleDialogCancel(event: Event) {
    event.preventDefault();
    closeDialog();
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

  function parseCustomInterval(): CustomIntervalResult {
    const valueNode = dialog?.querySelector(dialogContract.roleSelector(dialogContract.roles.customValue));
    const unitNode = dialog?.querySelector(dialogContract.roleSelector(dialogContract.roles.customUnit));
    const amount = Number((valueNode as HTMLInputElement | null | undefined)?.value);
    const unit = (unitNode as HTMLSelectElement | null | undefined)?.value === 'minutes' ? 'minutes' : 'seconds';
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

  function operationError(result: SessionResult): string {
    const reasons: Record<SessionResultCode, string> = {
      'invalid-input': '设置无效。',
      'not-ready': '设置尚未读取完成。',
      disposed: '会话已结束。',
      'storage-failed': '设置保存失败。',
      'application-failed': '设置已保存，但应用失败。',
    };
    return `${reasons[result.code as SessionResultCode] || '操作失败。'}${result.message || result.state.applicationError || ''}`;
  }

  async function dispatchAction(action: string, node: HTMLElement) {
    if (action === 'open-settings') return openSettings({ tab: 'refresh' });
    if (action === 'switch-tab') return renderDialog({ scope: getSelectedScope(), tab: node.dataset.partTab });
    if (action === 'close-dialog') return closeDialog();
    if (initializationError) throw new Error(initializationError);
    let scope = getSelectedScope();
    let command: ViewCommand = { type: action, scope };
    let tab = 'refresh';
    let message = '';
    if (action === 'save-preset' || action === 'save-custom') {
      const parsed: CustomIntervalResult =
        action === 'save-custom' ? parseCustomInterval() : { intervalMs: Number(node.dataset.intervalMs) };
      if (parsed.error) throw new Error(parsed.error);
      command = { type: 'save-refresh', scope, intervalMs: parsed.intervalMs };
      message = `已保存到${scopeLabel(scope)}：每 ${formatInterval(parsed.intervalMs!)} 刷新一次。`;
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
    let result: SessionResult;
    try {
      result = await session.dispatch(command as SessionCommand);
    } finally {
      pendingSubmissions.delete(submission);
    }
    latestSnapshot = result.state;
    const sameDialog = dialog === submission.dialog && dialogGeneration === submission.generation;
    const sameDraft = sameDialog && editRevision === submission.revision;
    if (!result.ok) {
      const error = operationError(result);
      if (sameDraft && result.persisted)
        renderDialog({ message: error, tone: 'error', scope: result.scope || scope, tab });
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

  async function handleRootClick(event: Event) {
    const actionNode = (event.target as Element | null)?.closest?.<HTMLElement>('[data-part-action]');
    if (!actionNode || !root?.contains(actionNode)) return;
    const action = actionNode.dataset.partAction!;
    if (!WRITE_ACTIONS.has(action) && !['open-settings', 'switch-tab', 'close-dialog', 'toggle-pause'].includes(action))
      return;
    if (action === 'close-dialog' && dialog && actionNode === dialog && event.target === dialog) {
      closeDialog();
      return;
    }
    if (action === 'close-dialog' && dialog && actionNode === dialog) return;
    if (
      action === 'open-settings' &&
      actionNode.classList.contains('part-widget-button') &&
      widgetShell?.anchor.isDragSuppressed()
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    const isWrite = WRITE_ACTIONS.has(action);
    const pendingLabel = isWrite ? actionNode.textContent : null;
    const actionDialog = dialog;
    const actionGeneration = dialogGeneration;
    const actionToken = {};
    if (isWrite) {
      pendingActionTokens.set(actionNode, actionToken);
      (actionNode as HTMLButtonElement).disabled = true;
      actionNode.textContent = '处理中…';
    }
    try {
      await dispatchAction(action, actionNode);
    } catch (error) {
      if (disposed) return;
      console.warn(`${SCRIPT_NAME}: action failed.`, error);
      if (
        dialog === actionDialog &&
        dialogGeneration === actionGeneration &&
        !dialog?.querySelector('[data-part-role="message"]')?.textContent
      ) {
        setMessage(`操作失败：${(error as Error | null)?.message || error}`, 'error');
      }
    } finally {
      if (isWrite && pendingActionTokens.get(actionNode) === actionToken) {
        pendingActionTokens.delete(actionNode);
        if (!disposed && actionNode.isConnected !== false) {
          (actionNode as HTMLButtonElement).disabled = false;
          actionNode.textContent = pendingLabel;
        }
      }
    }
  }

  function handleRootInput(event: Event) {
    if (dialog?.contains(event.target as Node | null)) editRevision += 1;
  }

  function handleRootChange(event: Event) {
    const target = event.target as Element | null;
    if (!target?.matches?.('input[name="part-scope"]')) return;
    const selectedScope = getSelectedScope();
    renderDialog({ message: `将保存到${scopeLabel(selectedScope)}。`, scope: selectedScope, tab: activeDialogTab });
  }

  function handleResize() {
    if (!disposed) placeWidget();
  }

  function update(snapshot: SessionState, change: Partial<SessionChange> = {}) {
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
    if (
      change.kind === 'lifecycle' ||
      (change.kind === 'settings' && ['refresh', 'all'].includes(change.area as string))
    )
      renderWidget();
    updatePauseButton();
    updateCountdownText();
    updateWidgetStatusText();
    if (!dialog) return;
    updateDialogStatus();
    if (change.kind === 'settings' && pendingSubmissions.size === 0 && editRevision === 0) {
      renderDialog({ scope: getSelectedScope(), tab: activeDialogTab });
    }
  }

  function mergeIntent(next: OpenSettingsOptions = {}) {
    pendingOpenIntent = {
      tab: next.tab ?? pendingOpenIntent?.tab ?? null,
      scope: next.scope ?? pendingOpenIntent?.scope ?? null,
    };
  }

  function openSettings(options: OpenSettingsOptions = {}): Promise<OpenSettingsResult> {
    if (disposed) return Promise.resolve({ ok: false, code: 'disposed' });
    mergeIntent(options);
    if (openPromise) return openPromise;
    const opening = (async (): Promise<OpenSettingsResult> => {
      let startup: StartupOutcome;
      try {
        startup = await Promise.race([Promise.resolve().then(() => ready()), disposedPromise]);
      } catch (error) {
        startup = {
          ok: false,
          code: 'storage-failed',
          message: String((error as Error | null)?.message || error),
          state: session.getState(),
        };
      }
      if (disposed || startup?.code === 'disposed') return { ok: false, code: 'disposed' };
      if (startup?.state) latestSnapshot = startup.state;
      if (!startup?.ok && latestSnapshot.lifecycle !== 'ready') {
        initializationError = `初始化失败：${startup?.message || latestSnapshot.applicationError || '设置读取失败。'}`;
      }
      const intent: Partial<OpenIntent> = pendingOpenIntent || {};
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
    detachWidgetShell();
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
