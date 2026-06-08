import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const blockStart = '// WEB_PAGE_ASSISTANT_UNLOCKER_RUNTIME_START';
const blockEnd = '// WEB_PAGE_ASSISTANT_UNLOCKER_RUNTIME_END';

async function loadUnlockerRuntimeFactory() {
  const userscriptPath = path.resolve(import.meta.dirname, '../src/web-page-assistant.user.js');
  const content = await readFile(userscriptPath, 'utf8');
  const startIndex = content.indexOf(blockStart);
  const endIndex = content.indexOf(blockEnd);

  assert.notEqual(startIndex, -1, 'unlocker runtime start marker is missing');
  assert.notEqual(endIndex, -1, 'unlocker runtime end marker is missing');
  assert.ok(endIndex > startIndex, 'unlocker runtime markers are out of order');

  const block = content.slice(startIndex + blockStart.length, endIndex);
  return vm.runInThisContext(`
    (() => {
      ${block}
      return createUnlockerRuntime;
    })()
  `);
}

function createTarget() {
  const listeners = [];
  return {
    listeners,
    addEventListener(type, handler, capture) {
      listeners.push({ type, handler, capture });
    },
    removeEventListener(type, handler, capture) {
      const index = listeners.findIndex(
        (listener) => listener.type === type && listener.handler === handler && listener.capture === capture,
      );
      if (index >= 0) listeners.splice(index, 1);
    },
    dispatch(type, event) {
      for (const listener of listeners.filter((entry) => entry.type === type)) {
        listener.handler(event);
      }
    },
  };
}

function createEvent(target = {}) {
  return {
    target,
    stopped: 0,
    immediateStopped: 0,
    returnValue: 'keep',
    stopPropagation() {
      this.stopped += 1;
    },
    stopImmediatePropagation() {
      this.immediateStopped += 1;
    },
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

function createHarness(options = {}) {
  const documentTarget = createTarget();
  const windowTarget = createTarget();
  let style = null;
  const createUnlockerRuntime = createHarness.factory;
  const runtime = createUnlockerRuntime({
    hasUnlockerAction,
    rootContainsTarget: (target) => target === options.rootTarget,
    getDocumentTarget: () => documentTarget,
    getWindowTarget: () => windowTarget,
    getStyle: () => style,
    installStyle(cssText) {
      style = {
        cssText,
        removed: false,
        remove() {
          this.removed = true;
          style = null;
        },
      };
    },
    removeStyle() {
      if (style) style.remove();
    },
    rootId: 'page-auto-refresh-timer-root',
  });

  return {
    runtime,
    documentTarget,
    windowTarget,
    get style() {
      return style;
    },
  };
}

createHarness.factory = await loadUnlockerRuntimeFactory();

test('unlocker runtime installs capability listeners and selection style', () => {
  const harness = createHarness();

  harness.runtime.install({
    enabled: true,
    allowSelection: true,
    allowCopy: true,
    allowContextMenu: false,
    allowDrag: true,
    suppressBeforeUnload: true,
  });

  assert.deepEqual(
    harness.documentTarget.listeners.map((listener) => [listener.type, listener.capture]),
    [
      ['selectstart', true],
      ['copy', true],
      ['cut', true],
      ['dragstart', true],
    ],
  );
  assert.deepEqual(
    harness.windowTarget.listeners.map((listener) => [listener.type, listener.capture]),
    [['beforeunload', true]],
  );
  assert.match(harness.style.cssText, /page-auto-refresh-timer-root/);
});

test('unlocker runtime excludes events inside the assistant root', () => {
  const rootTarget = { id: 'root-child' };
  const harness = createHarness({ rootTarget });
  harness.runtime.install({ enabled: true, allowCopy: true });

  const rootEvent = createEvent(rootTarget);
  const pageEvent = createEvent({ id: 'page' });
  harness.documentTarget.dispatch('copy', rootEvent);
  harness.documentTarget.dispatch('copy', pageEvent);

  assert.equal(rootEvent.stopped, 0);
  assert.equal(pageEvent.stopped, 1);
});

test('unlocker runtime suppresses beforeunload and cleans listeners on uninstall', () => {
  const harness = createHarness();
  harness.runtime.install({ enabled: true, suppressBeforeUnload: true });

  const event = createEvent();
  harness.windowTarget.dispatch('beforeunload', event);

  assert.equal(event.immediateStopped, 1);
  assert.equal(event.returnValue, undefined);

  harness.runtime.uninstall();
  assert.deepEqual(harness.windowTarget.listeners, []);
});

test('unlocker runtime removes selection style on reinstall or uninstall', () => {
  const harness = createHarness();

  harness.runtime.install({ enabled: true, allowSelection: true });
  assert.notEqual(harness.style, null);

  harness.runtime.install({ enabled: true, allowCopy: true });
  assert.equal(harness.style, null);
  assert.deepEqual(harness.documentTarget.listeners.map((listener) => listener.type), ['copy', 'cut']);

  harness.runtime.uninstall();
  assert.deepEqual(harness.documentTarget.listeners, []);
});

test('unlocker runtime describes active capability settings without duplicate labels', () => {
  const harness = createHarness();

  assert.equal(harness.runtime.describe(null, '当前页面'), '当前未启用网页限制解除。');
  assert.equal(
    harness.runtime.describe({
      enabled: true,
      allowSelection: false,
      allowCopy: false,
      allowContextMenu: false,
      allowDrag: false,
      suppressBeforeUnload: false,
    }, '当前页面'),
    '网页限制解除已保存，但没有启用任何能力。',
  );
  assert.equal(
    harness.runtime.describe({
      enabled: true,
      allowCopy: true,
      suppressBeforeUnload: true,
    }, '整个站点'),
    '整个站点已启用：复制/剪切、离开提示。',
  );
});
