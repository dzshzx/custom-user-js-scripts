import * as v from 'valibot';

const MIN_INTERVAL_MS = 1000;
const MAX_INTERVAL_MS = 60 * 60 * 1000;
type AnySchema = v.GenericSchema;
type RecordInput = Record<string, unknown>;

const DEFAULT_UNLOCKER_OPTIONS = {
  allowSelection: true,
  allowCopy: true,
  allowContextMenu: true,
  allowDrag: false,
  suppressBeforeUnload: false,
};

function emptySettings(): Settings {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isValidIntervalMs(value: number): boolean {
  return Number.isFinite(value) && value >= MIN_INTERVAL_MS && value <= MAX_INTERVAL_MS;
}

// Missing keys still run through the transform, so defaults apply uniformly.
const coerce = <T>(transform: (value: unknown) => T) =>
  v.pipe(
    v.optional(v.unknown(), () => undefined),
    v.transform(transform),
  );
const record = <E extends v.ObjectEntries>(entries: E) => v.pipe(v.custom<RecordInput>(isRecord), v.object(entries));

function timestampOrNow(value: unknown): number {
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
const scopedBucket = <S extends AnySchema>(settingSchema: S) =>
  coerce((bucket): Record<string, v.InferOutput<S>> => {
    const next: Record<string, v.InferOutput<S>> = {};
    for (const [key, setting] of Object.entries(isRecord(bucket) ? bucket : {})) {
      const result = v.safeParse(settingSchema, setting);
      if (result.success) next[key] = result.output;
    }
    return next;
  });

const scopedSettingsSchema = <S extends AnySchema>(settingSchema: S) =>
  v.object({ pages: scopedBucket(settingSchema), sites: scopedBucket(settingSchema) });

const RefreshScopedSchema = scopedSettingsSchema(RefreshSettingSchema);
const UnlockerScopedSchema = scopedSettingsSchema(UnlockerSettingSchema);

export type RefreshSetting = v.InferOutput<typeof RefreshSettingSchema>;
export type UnlockerSetting = v.InferOutput<typeof UnlockerSettingSchema>;
export type RefreshScopedSettings = v.InferOutput<typeof RefreshScopedSchema>;
export type UnlockerScopedSettings = v.InferOutput<typeof UnlockerScopedSchema>;
export type UnlockerOptions = typeof DEFAULT_UNLOCKER_OPTIONS;
export type UnlockerOption = keyof UnlockerOptions;
export type Scope = 'page' | 'site';
export interface Settings {
  version: number;
  refresh: RefreshScopedSettings;
  unlocker: UnlockerScopedSettings;
}
/** Raw or normalized settings; only the capability buckets are read. */
export type SettingsSource = { refresh?: unknown; unlocker?: unknown } | null | undefined;
export interface ScopeKeys {
  pageKey: string;
  siteKey: string;
}
export interface ScopedMatch<T> {
  scope: Scope;
  key: string;
  setting: T;
}
export type RefreshMatch = ScopedMatch<RefreshSetting>;
export type UnlockerMatch = ScopedMatch<UnlockerSetting>;

function parseOrNull<S extends AnySchema>(schema: S, value: unknown): v.InferOutput<S> | null {
  const result = v.safeParse(schema, value);
  return result.success ? result.output : null;
}

function normalizeRefreshSetting(value: unknown): RefreshSetting | null {
  return parseOrNull(RefreshSettingSchema, value);
}

function normalizeUnlockerSetting(value: unknown): UnlockerSetting | null {
  return parseOrNull(UnlockerSettingSchema, value);
}

function normalizeScopedSettings<S extends AnySchema>(value: unknown, scopedSchema: S): v.InferOutput<S> {
  return v.parse(scopedSchema, isRecord(value) ? value : {});
}

function normalizeSettings(value: unknown): Settings {
  const source = isRecord(value) ? value : {};
  // Version 1 stored refresh buckets at the top level.
  const refreshSource = isRecord(source.refresh) ? source.refresh : { pages: source.pages, sites: source.sites };
  return {
    ...emptySettings(),
    refresh: normalizeScopedSettings(refreshSource, RefreshScopedSchema),
    unlocker: normalizeScopedSettings(source.unlocker, UnlockerScopedSchema),
  };
}

function hasUnlockerAction(setting: UnlockerSetting | null | undefined): setting is UnlockerSetting {
  return Boolean(
    setting?.enabled &&
    (setting.allowSelection ||
      setting.allowCopy ||
      setting.allowContextMenu ||
      setting.allowDrag ||
      setting.suppressBeforeUnload),
  );
}

function resolveActiveRefreshSetting(sourceSettings: SettingsSource, keys: ScopeKeys): RefreshMatch | null {
  const refreshSettings = normalizeScopedSettings(sourceSettings?.refresh, RefreshScopedSchema);
  const pageSetting = normalizeRefreshSetting(refreshSettings.pages[keys.pageKey]);
  if (pageSetting) return { scope: 'page', key: keys.pageKey, setting: pageSetting };

  const siteSetting = normalizeRefreshSetting(refreshSettings.sites[keys.siteKey]);
  if (siteSetting) return { scope: 'site', key: keys.siteKey, setting: siteSetting };

  return null;
}

function resolveActiveUnlockerSetting(sourceSettings: SettingsSource, keys: ScopeKeys): UnlockerMatch | null {
  const unlockerSettings = normalizeScopedSettings(sourceSettings?.unlocker, UnlockerScopedSchema);
  const pageSetting = normalizeUnlockerSetting(unlockerSettings.pages[keys.pageKey]);
  if (hasUnlockerAction(pageSetting)) return { scope: 'page', key: keys.pageKey, setting: pageSetting };

  const siteSetting = normalizeUnlockerSetting(unlockerSettings.sites[keys.siteKey]);
  if (hasUnlockerAction(siteSetting)) return { scope: 'site', key: keys.siteKey, setting: siteSetting };

  return null;
}

function getRefreshSetting(sourceSettings: unknown, scope: Scope, key: string): RefreshSetting | null {
  const settings = normalizeSettings(sourceSettings);
  const bucket = scope === 'site' ? settings.refresh.sites : settings.refresh.pages;
  return normalizeRefreshSetting(bucket[key]);
}

function getUnlockerSetting(sourceSettings: unknown, scope: Scope, key: string): UnlockerSetting | null {
  const settings = normalizeSettings(sourceSettings);
  const bucket = scope === 'site' ? settings.unlocker.sites : settings.unlocker.pages;
  return normalizeUnlockerSetting(bucket[key]);
}

function setRefreshSetting(
  sourceSettings: unknown,
  scope: Scope,
  key: string,
  intervalMs: number,
  updatedAt: number = Date.now(),
): Settings {
  const next = normalizeSettings(sourceSettings);
  const bucket = scope === 'site' ? next.refresh.sites : next.refresh.pages;
  bucket[key] = { intervalMs, updatedAt };
  return normalizeSettings(next);
}

function deleteRefreshSetting(sourceSettings: unknown, scope: Scope, key: string): Settings {
  const next = normalizeSettings(sourceSettings);
  const bucket = scope === 'site' ? next.refresh.sites : next.refresh.pages;
  delete bucket[key];
  return next;
}

function defaultUnlockerSetting(overrides: Partial<Omit<UnlockerSetting, 'updatedAt'>> = {}): UnlockerSetting | null {
  return normalizeUnlockerSetting({
    enabled: true,
    ...DEFAULT_UNLOCKER_OPTIONS,
    ...overrides,
    updatedAt: Date.now(),
  });
}

function setUnlockerSetting(
  sourceSettings: unknown,
  scope: Scope,
  key: string,
  unlockerSetting: unknown,
  updatedAt: number = Date.now(),
): Settings {
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

function deleteUnlockerSetting(sourceSettings: unknown, scope: Scope, key: string): Settings {
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
