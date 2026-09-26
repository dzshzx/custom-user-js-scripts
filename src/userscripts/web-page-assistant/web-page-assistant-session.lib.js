import * as Settings from './web-page-assistant-settings.lib.js';
import { createRefreshRuntime } from './web-page-assistant-refresh.lib.js';

// Settings and applied capabilities have one owner. Only persisted commands
// and refreshes from storage enter the FIFO; pause remains available while a
// storage write is pending. Every write is applied to the latest stored
// settings, so other tabs' saves survive; their change events refresh the
// in-memory copy between writes.
function createWebPageAssistantSession({ keys, storage, clock, reload, unlocker, ready = () => Promise.resolve(), onChange = () => {} }) {
  let settings = Settings.emptySettings();
  let lifecycle = 'idle';
  let applicationError = null;
  const applicationErrors = { refresh: null, unlocker: null };
  let appliedUnlocker = null;
  let startPromise;
  let queue = Promise.resolve();
  let unsubscribeStorage = null;
  let changedWhileStarting = false;
  let refreshQueued = false;
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
  function changedAreas(previous, next) {
    const same = (resolve) => JSON.stringify(resolve(previous, keys)) === JSON.stringify(resolve(next, keys));
    return [
      ...(same(Settings.resolveActiveRefreshSetting) ? [] : ['refresh']),
      ...(same(Settings.resolveActiveUnlockerSetting) ? [] : ['unlocker']),
    ];
  }
  function combinedArea(areas) {
    return areas.length > 1 ? 'all' : areas[0] ?? null;
  }
  function adoptStoredSettings(latest) {
    const next = Settings.normalizeSettings(latest);
    if (JSON.stringify(next) === JSON.stringify(settings)) return;
    const area = combinedArea(changedAreas(settings, next));
    settings = next;
    if (area) apply(area);
    emit('settings', area);
  }
  function refreshFromStorage() {
    if (refreshQueued) return;
    refreshQueued = true;
    queue = queue.then(async () => {
      refreshQueued = false;
      if (lifecycle !== 'ready') return;
      const latest = await storage.readSettings();
      if (lifecycle === 'ready') adoptStoredSettings(latest);
    }).catch(() => { /* keep the current copy; the next write rereads storage */ });
  }
  function handleStorageChange() {
    if (lifecycle === 'starting') changedWhileStarting = true;
    else if (lifecycle === 'ready') refreshFromStorage();
  }
  function start() {
    if (lifecycle === 'disposed') return Promise.resolve(result('disposed'));
    if (startPromise) return startPromise;
    lifecycle = 'starting';
    emit('lifecycle');
    try {
      unsubscribeStorage = storage.subscribeSettings?.(handleStorageChange) || null;
    } catch { /* change events only shorten staleness; writes still reread storage */ }
    const initialize = async () => {
      try {
        const [loaded] = await Promise.all([storage.readSettings(), ready()]);
        if (lifecycle === 'disposed') return result('disposed');
        settings = Settings.normalizeSettings(loaded);
        lifecycle = 'ready';
        const code = apply('all');
        emit('lifecycle');
        if (changedWhileStarting) refreshFromStorage();
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
    let change;
    if (type === 'save-refresh') {
      if (!Settings.isValidIntervalMs(command.intervalMs)) return result('invalid-input');
      const updatedAt = clock.now();
      change = (latest) => Settings.setRefreshSetting(latest, scope, key, command.intervalMs, updatedAt);
    } else if (type === 'save-unlocker') {
      if (!Settings.normalizeUnlockerSetting(command.setting)) return result('invalid-input');
      const updatedAt = clock.now();
      change = (latest) => Settings.setUnlockerSetting(latest, scope, key, command.setting, updatedAt);
    } else if (type === 'delete-unlocker') {
      change = (latest) => Settings.deleteUnlockerSetting(latest, scope, key);
    } else if (type === 'delete-refresh' || type === 'disable-active') {
      change = (latest) => Settings.deleteRefreshSetting(latest, scope, key);
    } else return result('invalid-input');
    let next;
    try { next = Settings.normalizeSettings(await storage.updateSettings(change)); } catch (error) {
      if (lifecycle === 'disposed') return result('disposed');
      return { ...result('storage-failed'), message: String(error?.message || error) };
    }
    // Other tabs' changes arrive with this write; apply every area whose
    // match changed, and always the commanded one.
    const applied = combinedArea([...new Set([area, ...changedAreas(settings, next)])]);
    settings = next;
    if (lifecycle === 'disposed') return result('disposed', true, scope);
    const code = apply(applied);
    emit('settings', applied);
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
    try { unsubscribeStorage?.(); } catch { /* disposal still terminates the session */ }
    unsubscribeStorage = null;
    runtime.stop();
    appliedUnlocker = null;
    try { unlocker.uninstall(); } catch { /* disposal still terminates the session */ }
    finishDisposed();
  }
  return { start, dispatch, getState, dispose };
}

export { createWebPageAssistantSession };
