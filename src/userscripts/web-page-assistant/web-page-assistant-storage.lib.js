function maybePromise(value) {
  return value && typeof value.then === 'function' ? value : Promise.resolve(value);
}

function createWebPageAssistantStoragePort(adapters) {
  const {
    scriptName,
    settingsContract,
    normalizeWidgetPosition: normalizePosition,
    storageKey,
    widgetPositionKey,
    fallbackStorageKey,
    fallbackWidgetPositionKey,
    gmGetValue,
    gmSetValue,
    gmRegisterMenuCommand,
    gmAddValueChangeListener,
    gmRemoveValueChangeListener,
    gmApi,
    localStorageAdapter,
    eventTarget,
    logger,
    toPromise = maybePromise,
  } = adapters;

  async function readPrimaryValue(key, fallbackValue) {
    if (typeof gmGetValue === 'function') {
      return {
        available: true,
        value: await toPromise(gmGetValue(key, fallbackValue)),
      };
    }

    if (gmApi && typeof gmApi.getValue === 'function') {
      return {
        available: true,
        value: await gmApi.getValue(key, fallbackValue),
      };
    }

    return { available: false, value: fallbackValue };
  }

  async function writePrimaryValue(key, value) {
    if (typeof gmSetValue === 'function') {
      await toPromise(gmSetValue(key, value));
      return true;
    }

    if (gmApi && typeof gmApi.setValue === 'function') {
      await gmApi.setValue(key, value);
      return true;
    }

    return false;
  }

  function readFallbackJson(key, normalizer, fallbackValue, warning) {
    try {
      return normalizer(JSON.parse(localStorageAdapter.getItem(key) || 'null')) || fallbackValue;
    } catch (error) {
      logger.warn(warning, error);
      return fallbackValue;
    }
  }

  function writeFallbackJson(key, value) {
    localStorageAdapter.setItem(key, JSON.stringify(value));
  }

  // Reports which backend answered so a read-modify-write never derives data
  // from fallback storage and then overwrites the primary copy with it.
  async function readSettingsWithSource() {
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

  function readFallbackSettings() {
    return readFallbackJson(
      fallbackStorageKey,
      settingsContract.normalizeSettings,
      settingsContract.emptySettings(),
      `${scriptName}: failed to read fallback storage.`,
    );
  }

  async function writeSettingsTo(nextSettings, { primary = true } = {}) {
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

  function subscribePrimary(onChange) {
    const listener = (_name, _oldValue, _newValue, remote) => {
      if (remote) onChange();
    };
    if (typeof gmAddValueChangeListener === 'function') {
      const id = gmAddValueChangeListener(storageKey, listener);
      return () => {
        if (typeof gmRemoveValueChangeListener === 'function') gmRemoveValueChangeListener(id);
      };
    }
    if (gmApi && typeof gmApi.addValueChangeListener === 'function') {
      const id = toPromise(gmApi.addValueChangeListener(storageKey, listener));
      id.catch((error) => logger.warn(`${scriptName}: failed to watch userscript storage.`, error));
      return () => {
        if (typeof gmApi.removeValueChangeListener !== 'function') return;
        id.then((value) => gmApi.removeValueChangeListener(value)).catch(() => {});
      };
    }
    return null;
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
      const cleanups = [];
      try {
        const unsubscribe = subscribePrimary(onChange);
        if (unsubscribe) cleanups.push(unsubscribe);
      } catch (error) {
        logger.warn(`${scriptName}: failed to watch userscript storage.`, error);
      }
      if (eventTarget && typeof eventTarget.addEventListener === 'function') {
        const onStorage = (event) => {
          if (event?.key === fallbackStorageKey || event?.key === null) onChange();
        };
        eventTarget.addEventListener('storage', onStorage);
        cleanups.push(() => eventTarget.removeEventListener('storage', onStorage));
      }
      return () => {
        for (const cleanup of cleanups) {
          try { cleanup(); } catch { /* unsubscribing is best effort during unload */ }
        }
      };
    },
    async readWidgetPosition() {
      try {
        const primary = await readPrimaryValue(widgetPositionKey, null);
        if (primary.available) return normalizePosition(primary.value);
      } catch (error) {
        logger.warn(`${scriptName}: failed to read widget position.`, error);
      }

      return readFallbackJson(
        fallbackWidgetPositionKey,
        normalizePosition,
        null,
        `${scriptName}: failed to read fallback widget position.`,
      );
    },
    async writeSettings(nextSettings) {
      return writeSettingsTo(nextSettings);
    },
    async writeWidgetPosition(position) {
      const normalized = normalizePosition(position);
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
        if (typeof gmRegisterMenuCommand === 'function') {
          gmRegisterMenuCommand(label, callback);
          return true;
        }

        if (gmApi && typeof gmApi.registerMenuCommand === 'function') {
          gmApi.registerMenuCommand(label, callback);
          return true;
        }
      } catch (error) {
        logger.warn(`${scriptName}: failed to register menu command.`, error);
      }

      return false;
    },
  };
}

export { createWebPageAssistantStoragePort };
