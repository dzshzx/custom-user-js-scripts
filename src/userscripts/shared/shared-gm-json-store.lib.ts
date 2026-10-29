// One JSON value kept in userscript manager storage first, with page
// localStorage as fallback (and optionally as a mirror), per ADR-0003. The
// store owns the "which backend answered" bookkeeping, and `update` owns the
// read-modify-write rule that a value derived from the fallback never
// overwrites the GM copy. It never throws on reads; a write throws only when
// neither backend accepts it.
import { resolveGmApi } from './shared-gm.lib.ts';
import type { GmApi, GmOverrides } from './shared-gm.lib.ts';

export type GmFirstBackend = 'gm' | 'localStorage';

export interface GmFirstJsonStoreOptions<T> extends GmOverrides {
  /** Prefix of every warning. */
  scriptName: string;
  /** What the warnings call the value, such as 'settings' or 'archive'. */
  subject: string;
  /** GM storage key. */
  key: string;
  /** GM keys read in order when `key` holds nothing; never written. */
  inheritFrom?: readonly string[];
  /** localStorage key; without one the store has no localStorage side. */
  fallbackKey?: string;
  /** Defaults to globalThis.localStorage. */
  localStorage?: Pick<Storage, 'getItem' | 'setItem'>;
  /** Applied to the raw value read from either backend; defaults to identity. */
  normalize?: (raw: unknown) => T;
  /** Also copy every successful GM write to localStorage. */
  mirror?: boolean;
  /** When given, same-origin `storage` events for the fallback key are reported. */
  eventTarget?: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> | null;
  /** Defaults to globalThis.console. */
  logger?: Pick<Console, 'warn'>;
}

export interface GmFirstReadResult<T> {
  /** Which backend answered; 'none' when neither could be read. */
  backend: GmFirstBackend | 'none';
  /** Null when backend is 'none'. */
  value: T | null;
}

export interface GmFirstWriteResult {
  backend: GmFirstBackend;
  /** The GM write succeeded but the localStorage mirror did not. */
  mirrorDegraded: boolean;
}

export interface GmFirstCurrent<T> extends GmFirstReadResult<T> {
  /** The localStorage copy, read on demand; null when unavailable. */
  fallback(): T | null;
}

export interface GmFirstUpdateResult<T> extends GmFirstReadResult<T> {
  /** Present when the transform returned a value and it was written. */
  written?: GmFirstWriteResult;
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
  write(value: T): Promise<GmFirstWriteResult>;
  /**
   * Read-modify-write. The transform returns the value to store, or undefined
   * to store nothing. A value derived while GM storage was failing is written
   * to localStorage only, so it never overwrites the GM copy.
   */
  update(transform: (current: GmFirstCurrent<T>) => T | undefined): Promise<GmFirstUpdateResult<T>>;
  /** Returns an unsubscribe function that never throws. */
  subscribe(listener: (change: GmFirstChange) => void): () => void;
}

type Unavailable = typeof UNAVAILABLE;
const UNAVAILABLE = Symbol('unavailable');

function createGmFirstJsonStore<T>(options: GmFirstJsonStoreOptions<T>): GmFirstJsonStore<T> {
  const {
    scriptName,
    subject,
    key,
    inheritFrom = [],
    fallbackKey,
    normalize = (raw: unknown) => raw as T,
    mirror = false,
    eventTarget = null,
    logger = globalThis.console,
  } = options;
  const warn = (message: string, error: unknown) => logger?.warn?.(`${scriptName}: ${message}`, error);
  // Resolved lazily and kept once found, so a manager API that shows up after
  // construction is still picked up without re-probing on every call.
  let resolved: GmApi | null = null;
  const gmApi = () => {
    if (!resolved?.getValue || !resolved.setValue) resolved = resolveGmApi(options);
    return resolved;
  };

  function fallbackStorage(): Pick<Storage, 'getItem' | 'setItem'> {
    const storage = options.localStorage ?? globalThis.localStorage;
    if (!storage) throw new Error('localStorage is unavailable.');
    return storage;
  }

  function writeFallback(value: T): void {
    if (!fallbackKey) throw new Error(`No fallback storage for ${subject}.`);
    fallbackStorage().setItem(fallbackKey, JSON.stringify(value));
  }

  function readFallback(): T | Unavailable {
    if (!fallbackKey) return UNAVAILABLE;
    try {
      return normalize(JSON.parse(fallbackStorage().getItem(fallbackKey) || 'null'));
    } catch (error) {
      warn(`failed to read ${subject} from fallback storage.`, error);
      return UNAVAILABLE;
    }
  }

  // The first non-null GM value along `key` then `inheritFrom`.
  async function readGm(getValue: NonNullable<GmApi['getValue']>): Promise<T> {
    let value: T = normalize(null);
    for (const name of [key, ...inheritFrom]) {
      value = normalize(await getValue(name, null));
      if (value !== null && value !== undefined) break;
    }
    return value;
  }

  // `gmFailed` separates "GM storage threw" from "GM storage is absent": only
  // the former makes a later write-back unsafe for the GM copy.
  async function readWithSource(): Promise<GmFirstReadResult<T> & { gmFailed: boolean }> {
    let gmFailed = false;
    const { getValue } = gmApi();
    if (getValue) {
      try {
        return { backend: 'gm', value: await readGm(getValue), gmFailed: false };
      } catch (error) {
        gmFailed = true;
        warn(`failed to read ${subject} from userscript storage.`, error);
      }
    }
    const fallback = readFallback();
    return fallback === UNAVAILABLE
      ? { backend: 'none', value: null, gmFailed }
      : { backend: 'localStorage', value: fallback, gmFailed };
  }

  async function read(): Promise<GmFirstReadResult<T>> {
    const { backend, value } = await readWithSource();
    return { backend, value };
  }

  function tryMirror(value: T): boolean {
    if (!mirror || !fallbackKey) return true;
    try {
      writeFallback(value);
      return true;
    } catch (error) {
      warn(`failed to mirror ${subject} to fallback storage.`, error);
      return false;
    }
  }

  async function writeTo(value: T, fallbackOnly: boolean): Promise<GmFirstWriteResult> {
    const { setValue } = gmApi();
    if (!fallbackOnly && setValue) {
      try {
        await setValue(key, value as Tampermonkey.StorageValue);
        return { backend: 'gm', mirrorDegraded: !tryMirror(value) };
      } catch (error) {
        warn(`failed to write ${subject} to userscript storage.`, error);
      }
    }
    writeFallback(value);
    return { backend: 'localStorage', mirrorDegraded: false };
  }

  const write = (value: T) => writeTo(value, false);

  async function update(transform: (current: GmFirstCurrent<T>) => T | undefined): Promise<GmFirstUpdateResult<T>> {
    const { backend, value, gmFailed } = await readWithSource();
    const fallback = () => {
      const copy = readFallback();
      return copy === UNAVAILABLE ? null : copy;
    };
    const next = transform({ backend, value, fallback });
    if (next === undefined) return { backend, value };
    return { backend, value: next, written: await writeTo(next, gmFailed) };
  }

  function subscribeGm(listener: (change: GmFirstChange) => void): (() => void) | null {
    const { valueChange } = gmApi();
    if (!valueChange) return null;
    const watchFailed = (error: unknown) => warn(`failed to watch ${subject} in userscript storage.`, error);
    try {
      return valueChange.subscribe(
        key,
        (name, oldValue, newValue, remote) =>
          listener({ backend: 'gm', key: name, oldValue, newValue, remote: Boolean(remote) }),
        watchFailed,
      );
    } catch (error) {
      watchFailed(error);
      return null;
    }
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

  return { read, write, update, subscribe };
}

export { createGmFirstJsonStore };
