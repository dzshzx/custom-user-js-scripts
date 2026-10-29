// Small DOM helpers shared by every userscript's mount path.

// Installs a <style> once per document. A second call with the same id is a
// no-op that returns a no-op remover, so only the installer owns the node.
function ensureStyle(
  documentObject: Document,
  id: string,
  cssText: string,
  parent: Element = documentObject.head ?? documentObject.documentElement,
): () => void {
  if (documentObject.getElementById(id)) return () => {};
  const style = documentObject.createElement('style');
  style.id = id;
  style.textContent = cssText;
  parent.append(style);
  return () => style.remove();
}

export { ensureStyle };
