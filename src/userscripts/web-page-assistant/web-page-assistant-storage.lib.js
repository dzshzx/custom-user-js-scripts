(function (globalScope) {
  'use strict';

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
      gmApi,
      localStorageAdapter,
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

    return {
      async readSettings() {
        try {
          const primary = await readPrimaryValue(storageKey, settingsContract.emptySettings());
          if (primary.available) return settingsContract.normalizeSettings(primary.value);
        } catch (error) {
          logger.warn(`${scriptName}: failed to read userscript storage.`, error);
        }

        return readFallbackJson(
          fallbackStorageKey,
          settingsContract.normalizeSettings,
          settingsContract.emptySettings(),
          `${scriptName}: failed to read fallback storage.`,
        );
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
        const normalized = settingsContract.normalizeSettings(nextSettings);

        try {
          if (await writePrimaryValue(storageKey, normalized)) return normalized;
        } catch (error) {
          logger.warn(`${scriptName}: failed to write userscript storage.`, error);
        }

        writeFallbackJson(fallbackStorageKey, normalized);
        return normalized;
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

  globalScope.WebPageAssistantStorageLib = {
    createWebPageAssistantStoragePort,
  };
}(globalThis));
