// アプリのファイルをすべてキャッシュし、オフラインでも開けるようにする。
// ファイルを変えて公開するときは VERSION を上げる（上げないと古い版が使われ続ける）。
const VERSION = '0.0.1';
const CACHE = `ticket-web-${VERSION}`;

// tests/sw-precache.test.js が、アプリのファイルの漏れがないか確かめる
const PRECACHE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'vendor/preact.module.js',
  'vendor/hooks.module.js',
  'vendor/htm.module.js',
  'src/app.js',
  'src/html.js',
  'src/image.js',
  'src/sw-register.js',
  'src/store/idb.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('ticket-web-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
  if (event.data === 'version') event.source?.postMessage({ version: VERSION });
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate' && new URL(req.url).pathname.endsWith('/')) {
      const shell = await cache.match('index.html');
      if (shell) return shell;
    }
    return fetch(req);
  })());
});
