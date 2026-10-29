import { createGmFirstJsonStore } from '../shared/shared-gm-json-store.lib.ts';
import { resolveGmApi } from '../shared/shared-gm.lib.ts';
import { isRecord } from '../shared/shared-values.lib.ts';
import type { GmOverrides } from '../shared/shared-gm.lib.ts';
import type { Settings } from './web-page-assistant-settings.lib.ts';

export interface WidgetPosition {
  left: number;
  top: number;
}

function normalizeWidgetPosition(value: unknown): WidgetPosition | null {
  if (!isRecord(value)) return null;
  const left = Number(value.left);
  const top = Number(value.top);
  if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
  return { left: Math.round(left), top: Math.round(top) };
}

export interface StorageSettingsContract {
  emptySettings: () => Settings;
  normalizeSettings: (value: unknown) => Settings;
}

export interface StorageLogger {
  warn: (...args: unknown[]) => void;
}

export interface WebPageAssistantStorageAdapters extends GmOverrides {
  scriptName: string;
  settingsContract: StorageSettingsContract;
  storageKey: string;
  /** Per-site key the widget position is read from and written to. */
  widgetPositionKey: string;
  /** Read-only position shared by every site before positions were per site. */
  sharedWidgetPositionKey?: string | null;
  fallbackStorageKey: string;
  fallbackWidgetPositionKey: string;
  localStorageAdapter: Pick<Storage, 'getItem' | 'setItem'>;
  eventTarget?: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> | null;
  logger: StorageLogger;
}

export interface WebPageAssistantStoragePort {
  readSettings(): Promise<Settings>;
  updateSettings(transform: (latest: Settings) => unknown): Promise<Settings>;
  subscribeSettings(onChange: () => void): () => void;
  readWidgetPosition(): Promise<WidgetPosition | null>;
  writeSettings(nextSettings: unknown): Promise<Settings>;
  writeWidgetPosition(position: unknown): Promise<WidgetPosition | null>;
  registerSettingsMenu(label: string, callback: () => void): boolean;
}

function createWebPageAssistantStoragePort(adapters: WebPageAssistantStorageAdapters): WebPageAssistantStoragePort {
  const {
    scriptName,
    settingsContract,
    storageKey,
    widgetPositionKey,
    sharedWidgetPositionKey = null,
    fallbackStorageKey,
    fallbackWidgetPositionKey,
    localStorageAdapter,
    eventTarget,
    logger,
  } = adapters;
  // GM overrides (gmGetValue, gm, ...) in `adapters` replace the probed
  // manager API; production passes none and gets the resolved globals.
  const gm = resolveGmApi(adapters);
  const storeOptions = { ...adapters, scriptName, localStorage: localStorageAdapter, logger };
  const settingsStore = createGmFirstJsonStore({
    ...storeOptions,
    subject: 'settings',
    key: storageKey,
    fallbackKey: fallbackStorageKey,
    normalize: settingsContract.normalizeSettings,
    eventTarget,
  });
  const sitePositionStore = createGmFirstJsonStore({
    ...storeOptions,
    subject: 'widget position',
    key: widgetPositionKey,
    fallbackKey: fallbackWidgetPositionKey,
    normalize: normalizeWidgetPosition,
    eventTarget: null,
  });
  const sharedPositionStore = sharedWidgetPositionKey
    ? createGmFirstJsonStore({
        ...storeOptions,
        subject: 'shared widget position',
        key: sharedWidgetPositionKey,
        fallbackKey: null,
        normalize: normalizeWidgetPosition,
        eventTarget: null,
      })
    : null;

  async function readSettings() {
    const result = await settingsStore.read();
    return { result, settings: result.value ?? settingsContract.emptySettings() };
  }

  return {
    async readSettings() {
      return (await readSettings()).settings;
    },
    // Applies one change to the latest stored settings instead of a copy held
    // since page load, so saves from other tabs are kept. Settings read from
    // fallback storage after a GM failure are never written over the GM copy.
    async updateSettings(transform) {
      const latest = await readSettings();
      const next = settingsContract.normalizeSettings(transform(latest.settings));
      await settingsStore.write(next, { fallbackOnly: latest.result.gmFailed });
      return next;
    },
    // Calls onChange when another tab changes the settings. Returns an
    // unsubscribe function; managers without change events only get the
    // same-origin fallback storage event.
    subscribeSettings(onChange) {
      return settingsStore.subscribe((change) => {
        if (change.remote) onChange();
      });
    },
    async readWidgetPosition() {
      const site = await sitePositionStore.read();
      if (site.backend !== 'gm' || site.value || !sharedPositionStore) return site.value;
      // A site the widget was never dragged on keeps the shared position.
      const shared = await sharedPositionStore.read();
      return shared.gmFailed ? sitePositionStore.readFallback().value : shared.value;
    },
    async writeSettings(nextSettings) {
      const normalized = settingsContract.normalizeSettings(nextSettings);
      await settingsStore.write(normalized);
      return normalized;
    },
    async writeWidgetPosition(position) {
      const normalized = normalizeWidgetPosition(position);
      if (!normalized) return null;
      await sitePositionStore.write(normalized);
      return normalized;
    },
    registerSettingsMenu(label, callback) {
      try {
        if (gm.registerMenuCommand) {
          gm.registerMenuCommand(label, callback);
          return true;
        }
      } catch (error) {
        logger.warn(`${scriptName}: failed to register menu command.`, error);
      }

      return false;
    },
  };
}

export { createWebPageAssistantStoragePort, normalizeWidgetPosition };
