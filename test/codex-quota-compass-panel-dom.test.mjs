import test from 'node:test';
import assert from 'node:assert/strict';
import { createDomWindow, domSkip } from './helpers/dom-env.mjs';

await import('../src/userscripts/codex-quota-compass/codex-quota-compass-panel-dom.lib.js');

const { applyActiveView, readSyncFormValues, isSyncFormEditing } = globalThis.CodexQuotaCompassPanelDomLib;

function contentWith(window, html) {
  const node = window.document.createElement('div');
  node.innerHTML = html;
  return node;
}

test('applyActiveView swaps the details body and highlights the active tab', { skip: domSkip }, () => {
  const window = createDomWindow();
  const contentNode = contentWith(window, `
    <div class="cqc-tabs">
      <button class="cqc-tab is-active" data-view="details">D</button>
      <button class="cqc-tab" data-view="archive">A</button>
    </div>
    <div class="cqc-details">old body</div>
  `);

  const active = applyActiveView(contentNode, { activePanelView: 'archive', html: '<p>new body</p>' });

  assert.equal(active, 'archive');
  assert.match(contentNode.querySelector('.cqc-details').innerHTML, /new body/);
  const tabs = contentNode.querySelectorAll('.cqc-tab');
  assert.equal(tabs[0].classList.contains('is-active'), false);
  assert.equal(tabs[1].classList.contains('is-active'), true);
});

test('applyActiveView tolerates a null content node and a missing details node', { skip: domSkip }, () => {
  const window = createDomWindow();

  assert.equal(applyActiveView(null, { activePanelView: 'history' }), 'history');

  const tabsOnly = contentWith(window, `
    <div class="cqc-tabs">
      <button class="cqc-tab" data-view="details">D</button>
    </div>
  `);
  assert.doesNotThrow(() => applyActiveView(tabsOnly, { activePanelView: 'details', html: '<p>x</p>' }));
  assert.equal(tabsOnly.querySelector('.cqc-tab').classList.contains('is-active'), true);
});

test('readSyncFormValues reads token, gist id, and enabled state', { skip: domSkip }, () => {
  const window = createDomWindow();
  const contentNode = contentWith(window, `
    <div class="cqc-sync-form" data-sync-form>
      <input data-field="token" type="password">
      <input data-field="gistId" type="text">
      <input data-field="enabled" type="checkbox">
    </div>
  `);
  contentNode.querySelector('[data-field="token"]').value = 'ghp_x';
  contentNode.querySelector('[data-field="gistId"]').value = 'gist-1';
  contentNode.querySelector('[data-field="enabled"]').checked = true;

  assert.deepEqual(readSyncFormValues(contentNode), {
    token: 'ghp_x',
    gistId: 'gist-1',
    enabled: true,
  });
});

test('readSyncFormValues returns null when no sync form is rendered', { skip: domSkip }, () => {
  const window = createDomWindow();
  const contentNode = contentWith(window, '<div class="cqc-details">no form here</div>');

  assert.equal(readSyncFormValues(contentNode), null);
});

test('isSyncFormEditing is true only for a focused field inside the sync form', { skip: domSkip }, () => {
  const window = createDomWindow();
  const contentNode = contentWith(window, `
    <div class="cqc-sync-form" data-sync-form>
      <input data-field="token" type="password">
      <button type="button" data-action="save-remote-sync">Save</button>
    </div>
    <button class="outside">elsewhere</button>
  `);
  const input = contentNode.querySelector('[data-field="token"]');
  const saveButton = contentNode.querySelector('[data-action="save-remote-sync"]');
  const outsideButton = contentNode.querySelector('.outside');

  assert.equal(isSyncFormEditing(contentNode, input), true);
  assert.equal(isSyncFormEditing(contentNode, saveButton), false);
  assert.equal(isSyncFormEditing(contentNode, outsideButton), false);
  assert.equal(isSyncFormEditing(contentNode, null), false);
});
