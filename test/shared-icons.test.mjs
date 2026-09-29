import test from 'node:test';
import assert from 'node:assert/strict';
import { h } from 'preact';
import { renderToString } from 'preact-render-to-string';
import { createDomWindow, domSkip } from './helpers/dom-env.mjs';

import { ICON_NAMES, Icon, mountIcon } from '../src/userscripts/shared/shared-icons.lib.jsx';

test('ICON_NAMES lists the icons scripts use', () => {
  assert.deepEqual([...ICON_NAMES].sort(), ['alert-triangle', 'check', 'loader', 'refresh-cw', 'settings', 'x']);
});

test('Icon renders an accessible lucide SVG with shared classes for every name', () => {
  for (const name of ICON_NAMES) {
    const svg = renderToString(h(Icon, { name }));
    assert.ok(svg.startsWith('<svg'), name);
    for (const fragment of [
      'viewBox="0 0 24 24"',
      'fill="none"',
      'stroke="currentColor"',
      'stroke-width="2"',
      'width="16"',
      'height="16"',
      'aria-hidden="true"',
      'focusable="false"',
      `wk-icon wk-icon-${name}`,
    ]) {
      assert.ok(svg.includes(fragment), `${name} missing ${fragment}`);
    }
  }
});

test('Icon honors size and strokeWidth and rejects unknown names', () => {
  const svg = renderToString(h(Icon, { name: 'x', size: 20, strokeWidth: 1.5 }));
  assert.ok(svg.includes('width="20"'));
  assert.ok(svg.includes('stroke-width="1.5"'));
  assert.throws(() => renderToString(h(Icon, { name: 'nope' })), /unknown icon "nope"/);
});

test('mountIcon renders into an existing slot', { skip: domSkip }, () => {
  const window = createDomWindow({ globalDocument: true });
  const slot = window.document.createElement('span');
  mountIcon(slot, 'settings', { size: 14 });
  assert.ok(slot.querySelector('svg.wk-icon-settings'));
  assert.equal(slot.querySelector('svg').getAttribute('width'), '14');
});
