import test from 'node:test';
import assert from 'node:assert/strict';

import { createShellStyles } from '../src/userscripts/codex-quota-compass/codex-quota-compass-panel-shell-styles.lib.js';

test('createShellStyles bridges CQC variables onto the shared kit tokens', () => {
  const css = createShellStyles('quota-root');

  assert.match(css, /#quota-root \{/);
  assert.match(css, /--cqc-primary: var\(--wk-accent\)/);
  assert.match(css, /--cqc-surface: var\(--wk-surface\)/);
  assert.match(css, /--cqc-text: var\(--wk-text\)/);
  assert.match(css, /--cqc-border: var\(--wk-border\)/);
  assert.match(css, /--cqc-danger: var\(--wk-danger\)/);
  assert.match(css, /--cqc-shadow-panel: var\(--wk-shadow-panel\)/);
  // The unused --cqc-accent token is gone.
  assert.doesNotMatch(css, /--cqc-accent/);
});

test('createShellStyles themes dark through data-wk-theme, never the media query', () => {
  const css = createShellStyles('quota-root');

  assert.match(css, /#quota-root\[data-wk-theme="dark"\] \{/);
  assert.doesNotMatch(css, /prefers-color-scheme/);
});

test('createShellStyles keeps the 168x42 pill and docked shrink visuals', () => {
  const css = createShellStyles('quota-root');

  assert.match(css, /#quota-root \.cqc-button \{/);
  assert.match(css, /width: 168px/);
  assert.match(css, /height: 42px/);
  assert.match(css, /#quota-root \.cqc-button\[data-wk-docked\] \{/);
  assert.match(css, /width: 42px/);
  assert.match(css, /\.cqc-button-text \{/);
  // The content container stays a CSS query container for compact layouts.
  assert.match(css, /container-type: inline-size/);
});
