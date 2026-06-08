(function attachWebPageAssistantUnlockerLib(globalObject) {
  'use strict';

  const LIB_NAME = 'WebPageAssistantUnlockerLib';

  function createUnlockerRuntime(adapters) {
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
    const capabilitySpecs = [
      { option: 'allowSelection', label: '选择文本', target: getDocumentTarget, type: 'selectstart', handler: stopEvent },
      { option: 'allowCopy', label: '复制/剪切', target: getDocumentTarget, type: 'copy', handler: stopEvent },
      { option: 'allowCopy', label: '复制/剪切', target: getDocumentTarget, type: 'cut', handler: stopEvent },
      { option: 'allowContextMenu', label: '右键菜单', target: getDocumentTarget, type: 'contextmenu', handler: stopEvent },
      { option: 'allowDrag', label: '拖拽', target: getDocumentTarget, type: 'dragstart', handler: stopEvent },
      { option: 'suppressBeforeUnload', label: '离开提示', target: getWindowTarget, type: 'beforeunload', handler: stopBeforeUnload },
    ];
    let cleanupStack = [];

    function stopEvent(event) {
      if (rootContainsTarget(event.target)) return;
      event.stopPropagation();
    }

    function stopBeforeUnload(event) {
      event.stopImmediatePropagation();
      event.returnValue = undefined;
      return undefined;
    }

    function addListener(target, type, handler) {
      target.addEventListener(type, handler, true);
      cleanupStack.push(() => target.removeEventListener(type, handler, true));
    }

    function installSelectionStyle(setting) {
      if (!setting.allowSelection || getStyle()) return;

      installStyle(`
        html :not(#${rootId}):not(#${rootId} *) {
          -webkit-user-select: text !important;
          user-select: text !important;
        }
      `);
    }

    function describe(setting, scopeText) {
      if (!setting?.enabled) return '当前未启用网页限制解除。';

      const labels = [];
      const seenOptions = new Set();
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

  globalObject[LIB_NAME] = Object.freeze({
    createUnlockerRuntime,
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
