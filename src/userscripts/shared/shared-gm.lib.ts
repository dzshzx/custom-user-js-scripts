// The only place that probes the userscript manager API. Script managers expose
// either the legacy `GM_*` functions, the promise-based `GM.*` object, or both;
// callers get one resolved function per capability (or null when missing) and
// never touch the globals themselves. Explicit overrides win, which is how tests
// and hosts inject fakes.

// The adapter's own contract: what callers may rely on whichever manager family
// answered. Results stay `unknown` where the families differ (sync vs promise).
export type GmValueChangeListener = (name: string, oldValue: unknown, newValue: unknown, remote: boolean) => void;
export type GmListenerId = number | Promise<number>;
export type GmGetValue = (key: string, defaultValue?: Tampermonkey.StorageValue) => unknown;
export type GmSetValue = (key: string, value: Tampermonkey.StorageValue) => unknown;
export type GmAddValueChangeListener = (name: string, listener: GmValueChangeListener) => GmListenerId;
export type GmRemoveValueChangeListener = (listenerId: number) => unknown;
export type GmRegisterMenuCommand = (caption: string, onClick: () => void) => unknown;
export type GmXmlHttpRequest = (details: Tampermonkey.Request) => unknown;
export type GmDownload = (details: Tampermonkey.DownloadRequest) => unknown;
// The promise-based `GM.*` object, or a test fake standing in for it.
export type GmModernApi = { readonly [method: string]: unknown };

export interface GmValueChange {
  add: GmAddValueChangeListener;
  remove: GmRemoveValueChangeListener | null;
}

export interface GmApi {
  getValue: GmGetValue | null;
  setValue: GmSetValue | null;
  valueChange: GmValueChange | null;
  registerMenuCommand: GmRegisterMenuCommand | null;
  xmlHttpRequest: GmXmlHttpRequest | null;
  download: GmDownload | null;
}

export interface GmOverrides {
  gm?: GmModernApi | null;
  gmApi?: GmModernApi | null;
  gmGetValue?: GmGetValue | null;
  gmSetValue?: GmSetValue | null;
  gmAddValueChangeListener?: GmAddValueChangeListener | null;
  gmRemoveValueChangeListener?: GmRemoveValueChangeListener | null;
  gmRegisterMenuCommand?: GmRegisterMenuCommand | null;
  gmXmlhttpRequest?: GmXmlHttpRequest | null;
  gmDownload?: GmDownload | null;
}

function pickFunction<T>(override: T | null | undefined, legacy: T | null): T | null {
  if (typeof override === 'function') return override;
  if (typeof legacy === 'function') return legacy;
  return null;
}

function bindModern<T>(gm: GmModernApi | null, ...names: string[]): T | null {
  for (const name of names) {
    if (typeof gm?.[name] === 'function') return (gm[name] as (...args: never[]) => unknown).bind(gm) as T;
  }
  return null;
}

function legacyGlobals(): Omit<GmApi, 'valueChange'> & {
  addValueChangeListener: GmAddValueChangeListener | null;
  removeValueChangeListener: GmRemoveValueChangeListener | null;
} {
  return {
    getValue: typeof GM_getValue === 'function' ? GM_getValue : null,
    setValue: typeof GM_setValue === 'function' ? GM_setValue : null,
    addValueChangeListener: typeof GM_addValueChangeListener === 'function' ? GM_addValueChangeListener : null,
    removeValueChangeListener: typeof GM_removeValueChangeListener === 'function' ? GM_removeValueChangeListener : null,
    registerMenuCommand: typeof GM_registerMenuCommand === 'function' ? GM_registerMenuCommand : null,
    xmlHttpRequest: typeof GM_xmlhttpRequest === 'function' ? GM_xmlhttpRequest : null,
    download: typeof GM_download === 'function' ? GM_download : null,
  };
}

function modernGlobal(): GmModernApi | null {
  return typeof GM !== 'undefined' ? GM : null;
}

/**
 * Resolves the manager API once. Legacy `GM_*` functions take precedence over
 * `GM.*` methods, matching what each script did before the adapter existed.
 *
 * Overrides: `gmGetValue`, `gmSetValue`, `gmAddValueChangeListener`,
 * `gmRemoveValueChangeListener`, `gmRegisterMenuCommand`, `gmXmlhttpRequest`,
 * `gmDownload`, and `gm` / `gmApi` for the modern object.
 *
 * `valueChange` pairs add/remove from the same API family, because listener
 * ids are not interchangeable between them; the modern `add` may return a
 * promise of the id.
 */
function resolveGmApi(overrides: GmOverrides = {}): GmApi {
  const legacy = legacyGlobals();
  const gm = overrides.gm || overrides.gmApi || modernGlobal();

  const legacyAdd = pickFunction(overrides.gmAddValueChangeListener, legacy.addValueChangeListener);
  let valueChange: GmValueChange | null = null;
  if (legacyAdd) {
    valueChange = {
      add: legacyAdd,
      remove: pickFunction(overrides.gmRemoveValueChangeListener, legacy.removeValueChangeListener),
    };
  } else if (typeof gm?.addValueChangeListener === 'function') {
    valueChange = {
      add: gm.addValueChangeListener.bind(gm),
      remove: bindModern<GmRemoveValueChangeListener>(gm, 'removeValueChangeListener'),
    };
  }

  return {
    getValue: pickFunction(overrides.gmGetValue, legacy.getValue) || bindModern(gm, 'getValue'),
    setValue: pickFunction(overrides.gmSetValue, legacy.setValue) || bindModern(gm, 'setValue'),
    valueChange,
    registerMenuCommand:
      pickFunction(overrides.gmRegisterMenuCommand, legacy.registerMenuCommand) ||
      bindModern(gm, 'registerMenuCommand'),
    xmlHttpRequest:
      pickFunction(overrides.gmXmlhttpRequest, legacy.xmlHttpRequest) ||
      bindModern(gm, 'xmlHttpRequest', 'xmlhttpRequest'),
    // Legacy only: GM.download does not share GM_download's callback contract.
    download: pickFunction(overrides.gmDownload, legacy.download),
  };
}

export { resolveGmApi };
