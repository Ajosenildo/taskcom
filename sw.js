const CACHE_NAME = "taskcom-cache-v3"; // Atualizei a versão
const urlsToCache = [
  "./",
  "./index.html",
  "./css/styles.v3.css", // Atualizado para o nome real do seu arquivo
  "./js/app.v3.js",      // Atualizado para o nome real do seu arquivo
  "./js/api.v3.js",
  "./js/auth.v3.js",
  "./js/config.js",
  "./js/render.v3.js",
  "./js/state.js",
  "./js/supabaseClient.js",
  "./js/ui.v3.js",
  "./js/utils.js",
  "./manifest.json",
  "./favicon/favicon-96x96.png"
  // Adicione aqui seus ícones se tiver (icon-192.png, etc)
];

// 1. INSTALAÇÃO (Cachear arquivos)
self.addEventListener("install", event => {
  // Força o SW a ativar imediatamente
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
        // Tenta cachear, mas não trava se um arquivo falhar (opcional, mas seguro)
        return cache.addAll(urlsToCache).catch(err => console.error("Erro ao cachear arquivos:", err));
    })
  );
});

// 2. ATIVAÇÃO (Limpar caches antigos e assumir controle)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Assume o controle de todas as abas abertas imediatamente
      clients.claim(),
      // Limpa caches antigos se mudarmos a versão
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              return caches.delete(cacheName);
            }
          })
        );
      })
    ])
  );
});

// 3. FETCH (Servir arquivos do cache quando offline)
self.addEventListener("fetch", event => {
  // Apenas para requisições GET (evita erros com POST do Supabase)
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(response => {
        // Retorna do cache se tiver, senão busca na rede
        return response || fetch(event.request);
    })
  );
});

// 4. NOTIFICAÇÃO (O Código Mágico para o Android)
// Isso permite que o clique na notificação abra o App
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then( windowClients => {
      // Tenta focar em uma aba que já esteja aberta
      for (var i = 0; i < windowClients.length; i++) {
        var client = windowClients[i];
        if (client.url.includes('/') && 'focus' in client) {
          return client.focus();
        }
      }
      // Se não tiver aberta, abre uma nova
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});