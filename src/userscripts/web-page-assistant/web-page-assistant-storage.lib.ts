import { resolveGmApi } from '../shared/shared-gm.lib.ts';
import { isRecord } from '../shared/shared-values.lib.ts';
import type { GmOverrides, GmValueChangeListener } from '../shared/shared-gm.lib.ts';
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

/** GM.addValueChangeListener resolves the listener id asynchronously. */
type Pending = Promise<number>;
type SettingsSourceKind = 'primary' | 'fallback' | 'fallback-after-primary-failure';

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

  async function readPrimaryValue(key: string, fallbackValue: unknown) {
    if (gm.getValue) {
      return {
        available: true,
        value: await gm.getValue(key, fallbackValue as Tampermonkey.StorageValue),
      };
    }

    return { available: false, value: fallbackValue };
  }

  async function writePrimaryValue(key: string, value: unknown) {
    if (gm.setValue) {
      await gm.setValue(key, value as Tampermonkey.StorageValue);
      return true;
    }

    return false;
  }

  function readFallbackJson<T, F>(key: string, normalizer: (value: unknown) => T, fallbackValue: F, warning: string) {
    try {
      return normalizer(JSON.parse(localStorageAdapter.getItem(key) || 'null')) || fallbackValue;
    } catch (error) {
      logger.warn(warning, error);
      return fallbackValue;
    }
  }

  function writeFallbackJson(key: string, value: unknown) {
    localStorageAdapter.setItem(key, JSON.stringify(value));
  }

  // Reports which backend answered so a read-modify-write never derives data
  // from fallback storage and then overwrites the primary copy with it.
  async function readSettingsWithSource(): Promise<{ source: SettingsSourceKind; settings: Settings }> {
    try {
      const primary = await readPrimaryValue(storageKey, settingsContract.emptySettings());
      if (primary.available) {
        return { source: 'primary', settings: settingsContract.normalizeSettings(primary.value) };
      }
    } catch (error) {
      logger.warn(`${scriptName}: failed to read userscript storage.`, error);
      return { source: 'fallback-after-primary-failure', settings: readFallbackSettings() };
    }

    return { source: 'fallback', settings: readFallbackSettings() };
  }

  function readFallbackSettings(): Settings {
    return readFallbackJson(
      fallbackStorageKey,
      settingsContract.normalizeSettings,
      settingsContract.emptySettings(),
      `${scriptName}: failed to read fallback storage.`,
    );
  }

  async function writeSettingsTo(nextSettings: unknown, { primary = true }: { primary?: boolean } = {}) {
    const normalized = settingsContract.normalizeSettings(nextSettings);

    if (primary) {
      try {
        if (await writePrimaryValue(storageKey, normalized)) return normalized;
      } catch (error) {
        logger.warn(`${scriptName}: failed to write userscript storage.`, error);
      }
    }

    writeFallbackJson(fallbackStorageKey, normalized);
    return normalized;
  }

  function subscribePrimary(onChange: () => void) {
    const listener: GmValueChangeListener = (_name, _oldValue, _newValue, remote) => {
      if (remote) onChange();
    };
    if (!gm.valueChange) return null;
    const { add, remove } = gm.valueChange;
    const result = add(storageKey, listener);
    if (!result || typeof (result as Pending).then !== 'function') {
      return () => {
        if (remove) remove(result as number);
      };
    }
    // GM.addValueChangeListener resolves the listener id asynchronously.
    (result as Pending).catch((error) => logger.warn(`${scriptName}: failed to watch userscript storage.`, error));
    return () => {
      if (!remove) return;
      (result as Pending).then((value) => remove(value)).catch(() => {});
    };
  }

  return {
    async readSettings() {
      return (await readSettingsWithSource()).settings;
    },
    // Applies one change to the latest stored settings instead of a copy held
    // since page load, so saves from other tabs are kept.
    async updateSettings(transform) {
      const latest = await readSettingsWithSource();
      const next = transform(latest.settings);
      return writeSettingsTo(next, { primary: latest.source !== 'fallback-after-primary-failure' });
    },
    // Calls onChange when another tab changes the settings. Returns an
    // unsubscribe function; managers without change events only get the
    // same-origin fallback storage event.
    subscribeSettings(onChange) {
      const cleanups: Array<() => void> = [];
      try {
        const unsubscribe = subscribePrimary(onChange);
        if (unsubscribe) cleanups.push(unsubscribe);
      } catch (error) {
        logger.warn(`${scriptName}: failed to watch userscript storage.`, error);
      }
      if (eventTarget && typeof eventTarget.addEventListener === 'function') {
        const onStorage = (event: Event) => {
          if ((event as StorageEvent)?.key === fallbackStorageKey || (event as StorageEvent)?.key === null) onChange();
        };
        eventTarget.addEventListener('storage', onStorage);
        cleanups.push(() => eventTarget.removeEventListener('storage', onStorage));
      }
      return () => {
        for (const cleanup of cleanups) {
          try {
            cleanup();
          } catch {
            /* unsubscribing is best effort during unload */
          }
        }
      };
    },
    async readWidgetPosition() {
      try {
        const primary = await readPrimaryValue(widgetPositionKey, null);
        if (primary.available) {
          const sitePosition = normalizeWidgetPosition(primary.value);
          if (sitePosition || !sharedWidgetPositionKey) return sitePosition;
          // A site the widget was never dragged on keeps the shared position.
          return normalizeWidgetPosition((await readPrimaryValue(sharedWidgetPositionKey, null)).value);
        }
      } catch (error) {
        logger.warn(`${scriptName}: failed to read widget position.`, error);
      }

      return readFallbackJson(
        fallbackWidgetPositionKey,
        normalizeWidgetPosition,
        null,
        `${scriptName}: failed to read fallback widget position.`,
      );
    },
    async writeSettings(nextSettings) {
      return writeSettingsTo(nextSettings);
    },
    async writeWidgetPosition(position) {
      const normalized = normalizeWidgetPosition(position);
      if (!normalized) return null;

      try {
        if (await writePrimaryValue(widgetPositionKey, normalized)) return normalized;
      } catch (error) {
        logger.warn(`${scriptName}: failed to write widget position.`, error);
      }

      writeFallbackJson(fallbackWidgetPositionKey, normalized);
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
