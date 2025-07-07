const CACHE_NAME = "taskond-cache-v2"; // Nome do cache atualizado
const urlsToCache = [
  "/",
  "/index.html",
  "/css/styles.v2.css", // Nome do CSS atualizado
  "/js/app.v2.js",      // Nome do JS atualizado
  "/manifest.json",
  "/assets/icon-192.png",
  "/assets/icon-512.png"
];

// Limpa caches antigos
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});