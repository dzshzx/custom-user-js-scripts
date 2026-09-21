const SITE_IMAGE_HOST = 'https://c0.jdbstatic.com';

const ICON_PATHS = {
  star: '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 1-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
};

function appendIcon(document, parent, name, size) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('class', 'jdb-ra-icon');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.innerHTML = ICON_PATHS[name];
  parent.appendChild(svg);
}

function displayInteger(value, { minimum = 0 } = {}) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum ? String(parsed) : '—';
}

function displayDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || '').trim());
  if (!match) return '—';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? `${match[1]}-${match[2]}-${match[3]}`
    : '—';
}

function normalizedReleaseDate(value) {
  const date = displayDate(value);
  return date === '—' ? '' : date;
}

function coverUrl(value) {
  const source = String(value || '');
  const match = /\/covers\/.*$/.exec(source);
  return match ? SITE_IMAGE_HOST + match[0] : source;
}

function movieSignature(movies) {
  return JSON.stringify((Array.isArray(movies) ? movies : []).map(movie => [
    movie && movie.id,
    movie && movie.number,
    movie && movie.title,
    movie && movie.origin_title,
    movie && movie.cover_url,
    movie && movie.score,
    movie && movie.release_date,
  ]));
}

function appendCard({ document, grid, baseUrl, movie }) {
  const item = document.createElement('div');
  item.className = 'item';
  item.dataset.jdbRaCard = '1';
  const number = String(movie && movie.number || '');
  const title = String(movie && (movie.title || movie.origin_title) || '');
  item.dataset.q = `${number} ${String(movie && movie.title || '')} ${String(movie && movie.origin_title || '')}`.toLowerCase();

  const anchor = document.createElement('a');
  anchor.className = 'box';
  anchor.href = String(baseUrl || '').replace(/\/$/, '') + '/v/' + encodeURIComponent(String(movie && movie.id || ''));
  anchor.target = '_blank';
  anchor.rel = 'noopener';
  anchor.title = title;

  const cover = document.createElement('div');
  cover.className = 'cover contain';
  const image = document.createElement('img');
  image.loading = 'lazy';
  image.src = coverUrl(movie && movie.cover_url);
  image.alt = number;
  cover.appendChild(image);
  anchor.appendChild(cover);

  const titleElement = document.createElement('div');
  titleElement.className = 'video-title';
  const strong = document.createElement('strong');
  strong.textContent = number;
  titleElement.appendChild(strong);
  titleElement.appendChild(document.createTextNode(title ? ` ${title}` : ''));
  anchor.appendChild(titleElement);

  const metaParts = [];
  if (movie && movie.score) metaParts.push({ kind: 'score', value: String(movie.score) });
  const releaseDate = normalizedReleaseDate(movie && movie.release_date);
  if (releaseDate) metaParts.push({ kind: 'date', value: `发售 ${releaseDate}` });
  if (metaParts.length) {
    const meta = document.createElement('div');
    meta.className = 'meta';
    metaParts.forEach((part, index) => {
      if (index) meta.appendChild(document.createTextNode(' · '));
      if (part.kind === 'score') {
        const score = document.createElement('span');
        score.className = 'jdb-ra-score';
        appendIcon(document, score, 'star', 14);
        score.appendChild(document.createTextNode(part.value));
        meta.appendChild(score);
      } else {
        meta.appendChild(document.createTextNode(part.value));
      }
    });
    anchor.appendChild(meta);
  }

  item.appendChild(anchor);
  grid.appendChild(item);
}

function appendSkeletons(document, grid, count) {
  for (let index = 0; index < count; index += 1) {
    const skeleton = document.createElement('div');
    skeleton.className = 'item jdb-ra-skel';
    skeleton.setAttribute('aria-hidden', 'true');
    const cover = document.createElement('div');
    cover.className = 'jdb-ra-skel-cover';
    const line = document.createElement('div');
    line.className = 'jdb-ra-skel-line';
    const shortLine = document.createElement('div');
    shortLine.className = 'jdb-ra-skel-line short';
    skeleton.append(cover, line, shortLine);
    grid.appendChild(skeleton);
  }
}

export function createPeriodSection({ document, baseUrl, period, mode = 'browse', loading = false }) {
  const section = document.createElement('section');
  section.className = 'jdb-ra-sec';
  section.dataset.period = String(period && period.period == null ? '' : period && period.period);

  const heading = document.createElement('h2');
  heading.className = 'jdb-ra-ph';
  heading.appendChild(document.createTextNode(`第 ${displayInteger(period && period.period, { minimum: 1 })} 期`));
  if (mode !== 'search') {
    const sub = document.createElement('span');
    sub.className = 'sub';
    sub.textContent = `${displayDate(period && period.created_at)} · ${displayInteger(period && period.movies_count)} 部`;
    heading.appendChild(document.createTextNode(' '));
    heading.appendChild(sub);
  }

  const grid = document.createElement('div');
  grid.className = 'movie-list';
  section.append(heading, grid);
  if (loading) {
    const requested = Number.parseInt(period && period.movies_count, 10);
    appendSkeletons(document, grid, Math.min(Math.max(requested || 4, 3), 6));
  }

  let disposed = false;
  let signature = null;
  let query = '';

  function filter(nextQuery) {
    if (disposed) return 0;
    query = String(nextQuery || '').trim().toLowerCase();
    let hits = 0;
    const cards = grid.querySelectorAll(':scope > .item[data-jdb-ra-card="1"]');
    cards.forEach(card => {
      const match = !query || String(card.dataset.q || '').includes(query);
      if (match) {
        card.removeAttribute('data-jdb-ra-filtered');
        hits += 1;
      } else {
        card.dataset.jdbRaFiltered = 'true';
      }
    });
    if (query && cards.length && hits === 0) section.dataset.jdbRaFiltered = 'true';
    else section.removeAttribute('data-jdb-ra-filtered');
    return hits;
  }

  function update(payload = {}) {
    if (disposed) return false;
    section.dataset.degraded = String(Boolean(payload.degraded));
    if (payload.error) section.dataset.error = String(payload.error.message || payload.error);
    else section.removeAttribute('data-error');
    const movies = Array.isArray(payload.movies) ? payload.movies : [];
    const nextSignature = movieSignature(movies);
    if (signature === nextSignature) {
      filter(query);
      return false;
    }
    signature = nextSignature;
    grid.replaceChildren();
    if (!movies.length) {
      const empty = document.createElement('div');
      empty.className = 'jdb-ra-empty';
      empty.textContent = '本期没有影片';
      grid.appendChild(empty);
    } else {
      movies.forEach(movie => appendCard({ document, grid, baseUrl, movie: movie || {} }));
    }
    filter(query);
    return true;
  }

  function onCoverError(event) {
    const image = event.target;
    if (!image || image.tagName !== 'IMG' || !grid.contains(image)) return;
    const cover = image.closest('.cover');
    if (!cover || cover.querySelector('.jdb-ra-cover-ph')) return;
    image.style.display = 'none';
    const placeholder = document.createElement('div');
    placeholder.className = 'jdb-ra-cover-ph';
    placeholder.setAttribute('role', 'img');
    placeholder.setAttribute('aria-label', '封面加载失败');
    placeholder.title = '封面加载失败';
    appendIcon(document, placeholder, 'x', 20);
    cover.appendChild(placeholder);
  }
  section.addEventListener('error', onCoverError, true);

  return {
    element: section,
    update,
    filter,
    dispose() {
      if (disposed) return;
      disposed = true;
      section.removeEventListener('error', onCoverError, true);
      section.remove();
    },
  };
}
