import test from 'node:test';
import assert from 'node:assert/strict';

import { createDomWindow, domSkip } from './helpers/dom-env.mjs';
import {
  createDialogElement,
  createPageAssistantDialogContract,
} from '../src/userscripts/web-page-assistant/web-page-assistant-presentation.lib.ts';

function createDialogContract() {
  return createPageAssistantDialogContract({
    defaultIntervalMs: 5 * 60 * 1000,
    formatInterval(ms) {
      return `${ms / 1000} 秒`;
    },
  });
}

function createFakeDialog(checkedRoles) {
  return {
    querySelector(selector) {
      const role = selector.match(/data-part-role="([^"]+)"/)?.[1];
      if (!role) return null;
      return { checked: checkedRoles.includes(role) };
    },
  };
}

test('dialog contract normalizes tabs and focus roles', () => {
  const contract = createDialogContract();

  assert.equal(contract.normalizeTab('unlocker', 'refresh'), 'unlocker');
  assert.equal(contract.normalizeTab('missing', 'refresh'), 'refresh');
  assert.equal(contract.focusRoleForTab('unlocker'), contract.roles.unlockerEnabled);
  assert.equal(contract.focusRoleForTab('refresh'), contract.roles.customValue);
});

test('dialog contract shapes page and site settings into a view model', () => {
  const contract = createDialogContract();
  const model = contract.createViewModel({
    message: 'saved',
    preferredTab: 'unlocker',
    preferredScope: null,
    activeTab: 'refresh',
    activeRefreshMatch: {
      scope: 'site',
      setting: { intervalMs: 30_000 },
    },
    activeUnlockerMatch: null,
    settings: {
      refresh: {
        pages: {
          'https://example.com/a': { intervalMs: 45_000 },
        },
        sites: {
          'example.com': { intervalMs: 60_000 },
        },
      },
      unlocker: {
        pages: {},
        sites: {
          'example.com': { enabled: true, allowCopy: true },
        },
      },
    },
    pageKey: 'https://example.com/a',
    siteKey: 'example.com',
    statusText: 'site active',
    unlockerStatusText: 'unlocker active',
  });

  assert.equal(model.message, 'saved');
  assert.equal(model.activeTab, 'unlocker');
  assert.equal(model.selectedScope, 'site');
  assert.equal(model.customInterval.value, '30');
  assert.equal(model.customInterval.unit, 'seconds');
  assert.equal(model.pageRefreshText, '页面：https://example.com/a（45 秒）');
  assert.equal(model.siteRefreshText, '站点：example.com（60 秒）');
  assert.equal(model.pageUnlockerText, '页面：https://example.com/a（未设置）');
  assert.equal(model.siteUnlockerText, '站点：example.com（已保存）');
  assert.equal(model.unlockerFormSetting.enabled, true);
  assert.equal(model.unlockerFormSetting.allowCopy, true);
  assert.equal(model.focusRole, contract.roles.unlockerEnabled);
});

test('dialog contract reads unlocker form intent from role selectors', () => {
  const contract = createDialogContract();
  const setting = contract.readUnlockerFormSetting(
    createFakeDialog([
      contract.roles.unlockerEnabled,
      contract.roles.unlockerCopy,
      contract.roles.unlockerBeforeUnload,
    ]),
  );

  assert.equal(setting.enabled, true);
  assert.equal(setting.allowSelection, false);
  assert.equal(setting.allowCopy, true);
  assert.equal(setting.allowContextMenu, false);
  assert.equal(setting.allowDrag, false);
  assert.equal(setting.suppressBeforeUnload, true);
});

test('dialog contract writes unlocker checkboxes and reads the same fields back', { skip: domSkip }, () => {
  const window = createDomWindow();
  const contract = createDialogContract();
  const unlockerSetting = {
    enabled: true,
    allowSelection: false,
    allowCopy: true,
    allowContextMenu: false,
    allowDrag: true,
    suppressBeforeUnload: false,
    updatedAt: 1,
  };
  const model = contract.createViewModel({
    activeTab: 'unlocker',
    settings: { unlocker: { pages: { page: unlockerSetting } } },
    pageKey: 'page',
    siteKey: 'site',
    statusText: '',
    unlockerStatusText: '',
  });
  const dialog = createDialogElement({ documentObject: window.document, model });
  window.document.body.append(dialog);
  contract.applyModel(dialog, model, []);

  const checked = (role) => dialog.querySelector(contract.roleSelector(role)).checked;
  assert.deepEqual(
    [
      contract.roles.unlockerEnabled,
      contract.roles.unlockerSelection,
      contract.roles.unlockerCopy,
      contract.roles.unlockerContextMenu,
      contract.roles.unlockerDrag,
      contract.roles.unlockerBeforeUnload,
    ].map(checked),
    [true, false, true, false, true, false],
  );
  const { updatedAt, ...read } = contract.readUnlockerFormSetting(dialog);
  assert.equal(Number.isFinite(updatedAt), true);
  const { updatedAt: _ignored, ...expected } = unlockerSetting;
  assert.deepEqual(read, expected);
});
