/* Offline support: fresh copy from the network when there is one, otherwise the saved copy. */
const CACHE = 'quizdrop-v3';
const PY_CACHE = 'quizdrop-python-0.26.4';   // the Python runtime and its packages; kept across app updates
const ASSETS = [
  './', 'index.html', 'app.css', 'core.js', 'app.js', 'py-worker.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'samples/solar-system.quiz.json',
  'claude-package/PASTE-INTO-CLAUDE.md', 'claude-package/quizdrop-quiz-maker.zip'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== PY_CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.startsWith('/pyodide/')) {
    // Versioned files that never change: saved copy first, download once.
    e.respondWith(caches.open(PY_CACHE).then(c => c.match(url.href).then(hit => hit ||
      fetch(url.href, { mode: 'cors', credentials: 'omit' }).then(res => { if (res.ok) c.put(url.href, res.clone()); return res; }))));
    return;
  }
  if (url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(hit => hit || caches.match('index.html')))
  );
});
