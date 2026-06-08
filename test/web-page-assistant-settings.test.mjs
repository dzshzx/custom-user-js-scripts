import test from 'node:test';
import assert from 'node:assert/strict';

await import('../src/web-page-assistant-settings.lib.js');

const {
  normalizeSettings,
  resolveActiveRefreshSetting,
  resolveActiveUnlockerSetting,
  setRefreshSetting,
  deleteRefreshSetting,
  setUnlockerSetting,
  hasUnlockerAction,
} = globalThis.WebPageAssistantSettingsLib;

const pageKey = 'https://example.com/path?a=1';
const siteKey = 'example.com';

test('settings contract migrates legacy refresh pages and rejects invalid intervals', () => {
  const normalized = normalizeSettings({
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
  const settings = normalizeSettings({
    refresh: {
      pages: { [pageKey]: { intervalMs: 45_000, updatedAt: 1 } },
      sites: { [siteKey]: { intervalMs: 60_000, updatedAt: 2 } },
    },
  });

  const active = resolveActiveRefreshSetting(settings, { pageKey, siteKey });

  assert.equal(active.scope, 'page');
  assert.equal(active.key, pageKey);
  assert.equal(active.setting.intervalMs, 45_000);
});

test('settings contract mutates refresh settings without leaking bucket details', () => {
  const saved = setRefreshSetting(null, 'site', siteKey, 90_000, 10);
  const deleted = deleteRefreshSetting(saved, 'site', siteKey);

  assert.deepEqual(saved.refresh.sites[siteKey], { intervalMs: 90_000, updatedAt: 10 });
  assert.equal(Object.hasOwn(deleted.refresh.sites, siteKey), false);
});

test('settings contract resolves only active unlocker capabilities', () => {
  const inactive = setUnlockerSetting(null, 'site', siteKey, {
    enabled: true,
    allowSelection: false,
    allowCopy: false,
    allowContextMenu: false,
    allowDrag: false,
    suppressBeforeUnload: false,
  }, 1);
  const activeSite = resolveActiveUnlockerSetting(inactive, { pageKey, siteKey });

  assert.equal(hasUnlockerAction(inactive.unlocker.sites[siteKey]), false);
  assert.equal(activeSite, null);

  const activePage = setUnlockerSetting(inactive, 'page', pageKey, {
    enabled: true,
    allowCopy: true,
  }, 2);
  const active = resolveActiveUnlockerSetting(activePage, { pageKey, siteKey });

  assert.equal(active.scope, 'page');
  assert.equal(active.key, pageKey);
  assert.equal(active.setting.allowCopy, true);
});
