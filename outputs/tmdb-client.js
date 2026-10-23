/* Cliente público: las peticiones usan el mismo origen y nunca incluyen claves privadas. */
(() => {
  'use strict';
  function createURL(route) {
    if (typeof route !== 'string' || !route.startsWith('/') || route.startsWith('//'))
      throw new Error('Ruta de catálogo inválida.');
    const relative = new URL(route, 'https://catalogue.invalid');
    const base = new URL('./api/tmdb/', document.baseURI);
    const url = new URL(relative.pathname.slice(1), base);
    url.search = relative.search;
    url.searchParams.set('language', 'es-ES');
    return url;
  }
  async function get(route, { signal } = {}) {
    const response = await fetch(createURL(route), { signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(response.status === 503 ? 'tmdb-config' : 'tmdb-network');
    return response.json();
  }
  window.FekaTMDB = Object.freeze({ createURL, get });
})();
