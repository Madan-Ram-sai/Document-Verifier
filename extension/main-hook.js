// Runs in the page's own JS world. While the extension is capturing a document,
// window.open(url) is turned into a message instead of a popup tab.
(() => {
  const orig = window.open, cap = () => document.documentElement.dataset.jvCap === '1';
  const post = u => { try { window.postMessage({ jv: 'open', url: new URL(u, location.href).href }, '*'); } catch {} };
  window.open = function (u, ...a) {
    if (!cap()) return orig.call(this, u, ...a);
    if (u && u !== 'about:blank') post(u);
    const loc = {}; ['assign', 'replace'].forEach(k => loc[k] = post);
    Object.defineProperty(loc, 'href', { set: post, get: () => '' });
    return { closed: false, close() { this.closed = true; }, focus() {}, blur() {}, document: { write() {}, close() {} }, location: loc };
  };
})();
