import test from 'node:test';
import assert from 'node:assert/strict';

await import('../src/userscripts/codex-quota-compass/codex-quota-compass-panel-shell-markup.lib.js');

const { createShellMarkup } = globalThis.CodexQuotaCompassPanelShellMarkupLib;

test('createShellMarkup escapes labels and keeps shell actions stable', () => {
  const html = createShellMarkup({
    buttonAriaOpen: 'Open <quota>',
    buttonTitle: 'Quota & Usage',
    statusIdle: 'Idle "now"',
    panelTitle: 'Panel <title>',
    actionRefresh: 'Refresh',
    closeAria: 'Close',
  });

  assert.match(html, /aria-label="Open &lt;quota&gt;"/);
  assert.match(html, /Quota &amp; Usage/);
  assert.match(html, /Idle &quot;now&quot;/);
  assert.match(html, /Panel &lt;title&gt;/);
  assert.match(html, /data-action="toggle"/);
  assert.match(html, /data-action="refresh"/);
  assert.match(html, /data-action="close"/);
  assert.match(html, /class="cqc-content"/);
});
