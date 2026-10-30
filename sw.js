const CACHE_NAME = 'read-along-shell-v48-network-first';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './modules/page-sync.js',
  './modules/playlist-layout.js',
  './modules/catalog-playlist.js',
  './modules/remote-sync.js',
  './modules/diagnostics.js',
  './manifest.json',
  './icon.png',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.allSettled(APP_SHELL.map(async (asset) => {
        const response = await fetch(asset, { cache: 'no-cache' });
        if (response.ok) await cache.put(asset, response);
      }));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || request.headers.has('range')) return;

  const url = new URL(request.url);
  // PDF/audio files are deliberately never cached by the service worker.
  if (/\.(pdf|mp3|m4a|wav|ogg|aac)$/i.test(url.pathname)) return;

  if (url.origin === self.location.origin) {
    // Network-first for app code: online launches receive the newest shell,
    // while cached files remain available when the device is offline.
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request, { cache: 'no-cache' });
        if (response && response.ok) await cache.put(request, response.clone());
        return response;
      } catch (error) {
        const cached = await cache.match(request) || await cache.match('./index.html');
        if (cached) return cached;
        throw error;
      }
    })());
    return;
  }

  // Cache only the version-pinned PDF.js CDN assets. Do not cache GitHub
  // API responses, release metadata, R2 catalogs, or diagnostics requests.
  if (url.hostname !== 'cdnjs.cloudflare.com') return;
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  })());
});
