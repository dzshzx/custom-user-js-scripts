import test from 'node:test';
import assert from 'node:assert/strict';
import { createDomWindow, domSkip } from './helpers/dom-env.mjs';
import { buildQuotaSnapshotResult } from '../src/userscripts/codex-quota-compass/codex-quota-compass-core.lib.js';
import { createQuotaCompassTranslator } from '../src/userscripts/codex-quota-compass/codex-quota-compass-i18n.lib.js';
import { createQuotaPanelController } from '../src/userscripts/codex-quota-compass/codex-quota-compass-panel-controller.lib.js';

const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve;
  const promise = new Promise((yes) => { resolve = yes; });
  return { promise, resolve };
}
function result() {
  return buildQuotaSnapshotResult({
    config: { DATE_BUCKET_MODE: 'utc', USD_PER_CREDIT: 0.04, ROLLING_DAYS: 30 }, diagnostics: {}, windows: [],
    periods: {
      sinceReset: { summary: {}, weeklyEstimate: {}, rows: [], clients: [] },
      monthToDate: { summary: {}, rows: [], clients: [] },
      rolling: { summary: {}, rows: [], clients: [] },
    },
  });
}
function state(overrides = {}) {
  return { result: result(), calculationError: null, archiveSummary: null, ledgerCost: null,
    importReport: null, storageBackend: { id: 'gm', label: 'GM' },
    syncStatus: { enabled: false, hasToken: false, gistId: '' }, errors: {}, ...overrides };
}
function fixture(options = {}) {
  const window = createDomWindow({ url: 'https://chatgpt.com/' });
  const t = createQuotaCompassTranslator({ navigator: { language: 'en-US' } }).t;
  let current = state();
  let runs = 0;
  let imports = 0;
  let selections = 0;
  let downloads = 0;
  const settled = [];
  const application = {
    run: async () => { runs++; return options.run ? options.run() : { status: 'ok', completed: ['calculation', 'persistence', 'projection'], result: current.result }; },
    sync: options.sync || (async () => ({ status: 'ok', completed: ['sync'] })),
    configureSync: options.configureSync || (async () => ({ status: 'ok', completed: ['settings'] })),
    importArchive: async (value) => { imports++; return options.importArchive ? options.importArchive(value) : { status: 'ok', completed: ['persistence', 'projection'], report: { added: 1, skipped: 0, invalid: 0 } }; },
    exportArchive: options.exportArchive || (async () => ({ snapshotCount: 0 })),
  };
  const panel = createQuotaPanelController({
    application, document: window.document, window, storage: window.localStorage, t,
    files: {
      chooseText: async (argument) => { selections++; return options.chooseText ? options.chooseText(argument) : { status: 'cancelled' }; },
      downloadText: async () => { downloads++; },
    },
    onRefreshSettled: (outcome) => { settled.push(outcome.status); return options.onRefreshSettled?.(outcome); },
  });
  panel.update(current);
  return {
    window, panel, settled, runs: () => runs, imports: () => imports,
    selections: () => selections, downloads: () => downloads,
    update(value) { current = state(value); panel.update(current); },
    close() { panel.dispose(); window.happyDOM.abort(); window.close(); },
  };
}
async function openArchive(f) {
  await f.panel.dispatch({ type: 'open', view: 'archive' });
  return f.window.document.querySelector('[data-field="token"]');
}
function edit(f, node, value) {
  node.value = value;
  node.dispatchEvent(new f.window.Event('input', { bubbles: true }));
}

test('controller preserves dirty sync input through loading and calculation failure, and coalesces refresh', { skip: domSkip }, async () => {
  const pending = deferred();
  const f = fixture({ run: () => pending.promise });
  try {
    const token = await openArchive(f);
    edit(f, token, 'unsubmitted');
    token.blur();
    const first = f.panel.dispatch({ type: 'refresh' });
    const second = f.panel.dispatch({ type: 'refresh' });
    assert.equal(first, second);
    await tick();
    f.update({ errors: { sync: 'offline' } });
    assert.equal(f.window.document.querySelector('[data-field="token"]'), token);
    pending.resolve({ status: 'error', completed: [], error: 'calculate' });
    assert.equal((await first).status, 'error');
    assert.equal(f.window.document.querySelector('[data-field="token"]'), token);
    assert.equal(token.value, 'unsubmitted');
    assert.equal(f.runs(), 1);
    assert.deepEqual(f.settled, ['error']);
  } finally { f.close(); }
});

test('archive persistence and remote sync failures preserve an unfocused dirty form', { skip: domSkip }, async () => {
  for (const operation of ['refresh', 'sync']) {
    const f = fixture({
      run: async () => ({ status: 'partial', completed: ['calculation'], error: 'save failed' }),
      sync: async () => ({ status: 'error', completed: [], error: 'sync failed' }),
    });
    try {
      const token = await openArchive(f);
      edit(f, token, 'dirty draft');
      token.blur();
      assert.equal((await f.panel.dispatch(operation)).status, operation === 'refresh' ? 'partial' : 'error');
      f.update({ errors: { sync: 'background failed' } });
      assert.equal(f.window.document.querySelector('[data-field="token"]'), token);
      assert.equal(token.value, 'dirty draft');
    } finally { f.close(); }
  }
});

test('re-entering the active archive tab does not replace a dirty form', { skip: domSkip }, async () => {
  const f = fixture();
  try {
    const token = await openArchive(f);
    edit(f, token, 'dirty draft');
    token.blur();
    f.update({ syncStatus: { enabled: true, hasToken: true, gistId: 'updated' } });
    f.window.document.querySelector('[data-view="archive"]').click();
    assert.equal(f.window.document.querySelector('[data-field="token"]'), token);
    assert.equal(token.value, 'dirty draft');
  } finally { f.close(); }
});

test('successful settings stage clears only the submitted generation and revision', { skip: domSkip }, async () => {
  const pending = deferred();
  const f = fixture({ configureSync: () => pending.promise });
  try {
    let token = await openArchive(f);
    edit(f, token, 'submitted');
    const save = f.panel.dispatch({ type: 'save-remote-sync' });
    await tick();
    edit(f, token, 'new draft');
    pending.resolve({ status: 'partial', completed: ['settings'], error: 'remote failed' });
    assert.equal((await save).status, 'partial');
    assert.equal(token.value, 'new draft');
    f.update({ errors: { sync: 'offline' } });
    assert.equal(f.window.document.querySelector('[data-field="token"]'), token);
    f.window.document.querySelector('[data-view="details"]').click();
    f.window.document.querySelector('[data-view="archive"]').click();
    token = f.window.document.querySelector('[data-field="token"]');
    assert.notEqual(token.value, 'submitted');
  } finally { f.close(); }
});

test('an old settings completion cannot clear a newly opened form', { skip: domSkip }, async () => {
  const pending = deferred();
  const f = fixture({ configureSync: () => pending.promise });
  try {
    const oldToken = await openArchive(f);
    edit(f, oldToken, 'submitted');
    const save = f.panel.dispatch('save-remote-sync');
    await tick();
    f.window.document.querySelector('[data-view="details"]').click();
    f.window.document.querySelector('[data-view="archive"]').click();
    const newToken = f.window.document.querySelector('[data-field="token"]');
    assert.notEqual(newToken, oldToken);
    edit(f, newToken, 'new form draft');
    pending.resolve({ status: 'ok', completed: ['settings'] });
    assert.equal((await save).status, 'ok');
    assert.equal(f.window.document.querySelector('[data-field="token"]'), newToken);
    assert.equal(newToken.value, 'new form draft');
  } finally { f.close(); }
});

test('saved settings clear the submitted token even when remote sync fails', { skip: domSkip }, async () => {
  const f = fixture({ configureSync: async () => ({ status: 'partial', completed: ['settings'], error: 'remote failed' }) });
  try {
    const token = await openArchive(f);
    edit(f, token, 'submitted');
    const outcome = await f.panel.dispatch('save-remote-sync');
    assert.equal(outcome.status, 'partial');
    assert.deepEqual(outcome.completed, ['settings']);
    assert.equal(token.value, '');
    token.blur();
    await tick();
    f.update({ errors: { sync: 'offline' } });
    assert.notEqual(f.window.document.querySelector('[data-field="token"]'), token);
  } finally { f.close(); }
});

test('failed settings save retains an unfocused dirty form through background updates', { skip: domSkip }, async () => {
  const f = fixture({ configureSync: async () => ({ status: 'error', completed: [], error: 'settings failed' }) });
  try {
    const token = await openArchive(f);
    edit(f, token, 'unsaved');
    token.blur();
    assert.equal((await f.panel.dispatch('save-remote-sync')).status, 'error');
    f.update({ errors: { sync: 'offline' } });
    assert.equal(f.window.document.querySelector('[data-field="token"]'), token);
    assert.equal(token.value, 'unsaved');
  } finally { f.close(); }
});

test('cancelled import does not parse or import; concurrent export downloads once', { skip: domSkip }, async () => {
  const f = fixture();
  try {
    const imports = await Promise.all([f.panel.dispatch('import-archive'), f.panel.dispatch('import-archive')]);
    assert.equal(imports[0].reason, 'cancelled');
    assert.equal(f.selections(), 1);
    assert.equal(f.imports(), 0);
    const downloads = await Promise.all([f.panel.dispatch('export-archive'), f.panel.dispatch('export-archive')]);
    assert.equal(downloads[0].status, 'ok');
    assert.equal(f.downloads(), 1);
  } finally { f.close(); }
});

test('file selection failure returns its stage and emits one error notice', { skip: domSkip }, async () => {
  const f = fixture({ chooseText: async () => { throw Object.assign(Error('read failed'), { stage: 'read' }); } });
  try {
    const outcome = await f.panel.dispatch('import-archive');
    assert.equal(outcome.status, 'error');
    assert.equal(outcome.stage, 'read');
    assert.equal(f.window.document.querySelectorAll('.wk-toast').length, 1);
    assert.match(f.window.document.querySelector('.wk-toast').textContent, /read failed/);
    assert.equal(f.imports(), 0);
  } finally { f.close(); }
});

test('committed import with projection failure stays partial', { skip: domSkip }, async () => {
  const f = fixture({
    chooseText: async () => ({ status: 'selected', text: '{}' }),
    importArchive: async () => ({ status: 'partial', completed: ['persistence'], error: 'projection failed', report: { added: 1 } }),
  });
  try {
    const outcome = await f.panel.dispatch('import-archive');
    assert.equal(outcome.status, 'partial');
    assert.deepEqual(outcome.completed, ['select', 'parse', 'persistence']);
    assert.equal(f.imports(), 1);
  } finally { f.close(); }
});

test('disposed picker cannot resume an import', { skip: domSkip }, async () => {
  const waiting = deferred();
  const f = fixture({ chooseText: () => waiting.promise });
  const operation = f.panel.dispatch('import-archive');
  await tick();
  f.panel.dispose();
  waiting.resolve({ status: 'selected', text: '{}' });
  assert.equal((await operation).reason, 'disposed');
  assert.equal(f.imports(), 0);
  f.close();
});

test('dispose after export preparation prevents a late DOM download', { skip: domSkip }, async () => {
  const waiting = deferred();
  const f = fixture({ exportArchive: () => waiting.promise });
  const operation = f.panel.dispatch('export-archive');
  await tick();
  f.panel.dispose();
  waiting.resolve({ snapshotCount: 1 });
  const outcome = await operation;
  assert.equal(outcome.status, 'skipped');
  assert.equal(outcome.reason, 'disposed');
  assert.deepEqual(outcome.completed, ['export']);
  assert.equal(f.downloads(), 0);
  f.close();
});

test('dispose prevents late presentation but still reports the business refresh settlement', { skip: domSkip }, async () => {
  const pending = deferred();
  const f = fixture({ run: () => pending.promise });
  const operation = f.panel.dispatch('refresh');
  await tick();
  f.panel.dispose();
  pending.resolve({ status: 'ok', completed: ['calculation'], result: result() });
  assert.equal((await operation).status, 'ok');
  assert.deepEqual(f.settled, ['ok']);
  assert.equal((await f.panel.dispatch('sync')).reason, 'disposed');
  f.close();
});
