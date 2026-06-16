(function (globalScope) {
  'use strict';

  const MIN_INTERVAL_MS = 1000;
  const MAX_INTERVAL_MS = 60 * 60 * 1000;
  const DEFAULT_UNLOCKER_OPTIONS = {
    allowSelection: true,
    allowCopy: true,
    allowContextMenu: true,
    allowDrag: false,
    suppressBeforeUnload: false,
  };

  // WEB_PAGE_ASSISTANT_SETTINGS_CONTRACT_START
  function emptySettings() {
    return {
      version: 2,
      refresh: {
        pages: {},
        sites: {},
      },
      unlocker: {
        pages: {},
        sites: {},
      },
    };
  }

  function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function isValidIntervalMs(value) {
    return Number.isFinite(value) && value >= MIN_INTERVAL_MS && value <= MAX_INTERVAL_MS;
  }

  function emptyScopedSettings() {
    return {
      pages: {},
      sites: {},
    };
  }

  function normalizeRefreshSetting(value) {
    if (!isRecord(value)) return null;

    const intervalMs = Number(value.intervalMs);
    if (!isValidIntervalMs(intervalMs)) return null;

    return {
      intervalMs: Math.round(intervalMs),
      updatedAt: Number.isFinite(Number(value.updatedAt)) ? Number(value.updatedAt) : Date.now(),
    };
  }

  function normalizeUnlockerSetting(value) {
    if (!isRecord(value)) return null;

    return {
      enabled: Boolean(value.enabled),
      allowSelection: value.allowSelection !== false,
      allowCopy: value.allowCopy !== false,
      allowContextMenu: value.allowContextMenu !== false,
      allowDrag: value.allowDrag === true,
      suppressBeforeUnload: value.suppressBeforeUnload === true,
      updatedAt: Number.isFinite(Number(value.updatedAt)) ? Number(value.updatedAt) : Date.now(),
    };
  }

  function normalizeScopedSettings(value, normalizer) {
    const next = emptyScopedSettings();
    const source = isRecord(value) ? value : {};

    for (const [key, setting] of Object.entries(isRecord(source.pages) ? source.pages : {})) {
      const normalized = normalizer(setting);
      if (normalized) next.pages[key] = normalized;
    }

    for (const [key, setting] of Object.entries(isRecord(source.sites) ? source.sites : {})) {
      const normalized = normalizer(setting);
      if (normalized) next.sites[key] = normalized;
    }

    return next;
  }

  function normalizeSettings(value) {
    const next = emptySettings();
    const source = isRecord(value) ? value : {};
    const refreshSource = isRecord(source.refresh)
      ? source.refresh
      : { pages: source.pages, sites: source.sites };
    const unlockerSource = isRecord(source.unlocker) ? source.unlocker : {};

    next.refresh = normalizeScopedSettings(refreshSource, normalizeRefreshSetting);
    next.unlocker = normalizeScopedSettings(unlockerSource, normalizeUnlockerSetting);

    return next;
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

  function resolveActiveRefreshSetting(sourceSettings, keys) {
    const refreshSettings = normalizeScopedSettings(sourceSettings?.refresh, normalizeRefreshSetting);
    const pageSetting = normalizeRefreshSetting(refreshSettings.pages[keys.pageKey]);
    if (pageSetting) return { scope: 'page', key: keys.pageKey, setting: pageSetting };

    const siteSetting = normalizeRefreshSetting(refreshSettings.sites[keys.siteKey]);
    if (siteSetting) return { scope: 'site', key: keys.siteKey, setting: siteSetting };

    return null;
  }

  function resolveActiveUnlockerSetting(sourceSettings, keys) {
    const unlockerSettings = normalizeScopedSettings(sourceSettings?.unlocker, normalizeUnlockerSetting);
    const pageSetting = normalizeUnlockerSetting(unlockerSettings.pages[keys.pageKey]);
    if (hasUnlockerAction(pageSetting)) return { scope: 'page', key: keys.pageKey, setting: pageSetting };

    const siteSetting = normalizeUnlockerSetting(unlockerSettings.sites[keys.siteKey]);
    if (hasUnlockerAction(siteSetting)) return { scope: 'site', key: keys.siteKey, setting: siteSetting };

    return null;
  }

  function getRefreshSetting(sourceSettings, scope, key) {
    const settings = normalizeSettings(sourceSettings);
    const bucket = scope === 'site' ? settings.refresh.sites : settings.refresh.pages;
    return normalizeRefreshSetting(bucket[key]);
  }

  function getUnlockerSetting(sourceSettings, scope, key) {
    const settings = normalizeSettings(sourceSettings);
    const bucket = scope === 'site' ? settings.unlocker.sites : settings.unlocker.pages;
    return normalizeUnlockerSetting(bucket[key]);
  }

  function setRefreshSetting(sourceSettings, scope, key, intervalMs, updatedAt = Date.now()) {
    const next = normalizeSettings(sourceSettings);
    const bucket = scope === 'site' ? next.refresh.sites : next.refresh.pages;
    bucket[key] = { intervalMs, updatedAt };
    return normalizeSettings(next);
  }

  function deleteRefreshSetting(sourceSettings, scope, key) {
    const next = normalizeSettings(sourceSettings);
    const bucket = scope === 'site' ? next.refresh.sites : next.refresh.pages;
    delete bucket[key];
    return next;
  }

  function defaultUnlockerSetting(overrides = {}) {
    return normalizeUnlockerSetting({
      enabled: true,
      ...DEFAULT_UNLOCKER_OPTIONS,
      ...overrides,
      updatedAt: Date.now(),
    });
  }

  function setUnlockerSetting(sourceSettings, scope, key, unlockerSetting, updatedAt = Date.now()) {
    const normalized = normalizeUnlockerSetting(unlockerSetting);
    if (!normalized) return normalizeSettings(sourceSettings);

    const next = normalizeSettings(sourceSettings);
    const bucket = scope === 'site' ? next.unlocker.sites : next.unlocker.pages;
    bucket[key] = {
      ...normalized,
      updatedAt,
    };
    return normalizeSettings(next);
  }

  function deleteUnlockerSetting(sourceSettings, scope, key) {
    const next = normalizeSettings(sourceSettings);
    const bucket = scope === 'site' ? next.unlocker.sites : next.unlocker.pages;
    delete bucket[key];
    return next;
  }

  function createPageAssistantSettingsContract() {
    return {
      MIN_INTERVAL_MS,
      MAX_INTERVAL_MS,
      DEFAULT_UNLOCKER_OPTIONS,
      emptySettings,
      isValidIntervalMs,
      normalizeSettings,
      normalizeRefreshSetting,
      normalizeUnlockerSetting,
      hasUnlockerAction,
      resolveActiveRefreshSetting,
      resolveActiveUnlockerSetting,
      getRefreshSetting,
      getUnlockerSetting,
      setRefreshSetting,
      deleteRefreshSetting,
      defaultUnlockerSetting,
      setUnlockerSetting,
      deleteUnlockerSetting,
    };
  }
  // WEB_PAGE_ASSISTANT_SETTINGS_CONTRACT_END

  globalScope.WebPageAssistantSettingsLib = createPageAssistantSettingsContract();
}(globalThis));
