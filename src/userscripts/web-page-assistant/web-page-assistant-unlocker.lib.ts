import type { UnlockerOption, UnlockerSetting } from './web-page-assistant-settings.lib.ts';

export interface UnlockerAdapters {
  hasUnlockerAction: (setting: UnlockerSetting | null | undefined) => setting is UnlockerSetting;
  rootContainsTarget: (target: EventTarget | null) => boolean;
  getDocumentTarget: () => EventTarget;
  getWindowTarget: () => EventTarget;
  getStyle: () => unknown;
  installStyle: (cssText: string) => void;
  removeStyle: () => void;
  rootId: string;
}

export interface UnlockerCapability {
  option: UnlockerOption;
  label: string;
  type: string;
}

interface CapabilitySpec extends UnlockerCapability {
  target: () => EventTarget;
  handler: (event: Event) => void;
}

export interface UnlockerRuntime {
  describe(setting: UnlockerSetting | null | undefined, scopeText: string): string;
  getCapabilitySpecs(): UnlockerCapability[];
  install(this: Pick<UnlockerRuntime, 'uninstall'>, setting: UnlockerSetting | null | undefined): void;
  uninstall(): void;
}

function createUnlockerRuntime(adapters: UnlockerAdapters): UnlockerRuntime {
  const {
    hasUnlockerAction,
    rootContainsTarget,
    getDocumentTarget,
    getWindowTarget,
    getStyle,
    installStyle,
    removeStyle,
    rootId,
  } = adapters;
  const capabilitySpecs: CapabilitySpec[] = [
    { option: 'allowSelection', label: '选择文本', target: getDocumentTarget, type: 'selectstart', handler: stopEvent },
    { option: 'allowCopy', label: '复制/剪切', target: getDocumentTarget, type: 'copy', handler: stopEvent },
    { option: 'allowCopy', label: '复制/剪切', target: getDocumentTarget, type: 'cut', handler: stopEvent },
    {
      option: 'allowContextMenu',
      label: '右键菜单',
      target: getDocumentTarget,
      type: 'contextmenu',
      handler: stopEvent,
    },
    { option: 'allowDrag', label: '拖拽', target: getDocumentTarget, type: 'dragstart', handler: stopEvent },
    {
      option: 'suppressBeforeUnload',
      label: '离开提示',
      target: getWindowTarget,
      type: 'beforeunload',
      handler: stopBeforeUnload,
    },
  ];
  let cleanupStack: Array<() => void> = [];

  function stopEvent(event: Event) {
    if (rootContainsTarget(event.target)) return;
    event.stopPropagation();
  }

  function stopBeforeUnload(event: Event) {
    event.stopImmediatePropagation();
    (event as BeforeUnloadEvent).returnValue = undefined;
    return undefined;
  }

  function addListener(target: EventTarget, type: string, handler: (event: Event) => void) {
    target.addEventListener(type, handler, true);
    cleanupStack.push(() => target.removeEventListener(type, handler, true));
  }

  function installSelectionStyle(setting: UnlockerSetting) {
    if (!setting.allowSelection || getStyle()) return;

    installStyle(`
      html :not(#${rootId}):not(#${rootId} *) {
        -webkit-user-select: text !important;
        user-select: text !important;
      }
    `);
  }

  function describe(setting: UnlockerSetting | null | undefined, scopeText: string) {
    if (!setting?.enabled) return '当前未启用网页限制解除。';

    const labels: string[] = [];
    const seenOptions = new Set<UnlockerOption>();
    for (const spec of capabilitySpecs) {
      if (!setting[spec.option] || seenOptions.has(spec.option)) continue;
      labels.push(spec.label);
      seenOptions.add(spec.option);
    }

    if (!labels.length) return '网页限制解除已保存，但没有启用任何能力。';
    return `${scopeText}已启用：${labels.join('、')}。`;
  }

  return {
    describe,
    getCapabilitySpecs() {
      return capabilitySpecs.map(({ option, label, type }) => ({ option, label, type }));
    },
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

      removeStyle();
    },
  };
}

export { createUnlockerRuntime };
