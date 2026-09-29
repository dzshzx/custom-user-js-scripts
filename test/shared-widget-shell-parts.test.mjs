import test from 'node:test';
import assert from 'node:assert/strict';
import { createDomWindow, domSkip } from './helpers/dom-env.mjs';

import {
  createDragAnchor,
  createHoverExpansion,
  createPanelPlacement,
} from '../src/userscripts/shared/shared-widget-shell.lib.js';

const WIDGET_SIZE = { width: 154, height: 60 };

function createTimers() {
  const queue = [];
  return {
    queue,
    setTimeout(handler, delay) {
      const timer = { handler, delay };
      queue.push(timer);
      return timer;
    },
    clearTimeout(timer) {
      const index = queue.indexOf(timer);
      if (index >= 0) queue.splice(index, 1);
    },
    fire() {
      queue.shift()?.handler();
    },
  };
}

function setup({ coarse = false } = {}) {
  const window = createDomWindow();
  const widget = window.document.createElement('section');
  const button = window.document.createElement('button');
  widget.append(button);
  window.document.body.append(widget);
  const timers = createTimers();
  const moves = [];
  const drops = [];
  const anchor = createDragAnchor({
    anchorEl: widget,
    handleEl: button,
    windowObject: window,
    measure: () => WIDGET_SIZE,
    dock: false,
    timers,
    onDragStart: () => expansion.setExpanded(false),
    onMove: (position) => moves.push({ ...position }),
    onDrop: (position) => drops.push({ left: position.left, top: position.top }),
  });
  const expansion = createHoverExpansion({
    container: widget,
    trigger: button,
    isCoarsePointer: () => coarse,
    isSuppressed: () => anchor.isDragSuppressed(),
    timers,
  });
  return { window, widget, button, timers, anchor, expansion, moves, drops };
}

function pointer(window, type, props) {
  const event = new window.Event(type, { bubbles: true, cancelable: true });
  return Object.assign(event, { pointerId: 1, button: 0, clientX: 0, clientY: 0, ...props });
}

test('drag anchor clamps a saved position inside the viewport', { skip: domSkip }, () => {
  const { widget, anchor, moves } = setup();
  const position = anchor.applyPosition({ left: -50, top: 900 });
  // 1024x768 happy-dom viewport, 12px safe margin, 154x60 widget.
  assert.deepEqual(position, { left: 12, top: 696, dockSide: null });
  assert.equal(widget.style.left, '12px');
  assert.equal(widget.style.top, '696px');
  assert.equal(widget.style.bottom, 'auto');
  assert.deepEqual(moves.at(-1), position);
});

test('dragging moves the anchor, collapses the widget and persists once', { skip: domSkip }, () => {
  const { window, widget, button, timers, anchor, expansion, drops } = setup();
  anchor.applyPosition({ left: 100, top: 100 });
  expansion.setExpanded(true);

  button.dispatchEvent(pointer(window, 'pointerdown', { pointerId: 7, clientX: 100, clientY: 100 }));
  assert.ok(widget.classList.contains('is-dragging'));
  button.dispatchEvent(pointer(window, 'pointermove', { pointerId: 7, clientX: 150, clientY: 180 }));
  assert.equal(anchor.isDragSuppressed(), true);
  assert.equal(widget.classList.contains('is-expanded'), false);
  assert.equal(widget.style.left, '150px');
  assert.equal(widget.style.top, '180px');

  button.dispatchEvent(pointer(window, 'pointerup', { pointerId: 7 }));
  assert.equal(widget.classList.contains('is-dragging'), false);
  assert.deepEqual(drops, [{ left: 150, top: 180 }]);
  assert.equal(timers.queue.length, 1);
  timers.fire();
  assert.equal(anchor.isDragSuppressed(), false);
});

test('hover expansion waits for the intent delay and mouseleave cancels it', { skip: domSkip }, () => {
  const { window, widget, timers } = setup();
  widget.dispatchEvent(new window.Event('mouseenter'));
  assert.equal(widget.classList.contains('is-expanded'), false);
  assert.equal(timers.queue[0].delay, 150);
  timers.fire();
  assert.equal(widget.classList.contains('is-expanded'), true);

  widget.dispatchEvent(new window.Event('mouseleave'));
  assert.equal(widget.classList.contains('is-expanded'), false);

  widget.dispatchEvent(new window.Event('mouseenter'));
  widget.dispatchEvent(new window.Event('mouseleave'));
  assert.equal(timers.queue.length, 0);
  assert.equal(widget.classList.contains('is-expanded'), false);
});

test('coarse pointers toggle expansion via click and swallow the post-drag click', { skip: domSkip }, () => {
  const { window, widget, button, timers } = setup({ coarse: true });
  widget.dispatchEvent(new window.Event('mouseenter'));
  assert.equal(timers.queue.length, 0);

  button.dispatchEvent(new window.Event('click'));
  assert.equal(widget.classList.contains('is-expanded'), true);
  button.dispatchEvent(new window.Event('click'));
  assert.equal(widget.classList.contains('is-expanded'), false);

  button.dispatchEvent(pointer(window, 'pointerdown', { pointerId: 3, clientX: 100, clientY: 100 }));
  button.dispatchEvent(pointer(window, 'pointermove', { pointerId: 3, clientX: 140, clientY: 100 }));
  button.dispatchEvent(pointer(window, 'pointerup', { pointerId: 3 }));
  button.dispatchEvent(new window.Event('click'));
  assert.equal(widget.classList.contains('is-expanded'), false);

  timers.fire();
  button.dispatchEvent(new window.Event('click'));
  assert.equal(widget.classList.contains('is-expanded'), true);
});

test('destroy drops listeners, pending hover and drag state', { skip: domSkip }, () => {
  const { window, widget, button, timers, anchor, expansion, drops } = setup();
  anchor.applyPosition({ left: 100, top: 100 });
  widget.dispatchEvent(new window.Event('mouseenter'));
  const staleHover = timers.queue[0].handler;
  button.dispatchEvent(pointer(window, 'pointerdown', { pointerId: 9, clientX: 100, clientY: 100 }));

  expansion.destroy();
  anchor.destroy();
  staleHover();
  assert.equal(widget.classList.contains('is-expanded'), false);
  assert.equal(widget.classList.contains('is-dragging'), false);

  button.dispatchEvent(pointer(window, 'pointermove', { pointerId: 9, clientX: 300, clientY: 300 }));
  button.dispatchEvent(pointer(window, 'pointerup', { pointerId: 9 }));
  widget.dispatchEvent(new window.Event('focusin'));
  assert.equal(widget.style.left, '100px');
  assert.deepEqual(drops, []);
  assert.equal(widget.classList.contains('is-expanded'), false);
});

test('panel placement prefers the top side and flips below near the top edge', { skip: domSkip }, async () => {
  const window = createDomWindow({ globalWindow: true });
  Object.defineProperty(window.document.documentElement, 'clientWidth', { value: 1024 });
  Object.defineProperty(window.document.documentElement, 'clientHeight', { value: 768 });
  const reference = window.document.createElement('div');
  const floating = window.document.createElement('div');
  floating.style.position = 'fixed';
  window.document.body.append(reference, floating);
  Object.defineProperty(floating, 'offsetWidth', { value: 248 });
  Object.defineProperty(floating, 'offsetHeight', { value: 140 });
  let top = 500;
  reference.getBoundingClientRect = () => ({
    x: 620,
    y: top,
    left: 620,
    top,
    width: 154,
    height: 60,
    right: 774,
    bottom: top + 60,
  });
  const applied = [];
  const placement = createPanelPlacement({ reference, floating, placement: 'top-end', apply: (r) => applied.push(r) });

  await placement.update();
  assert.equal(applied.at(-1).placement, 'top-end');
  assert.equal(applied.at(-1).x, 774 - 248);
  assert.equal(applied.at(-1).y, 500 - 8 - 140);

  top = 10;
  await placement.update();
  assert.equal(applied.at(-1).placement, 'bottom-end');
  assert.equal(applied.at(-1).y, 10 + 60 + 8);
  placement.stop();
});
