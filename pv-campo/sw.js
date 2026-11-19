// Guarda la app en el teléfono para que abra aunque no haya señal en el campo.
const VERSION = 'pv-campo-v3';
const ARCHIVOS = [
  './', './index.html', './styles.css', './manifest.webmanifest', './icono.svg',
  './js/app.js', './js/solar.js', './js/pv.js', './js/grafica.js', './js/escena.js', './js/modulo.js',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' evita guardar copias viejas que el navegador tenga en su caché HTTP.
  e.waitUntil(caches.open(VERSION)
    .then((c) => c.addAll(ARCHIVOS.map((u) => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Archivos propios: primero la red (para recibir actualizaciones) y, si no hay, la copia guardada.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then((r) => {
        const copia = r.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copia));
        return r;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
