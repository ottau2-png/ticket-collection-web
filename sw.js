// アプリのファイルをすべてキャッシュし、オフラインでも開けるようにする。
// ファイルを変えて公開するときは VERSION を上げる（上げないと古い版が使われ続ける）。
const VERSION = '0.7.0';
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
  'src/data.js',
  'src/format.js',
  'src/html.js',
  'src/image.js',
  'src/model/ai-format.js',
  'src/model/category.js',
  'src/model/crop.js',
  'src/model/grouping.js',
  'src/model/performers.js',
  'src/model/text.js',
  'src/model/ticket.js',
  'src/prefs.js',
  'src/router.js',
  'src/store/db.js',
  'src/store/idb.js',
  'src/styles.css',
  'src/sw-register.js',
  'src/viewer-order.js',
  'src/views/ai-read-sheet.js',
  'src/views/common.js',
  'src/views/crop-view.js',
  'src/views/detail-view.js',
  'src/views/edit-view.js',
  'src/views/fields.js',
  'src/views/gestures.js',
  'src/views/list-view.js',
  'src/views/pager-math.js',
  'src/views/performers-view.js',
  'src/views/settings-view.js',
  'src/views/thumbnail.js',
  'src/views/viewer-view.js',
  'src/views/zoom-math.js',
  'src/views/zoomable-image.js',
];

self.addEventListener('install', (event) => {
  // ブラウザの HTTP キャッシュ（GitHub Pages は最大10分）を通すと古いファイルを取り込んでしまうので、必ず取り直す
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' })))));
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
  // 手元での開発中は、書き換えたファイルがすぐ見えるようにネットワークを先に使う
  if (self.location.hostname === 'localhost') {
    event.respondWith(fetch(req).catch(() => caches.match(req, { ignoreSearch: true })));
    return;
  }
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
