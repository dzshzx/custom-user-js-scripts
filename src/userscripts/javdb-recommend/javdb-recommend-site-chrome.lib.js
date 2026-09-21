const CHROME_TIMEOUT_MS = 12_000;
const ROUTE = '/recommend-archive';

function defaultClock(window) {
  return {
    now: () => Date.now(),
    setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
  };
}

function timeoutError() {
  const error = new Error('site chrome deadline exceeded');
  error.code = 'timeout';
  return error;
}

function disposedError() {
  const error = new Error('site chrome disposed');
  error.code = 'disposed';
  return error;
}

function diagnostic(reason, details = {}) {
  return { status: 'fallback', reason, ...details };
}

export function createSiteChrome({ document, window, fetch, clock, baseUrl, onChange = () => {} }) {
  const timer = clock || defaultClock(window);
  const ownedLinks = [];
  const ownedListeners = [];
  let ownedNavigation = null;
  let probe = null;
  let startPromise = null;
  let disposed = false;
  let fetchController = null;
  let deadline = 0;
  let ownedNativeClass = false;
  let ownedNavbarClass = false;
  let ownedTheme = null;
  let resolveDisposed;
  const disposedSignal = new Promise(resolve => { resolveDisposed = resolve; });

  function publish(result) {
    if (!disposed) {
      try { onChange(result); } catch (error) { /* presentation observers cannot change the outcome */ }
    }
    return result;
  }

  function remaining() {
    return Math.max(0, deadline - timer.now());
  }

  function byDeadline(promise) {
    const wait = remaining();
    if (wait <= 0) return Promise.reject(timeoutError());
    return new Promise((resolve, reject) => {
      const timeout = timer.setTimeout(() => reject(timeoutError()), wait);
      Promise.resolve(promise).then(
        value => { timer.clearTimeout(timeout); resolve(value); },
        error => { timer.clearTimeout(timeout); reject(error); },
      );
      disposedSignal.then(() => {
        timer.clearTimeout(timeout);
        reject(disposedError());
      });
    });
  }

  function notifyDisposed() {
    return { status: 'disposed', reason: 'disposed' };
  }

  function cleanupResources() {
    ownedListeners.splice(0).forEach(remove => remove());
    ownedLinks.splice(0).forEach(link => link.remove());
    if (ownedNavigation) ownedNavigation.remove();
    ownedNavigation = null;
    if (probe) probe.remove();
    probe = null;
    if (ownedNativeClass) document.documentElement.classList.remove('jdb-ra-native');
    if (ownedNavbarClass) document.documentElement.classList.remove('has-navbar-fixed-top');
    ownedNativeClass = false;
    ownedNavbarClass = false;
    if (ownedTheme && document.documentElement.dataset.theme === ownedTheme) {
      delete document.documentElement.dataset.theme;
    }
    ownedTheme = null;
  }

  function resolveHomepageBase(homeDocument, responseUrl) {
    const declaredBase = homeDocument.querySelector('base[href]')?.getAttribute('href');
    try {
      return declaredBase ? new window.URL(declaredBase, responseUrl).href : responseUrl;
    } catch (error) {
      return responseUrl;
    }
  }

  function applicableStyles(homeDocument) {
    return [...homeDocument.querySelectorAll('link[rel~="stylesheet"][href]')].filter(link => {
      const media = String(link.getAttribute('media') || '').trim();
      if (!media || media.toLowerCase() === 'all') return true;
      try { return !window.matchMedia || window.matchMedia(media).matches; } catch (error) { return false; }
    });
  }

  function prepareStyles(styles, homepageBase) {
    return styles.map(source => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = new window.URL(source.getAttribute('href'), homepageBase).href;
      link.dataset.jdbRaSiteChrome = 'stylesheet';
      const intendedMedia = source.getAttribute('media') || '';
      link.media = 'not all';
      const loaded = new Promise((resolve, reject) => {
        const onLoad = () => resolve();
        const onError = () => reject(new Error(`stylesheet failed: ${link.href}`));
        link.addEventListener('load', onLoad, { once: true });
        link.addEventListener('error', onError, { once: true });
        ownedListeners.push(() => {
          link.removeEventListener('load', onLoad);
          link.removeEventListener('error', onError);
        });
      });
      ownedLinks.push(link);
      document.head.appendChild(link);
      return { link, intendedMedia, loaded };
    });
  }

  function createProbe() {
    const root = document.createElement('div');
    root.dataset.jdbRaSiteChrome = 'probe';
    root.setAttribute('aria-hidden', 'true');
    root.style.cssText = 'position:absolute;left:-100000px;top:0;visibility:hidden;pointer-events:none;';
    const nav = document.createElement('nav');
    nav.className = 'navbar main-nav';
    const button = document.createElement('button');
    button.className = 'button';
    button.type = 'button';
    const box = document.createElement('div');
    box.className = 'box';
    root.append(nav, button, box);
    document.body.appendChild(root);
    probe = root;
    return { nav, button, box };
  }

  function nativeStylesApply() {
    const nodes = createProbe();
    const navStyle = window.getComputedStyle(nodes.nav);
    const buttonStyle = window.getComputedStyle(nodes.button);
    const boxStyle = window.getComputedStyle(nodes.box);
    const navReady = navStyle.display === 'flex' || parseFloat(navStyle.minHeight) > 0;
    const buttonReady = /flex/.test(buttonStyle.display) || parseFloat(buttonStyle.paddingLeft) > 4;
    const boxReady = boxStyle.boxShadow && boxStyle.boxShadow !== 'none' || parseFloat(boxStyle.paddingTop) > 0;
    probe.remove();
    probe = null;
    return Boolean(navReady && buttonReady && boxReady);
  }

  function absolutizeNavigation(navigation, homepageBase) {
    navigation.querySelectorAll('[href]').forEach(node => {
      try { node.setAttribute('href', new window.URL(node.getAttribute('href'), homepageBase).href); } catch (error) {}
    });
    navigation.querySelectorAll('[src]').forEach(node => {
      try { node.setAttribute('src', new window.URL(node.getAttribute('src'), homepageBase).href); } catch (error) {}
    });
  }

  function installNavigation(homeDocument, homepageBase) {
    let navigation = document.body.querySelector('nav.main-nav');
    if (!navigation) {
      const source = homeDocument.querySelector('nav.main-nav');
      if (!source) return;
      navigation = document.importNode(source, true);
      navigation.dataset.jdbRaSiteChrome = 'navigation';
      absolutizeNavigation(navigation, homepageBase);
      const root = document.querySelector('.jdb-ra');
      document.body.insertBefore(navigation, root || document.body.firstChild);
      ownedNavigation = navigation;
    }
    navigation.querySelectorAll('[data-target]').forEach(button => {
      const click = event => {
        event.preventDefault();
        const target = document.getElementById(button.getAttribute('data-target'));
        button.classList.toggle('is-active');
        if (target) target.classList.toggle('is-active');
      };
      button.addEventListener('click', click);
      ownedListeners.push(() => button.removeEventListener('click', click));
    });
    const start = navigation.querySelector('.navbar-start');
    if (start && !start.querySelector(`a[href$="${ROUTE}"]`)) {
      const entry = document.createElement('a');
      entry.className = 'navbar-item';
      entry.href = ROUTE;
      entry.title = '浏览佳片推荐全部历史期数';
      entry.textContent = '佳片推荐';
      start.appendChild(entry);
    }
  }

  async function run() {
    deadline = timer.now() + CHROME_TIMEOUT_MS;
    try {
      const homepageUrl = new window.URL('/', baseUrl).href;
      if (window.AbortController) fetchController = new window.AbortController();
      const response = await byDeadline(fetch(homepageUrl, fetchController ? { signal: fetchController.signal } : undefined));
      if (disposed) return notifyDisposed();
      if (!response || !response.ok) return publish(diagnostic('homepage-fetch', { httpStatus: response && response.status }));
      const html = await byDeadline(response.text());
      if (disposed) return notifyDisposed();
      const homeDocument = new window.DOMParser().parseFromString(html, 'text/html');
      const responseUrl = response.url || homepageUrl;
      const homepageBase = resolveHomepageBase(homeDocument, responseUrl);
      const styles = applicableStyles(homeDocument);
      if (!styles.length) return publish(diagnostic('no-stylesheets'));
      const prepared = prepareStyles(styles, homepageBase);
      await byDeadline(Promise.all(prepared.map(item => item.loaded)));
      if (disposed) return notifyDisposed();
      prepared.forEach(({ link, intendedMedia }) => {
        if (intendedMedia) link.media = intendedMedia;
        else link.removeAttribute('media');
      });
      await Promise.resolve();
      if (!nativeStylesApply()) {
        cleanupResources();
        return publish(diagnostic('style-check'));
      }
      if (disposed) return notifyDisposed();
      installNavigation(homeDocument, homepageBase);
      if (!document.documentElement.classList.contains('jdb-ra-native')) {
        document.documentElement.classList.add('jdb-ra-native');
        ownedNativeClass = true;
      }
      if (document.body.querySelector('nav.main-nav') && !document.documentElement.classList.contains('has-navbar-fixed-top')) {
        document.documentElement.classList.add('has-navbar-fixed-top');
        ownedNavbarClass = true;
      }
      const theme = homeDocument.documentElement.dataset.theme;
      if (theme && !document.documentElement.dataset.theme) {
        document.documentElement.dataset.theme = theme;
        ownedTheme = theme;
      }
      return publish({ status: 'native', reason: 'ready', stylesheets: prepared.length });
    } catch (error) {
      if (disposed) return notifyDisposed();
      const reason = error && error.code === 'timeout'
        ? 'timeout'
        : /^stylesheet failed:/.test(String(error && error.message)) ? 'stylesheet-error' : 'homepage-fetch';
      cleanupResources();
      return publish(diagnostic(reason));
    }
  }

  return {
    start() {
      if (disposed) return Promise.resolve(notifyDisposed());
      if (!startPromise) startPromise = run();
      return startPromise;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      resolveDisposed();
      if (fetchController) fetchController.abort();
      cleanupResources();
    },
  };
}
