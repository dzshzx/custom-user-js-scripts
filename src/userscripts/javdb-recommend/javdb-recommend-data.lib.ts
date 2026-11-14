import { clear, createStore, del, entries, get, keys, set } from 'idb-keyval';
import QuickLRU from 'quick-lru';
import { cancelled, createAborter, delay } from './javdb-recommend-request.lib.ts';
import type { Aborter, ApiRequest, RequestTimers } from './javdb-recommend-request.lib.ts';

// The movie fields the index projects and section signatures compare.
export const MOVIE_FIELDS = [
  'id',
  'number',
  'title',
  'origin_title',
  'cover_url',
  'score',
  'release_date',
] as const satisfies readonly (keyof Movie)[];

export interface Movie {
  id?: string | number;
  number?: string;
  title?: string;
  origin_title?: string;
  cover_url?: string;
  score?: string | number;
  release_date?: string;
}

export interface Period {
  period: number;
  created_at?: string;
  movies_count?: number | string;
}

export interface DetailEntry {
  movies: Movie[];
  fetchedAt: number;
  accessedAt?: number;
}

export interface DetailStore {
  get(key: string): Promise<DetailEntry | undefined>;
  set(key: string, value: DetailEntry): Promise<void>;
  del(key: string): Promise<void>;
  clear(): Promise<void>;
  keys(): Promise<string[]>;
  entries(): Promise<[string, DetailEntry][]>;
}

export interface CatalogResult {
  periods: Period[];
  degraded: boolean;
  source: string;
  error?: unknown;
}

export interface LoadCatalogOptions {
  force?: boolean;
  onProgress?: (count: number) => void;
}

export type AcquirePurpose = 'navigation' | 'search';

export interface AcquireOptions {
  purpose?: AcquirePurpose;
  diskEntries?: Record<string, DetailEntry>;
}

export interface PeriodResult {
  movies: Movie[];
  fetchedAt: number;
  degraded: boolean;
  source: 'cache' | 'network';
  error?: unknown;
}

export interface PeriodLease {
  promise: Promise<PeriodResult>;
  release(): void;
}

export interface SearchGroup {
  period: number;
  index: number;
  movies: Movie[];
}

export interface SearchResult {
  status: 'complete' | 'partial' | 'cancelled';
  completed: number;
  total: number;
  hits: number;
  hitPeriods: number;
  failed: number;
  degraded: number;
  groups: SearchGroup[];
}

// Update groups arrive in completion order; the final result is sorted by catalog index.
export interface SearchUpdate extends SearchResult {
  group: SearchGroup | undefined;
}

export interface SearchOptions {
  query?: string;
  onUpdate?: (update: SearchUpdate) => void;
}

export interface SearchJob {
  cancel(): void;
  done: Promise<SearchResult>;
}

export interface ArchiveData {
  loadCatalog(options?: LoadCatalogOptions): Promise<CatalogResult>;
  acquirePeriod(period: number, options?: AcquireOptions): PeriodLease;
  search(options?: SearchOptions): SearchJob;
  getLastPeriod(): number | null;
  setLastPeriod(period: number): void;
  invalidateCatalog(): void;
  clearCaches(): void;
  dispose(): void;
}

export interface ArchiveDataOptions {
  storage: Storage;
  details?: DetailStore | null;
  request: ApiRequest;
  now?: () => number;
  timers?: RequestTimers;
}

interface CatalogCache {
  version: 1;
  fetchedAt: number;
  fullFetchedAt?: number;
  periods: Period[];
}

interface IndexCache extends DetailEntry {
  version: 1;
}

interface CatalogWork {
  aborter: Aborter;
  promise: Promise<CatalogResult>;
}

interface NetworkRequest {
  aborter: Aborter;
  consumers: Set<Promise<never>>;
  promise: Promise<DetailEntry>;
}

const CATALOG = 'javdb_recommend_periods_cache_v1';
// Legacy localStorage details document; detail entries now live in IndexedDB.
const LEGACY_DETAILS = 'javdb_recommend_details_cache_v1';
const DETAIL_LIMIT = 48;
const INDEX = 'javdb_recommend_search_index_v1_';
const LAST_PERIOD = 'javdb_recommend_last_period';
const HOUR = 3600000,
  MONTH = 30 * 24 * HOUR;
const unique = (list: Period[]): Period[] =>
  [
    ...new Map(
      list
        .slice()
        .reverse()
        .map((item): [number, Period] => [item.period, item]),
    ).values(),
  ].reverse();
const project = (movie: Movie): Movie => Object.fromEntries(MOVIE_FIELDS.map((key) => [key, movie[key] || '']));
const CATALOG_PAGE_SIZE = 48;

// Index in cached of the first period found when scanning the fetched list from its end; -1 if none is cached.
function cachedOverlap(list: Period[], cached: Period[]): number {
  for (let i = list.length - 1; i >= 0; i--) {
    const overlap = cached.findIndex((item) => item.period === list[i].period);
    if (overlap >= 0) return overlap;
  }
  return -1;
}

// Reads catalog pages until one comes back short or, for an incremental refresh, the list reaches the cached
// catalog. onPage sees the merged list after every page and may throw to stop.
async function fetchCatalogPages(
  fetchPage: (page: number) => Promise<{ periods?: Period[] }>,
  onPage: (list: Period[]) => void,
  cached: Period[] | null,
): Promise<{ list: Period[]; overlap: number }> {
  let list: Period[] = [];
  for (let page = 1; ; page++) {
    const batch = (await fetchPage(page)).periods || [];
    list = unique(list.concat(batch));
    onPage(list);
    const overlap = cached ? cachedOverlap(list, cached) : -1;
    if (overlap >= 0 || batch.length !== CATALOG_PAGE_SIZE) return { list, overlap };
  }
}

// Per-period detail entries in the page origin's IndexedDB. Every call is async
// so a missing indexedDB (or a blocked open) surfaces as a rejection.
export function createDetailStore(dbName = 'javdb-recommend-archive', storeName = 'details'): DetailStore {
  const store = createStore(dbName, storeName);
  return {
    get: async (key) => get<DetailEntry>(key, store),
    set: async (key, value) => set(key, value, store),
    del: async (key) => del(key, store),
    clear: async () => clear(store),
    keys: async () => keys<string>(store),
    entries: async () => entries<string, DetailEntry>(store),
  };
}

export function createArchiveData({
  storage,
  details,
  request,
  now = Date.now,
  timers = globalThis,
}: ArchiveDataOptions) {
  let periods: Period[] = [],
    generation = 0,
    disposed = false,
    catalogWork: CatalogWork | null = null,
    activeSearch: SearchJob | null = null;
  const memory = new QuickLRU<number, DetailEntry>({ maxSize: 24 }),
    requests = new Map<number, NetworkRequest>(),
    liveLeases = new Set<PeriodLease>();
  const read = <T extends { version: 1 }>(key: string): T | null => {
    try {
      const value = JSON.parse(storage.getItem(key)!);
      return value?.version === 1 ? value : null;
    } catch {
      return null;
    }
  };
  const write = (key: string, value: object) => {
    try {
      storage.setItem(key, JSON.stringify({ ...value, version: 1 }));
      return true;
    } catch {
      return false;
    }
  };
  // Detail storage is a cache: every failure reads as a miss or a skipped write.
  const readDetail = async (period: number) => {
    try {
      return (await details?.get(String(period))) || null;
    } catch {
      return null;
    }
  };
  const readAllDetails = async (): Promise<Record<string, DetailEntry>> => {
    try {
      return Object.fromEntries((await details?.entries()) || []);
    } catch {
      return {};
    }
  };
  try {
    storage.removeItem(LEGACY_DETAILS);
  } catch {
    /* Legacy cleanup is best effort. */
  }
  const valid = (entry: DetailEntry | null | undefined) =>
    entry && Array.isArray(entry.movies) && Number.isFinite(entry.fetchedAt);
  const ttl = (period: number) => (periods[0]?.period === period ? 2 * HOUR : MONTH);
  const fresh = (entry: DetailEntry | null | undefined, period: number) =>
    valid(entry) && now() - entry!.fetchedAt < ttl(period);
  const check = (epoch: number) => {
    if (disposed || epoch !== generation) throw cancelled();
  };
  const notify = <T>(callback: ((value: T) => void) | undefined, value: T) => {
    try {
      callback?.(value);
    } catch {
      /* Observers do not own work. */
    }
  };
  function index(period: number): IndexCache | null {
    const entry = read<IndexCache>(INDEX + period);
    return valid(entry) && (periods[0]?.period !== period || fresh(entry, period)) ? entry : null;
  }
  function saveIndex(period: number, entry: DetailEntry) {
    write(INDEX + period, { fetchedAt: entry.fetchedAt, movies: entry.movies.map(project) });
  }
  // Search reads the projected index first; a fresh local entry also refreshes that index.
  function searchable(period: number, local: DetailEntry | null | undefined): DetailEntry | null {
    const indexed = index(period);
    if (indexed) return indexed;
    if (!fresh(local, period)) return null;
    saveIndex(period, local!);
    return local!;
  }
  async function saveDetail(period: number, entry: DetailEntry) {
    if (!details) return;
    try {
      await details.set(String(period), { ...entry, accessedAt: now() });
      if ((await details.keys()).length <= DETAIL_LIMIT) return;
      const stored = await details.entries();
      const stamp = (value: DetailEntry | undefined) => value?.accessedAt || value?.fetchedAt || 0;
      const stale = stored
        .filter(([key]) => key !== String(period))
        .sort((a, b) => stamp(b[1]) - stamp(a[1]))
        .slice(DETAIL_LIMIT - 1);
      await Promise.all(stale.map(([key]) => details!.del(key)));
    } catch {
      /* A detail cache that cannot be written only costs a later refetch. */
    }
  }
  function loadCatalog({ force = false, onProgress }: LoadCatalogOptions = {}): Promise<CatalogResult> {
    if (disposed) return Promise.reject(cancelled());
    if (catalogWork) return catalogWork.promise;
    const cached = read<CatalogCache>(CATALOG);
    const usable =
      cached && Array.isArray(cached.periods) && cached.periods.length && Number.isFinite(cached.fetchedAt);
    if (!force && usable && now() - cached!.fetchedAt < 6 * HOUR) {
      periods = unique(cached!.periods);
      return Promise.resolve({ periods: periods.slice(), degraded: false, source: '本地缓存' });
    }
    const epoch = generation,
      aborter = createAborter();
    const work = { aborter } as CatalogWork;
    // Keeps the fetched list, plus the cached tail after an overlap, and reports how the catalog was refreshed.
    const storeCatalog = (list: Period[], overlap: number): CatalogResult => {
      periods = overlap >= 0 ? unique(list.concat(cached!.periods.slice(overlap + 1))) : list;
      write(CATALOG, {
        fetchedAt: now(),
        fullFetchedAt: overlap >= 0 ? cached!.fullFetchedAt || cached!.fetchedAt : now(),
        periods,
      });
      return { periods: periods.slice(), degraded: false, source: overlap >= 0 ? '已增量更新' : '已完整更新' };
    };
    // A failed refresh falls back to a usable cached catalog unless the work was cancelled.
    const fallBackToCachedCatalog = (error: unknown): CatalogResult => {
      check(epoch);
      if (aborter.signal?.aborted) throw error;
      if (!usable) throw error;
      periods = unique(cached!.periods);
      return { periods: periods.slice(), degraded: true, source: '本地缓存', error };
    };
    const fetchCatalogPage = (page: number) =>
      request(
        '/api/v1/movies/recommend_periods',
        { page, limit: CATALOG_PAGE_SIZE },
        { signal: aborter.signal },
      ) as Promise<{ periods?: Period[] }>;
    // A page that lands after cancellation stops the refresh before it reports progress.
    const reportCatalogPage = (list: Period[]) => {
      check(epoch);
      notify(onProgress, list.length);
    };
    work.promise = (async (): Promise<CatalogResult> => {
      try {
        const incremental = usable && now() - (cached!.fullFetchedAt || cached!.fetchedAt) < MONTH;
        const { list, overlap } = await fetchCatalogPages(
          fetchCatalogPage,
          reportCatalogPage,
          incremental ? cached!.periods : null,
        );
        return storeCatalog(list, overlap);
      } catch (error) {
        return fallBackToCachedCatalog(error);
      } finally {
        if (catalogWork === work) catalogWork = null;
      }
    })();
    catalogWork = work;
    return work.promise;
  }
  // Browsing keeps a cache hit in memory, rewrites its access stamp at most hourly and refreshes its index.
  function keepNavigationHit(period: number, cached: DetailEntry) {
    memory.set(period, cached);
    if (now() - (cached.accessedAt || 0) >= HOUR) {
      cached.accessedAt = now();
      saveDetail(period, cached);
    }
    saveIndex(period, cached);
  }
  // The cached entry a lease may answer from: search reads the index, navigation needs a fresh entry.
  function cacheHit(period: number, purpose: AcquirePurpose, local: DetailEntry | null | undefined) {
    if (purpose === 'search') return searchable(period, local);
    return fresh(local, period) ? local : null;
  }
  function cacheResult(period: number, purpose: AcquirePurpose, cached: DetailEntry): PeriodResult {
    if (purpose === 'navigation') keepNavigationHit(period, cached);
    return { movies: cached.movies, fetchedAt: cached.fetchedAt, degraded: false, source: 'cache' };
  }
  // One network request per period, shared by every lease that needs it until its last consumer leaves.
  function periodRequest(period: number, epoch: number): NetworkRequest {
    const existing = requests.get(period);
    if (existing) return existing;
    const aborter = createAborter();
    const item = { aborter, consumers: new Set() } as NetworkRequest;
    item.promise = (async () => request('/api/v1/movies/recommend', { period }, { signal: aborter.signal }))()
      .then((response) => {
        check(epoch);
        if (aborter.signal?.aborted || !item.consumers.size) throw cancelled();
        return { movies: (response as { movies?: Movie[] }).movies || [], fetchedAt: now() };
      })
      .finally(() => {
        if (requests.get(period) === item) requests.delete(period);
      });
    requests.set(period, item);
    return item;
  }
  function networkResult(period: number, purpose: AcquirePurpose, entry: DetailEntry): PeriodResult {
    saveIndex(period, entry);
    if (purpose === 'navigation') {
      memory.set(period, entry);
      saveDetail(period, entry);
    }
    return { ...entry, degraded: false, source: 'network' };
  }
  // A failed request falls back to a valid local entry unless the request was aborted.
  function localFallback(
    period: number,
    purpose: AcquirePurpose,
    network: NetworkRequest,
    local: DetailEntry | null | undefined,
    error: unknown,
  ): PeriodResult {
    if (network.aborter.signal?.aborted || !valid(local)) throw error;
    if (purpose === 'navigation') memory.set(period, local!);
    return { movies: local!.movies, fetchedAt: local!.fetchedAt, degraded: true, source: 'cache', error };
  }
  function acquire(period: number, { purpose = 'navigation', diskEntries }: AcquireOptions = {}): PeriodLease {
    const epoch = generation;
    let released = false,
      network: NetworkRequest | null | undefined = null,
      rejectRelease: (reason: unknown) => void;
    const cancellation = new Promise<never>((_, reject) => {
      rejectRelease = reject;
    });
    const assertActive = () => {
      check(epoch);
      if (released) throw cancelled();
    };
    let local: DetailEntry | null | undefined = null;
    const work = (async (): Promise<PeriodResult> => {
      assertActive();
      local = memory.get(period) || (diskEntries ? diskEntries[period] : await readDetail(period));
      assertActive();
      const cached = cacheHit(period, purpose, local);
      if (cached) return cacheResult(period, purpose, cached);
      const shared = periodRequest(period, epoch);
      network = shared;
      shared.consumers.add(cancellation);
      try {
        const entry = await shared.promise;
        assertActive();
        return networkResult(period, purpose, entry);
      } catch (error) {
        assertActive();
        return localFallback(period, purpose, shared, local, error);
      }
    })();
    const lease: PeriodLease = {
      promise: Promise.race([work, cancellation]),
      release() {
        if (released) return;
        released = true;
        liveLeases.delete(lease);
        rejectRelease(cancelled());
        if (network) {
          network.consumers.delete(cancellation);
          if (!network.consumers.size) {
            network.aborter.abort();
            if (requests.get(period) === network) requests.delete(period);
          }
        }
      },
    };
    liveLeases.add(lease);
    lease.promise.then(
      () => liveLeases.delete(lease),
      () => liveLeases.delete(lease),
    );
    return lease;
  }
  function search({ query, onUpdate }: SearchOptions = {}): SearchJob {
    activeSearch?.cancel();
    const epoch = generation,
      aborter = createAborter(),
      leases = new Set<PeriodLease>();
    let stopped = disposed,
      cursor = 0;
    const result: SearchResult = {
      status: 'complete',
      completed: 0,
      total: periods.length,
      hits: 0,
      hitPeriods: 0,
      failed: 0,
      degraded: 0,
      groups: [],
    };
    const missing: { period: number; index: number }[] = [],
      q = String(query || '')
        .trim()
        .toLowerCase();
    const cancelledSearch = () => stopped || disposed || epoch !== generation;
    const emitUpdate = (group: SearchGroup | undefined) =>
      notify(onUpdate, { ...result, groups: result.groups.slice(), group });
    const report = (period: number, index: number, entry: { movies: Movie[]; degraded?: boolean }) => {
      const movies = entry.movies.filter((movie) =>
        (movie.number + ' ' + (movie.title || '') + ' ' + (movie.origin_title || '')).toLowerCase().includes(q),
      );
      result.completed++;
      if (entry.degraded) result.degraded++;
      let group: SearchGroup | undefined;
      if (movies.length) {
        group = { period, index, movies };
        result.groups.push(group);
        result.hits += movies.length;
        result.hitPeriods++;
      }
      emitUpdate(group);
    };
    const reportFailure = () => {
      if (cancelledSearch()) return;
      result.completed++;
      result.failed++;
      emitUpdate(undefined);
    };
    // One detail-store scan for the entire local pass and missing-period fallbacks.
    let diskEntries: Record<string, DetailEntry> = {};
    // Searches one period missing from local storage through a search lease.
    const searchMissing = async (item: { period: number; index: number }) => {
      const lease = acquire(item.period, { purpose: 'search', diskEntries });
      leases.add(lease);
      try {
        const entry = await lease.promise;
        if (!cancelledSearch()) report(item.period, item.index, entry);
      } catch {
        reportFailure();
      } finally {
        lease.release();
        leases.delete(lease);
      }
    };
    // Waits between network searches; false once the wait is aborted.
    const pauseBetweenRequests = async () => {
      try {
        await delay(100, aborter.signal, timers);
        return true;
      } catch {
        return false;
      }
    };
    const worker = async () => {
      while (!cancelledSearch() && cursor < missing.length) {
        await searchMissing(missing[cursor++]);
        const more = !cancelledSearch() && cursor < missing.length;
        if (more && !(await pauseBetweenRequests())) break;
      }
    };
    const job: SearchJob = {
      cancel() {
        if (stopped) return;
        stopped = true;
        aborter.abort();
        for (const lease of leases) lease.release();
      },
      done: null!,
    };
    job.done = Promise.resolve()
      .then(async () => {
        if (!cancelledSearch()) diskEntries = await readAllDetails();
        if (!cancelledSearch())
          periods.slice().forEach((item, i) => {
            const entry = searchable(item.period, memory.get(item.period) || diskEntries[item.period]);
            if (entry) report(item.period, i, entry);
            else missing.push({ period: item.period, index: i });
          });
        await Promise.all([worker(), worker()]);
        result.status = cancelledSearch() ? 'cancelled' : result.failed ? 'partial' : 'complete';
        result.groups.sort((a, b) => a.index - b.index);
        return result;
      })
      .finally(() => {
        if (activeSearch === job) activeSearch = null;
      });
    activeSearch = job;
    return job;
  }
  function cancelWork() {
    generation++;
    activeSearch?.cancel();
    for (const lease of liveLeases) lease.release();
    catalogWork?.aborter.abort();
    catalogWork = null;
    for (const request of requests.values()) request.aborter.abort();
    requests.clear();
    memory.clear();
  }
  return {
    loadCatalog,
    acquirePeriod: acquire,
    search,
    getLastPeriod() {
      try {
        const period = parseInt(storage.getItem(LAST_PERIOD)!, 10);
        return Number.isFinite(period) ? period : null;
      } catch {
        return null;
      }
    },
    setLastPeriod(period) {
      try {
        storage.setItem(LAST_PERIOD, String(period));
      } catch {
        /* Remembering the last period is best effort. */
      }
    },
    invalidateCatalog() {
      cancelWork();
      storage.removeItem(CATALOG);
    },
    clearCaches() {
      cancelWork();
      periods = [];
      storage.removeItem(CATALOG);
      details?.clear().catch(() => {});
      for (let i = storage.length - 1; i >= 0; i--) {
        const key = storage.key(i);
        if (key?.startsWith(INDEX)) storage.removeItem(key);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelWork();
    },
  } satisfies ArchiveData;
}
