// Offline cache for the app shell. Bump VERSION whenever app files change.
const VERSION = 'physique-v1';
const ASSETS = [
  './', './index.html', './styles.css', './manifest.webmanifest',
  './icons/apple-touch-icon.png', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
  './vendor/html5-qrcode.min.js',
  './js/app.js', './js/db.js', './js/util.js', './js/state.js', './js/streaks.js', './js/food.js', './js/train.js',
  './js/charts.js', './js/progress.js', './js/coach.js', './js/facts.js', './js/home.js', './js/settings.js',
  './js/data/training-facts.js', './js/data/fun-facts.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return; // Open Food Facts etc. go straight to network
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit => {
      const net = fetch(e.request).then(res => {
        if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
        return res;
      }).catch(() => hit || (e.request.mode === 'navigate' ? caches.match('./index.html') : undefined));
      return hit || net;
    })
  );
});
