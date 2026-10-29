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

interface CapabilitySpec {
  option: UnlockerOption;
  type: string;
  target: () => EventTarget;
  handler: (event: Event) => void;
}

export interface UnlockerRuntime {
  install(setting: UnlockerSetting | null | undefined): void;
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
    { option: 'allowSelection', target: getDocumentTarget, type: 'selectstart', handler: stopEvent },
    { option: 'allowCopy', target: getDocumentTarget, type: 'copy', handler: stopEvent },
    { option: 'allowCopy', target: getDocumentTarget, type: 'cut', handler: stopEvent },
    {
      option: 'allowContextMenu',

      target: getDocumentTarget,
      type: 'contextmenu',
      handler: stopEvent,
    },
    { option: 'allowDrag', target: getDocumentTarget, type: 'dragstart', handler: stopEvent },
    {
      option: 'suppressBeforeUnload',

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

  function uninstall() {
    for (const cleanup of cleanupStack) {
      cleanup();
    }
    cleanupStack = [];

    removeStyle();
  }

  return {
    install(setting) {
      uninstall();
      if (!hasUnlockerAction(setting)) return;

      installSelectionStyle(setting);
      for (const spec of capabilitySpecs) {
        if (setting[spec.option]) {
          addListener(spec.target(), spec.type, spec.handler);
        }
      }
    },
    uninstall,
  };
}

export { createUnlockerRuntime };
