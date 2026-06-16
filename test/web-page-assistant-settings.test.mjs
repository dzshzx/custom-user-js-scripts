import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

await import('../src/userscripts/web-page-assistant/web-page-assistant-settings.lib.js');

const pageKey = 'https://example.com/path?a=1';
const siteKey = 'example.com';
const userscriptPath = path.resolve(
  import.meta.dirname,
  '../src/userscripts/web-page-assistant/web-page-assistant.user.js',
);
const settingsRequireUrl = 'https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/userscripts/web-page-assistant/web-page-assistant-settings.lib.js';

const libraryContract = globalThis.WebPageAssistantSettingsLib;
const userscriptContent = await readFile(userscriptPath, 'utf8');

test('settings contract library exposes the stable interface', () => {
  assert.deepEqual(
    Object.keys(libraryContract).sort(),
    [
      'DEFAULT_UNLOCKER_OPTIONS',
      'MAX_INTERVAL_MS',
      'MIN_INTERVAL_MS',
      'defaultUnlockerSetting',
      'deleteRefreshSetting',
      'deleteUnlockerSetting',
      'emptySettings',
      'getRefreshSetting',
      'getUnlockerSetting',
      'hasUnlockerAction',
      'isValidIntervalMs',
      'normalizeRefreshSetting',
      'normalizeSettings',
      'normalizeUnlockerSetting',
      'resolveActiveRefreshSetting',
      'resolveActiveUnlockerSetting',
      'setRefreshSetting',
      'setUnlockerSetting',
    ].sort(),
  );
});

test('installable metadata requires the settings library', () => {
  assert.equal(
    userscriptContent.includes(`// @require      ${settingsRequireUrl}`),
    true,
  );
  assert.equal(userscriptContent.includes('WEB_PAGE_ASSISTANT_SETTINGS_CONTRACT_START'), false);
});

test('settings contract migrates legacy refresh pages and rejects invalid intervals', () => {
  const normalized = libraryContract.normalizeSettings({
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

test('settings contract resolves page refresh before site refresh', () => {
  const settings = libraryContract.normalizeSettings({
    refresh: {
      pages: { [pageKey]: { intervalMs: 45_000, updatedAt: 1 } },
      sites: { [siteKey]: { intervalMs: 60_000, updatedAt: 2 } },
    },
  });

  const active = libraryContract.resolveActiveRefreshSetting(settings, { pageKey, siteKey });

  assert.equal(active.scope, 'page');
  assert.equal(active.key, pageKey);
  assert.equal(active.setting.intervalMs, 45_000);
});

test('settings contract mutates refresh settings without leaking bucket details', () => {
  const saved = libraryContract.setRefreshSetting(null, 'site', siteKey, 90_000, 10);
  const deleted = libraryContract.deleteRefreshSetting(saved, 'site', siteKey);

  assert.deepEqual(saved.refresh.sites[siteKey], { intervalMs: 90_000, updatedAt: 10 });
  assert.equal(Object.hasOwn(deleted.refresh.sites, siteKey), false);
});

test('settings contract builds default unlocker settings', () => {
  const setting = libraryContract.defaultUnlockerSetting({ allowDrag: true }, 11);

  assert.equal(setting.enabled, true);
  assert.equal(setting.allowSelection, true);
  assert.equal(setting.allowDrag, true);
  assert.equal(Number.isFinite(setting.updatedAt), true);
});

test('settings contract resolves only active unlocker capabilities', () => {
  const inactive = libraryContract.setUnlockerSetting(null, 'site', siteKey, {
    enabled: true,
    allowSelection: false,
    allowCopy: false,
    allowContextMenu: false,
    allowDrag: false,
    suppressBeforeUnload: false,
  }, 1);
  const activeSite = libraryContract.resolveActiveUnlockerSetting(inactive, { pageKey, siteKey });

  assert.equal(libraryContract.hasUnlockerAction(inactive.unlocker.sites[siteKey]), false);
  assert.equal(activeSite, null);

  const activePage = libraryContract.setUnlockerSetting(inactive, 'page', pageKey, {
    enabled: true,
    allowCopy: true,
  }, 2);
  const active = libraryContract.resolveActiveUnlockerSetting(activePage, { pageKey, siteKey });

  assert.equal(active.scope, 'page');
  assert.equal(active.key, pageKey);
  assert.equal(active.setting.allowCopy, true);
});
