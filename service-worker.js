/*
 * service-worker.js — офлайн-кэш статики.
 *
 * Стратегия: cache-first. Версия кэша зашита в CACHE_VERSION: при её изменении
 * старый кэш удаляется целиком и файлы загружаются заново. Поэтому после
 * правок в HTML/CSS/JS нужно поднять номер версии ниже.
 */

var CACHE_VERSION = 'v1.2.0';
var CACHE_NAME = 'flashcards-' + CACHE_VERSION;

var ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/db.js',
  './js/srs.js',
  './js/ui.js',
  './js/app.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      // Кладём файлы по одному: один недоступный адрес не должен ломать установку.
      return Promise.all(ASSETS.map(function (url) {
        return cache.add(new Request(url, { cache: 'reload' })).catch(function (err) {
          console.warn('[sw] не удалось закэшировать', url, err);
        });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (key !== CACHE_NAME && key.indexOf('flashcards-') === 0) return caches.delete(key);
        return null;
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;

  var url;
  try { url = new URL(request.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;   // сторонние адреса не трогаем

  event.respondWith(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.match(request, { ignoreSearch: true }).then(function (cached) {
        if (cached) return cached;
        return fetch(request).then(function (response) {
          if (response && response.ok && response.type === 'basic') {
            cache.put(request, response.clone());
          }
          return response;
        }).catch(function () {
          // Офлайн и в кэше пусто: для переходов отдаём оболочку приложения.
          if (request.mode === 'navigate') {
            return cache.match('./index.html').then(function (shell) {
              return shell || cache.match('./') || offlineResponse();
            });
          }
          return offlineResponse();
        });
      });
    })
  );
});

function offlineResponse() {
  return new Response('Офлайн: ресурс недоступен', {
    status: 503,
    statusText: 'Offline',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}
