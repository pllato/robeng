// Служебный скрипт для «добавить на экран».
//
// Главное правило: НИКОГДА не отдавать старую страницу, пока сеть жива. В этой
// игре версия клиента обязана совпадать с версией сервера, и кэш, который держит
// вчерашний index.html, ломает всё тише и злее любой ошибки. Поэтому сначала
// всегда сеть, а кэш — только запасной выход, когда сети нет совсем.
const V = new URL(self.location).searchParams.get('v') || 'dev';
const CACHE = 'pixel-english-' + V;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin !== self.location.origin) return;
  if (u.pathname === '/version') return;        // версию спрашиваем только живьём
  e.respondWith((async () => {
    try {
      const net = await fetch(req);
      // 206 (кусок музыки по Range) класть в кэш нельзя — браузер на этом падает
      if (net && net.status === 200) {
        const c = await caches.open(CACHE);
        c.put(req, net.clone()).catch(() => {});
      }
      return net;
    } catch (err) {
      const hit = await caches.match(req);
      if (hit) return hit;
      throw err;
    }
  })());
});
