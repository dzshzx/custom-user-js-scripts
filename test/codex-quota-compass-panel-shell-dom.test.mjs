import test from 'node:test';
import assert from 'node:assert/strict';
import { createDomWindow, createMemoryStorage, domSkip } from './helpers/dom-env.mjs';

await import('../src/userscripts/codex-quota-compass/codex-quota-compass-panel-shell-markup.lib.js');
await import('../src/userscripts/codex-quota-compass/codex-quota-compass-panel-shell-styles.lib.js');
await import('../src/userscripts/codex-quota-compass/codex-quota-compass-panel-shell.lib.js');

const { createFloatingPanelShell } = globalThis.CodexQuotaCompassPanelShellLib;

function mountShell(window) {
  const actions = [];
  const shell = createFloatingPanelShell({
    rootId: 'cqc-dom-test-root',
    labels: {
      buttonTitle: 'Quota',
      statusIdle: 'idle',
      panelTitle: 'Panel',
      actionRefresh: 'Refresh',
      closeAria: 'Close',
    },
    document: window.document,
    window,
    storage: createMemoryStorage(),
    onAction: (action, event, node) => actions.push({ action, view: node?.dataset?.view }),
  });
  shell.mount();
  return { shell, actions };
}

test('floating shell routes a button click to the toggle action', { skip: domSkip }, () => {
  const window = createDomWindow();
  const { actions } = mountShell(window);

  window.document.querySelector('.cqc-button').click();

  assert.deepEqual(actions.map((entry) => entry.action), ['toggle']);
});

test('floating shell routes the header close button to the close action', { skip: domSkip }, () => {
  const window = createDomWindow();
  const { actions } = mountShell(window);

  window.document.querySelector('[data-action="close"]').click();

  assert.deepEqual(actions.map((entry) => entry.action), ['close']);
});

test('floating shell delegates tab and sync-form actions from rendered content', { skip: domSkip }, () => {
  const window = createDomWindow();
  const { shell, actions } = mountShell(window);
  const { contentNode } = shell.refs();

  contentNode.innerHTML = `
    <div class="cqc-tabs">
      <button type="button" class="cqc-tab" data-action="switch-view" data-view="archive">Sync</button>
    </div>
    <div class="cqc-details">
      <div class="cqc-sync-form" data-sync-form>
        <input data-field="token" type="password">
        <button type="button" data-action="save-remote-sync">Save</button>
      </div>
    </div>
  `;

  contentNode.querySelector('[data-action="switch-view"]').click();
  contentNode.querySelector('[data-action="save-remote-sync"]').click();

  assert.deepEqual(actions.map((entry) => entry.action), ['switch-view', 'save-remote-sync']);
  assert.equal(actions[0].view, 'archive');
});

test('floating shell exposes the live status node through setStatus', { skip: domSkip }, () => {
  const window = createDomWindow();
  const { shell } = mountShell(window);

  shell.setStatus('Updated', 'success');
  const statusNode = shell.refs().statusNode;

  assert.equal(statusNode.textContent, 'Updated');
  assert.equal(statusNode.dataset.tone, 'success');
});
