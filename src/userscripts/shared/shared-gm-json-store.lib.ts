// One JSON value kept in userscript manager storage first, with page
// localStorage as fallback (and optionally as a mirror), per ADR-0003. The
// store owns the "which backend answered" bookkeeping so scripts only decide
// what to do with the answer. It never throws on reads; a write throws only
// when neither backend accepts it.
import { resolveGmApi } from './shared-gm.lib.ts';
import type { GmOverrides } from './shared-gm.lib.ts';

export type GmFirstBackend = 'gm' | 'localStorage';

export interface GmFirstJsonStoreOptions<T> extends GmOverrides {
  /** Prefix of every warning. */
  scriptName: string;
  /** What the warnings call the value, such as 'settings' or 'archive'. */
  subject: string;
  /** GM storage key. */
  key: string;
  /** localStorage key; without one the store has no localStorage side. */
  fallbackKey?: string | null;
  /** Defaults to globalThis.localStorage; null means the fallback is unavailable. */
  localStorage?: Pick<Storage, 'getItem' | 'setItem'> | null;
  /** Applied to the raw value read from either backend. */
  normalize: (raw: unknown) => T;
  /** Also copy every successful GM write to localStorage. */
  mirror?: boolean;
  /** When given, same-origin `storage` events for the fallback key are reported. */
  eventTarget?: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> | null;
  /** Defaults to globalThis.console; null silences warnings. */
  logger?: Pick<Console, 'warn'> | null;
}

export interface GmFirstReadResult<T> {
  /** Which backend answered; 'none' when neither could be read. */
  backend: GmFirstBackend | 'none';
  /** Null when backend is 'none'. */
  value: T | null;
  /** GM storage exists but its read threw (as opposed to GM being absent). */
  gmFailed: boolean;
}

export interface GmFirstWriteResult {
  backend: GmFirstBackend;
  /** The GM write succeeded but the localStorage mirror did not. */
  mirrorDegraded: boolean;
}

export interface GmFirstChange {
  backend: GmFirstBackend;
  key: string;
  oldValue: unknown;
  newValue: unknown;
  remote: boolean;
}

export interface GmFirstJsonStore<T> {
  read(): Promise<GmFirstReadResult<T>>;
  /** Reads localStorage only. */
  readFallback(): { available: boolean; value: T | null };
  write(value: T, options?: { fallbackOnly?: boolean }): Promise<GmFirstWriteResult>;
  /** Returns an unsubscribe function that never throws. */
  subscribe(listener: (change: GmFirstChange) => void): () => void;
}

function createGmFirstJsonStore<T>(options: GmFirstJsonStoreOptions<T>): GmFirstJsonStore<T> {
  const { scriptName, subject, key, normalize, mirror = false, eventTarget = null } = options;
  const fallbackKey = options.fallbackKey || null;
  const logger = options.logger === undefined ? globalThis.console : options.logger;
  const warn = (message: string, error: unknown) => logger?.warn?.(`${scriptName}: ${message}`, error);
  // Resolved per call, as the scripts did before, so a manager API that shows
  // up after construction is still used.
  const gmApi = () => resolveGmApi(options);

  function fallbackStorage(): Pick<Storage, 'getItem' | 'setItem'> {
    const storage = options.localStorage === undefined ? globalThis.localStorage : options.localStorage;
    if (!storage) throw new Error('localStorage is unavailable.');
    return storage;
  }

  function writeFallback(value: T): void {
    if (!fallbackKey) throw new Error(`No fallback storage for ${subject}.`);
    fallbackStorage().setItem(fallbackKey, JSON.stringify(value));
  }

  function readFallback(): { available: boolean; value: T | null } {
    if (!fallbackKey) return { available: false, value: null };
    try {
      return { available: true, value: normalize(JSON.parse(fallbackStorage().getItem(fallbackKey) || 'null')) };
    } catch (error) {
      warn(`failed to read ${subject} from fallback storage.`, error);
      return { available: false, value: null };
    }
  }

  async function read(): Promise<GmFirstReadResult<T>> {
    let gmFailed = false;
    const { getValue } = gmApi();
    if (getValue) {
      try {
        return { backend: 'gm', value: normalize(await getValue(key, null)), gmFailed: false };
      } catch (error) {
        gmFailed = true;
        warn(`failed to read ${subject} from userscript storage.`, error);
      }
    }

    const fallback = readFallback();
    return fallback.available
      ? { backend: 'localStorage', value: fallback.value, gmFailed }
      : { backend: 'none', value: null, gmFailed };
  }

  async function write(value: T, { fallbackOnly = false }: { fallbackOnly?: boolean } = {}) {
    const { setValue } = gmApi();
    if (!fallbackOnly && setValue) {
      let written = false;
      try {
        await setValue(key, value as Tampermonkey.StorageValue);
        written = true;
      } catch (error) {
        warn(`failed to write ${subject} to userscript storage.`, error);
      }
      if (written) {
        let mirrorDegraded = false;
        if (mirror && fallbackKey) {
          try {
            writeFallback(value);
          } catch (error) {
            mirrorDegraded = true;
            warn(`failed to mirror ${subject} to fallback storage.`, error);
          }
        }
        return { backend: 'gm', mirrorDegraded } satisfies GmFirstWriteResult;
      }
    }

    writeFallback(value);
    return { backend: 'localStorage', mirrorDegraded: false } satisfies GmFirstWriteResult;
  }

  function subscribeGm(listener: (change: GmFirstChange) => void): (() => void) | null {
    const { valueChange } = gmApi();
    if (!valueChange) return null;
    const { add, remove } = valueChange;
    const watchFailed = (error: unknown) => warn(`failed to watch ${subject} in userscript storage.`, error);
    let listenerId;
    try {
      listenerId = add(key, (name, oldValue, newValue, remote) => {
        listener({ backend: 'gm', key: name, oldValue, newValue, remote: Boolean(remote) });
      });
    } catch (error) {
      watchFailed(error);
      return null;
    }
    if (listenerId === undefined || listenerId === null) return null;
    if (typeof (listenerId as Promise<number>).then !== 'function') {
      const id = listenerId as number;
      return () => remove?.(id);
    }
    // GM.addValueChangeListener resolves the listener id asynchronously.
    const pending = listenerId as Promise<number>;
    pending.catch(watchFailed);
    return () => {
      if (!remove) return;
      pending.then((id) => remove(id)).catch(() => {});
    };
  }

  function subscribe(listener: (change: GmFirstChange) => void): () => void {
    const cleanups: Array<() => void> = [];
    const unsubscribeGm = subscribeGm(listener);
    if (unsubscribeGm) cleanups.push(unsubscribeGm);

    if (fallbackKey && eventTarget && typeof eventTarget.addEventListener === 'function') {
      const onStorage = (event: Event) => {
        const { key: changedKey, oldValue, newValue } = (event || {}) as Partial<StorageEvent>;
        if (changedKey !== fallbackKey && changedKey !== null) return;
        listener({ backend: 'localStorage', key: fallbackKey, oldValue, newValue, remote: true });
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
  }

  return { read, readFallback, write, subscribe };
}

export { createGmFirstJsonStore };
