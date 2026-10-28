/* Somente arquivos estáticos locais. Nenhuma resposta do Firebase é armazenada. */
const RELEASE = '20261028-3';
const CACHE = 'green-window-shell-qr-' + RELEASE;
const SHELL = [
  'index.html', 'instalar.html', 'Janela%20Verde%20(20).html', 'install.js', 'pwa-boot.js',
  'app-features.js', 'usage-map.js',
  'qr-links.js', 'plant-unlocks.js', 'Firebase/firebase-config.js', 'Firebase/firebase-adapter.js',
  'manifest.webmanifest', ...Array.from({ length: 6 }, (_, i) => 'manifest-planta-' + (i + 1) + '.webmanifest'),
  'assets/icons/app.svg', 'assets/icons/icon-192.png', 'assets/icons/icon-512.png'
];
const staticPaths = new Set(SHELL.map(file => new URL(file, self.registration.scope).pathname));
self.addEventListener('install', event => {
  const files = SHELL.map(file => new Request(new URL(file, self.registration.scope), { cache: 'reload' }));
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(files)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('green-window-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !staticPaths.has(url.pathname)) return;
  event.respondWith(fetch(event.request, { cache: 'no-cache' }).then(response => {
    if (response.ok) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy)));
    }
    return response;
  }).catch(async () => {
    const saved = await caches.match(event.request, { ignoreSearch: true });
    return saved || Response.error();
  }));
});
