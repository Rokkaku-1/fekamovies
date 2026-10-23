/* FekaMovies · PWA. Incrementar VERSION al publicar cambios del app shell. */
'use strict';
const VERSION = 'v24';
// Aísla las cachés de otras aplicaciones en subcarpetas del mismo dominio.
const PREFIX = 'lumen-' + encodeURIComponent(new URL(self.registration.scope).pathname) + '-';
const SHELL = PREFIX + VERSION + '-shell';
const IMAGES = PREFIX + VERSION + '-images';
const API = PREFIX + VERSION + '-api';
const ACTIVE = [SHELL, IMAGES, API];
const API_TTL = 60 * 60 * 1000;
const IMAGE_LIMIT = 150;
const relative = (path) => new URL(path, self.registration.scope).href;
const OFFLINE = relative('offline.html');
const PRECACHE = [
  './',
  'index.html',
  'app.css',
  'app.js',
  'tmdb-client.js',
  'dmca.html',
  'legal.css',
  'legal.js',
  'offline.html',
  'manifest.webmanifest',
  'pwa.js',
  'mobile.css',
  'supabase-config.js',
  'embed-catalog.js',
  'hero-slider.js',
  'media-source.js',
  'tv-online.js',
  'tv-online.css',
  'icons/logo.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable.png',
  'icons/apple-touch-icon.png',
];
// CDN auxiliares: un fallo no impide instalar el shell propio.
const OPTIONAL = [
  'https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js',
  'https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/ScrollTrigger.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;650;700&display=swap',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      await cache.addAll(PRECACHE.map((path) => new Request(relative(path), { cache: 'reload' })));
      await Promise.allSettled(OPTIONAL.map((url) => cache.add(new Request(url, { mode: 'cors', cache: 'reload' }))));
      const fontCSS = await cache.match(OPTIONAL[2]);
      if (fontCSS) {
        const urls = [
          ...new Set(
            [...(await fontCSS.text()).matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map(
              (match) => match[1],
            ),
          ),
        ];
        await Promise.allSettled(urls.map((url) => cache.add(new Request(url, { mode: 'cors' }))));
      }
      // No skipWaiting automático: el usuario acepta la actualización.
    })(),
  );
});
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await Promise.all(
        (await caches.keys())
          .filter((key) => key.startsWith(PREFIX) && !ACTIVE.includes(key))
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

function bypass(request, url) {
  return (
    request.method !== 'GET' ||
    request.headers.has('Range') ||
    ['video', 'audio', 'iframe', 'embed', 'object'].includes(request.destination) ||
    /(^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be|googlevideo\.com|ytimg\.com)$/.test(url.hostname) ||
    /\.(mp4|webm|m3u8|m4s|ts|mov|m4v|mpd|mp3|aac|ogg|wav)(?:$|\/)/i.test(url.pathname)
  );
}
async function cacheFirst(request) {
  const cache = await caches.open(SHELL);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    try {
      await cache.put(request, response.clone());
    } catch {
      /* Caché llena: sigue en red. */
    }
  }
  return response;
}

// Serializa escrituras y expulsión para respetar el límite incluso con cargas paralelas.
let imageWrites = Promise.resolve();
function storeImage(request, response) {
  imageWrites = imageWrites
    .catch(() => {})
    .then(async () => {
      const cache = await caches.open(IMAGES);
      await cache.delete(request);
      await cache.put(request, response);
      const keys = await cache.keys();
      await Promise.all(keys.slice(0, Math.max(0, keys.length - IMAGE_LIMIT)).map((key) => cache.delete(key)));
    });
  return imageWrites;
}
async function imageSWR(request, event) {
  const cache = await caches.open(IMAGES);
  const cached = await cache.match(request);
  const network = fetch(request).then(async (response) => {
    if (response.ok || response.type === 'opaque') await storeImage(request, response.clone());
    return response;
  });
  event.waitUntil(network.catch(() => {}));
  return cached || network;
}
async function apiNetworkFirst(request) {
  const cache = await caches.open(API);
  // Evita esperar indefinidamente a una red sin respuesta antes de consultar caché.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(request, { signal: controller.signal });
    if (!response.ok) throw new Error('TMDB no disponible');
    try {
      const headers = new Headers(response.headers);
      headers.set('X-Lumen-Cached-At', String(Date.now()));
      const cached = new Response(await response.clone().blob(), { status: response.status, headers });
      await cache.put(request, cached);
      const keys = await cache.keys();
      await Promise.all(keys.slice(0, Math.max(0, keys.length - 100)).map((key) => cache.delete(key)));
    } catch {
      /* Un fallo de almacenamiento no descarta una respuesta válida. */
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    const stored = Number(cached?.headers.get('X-Lumen-Cached-At'));
    if (cached && stored > 0 && Date.now() - stored < API_TTL) return cached;
    if (cached) await cache.delete(request);
    return new Response(JSON.stringify({ status_message: 'Sin conexión. Vuelve a intentarlo.' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  } finally {
    clearTimeout(timer);
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  // Panel y catálogo remoto: nunca guardar sesiones, borradores ni respuestas de Auth.
  if (
    url.hostname.endsWith('.supabase.co') ||
    url.pathname.endsWith('/api/site') ||
    /\/admin(?:\.html|\.js|\.css)?$/.test(url.pathname)
  )
    return;
  if (bypass(request, url)) return;
  if (url.hostname === 'image.tmdb.org') {
    event.respondWith(imageSWR(request, event));
    return;
  }
  if (url.origin === self.location.origin && url.pathname.includes('/api/tmdb/')) {
    event.respondWith(apiNetworkFirst(request));
    return;
  }
  const own = url.origin === self.location.origin && url.pathname.startsWith(new URL(self.registration.scope).pathname);
  if (own && request.mode === 'navigate') {
    event.respondWith(
      cacheFirst(request).catch(async () =>
        (await caches.open(SHELL)).match(relative('index.html')).then((response) => response || caches.match(OFFLINE)),
      ),
    );
    return;
  }
  const fontOrLibrary =
    ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname) || OPTIONAL.includes(url.href);
  if ((own && ['style', 'script', 'font', 'image', 'manifest'].includes(request.destination)) || fontOrLibrary) {
    event.respondWith(cacheFirst(request));
  }
});
