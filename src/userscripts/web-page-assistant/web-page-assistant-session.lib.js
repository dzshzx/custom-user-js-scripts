(function attachWebPageAssistantSessionLib(globalObject) {
  'use strict';

  const LIB_NAME = 'WebPageAssistantSessionLib';

  function createWebPageAssistantSession(adapters) {
    const {
      settingsContract,
      storagePort,
      refreshRuntime,
      getSettings,
      setSettings,
      getActiveMatch,
      setActiveMatch,
      setActiveUnlockerMatch,
      getPageKey,
      getSiteKey,
      getSelectedScope,
      parseCustomInterval,
      readUnlockerFormSetting,
      resolveActiveSetting,
      resolveActiveUnlockerSetting,
      renderDialog,
      renderWidget,
      updatePauseButton,
      updateCountdownText,
      installUnlocker,
      setMessage,
      scopeLabel,
      formatInterval,
    } = adapters;
    const supportedActions = new Set([
      'open-settings',
      'switch-tab',
      'close-dialog',
      'toggle-pause',
      'save-preset',
      'save-custom',
      'delete-page',
      'delete-site',
      'save-unlocker',
      'delete-unlocker-page',
      'delete-unlocker-site',
      'disable-active',
    ]);

    function keyForScope(scope) {
      return scope === 'site' ? getSiteKey() : getPageKey();
    }

    function canHandle(action) {
      return supportedActions.has(action);
    }

    async function writeSettings(nextSettings) {
      const next = await storagePort.writeSettings(nextSettings);
      setSettings(next);
      return next;
    }

    function restartActiveCountdown() {
      refreshRuntime.restart(resolveActiveSetting(getSettings()));
      renderWidget();
      updatePauseButton();
      updateCountdownText();
    }

    function refreshUnlockerState() {
      const activeUnlockerMatch = resolveActiveUnlockerSetting(getSettings());
      setActiveUnlockerMatch(activeUnlockerMatch);
      installUnlocker(activeUnlockerMatch?.setting);
      return activeUnlockerMatch;
    }

    async function saveSetting(scope, intervalMs) {
      const next = settingsContract.setRefreshSetting(getSettings(), scope, keyForScope(scope), intervalMs);
      await writeSettings(next);
      restartActiveCountdown();
    }

    async function deleteSetting(scope) {
      const next = settingsContract.deleteRefreshSetting(getSettings(), scope, keyForScope(scope));
      await writeSettings(next);
      restartActiveCountdown();
    }

    async function saveUnlockerSetting(scope, unlockerSetting) {
      const normalized = settingsContract.normalizeUnlockerSetting(unlockerSetting);
      if (!normalized) return;

      const next = settingsContract.setUnlockerSetting(getSettings(), scope, keyForScope(scope), normalized);
      await writeSettings(next);
      refreshUnlockerState();
    }

    async function deleteUnlockerSetting(scope) {
      const next = settingsContract.deleteUnlockerSetting(getSettings(), scope, keyForScope(scope));
      await writeSettings(next);
      refreshUnlockerState();
    }

    async function dispatch(action, actionNode) {
      if (action === 'open-settings') {
        renderDialog('', null, 'refresh');
        return;
      }

      if (action === 'switch-tab') {
        renderDialog('', getSelectedScope(), actionNode.dataset.partTab);
        return;
      }

      if (action === 'close-dialog') {
        adapters.closeDialog();
        return;
      }

      if (action === 'toggle-pause') {
        refreshRuntime.togglePause();
        return;
      }

      if (action === 'save-preset') {
        const intervalMs = Number(actionNode.dataset.intervalMs);
        const scope = getSelectedScope();
        if (!settingsContract.isValidIntervalMs(intervalMs)) {
          setMessage('预设刷新时间无效。', 'error');
          return;
        }

        await saveSetting(scope, intervalMs);
        renderDialog(`已保存到${scopeLabel(scope)}：每 ${formatInterval(intervalMs)} 刷新一次。`, scope, 'refresh');
        return;
      }

      if (action === 'save-custom') {
        const parsed = parseCustomInterval();
        if (parsed.error) {
          setMessage(parsed.error, 'error');
          return;
        }

        const scope = getSelectedScope();
        await saveSetting(scope, parsed.intervalMs);
        renderDialog(`已保存到${scopeLabel(scope)}：每 ${formatInterval(parsed.intervalMs)} 刷新一次。`, scope, 'refresh');
        return;
      }

      if (action === 'delete-page') {
        await deleteSetting('page');
        renderDialog('已删除当前页面设置。', 'page', 'refresh');
        return;
      }

      if (action === 'delete-site') {
        await deleteSetting('site');
        renderDialog('已删除整个站点设置。', 'site', 'refresh');
        return;
      }

      if (action === 'save-unlocker') {
        const scope = getSelectedScope();
        const unlockerSetting = readUnlockerFormSetting();
        await saveUnlockerSetting(scope, unlockerSetting);
        renderDialog(unlockerSetting.enabled
          ? `已保存到${scopeLabel(scope)}：${adapters.unlockerStatusText(unlockerSetting)}`
          : `已保存到${scopeLabel(scope)}：网页限制解除关闭。`, scope, 'unlocker');
        return;
      }

      if (action === 'delete-unlocker-page') {
        await deleteUnlockerSetting('page');
        renderDialog('已删除当前页面限制解除设置。', 'page', 'unlocker');
        return;
      }

      if (action === 'delete-unlocker-site') {
        await deleteUnlockerSetting('site');
        renderDialog('已删除整个站点限制解除设置。', 'site', 'unlocker');
        return;
      }

      if (action === 'disable-active') {
        const activeMatch = getActiveMatch();
        if (!activeMatch) return;

        const disabledScope = activeMatch.scope;
        setActiveMatch(null);
        await deleteSetting(disabledScope);
        if (adapters.hasDialog()) renderDialog(`已停用${scopeLabel(disabledScope)}自动刷新。`, disabledScope, 'refresh');
      }
    }

    return {
      canHandle,
      dispatch,
      saveSetting,
      deleteSetting,
      saveUnlockerSetting,
      deleteUnlockerSetting,
      restartActiveCountdown,
      refreshUnlockerState,
    };
  }

  globalObject[LIB_NAME] = Object.freeze({
    createWebPageAssistantSession,
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
