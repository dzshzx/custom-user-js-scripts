import test from 'node:test';
import assert from 'node:assert/strict';
import { createArchiveData } from '../src/userscripts/javdb-recommend/javdb-recommend-data.lib.js';
import { createRequest } from '../src/userscripts/javdb-recommend/javdb-recommend-request.lib.js';
const C = 'javdb_recommend_periods_cache_v1', D = 'javdb_recommend_details_cache_v1', I = 'javdb_recommend_search_index_v1_';
const H = 3600000;
function storage() {
  const values = new Map(), reads = new Map();
  return { values, reads, get length() { return values.size; }, key: i => [...values.keys()][i],
    getItem(key) { reads.set(key, (reads.get(key) || 0) + 1); return values.get(key) || null; },
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
const put = (s, key, value) => s.setItem(key, JSON.stringify({ version: 1, ...value }));
const movie = { id: 'm', number: 'ABC', title: 'match' };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const tick = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
async function setup({ ids = [3,2,1], request, time = 100 * H, store = storage() } = {}) {
  put(store, C, { fetchedAt: time, fullFetchedAt: time, periods: ids.map(period => ({ period })) });
  let current = time;
  const data = createArchiveData({ storage: store, request: request || (async () => ({ movies: [movie] })), now: () => current });
  await data.loadCatalog();
  return { data, store, advance: delta => { current += delta; }, time };
}
test('independent leases share transport; releasing search preserves browsing; final release cancels', async () => {
  const pending = deferred(); let calls = 0, signal;
  const { data } = await setup({ request: (_, __, options) => { calls++; signal = options.signal; return pending.promise; } });
  const browse = data.acquirePeriod(3), search = data.acquirePeriod(3, { purpose: 'search' });
  const cancelled = assert.rejects(search.promise, { name: 'AbortError' });
  search.release(); search.release();
  await cancelled;
  assert.equal(calls, 1); assert.equal(signal.aborted, false);
  pending.resolve({ movies: [movie] });
  assert.equal((await browse.promise).movies.length, 1);
  browse.release();
  const last = data.acquirePeriod(2);
  last.release();
  await assert.rejects(last.promise, { name: 'AbortError' });
  assert.equal(signal.aborted, true);
  data.dispose();
});
test('memory and projected index retain source timestamps and expire latest period', async () => {
  let calls = 0;
  const { data, store, time, advance } = await setup({ request: async () => { calls++; return { movies: [movie] }; } });
  put(store, D, { entries: { 3: { fetchedAt: time-H, movies: [movie] } } });
  const first = data.acquirePeriod(3); await first.promise; first.release();
  assert.equal(JSON.parse(store.values.get(I+3)).fetchedAt, time-H);
  advance(H+1);
  const second = data.acquirePeriod(3); await second.promise; second.release();
  assert.equal(calls, 1);
  data.dispose();
});
test('network failure falls back with degradation while cancellation never succeeds with stale data', async () => {
  const { data, store, time } = await setup({ request: async () => { throw new TypeError('offline'); } });
  put(store, D, { entries: { 3: { fetchedAt: time-3*H, movies: [movie] } } });
  const lease = data.acquirePeriod(3);
  assert.equal((await lease.promise).degraded, true); lease.release();
  const cancelled = data.acquirePeriod(3); cancelled.release();
  await assert.rejects(cancelled.promise, { name: 'AbortError' });
  data.dispose();
});
test('clear cancels consumers and ignores late responses without repopulating storage', async () => {
  const pending = deferred();
  const { data, store } = await setup({ request: () => pending.promise });
  put(store, I+8, { fetchedAt: 1, movies: [movie] });
  const lease = data.acquirePeriod(3);
  const rejected = assert.rejects(lease.promise, { name: 'AbortError' });
  data.clearCaches(); await rejected;
  pending.resolve({ movies: [movie] }); await tick();
  assert.equal(store.values.size, 0);
  data.dispose();
});
test('search scans detail document once, preserves browsing payloads and reuses separate indexes', async () => {
  const { data, store, time } = await setup({ ids: Array.from({length: 60}, (_, i) => 60-i) });
  const entries = Object.fromEntries(Array.from({length:60}, (_,i) => [i+1,{ fetchedAt: time, movies: [movie] }]));
  put(store,D,{ entries });
  const before = store.values.get(D); store.reads.clear();
  const first = await data.search({ query: 'match' }).done;
  assert.equal(first.status,'complete'); assert.equal(first.hitPeriods,60);
  assert.equal(store.reads.get(D),1); assert.equal(store.values.get(D),before);
  store.removeItem(D);
  const second = await data.search({ query: 'match' }).done;
  assert.equal(second.hitPeriods,60); assert.equal(store.values.has(D),false);
  data.dispose();
});
test('partial search reports missing failures separately and groups follow catalog order', async () => {
  const { data } = await setup({ request: async (_, {period}) => {
    if (period === 2) throw new Error('missing'); return { movies: [movie] };
  } });
  const result = await data.search({ query: 'match' }).done;
  assert.equal(result.status,'partial'); assert.equal(result.failed,1); assert.equal(result.completed,3);
  assert.deepEqual(result.groups.map(g=>g.period),[3,1]); data.dispose();
});
test('new search cancels predecessor and stopping search does not cancel browsing lease', async () => {
  const pending = deferred(); let signal;
  const { data } = await setup({ ids:[3], request: (_,__,o) => { signal=o.signal; return pending.promise; } });
  const browse=data.acquirePeriod(3);
  const first=data.search({query:'match'}); await tick();
  const second=data.search({query:'match'}); await tick();
  assert.equal((await first.done).status,'cancelled');
  second.cancel(); assert.equal((await second.done).status,'cancelled');
  assert.equal(signal.aborted,false);
  pending.resolve({movies:[movie]}); await browse.promise; browse.release(); data.dispose();
});
test('catalog fallback, forced full verification and duplicate periods preserve metadata', async () => {
  const s=storage(); let fail=true, calls=0;
  put(s,C,{ fetchedAt:1,fullFetchedAt:1,periods:[{period:3},{period:2}] });
  const data=createArchiveData({storage:s,now:()=>1000*H,request:async()=>{
    calls++; if(fail) throw new Error('offline'); return {periods:[{period:4,title:'new'},{period:4,title:'duplicate'},{period:3}]};
  }});
  assert.equal((await data.loadCatalog()).degraded,true);
  fail=false;
  const result=await data.loadCatalog({force:true});
  assert.deepEqual(result.periods,[{period:4,title:'new'},{period:3}]);
  assert.equal(calls,2); data.dispose();
});
test('corrupt detail documents and full storage leave fetched data usable', async () => {
  const { data, store } = await setup();
  store.setItem(D,'{broken');
  store.setItem=()=>{ throw new Error('full'); };
  const lease=data.acquirePeriod(3);
  assert.deepEqual((await lease.promise).movies,[movie]); lease.release(); data.dispose();
});
test('retry backoff cancellation clears all timers and prevents another attempt', async () => {
  const jobs=new Map(); let id=0,calls=0;
  const timers={setTimeout(fn,ms){jobs.set(++id,{fn,ms});return id;},clearTimeout(id){jobs.delete(id);}};
  const api=createRequest({base:'https://example.test',timers,fetch:async()=>{calls++;throw new TypeError('offline');}});
  const controller=new AbortController();
  const request=api('/data',{}, {signal:controller.signal});
  await tick(); assert.deepEqual([...jobs.values()].map(j=>j.ms),[500]);
  controller.abort();
  await assert.rejects(request,{name:'AbortError'});
  assert.equal(jobs.size,0); assert.equal(calls,1);
});
test('disposed data rejects new work and cancels startup without writing late catalog', async () => {
  const pending=deferred(),s=storage();
  const data=createArchiveData({storage:s,request:()=>pending.promise});
  const load=data.loadCatalog();
  data.dispose(); data.dispose(); pending.resolve({periods:[{period:1}]});
  await assert.rejects(load,{name:'AbortError'});
  await assert.rejects(data.loadCatalog(),{name:'AbortError'});
  assert.equal(s.values.size,0);
});

test('navigation disk and memory are bounded independently at 48 and 24 periods', async () => {
  let calls=0;
  const {data,store}=await setup({ids:[60],request:async()=>{calls++;return {movies:[movie]};}});
  for(let period=1;period<=50;period++) {
    const lease=data.acquirePeriod(period); await lease.promise; lease.release();
  }
  assert.equal(Object.keys(JSON.parse(store.values.get(D)).entries).length,48);
  assert.ok(JSON.parse(store.values.get(D)).entries[50]);
  store.removeItem(D);
  const recent=data.acquirePeriod(50); await recent.promise; recent.release();
  assert.equal(calls,50);
  const evicted=data.acquirePeriod(1); await evicted.promise; evicted.release();
  assert.equal(calls,51); data.dispose();
});

test('quota errors progressively shrink the navigation document and keep the new period', async () => {
  const {data,store,time}=await setup();
  put(store,D,{entries:{1:{fetchedAt:time-1,movies:[movie]},2:{fetchedAt:time-2,movies:[movie]}}});
  const originalSet=store.setItem;
  store.setItem=(key,value)=>{
    if(key===D && Object.keys(JSON.parse(value).entries).length>1) throw new Error('quota');
    originalSet(key,value);
  };
  const lease=data.acquirePeriod(3); await lease.promise; lease.release();
  assert.deepEqual(Object.keys(JSON.parse(store.values.get(D)).entries),['3']);
  data.dispose();
});

test('timeouts use twelve seconds and retry at most three attempts with bounded backoff', async () => {
  const jobs=new Map(); let id=0,calls=0;
  const timers={setTimeout(fn,ms){jobs.set(++id,{fn,ms});return id;},clearTimeout(id){jobs.delete(id);}};
  const api=createRequest({base:'https://example.test',timers,fetch:async(_,options)=>{
    calls++;
    return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(Object.assign(new Error('timeout'),{name:'AbortError'})),{once:true}));
  }});
  const operation=api('/data',{});
  const rejection=assert.rejects(operation,{name:'AbortError'});
  for(let attempt=1;attempt<=3;attempt++){
    await tick();
    const [key,timeout]=[...jobs.entries()][0];
    assert.equal(timeout.ms,12000); jobs.delete(key); timeout.fn();
    await tick();
    if(attempt<3){
      const [backoffKey,backoff]=[...jobs.entries()][0];
      assert.equal(backoff.ms,500*2**(attempt-1)); jobs.delete(backoffKey); backoff.fn();
    }
  }
  await rejection; assert.equal(calls,3); assert.equal(jobs.size,0);
});
