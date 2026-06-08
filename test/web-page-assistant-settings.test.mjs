import test from 'node:test';
import assert from 'node:assert/strict';
import { loadInstallableBlock } from './helpers/installable-block-loader.mjs';

await import('../src/userscripts/web-page-assistant/web-page-assistant-settings.lib.js');

const pageKey = 'https://example.com/path?a=1';
const siteKey = 'example.com';

const loadInstallableContract = () => loadInstallableBlock({
  markerPrefix: 'WEB_PAGE_ASSISTANT_SETTINGS_CONTRACT',
  prefixSource: `
    const MIN_INTERVAL_MS = 1000;
    const MAX_INTERVAL_MS = 60 * 60 * 1000;
    const DEFAULT_UNLOCKER_OPTIONS = {
      allowSelection: true,
      allowCopy: true,
      allowContextMenu: true,
      allowDrag: false,
      suppressBeforeUnload: false,
    };
  `,
  returnExpression: 'createPageAssistantSettingsContract()',
});

const libraryContract = globalThis.WebPageAssistantSettingsLib;
const installableContract = await loadInstallableContract();
const contracts = {
  library: libraryContract,
  installable: installableContract,
};

test('settings contract installable block matches library interface', () => {
  assert.deepEqual(
    Object.keys(installableContract).sort(),
    Object.keys(libraryContract).sort(),
  );
});

for (const [label, contract] of Object.entries(contracts)) {
  test(`${label} settings contract migrates legacy refresh pages and rejects invalid intervals`, () => {
    const normalized = contract.normalizeSettings({
      pages: {
        [pageKey]: { intervalMs: 30_000, updatedAt: 1 },
        invalid: { intervalMs: 500, updatedAt: 2 },
      },
      sites: {
        [siteKey]: { intervalMs: 60_000, updatedAt: 3 },
      },
    });

    assert.deepEqual(normalized.refresh.pages[pageKey], { intervalMs: 30_000, updatedAt: 1 });
    assert.equal(Object.hasOwn(normalized.refresh.pages, 'invalid'), false);
    assert.deepEqual(normalized.refresh.sites[siteKey], { intervalMs: 60_000, updatedAt: 3 });
  });

  test(`${label} settings contract resolves page refresh before site refresh`, () => {
    const settings = contract.normalizeSettings({
      refresh: {
        pages: { [pageKey]: { intervalMs: 45_000, updatedAt: 1 } },
        sites: { [siteKey]: { intervalMs: 60_000, updatedAt: 2 } },
      },
    });

    const active = contract.resolveActiveRefreshSetting(settings, { pageKey, siteKey });

    assert.equal(active.scope, 'page');
    assert.equal(active.key, pageKey);
    assert.equal(active.setting.intervalMs, 45_000);
  });

  test(`${label} settings contract mutates refresh settings without leaking bucket details`, () => {
    const saved = contract.setRefreshSetting(null, 'site', siteKey, 90_000, 10);
    const deleted = contract.deleteRefreshSetting(saved, 'site', siteKey);

    assert.deepEqual(saved.refresh.sites[siteKey], { intervalMs: 90_000, updatedAt: 10 });
    assert.equal(Object.hasOwn(deleted.refresh.sites, siteKey), false);
  });

  test(`${label} settings contract builds default unlocker settings`, () => {
    const setting = contract.defaultUnlockerSetting({ allowDrag: true }, 11);

    assert.equal(setting.enabled, true);
    assert.equal(setting.allowSelection, true);
    assert.equal(setting.allowDrag, true);
    assert.equal(Number.isFinite(setting.updatedAt), true);
  });

  test(`${label} settings contract resolves only active unlocker capabilities`, () => {
    const inactive = contract.setUnlockerSetting(null, 'site', siteKey, {
      enabled: true,
      allowSelection: false,
      allowCopy: false,
      allowContextMenu: false,
      allowDrag: false,
      suppressBeforeUnload: false,
    }, 1);
    const activeSite = contract.resolveActiveUnlockerSetting(inactive, { pageKey, siteKey });

    assert.equal(contract.hasUnlockerAction(inactive.unlocker.sites[siteKey]), false);
    assert.equal(activeSite, null);

    const activePage = contract.setUnlockerSetting(inactive, 'page', pageKey, {
      enabled: true,
      allowCopy: true,
    }, 2);
    const active = contract.resolveActiveUnlockerSetting(activePage, { pageKey, siteKey });

    assert.equal(active.scope, 'page');
    assert.equal(active.key, pageKey);
    assert.equal(active.setting.allowCopy, true);
  });
}
