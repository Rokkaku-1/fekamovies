/* Proxy de lectura TMDB: host fijo, rutas/parámetros permitidos, caché y errores sin secretos. */
'use strict';
const { publicSettings } = require('./settings.cjs');
const { createFootballGuide } = require('./football-guide.cjs');
const ROUTES =
  /^(?:\/trending\/(?:all|movie|tv)\/(?:day|week)|\/movie\/(?:now_playing|upcoming|popular)|\/tv\/popular|\/discover\/(?:movie|tv)|\/search\/(?:multi|movie|tv)|\/(?:movie|tv)\/[1-9]\d{0,9}|\/tv\/[1-9]\d{0,9}\/season\/(?:0|[1-9]\d?))$/;
const PARAMETERS = {
  language: (value) => value === 'es-ES',
  region: (value) => /^[A-Z]{2}$/.test(value),
  page: (value) => /^(?:[1-9]\d?|100)$/.test(value),
  query: (value) => value.trim().length >= 2 && value.length <= 120 && !/[\x00-\x1f]/.test(value),
  include_adult: (value) => value === 'false',
  append_to_response: (value) => value === 'videos',
  include_video_language: (value) => value === 'es,en,null',
  sort_by: (value) => value === 'popularity.desc',
  'primary_release_date.gte': validDate,
  'primary_release_date.lte': validDate,
  'first_air_date.gte': validDate,
  'first_air_date.lte': validDate,
};
function validDate(value) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
function json(statusCode, data, extra = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extra,
    },
    body: JSON.stringify(data),
  };
}
function upstreamURL(pathname, searchParams) {
  const route = pathname.replace(/^\/(?:api|\.netlify\/functions\/api)\/tmdb/, '');
  if (!ROUTES.test(route)) throw new Error('route');
  const url = new URL('https://api.themoviedb.org/3' + route);
  const seen = new Set();
  for (const [name, value] of searchParams) {
    if (seen.has(name) || !Object.hasOwn(PARAMETERS, name) || !PARAMETERS[name](value)) throw new Error('parameter');
    seen.add(name);
    url.searchParams.set(name, value);
  }
  url.searchParams.set('language', 'es-ES');
  url.searchParams.set('include_adult', 'false');
  return url;
}
function createAPI({ env = process.env, fetchImpl = fetch, now = Date.now, readGuide } = {}) {
  const footballGuide = createFootballGuide({ env, fetchImpl, now, readGuide });
  const cache = new Map(),
    pending = new Map(),
    clients = new Map();
  function rateLimited(ip) {
    const time = now(),
      previous = clients.get(ip);
    const bucket = previous && previous.until > time ? previous : { count: 0, until: time + 60000 };
    bucket.count++;
    clients.set(ip, bucket);
    if (clients.size > 2000)
      for (const [key, value] of clients) {
        if (value.until <= time) clients.delete(key);
      }
    if (clients.size > 4000) clients.delete(clients.keys().next().value);
    return bucket.count > 80;
  }
  return async function handle({ method = 'GET', url, ip = 'unknown', origin, expectedOrigin, fetchSite }) {
    if (method !== 'GET') return json(405, { error: 'Método no permitido.' }, { Allow: 'GET' });
    if (fetchSite === 'cross-site' || (origin && expectedOrigin && origin !== expectedOrigin))
      return json(403, { error: 'Origen no permitido.' });
    const request = new URL(url, 'http://localhost');
    if (request.pathname === '/api/football-guide' || request.pathname === '/.netlify/functions/api/football-guide') {
      if ([...request.searchParams].length) return json(400, {error:'Consulta no admitida.'});
      if (rateLimited(ip)) return json(429, {error:'Demasiadas consultas.'}, {'Retry-After':'60'});
      return json(200, await footballGuide());
    }
    if (request.pathname === '/api/site' || request.pathname === '/.netlify/functions/api/site') {
      try {
        return json(200, { dmcaEmail: publicSettings(env).dmcaEmail });
      } catch {
        return json(503, { error: 'Contacto pendiente de configuración.' });
      }
    }
    let upstream;
    try {
      upstream = upstreamURL(request.pathname, request.searchParams);
    } catch {
      return json(400, { error: 'Consulta no admitida.' });
    }
    if (rateLimited(ip))
      return json(429, { error: 'Demasiadas consultas. Inténtalo en un minuto.' }, { 'Retry-After': '60' });
    if (!env.TMDB_API_KEY) return json(503, { error: 'El catálogo está pendiente de configuración.' });
    const key = upstream.href;
    const stored = cache.get(key);
    if (stored && stored.until > now()) return stored.response;
    if (pending.has(key)) return pending.get(key);
    const task = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        // La clave solo viaja entre el servidor y TMDB. Nunca se devuelve al cliente.
        upstream.searchParams.set('api_key', env.TMDB_API_KEY);
        const response = await fetchImpl(upstream, {
          signal: controller.signal,
          redirect: 'error',
          headers: { Accept: 'application/json' },
        });
        if (!response.ok)
          return json(response.status === 404 ? 404 : 502, {
            error: 'No pudimos consultar el catálogo. Inténtalo de nuevo.',
          });
        const data = await response.json();
        const result = json(200, data);
        // Las búsquedas no se comparten ni se conservan en caché del servidor.
        if (!key.includes('/search/')) {
          cache.set(key, { response: result, until: now() + 300000 });
          while (cache.size > 250) cache.delete(cache.keys().next().value);
        }
        return result;
      } catch {
        return json(502, { error: 'El catálogo no está disponible en este momento.' });
      } finally {
        clearTimeout(timeout);
      }
    })();
    pending.set(key, task);
    try {
      return await task;
    } finally {
      pending.delete(key);
    }
  };
}
module.exports = { createAPI, upstreamURL };
