import test from 'node:test';
import assert from 'node:assert/strict';
import { createDomWindow, domSkip } from './helpers/dom-env.mjs';

import { createWidgetShell } from '../src/userscripts/shared/shared-widget-shell.lib.js';

const POSITION_KEY = 'wk-test:position';

function createStorageAdapter(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    get(key) {
      return map.has(key) ? map.get(key) : null;
    },
    set(key, value) {
      map.set(key, String(value));
    },
  };
}

function setup({ storage, ...overrides } = {}) {
  const window = createDomWindow();
  const root = window.document.createElement('div');
  root.id = 'wk-test-root';
  window.document.body.append(root);
  const events = [];
  const shell = createWidgetShell({
    root,
    buttonId: 'wk-test-button',
    buttonAriaLabel: 'Test widget',
    buttonContent: '<span class="label">T</span>',
    storage,
    positionKey: POSITION_KEY,
    onOpen: () => events.push('open'),
    onClose: () => events.push('close'),
    renderPanelHeader: (header) => {
      header.innerHTML = '<button type="button" class="wk-first">First</button>';
    },
    renderPanelBody: (body) => {
      body.innerHTML = '<button type="button">Body action</button>';
    },
    ...overrides,
  });
  return { window, root, shell, events };
}

function pointerEvent(window, type, props = {}) {
  const event = new window.Event(type, { bubbles: true, cancelable: true });
  return Object.assign(event, { pointerId: 1, button: 0, clientX: 0, clientY: 0, ...props });
}

const flushTimers = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

test('open, close and toggle drive hidden, aria-expanded and callbacks', { skip: domSkip }, async () => {
  const { shell, events } = setup();
  const { buttonEl, panelEl } = shell;

  assert.equal(panelEl.hidden, true);
  assert.equal(shell.isOpen(), false);
  assert.equal(buttonEl.getAttribute('aria-expanded'), 'false');

  shell.open();
  assert.equal(panelEl.hidden, false);
  assert.equal(shell.isOpen(), true);
  assert.equal(buttonEl.getAttribute('aria-expanded'), 'true');
  await flushTimers(50);
  assert.ok(panelEl.classList.contains('is-open'));

  shell.toggle();
  assert.equal(shell.isOpen(), false);
  assert.equal(panelEl.hidden, false);
  await flushTimers(260);
  assert.equal(panelEl.hidden, true);
  assert.equal(buttonEl.getAttribute('aria-expanded'), 'false');
  assert.deepEqual(events, ['open', 'close']);

  shell.toggle();
  assert.equal(shell.isOpen(), true);
  shell.destroy();
});

test('Escape closes the panel while open', { skip: domSkip }, () => {
  const { window, shell } = setup();
  shell.open();
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.equal(shell.isOpen(), false);

  shell.close();
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.equal(shell.isOpen(), false);
  shell.destroy();
});

test('focus moves into the panel on open and returns to the button on close', { skip: domSkip }, () => {
  const { window, shell } = setup();
  shell.open();
  assert.equal(window.document.activeElement, window.document.querySelector('.wk-first'));
  shell.close();
  assert.equal(window.document.activeElement, shell.buttonEl);
  shell.destroy();
});

test('pointerdown outside the button and panel closes the panel', { skip: domSkip }, () => {
  const { window, shell } = setup();
  shell.open();

  shell.panelEl.dispatchEvent(pointerEvent(window, 'pointerdown'));
  assert.equal(shell.isOpen(), true);

  shell.buttonEl.dispatchEvent(pointerEvent(window, 'pointerdown'));
  assert.equal(shell.isOpen(), true);

  window.document.body.dispatchEvent(pointerEvent(window, 'pointerdown'));
  assert.equal(shell.isOpen(), false);
  shell.destroy();
});

test('sub-threshold pointer movement still toggles on click, drag suppresses it', { skip: domSkip }, async () => {
  const { window, shell } = setup();
  const button = shell.buttonEl;

  // |dx| + |dy| = 3 < 4: treated as a click.
  button.dispatchEvent(pointerEvent(window, 'pointerdown', { clientX: 100, clientY: 100 }));
  button.dispatchEvent(pointerEvent(window, 'pointermove', { clientX: 102, clientY: 101 }));
  button.dispatchEvent(pointerEvent(window, 'pointerup', { clientX: 102, clientY: 101 }));
  button.dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.equal(shell.isOpen(), true);

  shell.close();

  // |dx| + |dy| = 6 > 4: a drag, the trailing click is swallowed.
  button.dispatchEvent(pointerEvent(window, 'pointerdown', { clientX: 100, clientY: 100 }));
  button.dispatchEvent(pointerEvent(window, 'pointermove', { clientX: 103, clientY: 103 }));
  button.dispatchEvent(pointerEvent(window, 'pointerup', { clientX: 103, clientY: 103 }));
  button.dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.equal(shell.isOpen(), false);

  await flushTimers();
  button.dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.equal(shell.isOpen(), true);
  shell.destroy();
});

test('dragging repositions, docks near the right edge and persists through storage', { skip: domSkip }, async () => {
  const storage = createStorageAdapter();
  const { window, shell } = setup({ storage });
  const button = shell.buttonEl;

  // Default position against the 1024x768 happy-dom viewport (44px fallback size).
  assert.equal(button.style.top, '76px');
  assert.equal(button.style.left, '956px');

  button.dispatchEvent(pointerEvent(window, 'pointerdown', { clientX: 500, clientY: 300 }));
  button.dispatchEvent(pointerEvent(window, 'pointermove', { clientX: 200, clientY: 300 }));
  button.dispatchEvent(pointerEvent(window, 'pointerup', { clientX: 200, clientY: 300 }));
  assert.equal(button.style.left, '656px');
  assert.equal(button.style.top, '76px');
  assert.equal(button.hasAttribute('data-wk-docked'), false);
  await flushTimers();
  assert.deepEqual(JSON.parse(storage.map.get(POSITION_KEY)), { left: 656, top: 76 });

  button.dispatchEvent(pointerEvent(window, 'pointerdown', { clientX: 200, clientY: 300 }));
  button.dispatchEvent(pointerEvent(window, 'pointermove', { clientX: 500, clientY: 310 }));
  button.dispatchEvent(pointerEvent(window, 'pointerup', { clientX: 500, clientY: 310 }));
  assert.equal(button.dataset.wkDocked, 'right');
  assert.equal(button.style.left, 'auto');
  assert.equal(button.style.right, '8px');
  assert.equal(button.style.top, '86px');
  await flushTimers();
  assert.deepEqual(JSON.parse(storage.map.get(POSITION_KEY)), { left: 972, top: 86, dockSide: 'right' });
  shell.destroy();
});

test('a persisted position wins over the default on startup', { skip: domSkip }, async () => {
  const storage = createStorageAdapter({
    [POSITION_KEY]: JSON.stringify({ left: 120, top: 220 }),
  });
  const { shell } = setup({ storage });
  await flushTimers();
  assert.equal(shell.buttonEl.style.left, '120px');
  assert.equal(shell.buttonEl.style.top, '220px');
  shell.destroy();
});

test('promise-based storage adapters are supported', { skip: domSkip }, async () => {
  const map = new Map([[POSITION_KEY, JSON.stringify({ left: 50, top: 60 })]]);
  const storage = {
    get: async (key) => map.get(key) ?? null,
    set: async (key, value) => {
      map.set(key, value);
    },
  };
  const { window, shell } = setup({ storage });
  await flushTimers();
  assert.equal(shell.buttonEl.style.left, '50px');
  assert.equal(shell.buttonEl.style.top, '60px');

  shell.buttonEl.dispatchEvent(pointerEvent(window, 'pointerdown', { clientX: 0, clientY: 0 }));
  shell.buttonEl.dispatchEvent(pointerEvent(window, 'pointermove', { clientX: -30, clientY: 0 }));
  shell.buttonEl.dispatchEvent(pointerEvent(window, 'pointerup', { clientX: -30, clientY: 0 }));
  await flushTimers();
  assert.deepEqual(JSON.parse(map.get(POSITION_KEY)), { left: 8, top: 60, dockSide: 'left' });
  shell.destroy();
});

test('window resize re-clamps the button into the safe area', { skip: domSkip }, () => {
  const { window, shell } = setup();
  assert.equal(shell.buttonEl.style.left, '956px');

  window.happyDOM.setViewport({ width: 400, height: 300 });
  window.dispatchEvent(new window.Event('resize'));
  assert.equal(shell.buttonEl.style.left, '344px');
  assert.equal(shell.buttonEl.style.top, '76px');
  shell.destroy();
});

test('dock=false disables edge snapping', { skip: domSkip }, () => {
  const { window, shell } = setup({ dock: false, storage: createStorageAdapter() });
  const button = shell.buttonEl;

  button.dispatchEvent(pointerEvent(window, 'pointerdown', { clientX: 0, clientY: 0 }));
  button.dispatchEvent(pointerEvent(window, 'pointermove', { clientX: 30, clientY: 0 }));
  button.dispatchEvent(pointerEvent(window, 'pointerup', { clientX: 30, clientY: 0 }));
  assert.equal(button.hasAttribute('data-wk-docked'), false);
  assert.equal(button.style.left, '968px');
  shell.destroy();
});

test('destroy removes elements and document listeners', { skip: domSkip }, () => {
  const { window, root, shell } = setup();
  shell.open();
  shell.destroy();
  assert.equal(root.children.length, 0);

  window.document.body.dispatchEvent(pointerEvent(window, 'pointerdown'));
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.equal(shell.isOpen(), false);
});

test('buttonClass and panelClass append host classes alongside the kit classes', { skip: domSkip }, () => {
  const { shell } = setup({ buttonClass: 'host-button extra', panelClass: 'host-panel' });

  assert.ok(shell.buttonEl.classList.contains('wk-widget-button'));
  assert.ok(shell.buttonEl.classList.contains('host-button'));
  assert.ok(shell.buttonEl.classList.contains('extra'));
  assert.ok(shell.panelEl.classList.contains('wk-widget-panel'));
  assert.ok(shell.panelEl.classList.contains('host-panel'));
  shell.destroy();
});

test('reposition re-places an open panel and is a no-op when closed', { skip: domSkip }, () => {
  const { shell } = setup();

  shell.reposition();
  assert.equal(shell.panelEl.style.left, '');

  shell.open();
  shell.reposition();
  assert.equal(shell.panelEl.style.width, '560px');
  assert.match(shell.panelEl.style.left, /px$/);
  assert.match(shell.panelEl.style.top, /px$/);
  shell.destroy();
});
