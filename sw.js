/* Offline support: fresh copy from the network when there is one, otherwise the saved copy. */
const CACHE = 'quizdrop-v5';
const ASSETS = [
  './', 'index.html', 'app.css', 'core.js', 'app.js', 'py-worker.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'samples/solar-system.quiz.json',
  'claude-package/PASTE-INTO-CLAUDE.md', 'claude-package/quizdrop-quiz-maker.zip'
];

/* Versioned files on the jsDelivr CDN that never change: saved copy first, downloaded once, kept across app updates. */
const CDN = [
  { prefix: '/pyodide/v0.26.4/', cache: 'quizdrop-python-0.26.4' },   // Python runtime and packages
  { prefix: '/npm/katex@0.16.11/', cache: 'quizdrop-katex-0.16.11' }  // maths typesetting
];
const KATEX = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/';
const KATEX_FILES = ['katex.min.js', 'katex.min.css'].concat([
  'Main-Regular', 'Main-Bold', 'Main-Italic', 'Math-Italic', 'Math-BoldItalic', 'AMS-Regular',
  'Size1-Regular', 'Size2-Regular', 'Size3-Regular', 'Size4-Regular', 'Caligraphic-Regular'
].map(f => 'fonts/KaTeX_' + f + '.woff2'));

const cors = url => fetch(url, { mode: 'cors', credentials: 'omit' });

self.addEventListener('install', e => {
  // Maths support is fetched ahead of time so it works offline; it is small, and failing to get it never blocks the install.
  const katex = caches.open(CDN[1].cache).then(c => Promise.all(KATEX_FILES.map(f =>
    c.match(KATEX + f).then(hit => hit || cors(KATEX + f).then(res => { if (res.ok) return c.put(KATEX + f, res); })).catch(() => {}))));
  e.waitUntil(Promise.all([caches.open(CACHE).then(c => c.addAll(ASSETS)), katex.catch(() => {})]).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  const keepers = [CACHE].concat(CDN.map(x => x.cache));
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => !keepers.includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.hostname === 'cdn.jsdelivr.net') {
    const hit = CDN.find(x => url.pathname.startsWith(x.prefix));
    if (!hit) return;
    e.respondWith(caches.open(hit.cache).then(c => c.match(url.href).then(saved => saved ||
      cors(url.href).then(res => { if (res.ok) c.put(url.href, res.clone()); return res; }))));
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
