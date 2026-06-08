import test from 'node:test';
import assert from 'node:assert/strict';

await import('../src/userscripts/codex-quota-compass/codex-quota-compass-panel-shell-styles.lib.js');

const { createShellStyles } = globalThis.CodexQuotaCompassPanelShellStylesLib;

test('createShellStyles renders scoped shell CSS with injected layout constants', () => {
  const css = createShellStyles('quota-root', {
    BUTTON_FULL_WIDTH: 180,
    BUTTON_HEIGHT: 44,
    PANEL_OPEN_ANIMATION_MS: 250,
    PANEL_CLOSE_ANIMATION_MS: 500,
    PANEL_OPEN_EASING: 'linear',
    PANEL_CLOSE_EASING: 'ease-out',
  });

  assert.match(css, /#quota-root/);
  assert.match(css, /width: 180px/);
  assert.match(css, /min-width: 44px/);
  assert.match(css, /container-type: inline-size/);
  assert.match(css, /left 250ms linear/);
  assert.match(css, /left 500ms ease-out/);
  assert.match(css, /prefers-color-scheme: dark/);
});
