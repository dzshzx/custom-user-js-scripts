// The only place that probes the userscript manager API. Script managers expose
// either the legacy `GM_*` functions, the promise-based `GM.*` object, or both;
// callers get one resolved function per capability (or null when missing) and
// never touch the globals themselves. Explicit overrides win, which is how tests
// and hosts inject fakes.

// What a manager (or a test override) supplies: synchronous or promise-based.
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

// The adapter's own contract, the same whichever manager family answered:
// getValue/setValue always return a promise, value-change subscriptions hide
// the listener id; other results stay `unknown` where the families differ.
type Promised<F extends (...args: never[]) => unknown> = (...args: Parameters<F>) => Promise<unknown>;

export interface GmValueChange {
  /**
   * Returns an unsubscribe function. A synchronous failure of the manager's
   * add function throws; an asynchronous one (the modern `GM.*` resolves the
   * listener id later) is reported through `onError`.
   */
  subscribe(name: string, listener: GmValueChangeListener, onError?: (error: unknown) => void): () => void;
}

export interface GmApi {
  getValue: Promised<GmGetValue> | null;
  setValue: Promised<GmSetValue> | null;
  valueChange: GmValueChange | null;
  registerMenuCommand: GmRegisterMenuCommand | null;
  xmlHttpRequest: GmXmlHttpRequest | null;
  download: GmDownload | null;
}

export interface GmOverrides {
  gm?: GmModernApi | null;
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

function legacyGlobals() {
  return {
    getValue: typeof GM_getValue === 'function' ? (GM_getValue as GmGetValue) : null,
    setValue: typeof GM_setValue === 'function' ? (GM_setValue as GmSetValue) : null,
    addValueChangeListener: typeof GM_addValueChangeListener === 'function' ? GM_addValueChangeListener : null,
    removeValueChangeListener: typeof GM_removeValueChangeListener === 'function' ? GM_removeValueChangeListener : null,
    registerMenuCommand: typeof GM_registerMenuCommand === 'function' ? GM_registerMenuCommand : null,
    xmlHttpRequest: typeof GM_xmlhttpRequest === 'function' ? GM_xmlhttpRequest : null,
    download: typeof GM_download === 'function' ? GM_download : null,
  };
}

// One promise shape for both families; a synchronous throw becomes a rejection.
function promised<F extends (...args: never[]) => unknown>(fn: F | null): Promised<F> | null {
  return fn ? async (...args) => fn(...args) : null;
}

// Pairs add/remove from the same API family, because listener ids are not
// interchangeable between them; the modern `add` may return a promise of the id.
function valueChangeOf(add: GmAddValueChangeListener, remove: GmRemoveValueChangeListener | null): GmValueChange {
  return {
    subscribe(name, listener, onError = () => {}) {
      const listenerId = add(name, listener);
      if (listenerId === undefined || listenerId === null) return () => {};
      if (typeof (listenerId as Promise<number>).then !== 'function') {
        const id = listenerId as number;
        return () => remove?.(id);
      }
      const pending = (listenerId as Promise<number>).then(
        (id) => id,
        (error) => {
          onError(error);
          return null;
        },
      );
      return () => {
        // Unsubscribing is best effort (usually during unload): a failing remove is swallowed.
        if (remove) pending.then((id) => id !== null && remove(id)).catch(() => {});
      };
    },
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
 * `gmDownload`, and `gm` for the modern object.
 */
function resolveGmApi(overrides: GmOverrides = {}): GmApi {
  const legacy = legacyGlobals();
  const gm = overrides.gm || modernGlobal();

  const legacyAdd = pickFunction(overrides.gmAddValueChangeListener, legacy.addValueChangeListener);
  const modernAdd = bindModern<GmAddValueChangeListener>(gm, 'addValueChangeListener');
  let valueChange: GmValueChange | null = null;
  if (legacyAdd) {
    valueChange = valueChangeOf(
      legacyAdd,
      pickFunction(overrides.gmRemoveValueChangeListener, legacy.removeValueChangeListener),
    );
  } else if (modernAdd) {
    valueChange = valueChangeOf(modernAdd, bindModern<GmRemoveValueChangeListener>(gm, 'removeValueChangeListener'));
  }

  return {
    getValue: promised(pickFunction(overrides.gmGetValue, legacy.getValue) || bindModern<GmGetValue>(gm, 'getValue')),
    setValue: promised(pickFunction(overrides.gmSetValue, legacy.setValue) || bindModern<GmSetValue>(gm, 'setValue')),
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
