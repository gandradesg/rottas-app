// Service Worker - Imob Rottas
// Estrategia: NETWORK-FIRST com fallback de cache (offline-friendly)
// - Toda requisicao tenta servidor PRIMEIRO. Se network falhar, cai no cache
// - Update automatico: quando novo SW e detectado, ativa imediatamente e recarrega
// - Bypassa cache do WebAPK Android porque o SW intercepta TODAS as requisicoes
//
// IMPORTANTE: SW_VERSION deve casar com APP_VERSION (js/config.js) a cada deploy.
// Mudar esta string faz o navegador detectar um SW novo, ativar na hora, PURGAR o
// cache antigo (no 'activate') e recarregar — garantindo que nunca fique um mix de
// versoes de JS em cache (causa raiz de "app nao abre / versao velha").
const SW_VERSION = '1.7.0';
const CACHE_NAME = 'imob-rottas-' + SW_VERSION;

self.addEventListener('install', (event) => {
  // Pula a fase "waiting" - novo SW ativa imediatamente
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Limpa caches antigos (de versoes anteriores do SW)
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    // Toma controle de todos os tabs/PWAs abertos imediatamente
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Apenas GET HTTP/S
  if (req.method !== 'GET' || !req.url.startsWith('http')) return;

  // Pula chamadas para o Supabase (auth, db, storage, functions) - sempre network direto
  if (req.url.includes('supabase.co')) return;

  // Pula chamadas externas (CDNs, fontes etc)
  const reqUrl = new URL(req.url);
  if (reqUrl.origin !== self.location.origin) return;

  // NETWORK FIRST: tenta servidor, atualiza cache, fallback offline
  event.respondWith((async () => {
    try {
      const networkRes = await fetch(req);
      if (networkRes && networkRes.status === 200 && networkRes.type === 'basic') {
        const clone = networkRes.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, clone)).catch(() => {});
      }
      return networkRes;
    } catch (err) {
      // Offline: serve do cache se tiver
      const cached = await caches.match(req);
      if (cached) return cached;
      // HTML root fallback
      if (req.destination === 'document') return caches.match('/');
      throw err;
    }
  })());
});

// Permite que a pagina mande "SKIP_WAITING" para forcar update imediato
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
