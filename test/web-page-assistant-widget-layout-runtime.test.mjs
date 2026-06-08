import test from 'node:test';
import assert from 'node:assert/strict';
import { loadInstallableBlock } from './helpers/installable-block-loader.mjs';

const loadWidgetLayoutRuntimeFactory = () => loadInstallableBlock({
  markerPrefix: 'WEB_PAGE_ASSISTANT_WIDGET_LAYOUT_RUNTIME',
  prefixSource: "const SCRIPT_NAME = 'Web Page Assistant';",
  returnExpression: 'createWidgetLayoutRuntime',
});

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
      this.listeners.set(type, handler);
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
      this.listeners.get(type)?.(event);
    },
  };
}

function createButton() {
  return {
    listeners: new Map(),
    captures: new Set(),
    addEventListener(type, handler) {
      this.listeners.set(type, handler);
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
      this.listeners.get(type)?.(event);
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
      timers.push({ handler, delay });
    },
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

createHarness.factory = await loadWidgetLayoutRuntimeFactory();

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
