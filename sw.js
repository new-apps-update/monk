/* Monk Mode service worker
   - app files: network first (fresh updates), but fall back to cache after 3s so a slow network never freezes the app
   - pdf.js from the CDN: cache first, so opening a PDF is instant after the first time */
const CACHE = 'monkmode-v16';
const CORE = ['./', 'index.html', 'style.css', 'app.js', 'manifest.json', 'favicon.ico', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'favicon-32.png'];
const PDFJS_HOST = 'cdnjs.cloudflare.com';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE).catch(() => {})).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const withTimeout = (p, ms) => new Promise((ok, no) => { const t = setTimeout(() => no(new Error('timeout')), ms); p.then(r => { clearTimeout(t); ok(r); }, e => { clearTimeout(t); no(e); }); });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.headers.has('range')) return;       // video/audio streaming

  // pdf.js (viewer library + worker): cache first
  if (url.hostname === PDFJS_HOST && url.pathname.includes('/pdf.js/')) {
    e.respondWith(caches.open(CACHE).then(c => c.match(req).then(hit => hit || fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone());
      return res;
    }))));
    return;
  }

  if (url.origin !== location.origin) return; // Firebase, fonts etc. go straight to network
  e.respondWith(
    withTimeout(fetch(req), 3000).then(res => {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then(r => r || fetch(req).catch(() => caches.match('index.html'))))
  );
});
