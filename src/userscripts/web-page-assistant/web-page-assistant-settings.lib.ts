import * as v from 'valibot';

const MIN_INTERVAL_MS = 1000;
const MAX_INTERVAL_MS = 60 * 60 * 1000;
const DEFAULT_UNLOCKER_OPTIONS = {
  allowSelection: true,
  allowCopy: true,
  allowContextMenu: true,
  allowDrag: false,
  suppressBeforeUnload: false,
};

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

// Missing keys still run through the transform, so defaults apply uniformly.
const coerce = (transform) =>
  v.pipe(
    v.optional(v.unknown(), () => undefined),
    v.transform(transform),
  );
const record = (entries) => v.pipe(v.custom(isRecord), v.object(entries));

function timestampOrNow(value) {
  return Number.isFinite(Number(value)) ? Number(value) : Date.now();
}

const RefreshSettingSchema = record({
  intervalMs: v.pipe(coerce(Number), v.check(isValidIntervalMs), v.transform(Math.round)),
  updatedAt: coerce(timestampOrNow),
});

const UnlockerSettingSchema = record({
  enabled: coerce(Boolean),
  allowSelection: coerce((value) => value !== false),
  allowCopy: coerce((value) => value !== false),
  allowContextMenu: coerce((value) => value !== false),
  allowDrag: coerce((value) => value === true),
  suppressBeforeUnload: coerce((value) => value === true),
  updatedAt: coerce(timestampOrNow),
});

// Invalid entries are dropped individually; an invalid bucket reads as empty.
const scopedBucket = (settingSchema) =>
  coerce((bucket) => {
    const next = {};
    for (const [key, setting] of Object.entries(isRecord(bucket) ? bucket : {})) {
      const result = v.safeParse(settingSchema, setting);
      if (result.success) next[key] = result.output;
    }
    return next;
  });

const scopedSettingsSchema = (settingSchema) =>
  v.object({ pages: scopedBucket(settingSchema), sites: scopedBucket(settingSchema) });

const RefreshScopedSchema = scopedSettingsSchema(RefreshSettingSchema);
const UnlockerScopedSchema = scopedSettingsSchema(UnlockerSettingSchema);

function parseOrNull(schema, value) {
  const result = v.safeParse(schema, value);
  return result.success ? result.output : null;
}

function normalizeRefreshSetting(value) {
  return parseOrNull(RefreshSettingSchema, value);
}

function normalizeUnlockerSetting(value) {
  return parseOrNull(UnlockerSettingSchema, value);
}

function normalizeScopedSettings(value, scopedSchema) {
  return v.parse(scopedSchema, isRecord(value) ? value : {});
}

function normalizeSettings(value) {
  const source = isRecord(value) ? value : {};
  // Version 1 stored refresh buckets at the top level.
  const refreshSource = isRecord(source.refresh) ? source.refresh : { pages: source.pages, sites: source.sites };
  return {
    ...emptySettings(),
    refresh: normalizeScopedSettings(refreshSource, RefreshScopedSchema),
    unlocker: normalizeScopedSettings(source.unlocker, UnlockerScopedSchema),
  };
}

function hasUnlockerAction(setting) {
  return Boolean(
    setting?.enabled &&
    (setting.allowSelection ||
      setting.allowCopy ||
      setting.allowContextMenu ||
      setting.allowDrag ||
      setting.suppressBeforeUnload),
  );
}

function resolveActiveRefreshSetting(sourceSettings, keys) {
  const refreshSettings = normalizeScopedSettings(sourceSettings?.refresh, RefreshScopedSchema);
  const pageSetting = normalizeRefreshSetting(refreshSettings.pages[keys.pageKey]);
  if (pageSetting) return { scope: 'page', key: keys.pageKey, setting: pageSetting };

  const siteSetting = normalizeRefreshSetting(refreshSettings.sites[keys.siteKey]);
  if (siteSetting) return { scope: 'site', key: keys.siteKey, setting: siteSetting };

  return null;
}

function resolveActiveUnlockerSetting(sourceSettings, keys) {
  const unlockerSettings = normalizeScopedSettings(sourceSettings?.unlocker, UnlockerScopedSchema);
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

export {
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
