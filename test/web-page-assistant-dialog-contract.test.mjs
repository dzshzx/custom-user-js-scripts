import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

await import('../src/userscripts/web-page-assistant/web-page-assistant-presentation.lib.js');

const userscriptPath = path.resolve(
  import.meta.dirname,
  '../src/userscripts/web-page-assistant/web-page-assistant.user.js',
);
const presentationRequireUrls = [
  'https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/userscripts/web-page-assistant/web-page-assistant-presentation-base-styles.lib.js',
  'https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/userscripts/web-page-assistant/web-page-assistant-presentation-dialog-styles.lib.js',
  'https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/userscripts/web-page-assistant/web-page-assistant-presentation.lib.js',
];
const userscriptContent = await readFile(userscriptPath, 'utf8');

function createSettingsContract() {
  return {
    getRefreshSetting(settings, scope, key) {
      return settings.refresh?.[scope]?.[key] || null;
    },
    getUnlockerSetting(settings, scope, key) {
      return settings.unlocker?.[scope]?.[key] || null;
    },
  };
}

function createDialogContract() {
  const createPageAssistantDialogContract = createDialogContract.factory;
  return createPageAssistantDialogContract({
    settingsContract: createSettingsContract(),
    defaultIntervalMs: 5 * 60 * 1000,
    defaultUnlockerSetting(overrides = {}) {
      return {
        enabled: true,
        allowSelection: true,
        allowCopy: true,
        allowContextMenu: true,
        allowDrag: false,
        suppressBeforeUnload: false,
        updatedAt: 1,
        ...overrides,
      };
    },
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

createDialogContract.factory = globalThis.WebPageAssistantPresentationLib.createPageAssistantDialogContract;

test('installable metadata requires the presentation libraries', () => {
  for (const requireUrl of presentationRequireUrls) {
    assert.equal(
      userscriptContent.includes(`// @require      ${requireUrl}`),
      true,
    );
  }
  assert.equal(userscriptContent.includes('WEB_PAGE_ASSISTANT_DIALOG_CONTRACT_START'), false);
});

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
        page: {
          'https://example.com/a': { intervalMs: 45_000 },
        },
        site: {
          'example.com': { intervalMs: 60_000 },
        },
      },
      unlocker: {
        page: {},
        site: {
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
  assert.equal(model.siteUnlockerText, '站点：example.com（已保存）');
  assert.equal(model.focusRole, contract.roles.unlockerEnabled);
});

test('dialog contract reads unlocker form intent from role selectors', () => {
  const contract = createDialogContract();
  const setting = contract.readUnlockerFormSetting(createFakeDialog([
    contract.roles.unlockerEnabled,
    contract.roles.unlockerCopy,
    contract.roles.unlockerBeforeUnload,
  ]));

  assert.equal(setting.enabled, true);
  assert.equal(setting.allowSelection, false);
  assert.equal(setting.allowCopy, true);
  assert.equal(setting.allowContextMenu, false);
  assert.equal(setting.allowDrag, false);
  assert.equal(setting.suppressBeforeUnload, true);
});
