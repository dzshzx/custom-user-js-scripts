import test from 'node:test';
import assert from 'node:assert/strict';

import { createWidgetLayoutRuntime } from '../src/userscripts/web-page-assistant/web-page-assistant-widget-layout.lib.js';

function createClassList() {
  const values = new Set();
  return {
    add(value) {
      values.add(value);
    },
    remove(value) {
      values.delete(value);
    },
    toggle(value, force) {
      if (force) values.add(value);
      else values.delete(value);
    },
    contains(value) {
      return values.has(value);
    },
  };
}

function createWidgetStyle(rect) {
  const values = {};
  return {
    set left(value) {
      values.left = value;
      rect.left = Number.parseInt(value, 10);
      rect.right = rect.left + rect.width;
    },
    get left() {
      return values.left;
    },
    set top(value) {
      values.top = value;
      rect.top = Number.parseInt(value, 10);
      rect.bottom = rect.top + rect.height;
    },
    get top() {
      return values.top;
    },
    set right(value) {
      values.right = value;
    },
    get right() {
      return values.right;
    },
    set bottom(value) {
      values.bottom = value;
    },
    get bottom() {
      return values.bottom;
    },
    values,
  };
}

function createPanel() {
  const properties = new Map();
  return {
    offsetHeight: 140,
    style: {
      properties,
      setProperty(name, value) {
        properties.set(name, value);
      },
    },
  };
}

function createWidget(rectOverrides = {}) {
  const rect = {
    left: 700,
    top: 500,
    width: 154,
    height: 60,
    right: 854,
    bottom: 560,
    ...rectOverrides,
  };
  rect.right = rect.left + rect.width;
  rect.bottom = rect.top + rect.height;

  const panel = createPanel();
  return {
    rect,
    panel,
    classList: createClassList(),
    style: createWidgetStyle(rect),
    listeners: new Map(),
    addEventListener(type, handler) {
      const handlers = this.listeners.get(type) || new Set();
      handlers.add(handler);
      this.listeners.set(type, handlers);
    },
    removeEventListener(type, handler) {
      this.listeners.get(type)?.delete(handler);
    },
    contains(node) {
      return node === this;
    },
    getBoundingClientRect() {
      return { ...rect };
    },
    querySelector(selector) {
      return selector === '.part-widget-panel' ? panel : null;
    },
    dispatch(type, event = {}) {
      for (const handler of this.listeners.get(type) || []) handler(event);
    },
  };
}

function createButton() {
  return {
    listeners: new Map(),
    captures: new Set(),
    addEventListener(type, handler) {
      const handlers = this.listeners.get(type) || new Set();
      handlers.add(handler);
      this.listeners.set(type, handlers);
    },
    removeEventListener(type, handler) {
      this.listeners.get(type)?.delete(handler);
    },
    setPointerCapture(pointerId) {
      this.captures.add(pointerId);
    },
    hasPointerCapture(pointerId) {
      return this.captures.has(pointerId);
    },
    releasePointerCapture(pointerId) {
      this.captures.delete(pointerId);
    },
    dispatch(type, event = {}) {
      for (const handler of this.listeners.get(type) || []) handler(event);
    },
  };
}

function normalizeWidgetPosition(value) {
  if (!value || typeof value !== 'object') return null;
  const left = Number(value.left);
  const top = Number(value.top);
  if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
  return { left: Math.round(left), top: Math.round(top) };
}

function createHarness(options = {}) {
  const viewport = options.viewport || { width: 800, height: 600 };
  const persisted = [];
  const positions = [];
  const warnings = [];
  const timers = [];
  const createWidgetLayoutRuntime = createHarness.factory;
  const runtime = createWidgetLayoutRuntime({
    normalizeWidgetPosition,
    clampNumber(value, min, max) {
      return Math.min(Math.max(min, value), max);
    },
    getViewportSize: () => viewport,
    async persistPosition(position) {
      persisted.push(position);
    },
    onPositionChange(position) {
      positions.push(position);
    },
    setTimeout(handler, delay) {
      const entry = { handler, delay };
      timers.push(entry);
      return entry;
    },
    clearTimeout(handle) {
      const index = timers.indexOf(handle);
      if (index >= 0) timers.splice(index, 1);
    },
    isCoarsePointer: () => options.isCoarsePointer === true,
    logger: {
      warn(...args) {
        warnings.push(args);
      },
    },
    constants: {
      buttonSize: 52,
      widgetWidth: 154,
      widgetHeight: 60,
      panelWidth: 248,
      panelGap: 8,
      safeMargin: 12,
      defaultOffset: 18,
    },
  });

  return { runtime, viewport, persisted, positions, warnings, timers };
}

createHarness.factory = createWidgetLayoutRuntime;

test('widget layout runtime clamps saved position inside viewport', () => {
  const harness = createHarness();
  const widget = createWidget();
  const button = createButton();

  harness.runtime.attach(widget, button, { left: -50, top: 900 });
  const position = harness.runtime.applyPosition();

  assert.deepEqual(position, { left: 12, top: 528 });
  assert.equal(widget.style.left, '12px');
  assert.equal(widget.style.top, '528px');
  assert.deepEqual(harness.positions.at(-1), { left: 12, top: 528 });
});

test('widget layout runtime places panel above or below the trigger', () => {
  const harness = createHarness();
  const bottomWidget = createWidget({ left: 620, top: 500 });
  const bottomButton = createButton();

  harness.runtime.attach(bottomWidget, bottomButton, { left: 620, top: 500 });
  harness.runtime.applyPosition();
  assert.equal(bottomWidget.panel.style.properties.get('--part-panel-origin'), 'bottom right');
  assert.equal(bottomWidget.panel.style.properties.get('--part-panel-width'), '248px');

  const topHarness = createHarness();
  const topWidget = createWidget({ left: 620, top: 10 });
  const topButton = createButton();
  topHarness.runtime.attach(topWidget, topButton, { left: 620, top: 10 });
  topHarness.runtime.applyPosition();
  assert.equal(topWidget.panel.style.properties.get('--part-panel-origin'), 'top right');
});

test('widget layout runtime persists clamped drag position and resets expansion suppression', async () => {
  const harness = createHarness();
  const widget = createWidget({ left: 100, top: 100 });
  const button = createButton();
  harness.runtime.attach(widget, button, { left: 100, top: 100 });
  harness.runtime.applyPosition();

  button.dispatch('pointerdown', {
    button: 0,
    pointerId: 7,
    clientX: 100,
    clientY: 100,
  });
  button.dispatch('pointermove', {
    pointerId: 7,
    clientX: 150,
    clientY: 180,
  });

  assert.equal(harness.runtime.isExpansionSuppressed(), true);
  assert.equal(widget.classList.contains('is-expanded'), false);
  assert.equal(widget.style.left, '150px');
  assert.equal(widget.style.top, '180px');

  button.dispatch('pointerup', { pointerId: 7 });
  assert.deepEqual(harness.persisted, [{ left: 150, top: 180 }]);
  assert.equal(button.hasPointerCapture(7), false);
  assert.equal(harness.timers.length, 1);

  harness.timers[0].handler();
  assert.equal(harness.runtime.isExpansionSuppressed(), false);
});

test('hover expansion waits for the intent delay and mouseleave cancels it', () => {
  const harness = createHarness();
  const widget = createWidget({ left: 100, top: 100 });
  const button = createButton();
  harness.runtime.attach(widget, button, { left: 100, top: 100 });
  harness.runtime.applyPosition();

  widget.dispatch('mouseenter');
  assert.equal(widget.classList.contains('is-expanded'), false);
  assert.equal(harness.timers.length, 1);
  assert.equal(harness.timers[0].delay, 150);

  // Firing a real timer consumes it; mirror that in the harness queue.
  harness.timers.splice(0, 1)[0].handler();
  assert.equal(widget.classList.contains('is-expanded'), true);

  widget.dispatch('mouseleave');
  assert.equal(widget.classList.contains('is-expanded'), false);

  // A quick pass-through cancels the pending timer and never expands.
  widget.dispatch('mouseenter');
  widget.dispatch('mouseleave');
  assert.equal(harness.timers.length, 0);
  assert.equal(widget.classList.contains('is-expanded'), false);
});

test('coarse pointers toggle expansion via click and swallow the post-drag click', () => {
  const harness = createHarness({ isCoarsePointer: true });
  const widget = createWidget({ left: 100, top: 100 });
  const button = createButton();
  harness.runtime.attach(widget, button, { left: 100, top: 100 });
  harness.runtime.applyPosition();

  // No hover intent timer is armed on coarse pointers.
  widget.dispatch('mouseenter');
  assert.equal(harness.timers.length, 0);
  assert.equal(widget.classList.contains('is-expanded'), false);

  button.dispatch('click');
  assert.equal(widget.classList.contains('is-expanded'), true);
  button.dispatch('click');
  assert.equal(widget.classList.contains('is-expanded'), false);

  button.dispatch('pointerdown', { button: 0, pointerId: 3, clientX: 100, clientY: 100 });
  button.dispatch('pointermove', { pointerId: 3, clientX: 140, clientY: 100 });
  button.dispatch('pointerup', { pointerId: 3 });
  button.dispatch('click');
  assert.equal(widget.classList.contains('is-expanded'), false);

  harness.timers.at(-1).handler();
  button.dispatch('click');
  assert.equal(widget.classList.contains('is-expanded'), true);
});

test('reattach clears old hover callbacks before binding the next widget', () => {
  const harness = createHarness();
  const oldWidget = createWidget();
  const oldButton = createButton();
  const nextWidget = createWidget();
  const nextButton = createButton();
  harness.runtime.attach(oldWidget, oldButton);
  oldWidget.dispatch('mouseenter');
  const staleHover = harness.timers[0].handler;

  harness.runtime.attach(nextWidget, nextButton);
  staleHover();
  assert.equal(oldWidget.classList.contains('is-expanded'), false);
  assert.equal(nextWidget.classList.contains('is-expanded'), false);
  assert.equal([...oldWidget.listeners.values()].every((handlers) => handlers.size === 0), true);
});

test('reattach releases pointer capture and dispose removes the active binding', () => {
  const harness = createHarness();
  const oldWidget = createWidget();
  const oldButton = createButton();
  harness.runtime.attach(oldWidget, oldButton);
  oldButton.dispatch('pointerdown', {
    button: 0,
    pointerId: 9,
    clientX: 100,
    clientY: 100,
  });
  assert.equal(oldButton.hasPointerCapture(9), true);

  const nextWidget = createWidget();
  const nextButton = createButton();
  harness.runtime.attach(nextWidget, nextButton);
  assert.equal(oldButton.hasPointerCapture(9), false);
  harness.runtime.dispose();
  assert.equal([...nextWidget.listeners.values()].every((handlers) => handlers.size === 0), true);
  assert.equal([...nextButton.listeners.values()].every((handlers) => handlers.size === 0), true);
});
