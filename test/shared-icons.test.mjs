import test from 'node:test';
import assert from 'node:assert/strict';

import { ICON_NAMES, iconSvg } from '../src/userscripts/shared/shared-icons.lib.js';

const EXPECTED_ICONS = [
  'x',
  'refresh-cw',
  'settings',
  'search',
  'chevron-left',
  'chevron-right',
  'arrow-left',
  'star',
  'check',
  'alert-triangle',
  'loader',
];

test('ICON_NAMES lists the vendored Lucide set', () => {
  assert.deepEqual([...ICON_NAMES].sort(), [...EXPECTED_ICONS].sort());
});

test('iconSvg returns a consistent accessible SVG string for every icon', () => {
  for (const name of ICON_NAMES) {
    const svg = iconSvg(name);
    assert.ok(svg.startsWith('<svg'), name);
    assert.ok(svg.endsWith('</svg>'), name);
    for (const fragment of [
      'viewBox="0 0 24 24"',
      'fill="none"',
      'stroke="currentColor"',
      'stroke-width="2"',
      'stroke-linecap="round"',
      'stroke-linejoin="round"',
      'width="16"',
      'height="16"',
      'aria-hidden="true"',
      'focusable="false"',
      `wk-icon-${name}`,
    ]) {
      assert.ok(svg.includes(fragment), `${name} missing ${fragment}`);
    }
  }
});

test('iconSvg honors size and strokeWidth options', () => {
  const svg = iconSvg('x', { size: 20, strokeWidth: 1.5 });
  assert.ok(svg.includes('width="20"'));
  assert.ok(svg.includes('height="20"'));
  assert.ok(svg.includes('stroke-width="1.5"'));
});

test('iconSvg rejects unknown names and non-numeric sizing', () => {
  assert.throws(() => iconSvg('nope'), /unknown icon "nope"/);
  assert.throws(() => iconSvg('nope'), /alert-triangle/);
  assert.throws(() => iconSvg('x', { size: '16px; color: red' }));
  assert.throws(() => iconSvg('x', { strokeWidth: 0 }));
});
