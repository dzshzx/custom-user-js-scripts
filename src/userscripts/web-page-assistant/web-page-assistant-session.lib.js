import * as Settings from './web-page-assistant-settings.lib.js';
import { createRefreshRuntime } from './web-page-assistant-refresh.lib.js';

// Settings and applied capabilities have one owner. Only persisted commands
// enter the FIFO; pause remains available while a storage write is pending.
function createWebPageAssistantSession({ keys, storage, clock, reload, unlocker, ready = () => Promise.resolve(), onChange = () => {} }) {
  let settings = Settings.emptySettings();
  let lifecycle = 'idle';
  let applicationError = null;
  const applicationErrors = { refresh: null, unlocker: null };
  let appliedUnlocker = null;
  let startPromise;
  let queue = Promise.resolve();
  let finishDisposed;
  const disposed = new Promise((resolve) => { finishDisposed = resolve; });
  const runtime = createRefreshRuntime({
    minIntervalMs: Settings.MIN_INTERVAL_MS,
    tickMs: 1000,
    now: clock.now,
    setInterval: clock.setInterval,
    clearInterval: clock.clearInterval,
    reload,
    onStateChange: () => emit('countdown'),
  });

  function getState() {
    return JSON.parse(JSON.stringify({
      lifecycle, settings, refresh: runtime.getState(), appliedUnlocker, applicationError, applicationErrors,
      matchedRefresh: Settings.resolveActiveRefreshSetting(settings, keys),
      matchedUnlocker: Settings.resolveActiveUnlockerSetting(settings, keys),
    }));
  }
  function emit(kind, area = null) {
    if (lifecycle === 'disposed') return;
    try { onChange(getState(), { kind, area }); } catch { /* observers cannot fail commands */ }
  }
  function result(code = null, persisted = false, scope = null) {
    return { ok: !code, code, persisted, scope, state: getState() };
  }
  function apply(area) {
    let failed = false;
    for (const capability of area === 'all' ? ['refresh', 'unlocker'] : [area]) {
      applicationErrors[capability] = null;
      try {
        if (capability === 'refresh') runtime.restart(Settings.resolveActiveRefreshSetting(settings, keys));
        else {
          appliedUnlocker = null;
          const match = Settings.resolveActiveUnlockerSetting(settings, keys);
          unlocker.install(match?.setting);
          appliedUnlocker = match;
        }
      } catch (error) {
        failed = true;
        applicationErrors[capability] = String(error?.message || error);
        if (capability === 'refresh') runtime.stop();
        else {
          appliedUnlocker = null;
          try { unlocker.uninstall(); } catch { /* preserve the original application error */ }
        }
      }
    }
    applicationError = Object.values(applicationErrors).filter(Boolean).join('; ') || null;
    return failed ? 'application-failed' : null;
  }
  function start() {
    if (lifecycle === 'disposed') return Promise.resolve(result('disposed'));
    if (startPromise) return startPromise;
    lifecycle = 'starting';
    emit('lifecycle');
    const initialize = async () => {
      try {
        const [loaded] = await Promise.all([storage.readSettings(), ready()]);
        if (lifecycle === 'disposed') return result('disposed');
        settings = Settings.normalizeSettings(loaded);
        lifecycle = 'ready';
        const code = apply('all');
        emit('lifecycle');
        return result(code);
      } catch (error) {
        if (lifecycle === 'disposed') return result('disposed');
        lifecycle = 'error';
        applicationError = String(error?.message || error);
        emit('lifecycle');
        return result('storage-failed');
      }
    };
    startPromise = Promise.race([initialize(), disposed.then(() => result('disposed'))]);
    return startPromise;
  }
  async function write(command) {
    if (lifecycle !== 'ready') return result(lifecycle === 'disposed' ? 'disposed' : 'not-ready');
    const { type } = command;
    const scope = type === 'disable-active' ? runtime.getState().activeMatch?.scope : command.scope;
    if (type === 'disable-active' && !scope) return result();
    if (!['page', 'site'].includes(scope)) return result('invalid-input');
    const key = scope === 'page' ? keys.pageKey : keys.siteKey;
    const area = type.includes('unlocker') ? 'unlocker' : 'refresh';
    let next;
    if (type === 'save-refresh') {
      if (!Settings.isValidIntervalMs(command.intervalMs)) return result('invalid-input');
      next = Settings.setRefreshSetting(settings, scope, key, command.intervalMs, clock.now());
    } else if (type === 'save-unlocker') {
      if (!Settings.normalizeUnlockerSetting(command.setting)) return result('invalid-input');
      next = Settings.setUnlockerSetting(settings, scope, key, command.setting, clock.now());
    } else if (type === 'delete-unlocker') {
      next = Settings.deleteUnlockerSetting(settings, scope, key);
    } else if (type === 'delete-refresh' || type === 'disable-active') {
      next = Settings.deleteRefreshSetting(settings, scope, key);
    } else return result('invalid-input');
    try { await storage.writeSettings(next); } catch (error) {
      if (lifecycle === 'disposed') return result('disposed');
      return { ...result('storage-failed'), message: String(error?.message || error) };
    }
    settings = next;
    if (lifecycle === 'disposed') return result('disposed', true, scope);
    const code = apply(area);
    emit('settings', area);
    return result(code, true, scope);
  }
  function dispatch(command) {
    if (lifecycle !== 'ready') return Promise.resolve(result(lifecycle === 'disposed' ? 'disposed' : 'not-ready'));
    if (command?.type === 'toggle-pause') {
      runtime.togglePause();
      return Promise.resolve(result());
    }
    // Capture caller input now, but derive the next settings at execution time.
    const captured = JSON.parse(JSON.stringify(command || {}));
    let started = false;
    const pending = queue.then(() => { started = true; return write(captured); });
    queue = pending.catch(() => {});
    return Promise.race([pending, disposed.then(() => started ? pending : result('disposed'))]);
  }
  function dispose() {
    if (lifecycle === 'disposed') return;
    lifecycle = 'disposed';
    runtime.stop();
    appliedUnlocker = null;
    try { unlocker.uninstall(); } catch { /* disposal still terminates the session */ }
    finishDisposed();
  }
  return { start, dispatch, getState, dispose };
}

export { createWebPageAssistantSession };
