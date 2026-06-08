import test from 'node:test';
import assert from 'node:assert/strict';

await import('../src/userscripts/codex-quota-compass/codex-quota-compass-panel-shell.lib.js');

const { createFloatingPanelShell } = globalThis.CodexQuotaCompassPanelShellLib;

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(...classes) {
    classes.forEach((className) => this.values.add(className));
  }

  remove(...classes) {
    classes.forEach((className) => this.values.delete(className));
  }

  contains(className) {
    return this.values.has(className);
  }

  toggle(className, force) {
    const shouldAdd = force ?? !this.values.has(className);
    if (shouldAdd) {
      this.values.add(className);
    } else {
      this.values.delete(className);
    }
    return shouldAdd;
  }
}

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this.dataset = {};
    this.classList = new FakeClassList();
    this.listeners = new Map();
    this.hidden = false;
    this.textContent = '';
    this.id = '';
    this.attributes = new Map();
  }

  set innerHTML(value) {
    this._innerHTML = value;
    if (String(value).includes('cqc-button')) {
      this.children = createShellChildren(this);
    }
  }

  get innerHTML() {
    return this._innerHTML || '';
  }

  append(...nodes) {
    nodes.forEach((node) => {
      node.parentNode = this;
      this.children.push(node);
    });
  }

  appendChild(node) {
    this.append(node);
    return node;
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  dispatchEvent(event) {
    event.target ??= this;
    for (const listener of this.listeners.get(event.type) || []) {
      listener(event);
    }
  }

  querySelector(selector) {
    return findElement(this.children, (node) => node.matches(selector));
  }

  closest(selector) {
    for (let node = this; node; node = node.parentNode) {
      if (node.matches(selector)) return node;
    }
    return null;
  }

  matches(selector) {
    if (selector === ':hover') return false;
    if (selector === '[data-action]') return Boolean(this.dataset.action);
    const actionMatch = selector.match(/^\[data-action="([^"]+)"\]$/);
    if (actionMatch) return this.dataset.action === actionMatch[1];
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
    return false;
  }

  contains(node) {
    if (node === this) return true;
    return this.children.some((child) => child.contains(node));
  }

  getBoundingClientRect() {
    const width = readPixels(this.style.width) || (this.classList.contains('cqc-panel') ? 560 : 168);
    const height = readPixels(this.style.height) || (this.classList.contains('cqc-panel') ? 240 : 42);
    const left = readPixels(this.style.left) || this.rect?.left || 40;
    const top = readPixels(this.style.top) || this.rect?.top || 76;
    return {
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
    };
  }

  cloneNode(deep = false) {
    const clone = new FakeElement(this.tagName);
    clone.id = this.id;
    clone.hidden = this.hidden;
    clone.textContent = this.textContent;
    clone.attributes = new Map(this.attributes);
    clone.dataset = { ...this.dataset };
    clone.style = { ...this.style };
    clone.classList.add(...this.classList.values);
    if (deep) {
      this.children.forEach((child) => clone.append(child.cloneNode(true)));
    }
    return clone;
  }

  blur() {}

  setPointerCapture() {}

  hasPointerCapture() {
    return false;
  }

  releasePointerCapture() {}
}

class FakeDocument {
  constructor() {
    this.documentElement = new FakeElement('html');
    this.head = new FakeElement('head');
    this.documentElement.append(this.head);
    this.listeners = new Map();
  }

  createElement(tagName) {
    return new FakeElement(tagName);
  }

  getElementById(id) {
    return findElement([this.documentElement], (node) => node.id === id);
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }
}

function createNode(tagName, classNames = [], options = {}) {
  const node = new FakeElement(tagName);
  node.classList.add(...classNames);
  node.dataset = { ...options.dataset };
  node.textContent = options.textContent || '';
  node.hidden = Boolean(options.hidden);
  return node;
}

function createShellChildren(root) {
  const button = createNode('button', ['cqc-button'], { dataset: { action: 'toggle' } });
  button.setAttribute('aria-expanded', 'false');
  button.append(createNode('span', ['cqc-dot']));
  const buttonText = createNode('span', ['cqc-button-text']);
  buttonText.append(createNode('span', ['cqc-button-title'], { textContent: 'Quota' }));
  buttonText.append(createNode('span', ['cqc-status'], { textContent: 'Idle' }));
  button.append(buttonText);

  const panel = createNode('div', ['cqc-panel'], { hidden: true });
  const header = createNode('div', ['cqc-panel-header']);
  const title = createNode('div', ['cqc-panel-title']);
  title.append(createNode('span', ['cqc-dot']));
  title.append(createNode('span', [], { textContent: 'Quota panel' }));
  const actions = createNode('div', ['cqc-panel-actions']);
  actions.append(createNode('button', ['cqc-refresh'], { dataset: { action: 'refresh' } }));
  actions.append(createNode('button', ['cqc-icon-button'], { dataset: { action: 'close' } }));
  header.append(title, actions);
  panel.append(header, createNode('div', ['cqc-content']));

  button.parentNode = root;
  panel.parentNode = root;
  return [button, panel];
}

function findElement(nodes, predicate) {
  for (const node of nodes) {
    if (predicate(node)) return node;
    const childMatch = findElement(node.children, predicate);
    if (childMatch) return childMatch;
  }
  return null;
}

function readPixels(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^(-?\d+(?:\.\d+)?)px$/);
  return match ? Number(match[1]) : null;
}

function createWindowAdapter() {
  return {
    innerWidth: 1024,
    innerHeight: 768,
    addEventListener() {},
    requestAnimationFrame(callback) {
      callback();
    },
    setTimeout(callback) {
      callback();
      return 1;
    },
    clearTimeout() {},
  };
}

function createStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  const reads = [];
  return {
    reads,
    getItem(key) {
      reads.push(key);
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

function createMountedShell(options = {}) {
  const document = new FakeDocument();
  const window = createWindowAdapter();
  const storage = options.storage || createStorage();
  const actions = [];
  const shell = createFloatingPanelShell({
    rootId: 'cqc-test-root',
    labels: {
      panelTitle: 'Quota panel',
      buttonTitle: 'Quota',
      buttonAriaOpen: 'Open quota panel',
      statusIdle: 'Idle',
      actionRefresh: 'Refresh',
      closeAria: 'Close',
    },
    positionKey: options.positionKey || 'codexQuotaCompassButtonPosition',
    document,
    window,
    storage,
    onAction: (action) => actions.push(action),
  });

  const mounted = shell.mount();
  assert.ok(mounted);
  return { shell: mounted, document, storage, actions };
}

test('createFloatingPanelShell mounts shell and preserves injected position key', () => {
  const storage = createStorage({
    codexQuotaCompassButtonPosition: JSON.stringify({ left: 10, top: 90, dockSide: 'left' }),
  });
  const { shell, storage: mountedStorage } = createMountedShell({ storage });
  const refs = shell.refs();

  assert.equal(refs.root.id, 'cqc-test-root');
  assert.equal(shell.isOpen(), false);
  assert.equal(refs.panel.hidden, true);
  assert.equal(refs.button.getAttribute('aria-expanded'), 'false');
  assert.equal(refs.statusNode.textContent, 'Idle');
  assert.deepEqual(mountedStorage.reads, ['codexQuotaCompassButtonPosition']);
  assert.equal(refs.button.style.left, '8px');
  assert.equal(refs.button.style.top, '90px');
  assert.equal(refs.button.dataset.dockSide, 'left');
  assert.equal(refs.button.classList.contains('is-docked'), true);
});

test('createFloatingPanelShell updates status and delegates shell actions', () => {
  const { shell, actions } = createMountedShell();
  const refs = shell.refs();

  shell.setStatus('Ready', 'success');
  assert.equal(refs.statusNode.textContent, 'Ready');
  assert.equal(refs.statusNode.dataset.tone, 'success');

  refs.root.dispatchEvent({ type: 'click', target: refs.button });
  refs.root.dispatchEvent({ type: 'click', target: refs.root.querySelector('[data-action="refresh"]') });
  refs.root.dispatchEvent({ type: 'click', target: refs.root.querySelector('[data-action="close"]') });

  assert.deepEqual(actions, ['toggle', 'refresh', 'close']);
});

test('createFloatingPanelShell opens, resizes, and closes panel state', () => {
  const { shell } = createMountedShell();
  const refs = shell.refs();

  shell.openPanel();
  assert.equal(shell.isOpen(), true);
  assert.equal(refs.panel.hidden, false);
  assert.equal(refs.panel.classList.contains('is-open'), true);
  assert.equal(refs.button.classList.contains('is-active'), true);
  assert.equal(refs.button.getAttribute('aria-expanded'), 'true');

  shell.schedulePanelResize();
  assert.equal(refs.panel.style.width, '560px');

  shell.closePanel();
  assert.equal(shell.isOpen(), false);
  assert.equal(refs.panel.hidden, true);
  assert.equal(refs.button.classList.contains('is-active'), false);
  assert.equal(refs.button.getAttribute('aria-expanded'), 'false');
});
