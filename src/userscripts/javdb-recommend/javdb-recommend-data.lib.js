import { cancelled, delay } from './javdb-recommend-request.lib.js';

const CATALOG = 'javdb_recommend_periods_cache_v1';
const DETAILS = 'javdb_recommend_details_cache_v1';
const INDEX = 'javdb_recommend_search_index_v1_';
const HOUR = 3600000, MONTH = 30 * 24 * HOUR;
const unique = list => [...new Map(list.slice().reverse().map(item => [item.period, item])).values()].reverse();
const project = movie => Object.fromEntries(['id', 'number', 'title', 'origin_title', 'cover_url', 'score', 'release_date'].map(key => [key, movie[key] || '']));

export function createArchiveData({ storage, request, now = Date.now, timers = globalThis }) {
  let periods = [], generation = 0, disposed = false, catalogWork = null, activeSearch = null;
  const memory = new Map(), requests = new Map(), liveLeases = new Set();
  const controller = () => typeof AbortController === 'function' ? new AbortController() : { signal: undefined, abort() {} };
  const read = key => {
    try { const value = JSON.parse(storage.getItem(key)); return value?.version === 1 ? value : null; }
    catch { return null; }
  };
  const write = (key, value) => {
    try { storage.setItem(key, JSON.stringify({ ...value, version: 1 })); return true; }
    catch { return false; }
  };
  const valid = entry => entry && Array.isArray(entry.movies) && Number.isFinite(entry.fetchedAt);
  const ttl = period => periods[0]?.period === period ? 2 * HOUR : MONTH;
  const fresh = (entry, period) => valid(entry) && now() - entry.fetchedAt < ttl(period);
  const check = epoch => { if (disposed || epoch !== generation) throw cancelled(); };
  const notify = (callback, value) => { try { callback?.(value); } catch { /* Observers do not own work. */ } };
  function index(period) {
    const entry = read(INDEX + period);
    return valid(entry) && (periods[0]?.period !== period || fresh(entry, period)) ? entry : null;
  }
  function saveIndex(period, entry) {
    write(INDEX + period, { fetchedAt: entry.fetchedAt, movies: entry.movies.map(project) });
  }
  function remember(period, entry) {
    memory.delete(period);
    memory.set(period, entry);
    if (memory.size > 24) memory.delete(memory.keys().next().value);
  }
  function saveDetail(period, entry) {
    const stored = read(DETAILS)?.entries;
    const entries = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
    entries[period] = { ...entry, accessedAt: now() };
    const keys = Object.keys(entries).sort((a, b) => {
      if (a === String(period)) return -1;
      if (b === String(period)) return 1;
      return (entries[b].accessedAt || entries[b].fetchedAt || 0) - (entries[a].accessedAt || entries[a].fetchedAt || 0);
    });
    keys.splice(48).forEach(key => delete entries[key]);
    while (!write(DETAILS, { entries })) {
      if (keys.length <= 1) break;
      delete entries[keys.pop()];
    }
  }
  function loadCatalog({ force = false, onProgress } = {}) {
    if (disposed) return Promise.reject(cancelled());
    if (catalogWork) return catalogWork.promise;
    const cached = read(CATALOG);
    const usable = cached && Array.isArray(cached.periods) && cached.periods.length && Number.isFinite(cached.fetchedAt);
    if (!force && usable && now() - cached.fetchedAt < 6 * HOUR) {
      periods = unique(cached.periods);
      return Promise.resolve({ periods: periods.slice(), degraded: false, source: '本地缓存' });
    }
    const epoch = generation, aborter = controller();
    const work = { aborter };
    work.promise = (async () => {
      try {
        const incremental = usable && now() - (cached.fullFetchedAt || cached.fetchedAt) < MONTH;
        let list = [];
        for (let page = 1; ; page++) {
          const response = await request('/api/v1/movies/recommend_periods', { page, limit: 48 }, { signal: aborter.signal });
          check(epoch);
          const batch = response.periods || [];
          list = unique(list.concat(batch));
          notify(onProgress, list.length);
          let overlap = -1;
          if (incremental) {
            for (let i = list.length - 1; i >= 0; i--) {
              overlap = cached.periods.findIndex(item => item.period === list[i].period);
              if (overlap >= 0) break;
            }
          }
          if (overlap >= 0 || batch.length !== 48) {
            periods = overlap >= 0 ? unique(list.concat(cached.periods.slice(overlap + 1))) : list;
            write(CATALOG, { fetchedAt: now(), fullFetchedAt: overlap >= 0 ? (cached.fullFetchedAt || cached.fetchedAt) : now(), periods });
            return { periods: periods.slice(), degraded: false, source: overlap >= 0 ? '已增量更新' : '已完整更新' };
          }
        }
      } catch (error) {
        check(epoch);
        if (aborter.signal?.aborted) throw error;
        if (!usable) throw error;
        periods = unique(cached.periods);
        return { periods: periods.slice(), degraded: true, source: '本地缓存', error };
      } finally { if (catalogWork === work) catalogWork = null; }
    })();
    catalogWork = work;
    return work.promise;
  }
  function acquire(period, { purpose = 'navigation', diskEntries } = {}) {
    const epoch = generation;
    let released = false, network = null, rejectRelease;
    const cancellation = new Promise((_, reject) => { rejectRelease = reject; });
    const assertActive = () => { check(epoch); if (released) throw cancelled(); };
    const local = memory.get(period) || (diskEntries ? diskEntries[period] : read(DETAILS)?.entries?.[period]);
    const cached = purpose === 'search' ? index(period) || (fresh(local, period) ? local : null) : fresh(local, period) ? local : null;
    const work = (async () => {
      assertActive();
      if (cached) {
        if (purpose === 'navigation') {
          remember(period, cached);
          if (now() - (cached.accessedAt || 0) >= HOUR) {
            cached.accessedAt = now();
            saveDetail(period, cached);
          }
        }
        saveIndex(period, cached);
        return { movies: cached.movies, fetchedAt: cached.fetchedAt, degraded: false, source: 'cache' };
      }
      network = requests.get(period);
      if (!network) {
        const aborter = controller();
        network = { aborter, consumers: new Set() };
        const item = network;
        item.promise = (async () => request('/api/v1/movies/recommend', { period }, { signal: aborter.signal }))().then(response => {
          check(epoch);
          if (aborter.signal?.aborted || !item.consumers.size) throw cancelled();
          return { movies: response.movies || [], fetchedAt: now() };
        }).finally(() => { if (requests.get(period) === item) requests.delete(period); });
        requests.set(period, item);
      }
      network.consumers.add(cancellation);
      try {
        const entry = await network.promise;
        assertActive();
        saveIndex(period, entry);
        if (purpose === 'navigation') { remember(period, entry); saveDetail(period, entry); }
        return { ...entry, degraded: false, source: 'network' };
      } catch (error) {
        assertActive();
        if (network.aborter.signal?.aborted || !valid(local)) throw error;
        if (purpose === 'navigation') remember(period, local);
        return { movies: local.movies, fetchedAt: local.fetchedAt, degraded: true, source: 'cache', error };
      }
    })();
    const lease = {
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
    lease.promise.then(() => liveLeases.delete(lease), () => liveLeases.delete(lease));
    return lease;
  }
  function search({ query, onUpdate } = {}) {
    activeSearch?.cancel();
    const epoch = generation, aborter = controller(), leases = new Set();
    let stopped = disposed, cursor = 0;
    const result = { status: 'complete', completed: 0, total: periods.length, hits: 0, hitPeriods: 0, failed: 0, degraded: 0, groups: [] };
    const missing = [], q = String(query || '').trim().toLowerCase();
    const cancelledSearch = () => stopped || disposed || epoch !== generation;
    const report = (period, index, entry) => {
      const movies = entry.movies.filter(movie => (movie.number + ' ' + (movie.title || '') + ' ' + (movie.origin_title || '')).toLowerCase().includes(q));
      result.completed++;
      if (entry.degraded) result.degraded++;
      let group;
      if (movies.length) {
        group = { period, index, movies };
        result.groups.push(group);
        result.hits += movies.length;
        result.hitPeriods++;
      }
      notify(onUpdate, { ...result, groups: result.groups.slice().sort((a,b) => a.index-b.index), group });
    };
    // One details-document parse for the entire local pass and missing-period fallbacks.
    const diskEntries = read(DETAILS)?.entries || {};
    const job = {
      cancel() { if (stopped) return; stopped = true; aborter.abort(); for (const lease of leases) lease.release(); },
      done: null,
    };
    job.done = Promise.resolve().then(async () => {
      if (!cancelledSearch()) periods.slice().forEach((item, i) => {
        const local = memory.get(item.period) || diskEntries[item.period];
        const entry = index(item.period) || (fresh(local, item.period) ? local : null);
        if (entry) { saveIndex(item.period, entry); report(item.period, i, entry); }
        else missing.push({ period: item.period, index: i });
      });
      async function worker() {
        while (!cancelledSearch() && cursor < missing.length) {
          const item = missing[cursor++], lease = acquire(item.period, { purpose: 'search', diskEntries });
          leases.add(lease);
          try {
            const entry = await lease.promise;
            if (!cancelledSearch()) report(item.period, item.index, entry);
          } catch {
            if (!cancelledSearch()) {
              result.completed++; result.failed++;
              notify(onUpdate, { ...result, groups: result.groups.slice(), group: undefined });
            }
          } finally { lease.release(); leases.delete(lease); }
          if (!cancelledSearch() && cursor < missing.length) {
            try { await delay(100, aborter.signal, timers); } catch { break; }
          }
        }
      }
      await Promise.all([worker(), worker()]);
      result.status = cancelledSearch() ? 'cancelled' : result.failed ? 'partial' : 'complete';
      result.groups.sort((a,b) => a.index-b.index);
      return result;
    }).finally(() => { if (activeSearch === job) activeSearch = null; });
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
    acquirePeriod: (period, options) => acquire(period, options),
    search,
    invalidateCatalog() { cancelWork(); storage.removeItem(CATALOG); },
    clearCaches() {
      cancelWork();
      periods = [];
      storage.removeItem(CATALOG); storage.removeItem(DETAILS);
      for (let i = storage.length - 1; i >= 0; i--) {
        const key = storage.key(i);
        if (key?.startsWith(INDEX)) storage.removeItem(key);
      }
    },
    dispose() { if (disposed) return; disposed = true; cancelWork(); },
  };
}
