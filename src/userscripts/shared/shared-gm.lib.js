// The only place that probes the userscript manager API. Script managers expose
// either the legacy `GM_*` functions, the promise-based `GM.*` object, or both;
// callers get one resolved function per capability (or null when missing) and
// never touch the globals themselves. Explicit overrides win, which is how tests
// and hosts inject fakes.

function pickFunction(override, legacy) {
  if (typeof override === 'function') return override;
  if (typeof legacy === 'function') return legacy;
  return null;
}

function bindModern(gm, ...names) {
  for (const name of names) {
    if (typeof gm?.[name] === 'function') return gm[name].bind(gm);
  }
  return null;
}

function legacyGlobals() {
  return {
    getValue: typeof GM_getValue === 'function' ? GM_getValue : null,
    setValue: typeof GM_setValue === 'function' ? GM_setValue : null,
    addValueChangeListener: typeof GM_addValueChangeListener === 'function' ? GM_addValueChangeListener : null,
    removeValueChangeListener: typeof GM_removeValueChangeListener === 'function' ? GM_removeValueChangeListener : null,
    registerMenuCommand: typeof GM_registerMenuCommand === 'function' ? GM_registerMenuCommand : null,
    xmlHttpRequest: typeof GM_xmlhttpRequest === 'function' ? GM_xmlhttpRequest : null,
    download: typeof GM_download === 'function' ? GM_download : null,
  };
}

function modernGlobal() {
  return typeof GM !== 'undefined' ? GM : null;
}

/**
 * Resolves the manager API once. Legacy `GM_*` functions take precedence over
 * `GM.*` methods, matching what each script did before the adapter existed.
 *
 * Overrides: `gmGetValue`, `gmSetValue`, `gmAddValueChangeListener`,
 * `gmRemoveValueChangeListener`, `gmRegisterMenuCommand`, `gmXmlhttpRequest`,
 * `gmDownload`, and `gm` / `gmApi` for the modern object.
 *
 * `valueChange` pairs add/remove from the same API family, because listener
 * ids are not interchangeable between them; the modern `add` may return a
 * promise of the id.
 */
function resolveGmApi(overrides = {}) {
  const legacy = legacyGlobals();
  const gm = overrides.gm || overrides.gmApi || modernGlobal();

  const legacyAdd = pickFunction(overrides.gmAddValueChangeListener, legacy.addValueChangeListener);
  let valueChange = null;
  if (legacyAdd) {
    valueChange = {
      add: legacyAdd,
      remove: pickFunction(overrides.gmRemoveValueChangeListener, legacy.removeValueChangeListener),
    };
  } else if (typeof gm?.addValueChangeListener === 'function') {
    valueChange = {
      add: gm.addValueChangeListener.bind(gm),
      remove: bindModern(gm, 'removeValueChangeListener'),
    };
  }

  return {
    getValue: pickFunction(overrides.gmGetValue, legacy.getValue) || bindModern(gm, 'getValue'),
    setValue: pickFunction(overrides.gmSetValue, legacy.setValue) || bindModern(gm, 'setValue'),
    valueChange,
    registerMenuCommand:
      pickFunction(overrides.gmRegisterMenuCommand, legacy.registerMenuCommand) ||
      bindModern(gm, 'registerMenuCommand'),
    xmlHttpRequest:
      pickFunction(overrides.gmXmlhttpRequest, legacy.xmlHttpRequest) ||
      bindModern(gm, 'xmlHttpRequest', 'xmlhttpRequest'),
    // Legacy only: GM.download does not share GM_download's callback contract.
    download: pickFunction(overrides.gmDownload, legacy.download),
  };
}

export { resolveGmApi };
