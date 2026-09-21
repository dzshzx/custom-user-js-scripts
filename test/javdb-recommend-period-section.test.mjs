import test from 'node:test';
import assert from 'node:assert/strict';

import { createPeriodSection } from '../src/userscripts/javdb-recommend/javdb-recommend-period-section.lib.js';
import { createDomWindow, domSkip } from './helpers/dom-env.mjs';

const MOVIES = [{
  id: '1',
  number: 'ABC-001',
  title: '标题',
  origin_title: 'Title',
  cover_url: 'https://example.test/covers/a.jpg',
  score: '4.5',
  release_date: '2026-09-01',
}];

test('period metadata is always text and malformed fields use placeholders', { skip: domSkip }, () => {
  const window = createDomWindow();
  const handle = createPeriodSection({
    document: window.document,
    baseUrl: 'https://javdb.com/',
    period: { period: '<em>7</em>', movies_count: '<img src=x>', created_at: '<b>today</b>' },
    mode: 'browse',
    loading: true,
  });
  window.document.body.appendChild(handle.element);

  assert.equal(handle.element.querySelector('.jdb-ra-ph').textContent, '第 — 期 — · — 部');
  assert.equal(handle.element.querySelector('em, img, b'), null);
  assert.equal(handle.element.dataset.period, '<em>7</em>');
  assert.equal(handle.element.querySelectorAll('.jdb-ra-skel').length, 4);
  window.happyDOM.close();
});

test('updates preserve the section and grid and identical content keeps decorated cards', { skip: domSkip }, () => {
  const window = createDomWindow();
  const handle = createPeriodSection({
    document: window.document,
    baseUrl: 'https://javdb.com/',
    period: { period: 7, movies_count: 1, created_at: '2026-09-01T00:00:00Z' },
    loading: true,
  });
  window.document.body.appendChild(handle.element);
  const section = handle.element;
  const grid = section.querySelector('.movie-list');
  grid.dataset.external = 'kept';
  grid.style.setProperty('--jav-card-columns', '7');

  assert.equal(handle.update({ movies: MOVIES, degraded: false }), true);
  const card = grid.querySelector('.item');
  card.classList.add('third-party-decoration');
  card.appendChild(window.document.createElement('button'));
  assert.equal(handle.update({ movies: MOVIES.map(movie => ({ ...movie })), degraded: true }), false);

  assert.equal(handle.element, section);
  assert.equal(section.querySelector('.movie-list'), grid);
  assert.equal(grid.dataset.external, 'kept');
  assert.equal(grid.style.getPropertyValue('--jav-card-columns'), '7');
  assert.equal(grid.querySelector('.item'), card);
  assert.ok(card.classList.contains('third-party-decoration'));
  assert.ok(card.querySelector('button'));
  assert.equal(section.dataset.degraded, 'true');
  window.happyDOM.close();
});

test('filter owns only its marker and preserves external hidden and display state', { skip: domSkip }, () => {
  const window = createDomWindow();
  const handle = createPeriodSection({
    document: window.document,
    baseUrl: 'https://javdb.com/',
    period: { period: 7 },
    mode: 'search',
  });
  window.document.body.appendChild(handle.element);
  handle.update({ movies: [...MOVIES, { ...MOVIES[0], id: '2', number: 'XYZ-002' }] });
  const [first, second] = handle.element.querySelectorAll('.item');
  first.hidden = true;
  second.style.display = 'grid';

  assert.equal(handle.filter('ABC'), 1);
  assert.equal(first.hidden, true);
  assert.equal(first.style.display, '');
  assert.equal(second.style.display, 'grid');
  assert.equal(second.dataset.jdbRaFiltered, 'true');
  assert.equal(handle.filter(''), 2);
  assert.equal(first.hidden, true);
  assert.equal(second.style.display, 'grid');
  assert.equal(second.hasAttribute('data-jdb-ra-filtered'), false);
  window.happyDOM.close();
});

test('a query set during loading is applied when data arrives and disposal is idempotent', { skip: domSkip }, () => {
  const window = createDomWindow();
  const handle = createPeriodSection({
    document: window.document,
    baseUrl: 'https://javdb.com/',
    period: { period: 7, movies_count: 3 },
    loading: true,
  });
  window.document.body.appendChild(handle.element);
  assert.equal(handle.filter('missing'), 0);
  handle.update({ movies: MOVIES });
  assert.equal(handle.element.querySelector('.item').dataset.jdbRaFiltered, 'true');
  assert.equal(handle.element.dataset.jdbRaFiltered, 'true');
  handle.dispose();
  handle.dispose();
  assert.equal(window.document.body.contains(handle.element), false);
  assert.equal(handle.update({ movies: [] }), false);
  window.happyDOM.close();
});
