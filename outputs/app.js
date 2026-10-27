// 01. Catálogo: consultas al servidor; ninguna clave privada llega al navegador.
// Compatibilidad con enlaces guardados antes de separar TV del catálogo.
if (location.hash === '#tv-online') location.replace(new URL('./tv.html', document.baseURI).href);
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';
const MAX_RESULTS = 15;
const OVERLAY_CLEAR_PROPS = 'transform,scale,y,opacity,visibility,willChange';
// FUENTES · Fuentes. Para conectar contenido real, solo modifica obtenerFuente y estaDisponible.
const MODO_DEMO = false;
// Big Buck Bunny © 2008 Blender Foundation, CC BY 3.0; copia pública de W3C.
// Esta URL alternativa respondió HTTP 200, video/mp4 y admite rangos de bytes.
const VIDEO_DEMO = { url: 'https://media.w3.org/2010/05/bunny/movie.mp4', subtitulos: [] };
// Hasta conectar un backend, solo estas fuentes representan contenido cargado.
// Un registro con publicado:false nunca habilita reproducción.
const DISPONIBLES = {
  // 'movie-123': { video: 'https://tu-servidor/pelicula.mp4', subtitulos: [] },
  // 'tv-456': { episodios: {
  //   '1-1': { video: 'https://tu-servidor/t1e1.m3u8', subtitulos: [
  //     { url: 'https://tu-servidor/es.vtt', idioma: 'es', label: 'Español' }
  //   ] }
  // } }
};

function obtenerFuente(tipo, tmdbId, temporada, episodio) {
  if (!['movie', 'tv'].includes(tipo) || !/^\d+$/.test(String(tmdbId))) return null;
  if (!MODO_DEMO && window.LumenCatalog?.configured) {
    const sources = window.LumenCatalog.getSources(tipo, tmdbId, temporada, episodio);
    return sources.length
      ? {
          tipo: ['mp4', 'hls'].includes(sources[0].provider) ? 'video' : 'iframe',
          url: sources[0].embed_url,
          sources,
          subtitulos: [],
        }
      : null;
  }
  const record = MODO_DEMO ? VIDEO_DEMO : DISPONIBLES[tipo + '-' + tmdbId];
  if (!MODO_DEMO && record?.publicado === false) return null;
  // Para una serie sin episodio concreto, usar la primera fuente configurada.
  if (
    !MODO_DEMO &&
    tipo === 'tv' &&
    temporada === undefined &&
    episodio === undefined &&
    !record?.url &&
    !record?.video
  ) {
    for (const key of Object.keys(record?.episodios || {}).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    )) {
      const parts = /^(\d+)-(\d+)$/.exec(key);
      if (!parts) continue;
      const candidate = obtenerFuente(tipo, tmdbId, Number(parts[1]), Number(parts[2]));
      if (candidate) return candidate;
    }
    return null;
  }
  const source =
    !MODO_DEMO && tipo === 'tv' && temporada !== undefined && episodio !== undefined
      ? record?.episodios?.[temporada + '-' + episodio]
      : record;
  if (!MODO_DEMO && source?.publicado === false) return null;
  const raw = source?.url || source?.video;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const url = new URL(raw, document.baseURI);
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    const subtitulos = (Array.isArray(source.subtitulos) ? source.subtitulos : []).flatMap((track) => {
      try {
        const trackUrl = new URL(track.url || track.src, document.baseURI);
        if ((!track.url && !track.src) || !['https:', 'http:'].includes(trackUrl.protocol)) return [];
        return [
          {
            url: trackUrl.href,
            idioma: track.idioma || track.srclang || 'es',
            label: track.label || 'Subtítulos',
          },
        ];
      } catch {
        return [];
      }
    });
    return { url: url.href, tipo: 'video', subtitulos };
  } catch {
    return null;
  }
}

function estaDisponible(tipo, tmdbId, temporada, episodio) {
  return obtenerFuente(tipo, tmdbId, temporada, episodio) !== null;
}

// TMDB describe estrenos; la disponibilidad de FekaMovies depende de una fuente propia.
function obtenerEstadoContenido(item, tipo, hoy = new Date(), temporada, episodio) {
  if (estaDisponible(tipo, item.id, temporada, episodio)) return { valor: 'available', etiqueta: 'Disponible' };
  const estreno = tipo === 'tv' ? item.first_air_date : item.release_date;
  const fechaHoy = [
    hoy.getFullYear(),
    String(hoy.getMonth() + 1).padStart(2, '0'),
    String(hoy.getDate()).padStart(2, '0'),
  ].join('-');
  const fechaValida =
    typeof estreno === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(estreno) &&
    Number.isFinite(Date.parse(estreno + 'T00:00:00Z')) &&
    new Date(estreno + 'T00:00:00Z').toISOString().slice(0, 10) === estreno;
  return fechaValida && estreno > fechaHoy
    ? { valor: 'upcoming', etiqueta: 'Próximamente' }
    : { valor: 'unavailable', etiqueta: 'No disponible' };
}

let filtroActivo = 'all';
const peticiones = new Map();

// Caché en memoria: hero y fila de estrenos comparten la misma petición.
function consultarTMDB(ruta) {
  if (peticiones.has(ruta)) return peticiones.get(ruta);
  const promise = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      return await window.FekaTMDB.get(ruta, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  })();
  peticiones.set(ruta, promise);
  promise.catch(() => peticiones.delete(ruta));
  return promise;
}

// 02. Elementos DOM: el texto de la API se inserta sin interpretar HTML.
function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function updateControls(container) {
  const end = container.scrollWidth - container.clientWidth;
  document.querySelectorAll('[data-carousel="' + container.id + '"]').forEach((button) => {
    button.disabled = button.dataset.direction === '-1' ? container.scrollLeft <= 2 : container.scrollLeft >= end - 2;
  });
}

function renderSkeletons(container) {
  const fragment = document.createDocumentFragment();
  for (let index = 0; index < 6; index++) {
    const skeleton = createElement('div', 'media-card skeleton');
    skeleton.setAttribute('aria-hidden', 'true');
    skeleton.append(
      createElement('div', 'skeleton__poster'),
      createElement('div', 'skeleton__line'),
      createElement('div', 'skeleton__line'),
    );
    fragment.append(skeleton);
  }
  container.replaceChildren(fragment);
}

const detailRecords = new WeakMap();

// Un único punto actualiza etiquetas, filtros y atenuación de las tarjetas.
function aplicarEstadoTarjeta(card, estado) {
  const available = estado.valor === 'available';
  card.dataset.status = estado.valor;
  card.dataset.available = String(available);
  card.classList.toggle('is-unavailable', !available);
  const badge = card.querySelector('.availability-badge');
  if (badge) {
    badge.textContent = estado.etiqueta;
    badge.classList.toggle('availability-badge--available', available);
  }
}

function crearTarjeta(item, explicitType) {
  // En tendencias mixtas se usa media_type; los otros carruseles pasan el tipo.
  const mediaType = explicitType || item.media_type;
  const title = item.title || item.name || 'Título no disponible';
  const card = createElement('article', 'media-card');
  card.setAttribute('role', 'listitem');
  // Una acción de interfaz usa un botón: no delega enlaces a Windows.
  const link = createElement('button', 'media-card__link');
  link.type = 'button';
  card.dataset.id = String(item.id);
  card.dataset.type = mediaType;
  card.dataset.releaseDate = item.release_date || item.first_air_date || '';
  const estado = obtenerEstadoContenido(item, mediaType);
  link.dataset.id = String(item.id);
  link.dataset.type = mediaType;
  link.setAttribute('aria-haspopup', 'dialog');
  link.setAttribute('aria-controls', 'detail-dialog');
  link.setAttribute('aria-label', 'Ver detalles de ' + title);
  const poster = createElement('span', 'media-card__poster');
  const image = createElement('img');
  image.alt = 'Póster de ' + title;
  image.loading = 'lazy';
  image.decoding = 'async';
  image.width = 500;
  image.height = 750;
  image.addEventListener(
    'error',
    () => {
      image.hidden = true;
      poster.append(createElement('span', 'poster-fallback', 'Póster no disponible'));
    },
    { once: true },
  );
  if (item.poster_path) {
    image.src = TMDB_IMAGE_BASE + item.poster_path;
    poster.append(image);
  } else poster.append(createElement('span', 'poster-fallback', title));
  poster.append(createElement('span', 'availability-badge'));
  const meta = createElement('span', 'media-card__meta');
  const score = Number.isFinite(item.vote_average) ? item.vote_average.toFixed(1) : '—';
  const rating = createElement('span', 'media-card__rating', score);
  rating.setAttribute('aria-label', 'Nota: ' + score + ' de 10');
  meta.append(rating, createElement('span', '', mediaType === 'movie' ? 'Película' : 'Serie'));
  link.append(poster, createElement('span', 'media-card__title', title), meta);
  card.append(link);
  aplicarEstadoTarjeta(card, estado);
  return card;
}

// Fuentes independientes: publicados por el administrador y futuros estrenos de TMDB.
async function consultarFila(ruta) {
  if (ruta === 'published') {
    const unique = new Map();
    for (const record of window.LumenCatalog?.getPublished?.() || [])
      unique.set(record.media_type + '-' + record.tmdb_id, record);
    const results = await Promise.all(
      [...unique.values()].map(async (record) => {
        try {
          return {
            ...(await consultarTMDB('/' + record.media_type + '/' + record.tmdb_id)),
            media_type: record.media_type,
          };
        } catch {
          return { id: record.tmdb_id, title: record.title, media_type: record.media_type };
        }
      }),
    );
    return { results };
  }
  if (ruta === 'upcoming') {
    const today = new Date();
    const date = (value) =>
      [
        value.getFullYear(),
        String(value.getMonth() + 1).padStart(2, '0'),
        String(value.getDate()).padStart(2, '0'),
      ].join('-');
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const end = new Date(today);
    end.setDate(end.getDate() + 180);
    const responses = await Promise.allSettled([
      consultarTMDB(
        '/discover/movie?sort_by=popularity.desc&include_adult=false&primary_release_date.gte=' +
          date(tomorrow) +
          '&primary_release_date.lte=' +
          date(end),
      ),
      consultarTMDB(
        '/discover/tv?sort_by=popularity.desc&include_adult=false&first_air_date.gte=' +
          date(tomorrow) +
          '&first_air_date.lte=' +
          date(end),
      ),
    ]);
    if (responses.every((result) => result.status === 'rejected'))
      throw new Error('No pudimos consultar los estrenos.');
    const results = responses.flatMap((result, index) =>
      result.status === 'fulfilled'
        ? (result.value.results || []).map((item) => ({ ...item, media_type: index ? 'tv' : 'movie' }))
        : [],
    );
    return {
      results: results
        .filter((item) => obtenerEstadoContenido(item, item.media_type).valor === 'upcoming' && item.poster_path)
        .sort((a, b) => (b.popularity || 0) - (a.popularity || 0)),
    };
  }
  return consultarTMDB(ruta);
}

// 03. Una función de renderizado para todas las filas; conserva el filtro al reintentar.
async function cargarFila(ruta, contenedor, tipo) {
  const status = document.getElementById(contenedor.getAttribute('aria-describedby'));
  contenedor.setAttribute('aria-busy', 'true');
  contenedor.dataset.loaded = 'false';
  status.textContent = 'Cargando catálogo…';
  renderSkeletons(contenedor);
  try {
    const data = await consultarFila(ruta);
    if (!Array.isArray(data.results)) throw new Error('Respuesta inesperada');
    const items = data.results
      .filter(
        (item) =>
          item &&
          item.id &&
          (tipo || ['movie', 'tv'].includes(item.media_type)) &&
          (item.poster_path || ruta === 'published'),
      )
      .slice(0, ruta === 'published' ? data.results.length : MAX_RESULTS);
    const fragment = document.createDocumentFragment();
    items.forEach((item) => fragment.append(crearTarjeta(item, tipo)));
    contenedor.replaceChildren(fragment);
    const empty = createElement('div', 'carousel-message filter-empty');
    empty.setAttribute('role', 'listitem');
    empty.append(createElement('p', '', ''));
    contenedor.append(empty);
    contenedor.dataset.loaded = 'true';
    aplicarFiltroFila(contenedor);
    animateCards(contenedor);
  } catch {
    const message = createElement('div', 'carousel-message');
    message.setAttribute('role', 'listitem');
    message.append(
      createElement('p', '', 'No pudimos cargar estas historias. Comprueba tu conexión y vuelve a intentarlo.'),
    );
    const retry = createElement('button', 'button button--secondary', 'Volver a intentar');
    retry.type = 'button';
    retry.addEventListener('click', () => {
      contenedor.focus({ preventScroll: true });
      cargarFila(ruta, contenedor, tipo);
    });
    message.append(retry);
    contenedor.replaceChildren(message);
    status.textContent = 'El catálogo no está disponible temporalmente.';
  } finally {
    contenedor.setAttribute('aria-busy', 'false');
    updateControls(contenedor);
  }
}

function aplicarFiltroFila(contenedor) {
  if (contenedor.dataset.loaded !== 'true') return;
  const cards = [...contenedor.querySelectorAll('.media-card')];
  let visible = 0;
  cards.forEach((card) => {
    card.hidden = filtroActivo === 'all' ? false : card.dataset.status !== filtroActivo;
    if (!card.hidden) visible++;
  });
  const empty = contenedor.querySelector('.filter-empty');
  empty.hidden = visible > 0;
  empty.querySelector('p').textContent = !cards.length
    ? 'Todavía no hay títulos para mostrar.'
    : filtroActivo === 'available'
      ? 'Aún no hay videos disponibles en esta fila.'
      : 'No hay títulos que coincidan con este filtro.';
  document.getElementById(contenedor.getAttribute('aria-describedby')).textContent =
    visible + (visible === 1 ? ' título' : ' títulos');
  // Los filtros recorren todo el catálogo, sin dejar filas vacías ocupando espacio.
  contenedor.closest('.catalogue').hidden = filtroActivo !== 'all' && visible === 0;
  contenedor.scrollLeft = 0;
  updateControls(contenedor);
}

function configurarFiltros() {
  document.querySelectorAll('[data-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      filtroActivo = button.dataset.filter;
      document
        .querySelectorAll('[data-filter]')
        .forEach((control) => control.setAttribute('aria-pressed', String(control === button)));
      document.querySelectorAll('.carousel').forEach(aplicarFiltroFila);
      if (window.ScrollTrigger) ScrollTrigger.refresh();
    });
  });
}

// Slider compartido: selección del administrador o cuatro películas automáticas.
let heroSlider;
async function cargarHero() {
  heroSlider ||= window.FekaHero.create({
    query: consultarTMDB,
    available: estaDisponible,
    catalog: window.LumenCatalog,
  });
  await heroSlider.load();
}

// 04. Animación sobre el artículo; el hover transforma el enlace interior.
function animateCards(container) {
  if (!window.gsap || !window.ScrollTrigger) return;
  gsap.matchMedia().add('(prefers-reduced-motion: no-preference)', () => {
    trackBackgroundAnimation(
      gsap.from(container.querySelectorAll('.media-card:not([hidden])'), {
        opacity: 0,
        y: 22,
        duration: 0.6,
        stagger: 0.065,
        ease: 'power3.out',
        clearProps: 'transform,opacity',
        scrollTrigger: { trigger: container, start: 'top 92%', once: true },
      }),
    );
    ScrollTrigger.refresh();
  });
}
// 05. YouTube: API compartida, candidatos ordenados y sesiones cancelables.
let youtubeApiPromise;
const youtubeSessions = new Map();
const trailerMetadata = new WeakMap();

function getTrailerCandidates(videos) {
  const typeRank = { Trailer: 0, Teaser: 1 };
  const languageRank = { es: 0, en: 1 };
  const seen = new Set();
  return (Array.isArray(videos) ? videos : [])
    .filter((video) => video?.site === 'YouTube' && /^[a-zA-Z0-9_-]{11}$/.test(video.key))
    .sort(
      (a, b) =>
        (typeRank[a.type] ?? 2) - (typeRank[b.type] ?? 2) ||
        (languageRank[a.iso_639_1] ?? 2) - (languageRank[b.iso_639_1] ?? 2) ||
        Number(Boolean(b.official)) - Number(Boolean(a.official)),
    )
    .filter((video) => {
      if (seen.has(video.key)) return false;
      seen.add(video.key);
      return true;
    });
}

function loadYouTubeAPI() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;
  youtubeApiPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const previousReady = window.onYouTubeIframeAPIReady;
    let settled = false;
    function finish(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (window.onYouTubeIframeAPIReady === ready) window.onYouTubeIframeAPIReady = previousReady;
      if (error) {
        script.remove();
        reject(error);
      } else resolve(window.YT);
    }
    function ready() {
      try {
        if (typeof previousReady === 'function') previousReady();
      } finally {
        finish(window.YT?.Player ? null : new Error('API de YouTube no disponible'));
      }
    }
    const timeout = setTimeout(() => finish(new Error('Tiempo de espera de YouTube agotado')), 15000);
    window.onYouTubeIframeAPIReady = ready;
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.referrerPolicy = 'strict-origin-when-cross-origin';
    script.addEventListener('error', () => finish(new Error('No se pudo cargar YouTube')), { once: true });
    document.head.append(script);
  }).catch((error) => {
    youtubeApiPromise = null;
    throw error;
  });
  return youtubeApiPromise;
}

function destroyYouTubePlayer(session) {
  clearTimeout(session.timeout);
  const player = session.player;
  session.player = null;
  if (player) {
    try {
      player.destroy();
    } catch {
      /* El iframe puede haberse eliminado ya. */
    }
  }
}

function destroyTrailer(host) {
  const session = youtubeSessions.get(host);
  if (!session) return;
  session.disposed = true;
  session.attempt++;
  destroyYouTubePlayer(session);
  youtubeSessions.delete(host);
  host.replaceChildren();
}

function showTrailerFallback(host, candidate) {
  const fallback = createElement('div', 'detail__fallback');
  const explanation =
    window.location.protocol === 'file:'
      ? 'Este archivo local no proporciona un origen HTTP. Prueba desde localhost o HTTPS; también puedes abrir el tráiler en YouTube.'
      : 'Este tráiler no se pudo reproducir aquí. Puedes verlo directamente en YouTube.';
  fallback.append(createElement('p', '', candidate ? explanation : 'Tráiler no disponible'));
  if (candidate) {
    const watch = createElement('a', 'detail__watch', 'Ver tráiler en YouTube ↗');
    watch.href = 'https://www.youtube.com/watch?v=' + candidate.key;
    watch.target = '_blank';
    watch.rel = 'noopener';
    fallback.append(watch);
  }
  host.replaceChildren(fallback);
}

async function mountTrailer(host, candidates, title) {
  destroyTrailer(host);
  if (!candidates.length) {
    showTrailerFallback(host);
    return;
  }
  const session = { player: null, disposed: false, attempt: 0, index: 0, timeout: null };
  youtubeSessions.set(host, session);
  const isActive = () => !session.disposed && youtubeSessions.get(host) === session && host.isConnected;
  function fallback() {
    if (!isActive()) return;
    session.attempt++;
    destroyYouTubePlayer(session);
    showTrailerFallback(host, candidates[0]);
  }
  try {
    const api = await loadYouTubeAPI();
    if (!isActive()) return;
    function tryNext() {
      if (!isActive()) return;
      const attempt = ++session.attempt;
      destroyYouTubePlayer(session);
      const candidate = candidates[session.index++];
      if (!candidate) {
        fallback();
        return;
      }
      const iframe = createElement('iframe');
      iframe.title = 'Tráiler de ' + title;
      // Los atributos se fijan ANTES de src y de insertar el iframe.
      iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
      iframe.setAttribute('allow', 'autoplay; encrypted-media; fullscreen');
      iframe.setAttribute('allowfullscreen', '');
      const url = new URL('https://www.youtube.com/embed/' + candidate.key);
      url.search = new URLSearchParams({
        enablejsapi: '1',
        autoplay: '1',
        mute: '1',
        playsinline: '1',
        rel: '0',
      });
      // El origen real protege postMessage; no inventa ni sustituye el Referer.
      if (['http:', 'https:'].includes(window.location.protocol))
        url.searchParams.set('origin', window.location.origin);
      iframe.src = url.href;
      host.replaceChildren(iframe);
      const isCurrent = () => isActive() && attempt === session.attempt;
      session.timeout = setTimeout(() => {
        if (isCurrent()) fallback();
      }, 15000);
      try {
        session.player = new api.Player(iframe, {
          events: {
            onReady(event) {
              if (!isCurrent()) return;
              clearTimeout(session.timeout);
              event.target.mute();
              event.target.playVideo();
            },
            onError(event) {
              if (!isCurrent()) return;
              // 101/150: bloqueo de incrustación. 153: falta de Referer/identidad.
              // También avanzar ante IDs inválidos, eliminados o errores HTML5.
              if ([2, 5, 100, 101, 150, 153].includes(Number(event.data))) tryNext();
              else fallback();
            },
          },
        });
      } catch {
        fallback();
      }
    }
    tryNext();
  } catch {
    fallback();
  }
}

function initializeTrailers(root) {
  return Promise.all(
    [...root.querySelectorAll('.detail__video')].map((host) => {
      const metadata = trailerMetadata.get(host);
      return metadata ? mountTrailer(host, metadata.candidates, metadata.title) : undefined;
    }),
  );
}

// Series · Una petición por temporada, caché en memoria y limpieza al cerrar detalle.
const temporadasCache = new Map();
const selectoresEpisodios = new WeakMap();

function crearSelectorEpisodios(data, serieId, titulo) {
  const root = createElement('section', 'series-episodes');
  const heading = createElement('h3', 'series-episodes__title', 'Temporadas y capítulos');
  heading.id = 'series-episodes-title';
  root.setAttribute('aria-labelledby', heading.id);
  const seasons = [
    ...new Map(
      (Array.isArray(data.seasons) ? data.seasons : [])
        .filter((season) => Number.isInteger(season.season_number) && season.season_number >= 0)
        .map((season) => [season.season_number, season]),
    ).values(),
  ].sort((a, b) => (a.season_number === 0) - (b.season_number === 0) || a.season_number - b.season_number);
  const regular = seasons.filter((season) => season.season_number > 0).length;
  const count = Number.isInteger(data.number_of_episodes) ? data.number_of_episodes : null;
  const summary = createElement(
    'p',
    'series-episodes__summary',
    regular +
      (regular === 1 ? ' temporada' : ' temporadas') +
      (count !== null ? ' · ' + count + (count === 1 ? ' capítulo' : ' capítulos') : '') +
      (seasons.some((season) => season.season_number === 0) ? ' · Incluye especiales' : ''),
  );
  const toolbar = createElement('div', 'series-episodes__toolbar');
  const label = createElement('label', '', 'Temporada');
  label.htmlFor = 'series-season';
  // Combobox propio: el menú abierto conserva los colores de FekaMovies en todos los navegadores.
  const select = createElement('button', 'series-episodes__select');
  select.type = 'button';
  select.id = 'series-season';
  select.setAttribute('role', 'combobox');
  select.setAttribute('aria-haspopup', 'listbox');
  select.setAttribute('aria-expanded', 'false');
  select.setAttribute('aria-controls', 'series-season-options');
  select.setAttribute('aria-label', 'Cambiar temporada');
  const menu = createElement('div', 'season-menu');
  menu.id = 'series-season-options';
  menu.hidden = true;
  menu.setAttribute('role', 'listbox');
  menu.setAttribute('aria-label', 'Temporadas');
  const labels = seasons.map(
    (season) =>
      (season.season_number === 0 ? 'Especiales' : 'Temporada ' + season.season_number) +
      (Number.isInteger(season.episode_count)
        ? ' · ' + season.episode_count + (season.episode_count === 1 ? ' capítulo' : ' capítulos')
        : ''),
  );
  const options = seasons.map((season, index) => {
    const option = createElement('div', 'season-menu__option', labels[index]);
    option.id = 'series-season-option-' + season.season_number;
    option.dataset.seasonIndex = String(index);
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', String(index === 0));
    menu.append(option);
    return option;
  });
  select.disabled = !seasons.length;
  select.value = seasons.length ? String(seasons[0].season_number) : '';
  select.textContent = labels[0] || 'Sin temporadas';
  let activeOption = 0;

  const status = createElement('p', 'series-episodes__status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const list = createElement('div', 'series-episodes__list');
  list.id = 'series-episode-list';
  list.setAttribute('role', 'list');
  const retry = createElement('button', 'button button--secondary series-episodes__retry', 'Reintentar capítulos');
  retry.type = 'button';
  retry.hidden = true;
  toolbar.append(label, select, menu);
  root.append(heading, summary, toolbar, status, list, retry);
  const controller = {
    start,
    destroy,
    refresh() {
      if (!disposed && selectedSeason !== undefined) {
        const cached = temporadasCache.get(serieId + '/' + selectedSeason);
        if (cached) renderEpisodes(cached, selectedSeason);
      }
    },
  };
  selectoresEpisodios.set(root, controller);
  let started = false,
    disposed = false,
    request,
    sequence = 0;
  let selectedSeason;
  let episodesByNumber = new Map();

  function renderEpisodes(episodes, season) {
    const fragment = document.createDocumentFragment();
    episodesByNumber = new Map(
      episodes
        .filter((episode) => Number.isInteger(episode.episode_number) && episode.episode_number > 0)
        .sort((a, b) => a.episode_number - b.episode_number)
        .map((episode) => [episode.episode_number, episode]),
    );
    for (const episode of episodesByNumber.values()) {
      const state = obtenerEstadoContenido(
        { id: serieId, first_air_date: episode.air_date },
        'tv',
        new Date(),
        season,
        episode.episode_number,
      );
      const card = createElement('article', 'series-episode');
      card.setAttribute('role', 'listitem');
      const thumbnail = createElement('span', 'series-episode__thumbnail');
      thumbnail.setAttribute('aria-hidden', 'true');
      thumbnail.append(createElement('span', '', '▶'));
      if (typeof episode.still_path === 'string' && episode.still_path.startsWith('/')) {
        const image = createElement('img');
        image.src = 'https://image.tmdb.org/t/p/w300' + episode.still_path;
        image.alt = '';
        image.loading = 'lazy';
        image.decoding = 'async';
        image.width = 300;
        image.height = 169;
        image.addEventListener('error', () => image.remove(), { once: true });
        thumbnail.append(image);
      }
      const number = createElement('span', 'series-episode__number', season + ' - ' + episode.episode_number);
      number.setAttribute('aria-label', 'Capítulo ' + episode.episode_number);
      const copy = createElement('div', 'series-episode__copy');
      const name = episode.name?.trim() || 'Capítulo ' + episode.episode_number;
      const heading = createElement('h4', '', name);
      const airDate = /^\d{4}-\d{2}-\d{2}$/.test(episode.air_date || '')
        ? new Date(episode.air_date + 'T00:00:00Z')
        : null;
      const dateLabel =
        airDate && Number.isFinite(airDate.getTime())
          ? airDate.toLocaleDateString('es-ES', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              timeZone: 'UTC',
            })
          : 'Fecha por confirmar';
      const meta = createElement(
        'p',
        'series-episode__meta',
        dateLabel + (Number.isFinite(episode.runtime) && episode.runtime > 0 ? ' · ' + episode.runtime + ' min' : ''),
      );
      if (episode.overview?.trim()) card.setAttribute('title', episode.overview.trim());
      const badge = createElement(
        'span',
        'series-episode__state' + (state.valor === 'available' ? ' is-available' : ''),
        state.etiqueta,
      );
      const button = createElement(
        'button',
        'button button--secondary series-episode__play',
        state.valor === 'available' ? '▶ Ver capítulo' : state.etiqueta,
      );
      button.type = 'button';
      button.disabled = state.valor !== 'available';
      button.dataset.episode = String(episode.episode_number);
      button.setAttribute(
        'aria-label',
        (button.disabled ? state.etiqueta + ': ' : 'Reproducir ') +
          'temporada ' +
          season +
          ', capítulo ' +
          episode.episode_number +
          ', ' +
          name,
      );
      copy.append(heading, meta, badge);
      card.append(thumbnail, number, copy, button);
      fragment.append(card);
    }
    list.replaceChildren(fragment);
    status.textContent = episodesByNumber.size
      ? episodesByNumber.size + ' capítulos · Selecciona uno disponible para reproducir.'
      : 'Todavía no hay capítulos para esta temporada.';
  }

  async function loadSeason() {
    if (disposed || !seasons.length) return;
    const season = Number(select.value);
    if (!seasons.some((item) => item.season_number === season)) return;
    request?.abort();
    const token = ++sequence;
    selectedSeason = season;
    episodesByNumber.clear();
    list.replaceChildren();
    retry.hidden = true;
    list.setAttribute('aria-busy', 'true');
    status.textContent = 'Cargando capítulos…';
    const key = serieId + '/' + season;
    const current = new AbortController();
    request = current;
    let timeout;
    try {
      let episodes = temporadasCache.get(key);
      if (!episodes) {
        timeout = setTimeout(() => current.abort(), 15000);
        const data = await window.FekaTMDB.get('/tv/' + serieId + '/season/' + season, { signal: current.signal });
        if (!Array.isArray(data.episodes)) throw new Error('Respuesta de temporada inválida');
        episodes = data.episodes;
        if (disposed || token !== sequence) return;
        temporadasCache.set(key, episodes);
        if (temporadasCache.size > 60) temporadasCache.delete(temporadasCache.keys().next().value);
      }
      if (!disposed && token === sequence) renderEpisodes(episodes, season);
    } catch {
      if (disposed || token !== sequence) return;
      status.textContent = 'No pudimos cargar los capítulos. Comprueba tu conexión y vuelve a intentarlo.';
      retry.hidden = false;
    } finally {
      clearTimeout(timeout);
      if (!disposed && token === sequence) {
        list.setAttribute('aria-busy', 'false');
        request = null;
      }
    }
  }

  function closeSeasonMenu() {
    menu.hidden = true;
    select.setAttribute('aria-expanded', 'false');
    select.removeAttribute('aria-activedescendant');
  }
  function highlightSeason(index) {
    activeOption = Math.min(options.length - 1, Math.max(0, index));
    options.forEach((option, position) => option.setAttribute('data-active', String(position === activeOption)));
    select.setAttribute('aria-activedescendant', options[activeOption].id);
    options[activeOption].scrollIntoView({ block: 'nearest' });
  }
  function openSeasonMenu() {
    if (!options.length) return;
    menu.hidden = false;
    select.setAttribute('aria-expanded', 'true');
    highlightSeason(
      Math.max(
        0,
        seasons.findIndex((season) => String(season.season_number) === select.value),
      ),
    );
  }
  function toggleSeasonMenu() {
    menu.hidden ? openSeasonMenu() : closeSeasonMenu();
  }
  function chooseSeason(index) {
    if (!seasons[index]) return;
    const value = String(seasons[index].season_number);
    const changed = select.value !== value;
    select.value = value;
    select.textContent = labels[index];
    options.forEach((option, position) => option.setAttribute('aria-selected', String(position === index)));
    closeSeasonMenu();
    select.focus({ preventScroll: true });
    if (changed) void loadSeason();
  }
  function clickSeason(event) {
    const option = event.target.closest('[data-season-index]');
    if (option && menu.contains(option)) chooseSeason(Number(option.dataset.seasonIndex));
  }
  function seasonKeys(event) {
    if (event.key === 'Escape' && !menu.hidden) {
      event.preventDefault();
      event.stopPropagation();
      closeSeasonMenu();
      return;
    }
    if (event.key === 'Tab') {
      closeSeasonMenu();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (!options.length) return;
    if (menu.hidden) {
      openSeasonMenu();
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') chooseSeason(activeOption);
    else
      highlightSeason(
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? options.length - 1
            : activeOption + (event.key === 'ArrowDown' ? 1 : -1),
      );
  }
  function outsideSeasonMenu(event) {
    if (!toolbar.contains(event.target)) closeSeasonMenu();
  }

  // Un listener por lista; ningún listener se registra dentro de fetch.
  function playEpisode(event) {
    const button = event.target.closest('[data-episode]');
    if (!button || !list.contains(button) || button.disabled) return;
    const number = Number(button.dataset.episode);
    const episode = episodesByNumber.get(number);
    if (!episode || !estaDisponible('tv', serieId, selectedSeason, number)) return;
    abrirReproductor(
      {
        tipo: 'tv',
        id: serieId,
        temporada: selectedSeason,
        episodio: number,
        serieTitulo: titulo,
        titulo: titulo + ' · T' + selectedSeason + ':E' + number + ' · ' + (episode.name || 'Capítulo ' + number),
      },
      button,
    );
  }
  function start() {
    if (started || disposed) return;
    started = true;
    select.addEventListener('click', toggleSeasonMenu);
    select.addEventListener('keydown', seasonKeys);
    menu.addEventListener('click', clickSeason);
    document.addEventListener('pointerdown', outsideSeasonMenu);
    retry.addEventListener('click', loadSeason);
    list.addEventListener('click', playEpisode);
    if (seasons.length) void loadSeason();
    else status.textContent = 'Todavía no hay información de temporadas para esta serie.';
  }
  function destroy() {
    disposed = true;
    sequence++;
    request?.abort();
    closeSeasonMenu();
    select.removeEventListener('click', toggleSeasonMenu);
    select.removeEventListener('keydown', seasonKeys);
    menu.removeEventListener('click', clickSeason);
    document.removeEventListener('pointerdown', outsideSeasonMenu);
    retry.removeEventListener('click', loadSeason);
    list.removeEventListener('click', playEpisode);
    selectoresEpisodios.delete(root);
  }
  return root;
}

function iniciarSelectoresEpisodios(root) {
  root.querySelectorAll('.series-episodes').forEach((section) => selectoresEpisodios.get(section)?.start());
}
function detenerSelectoresEpisodios(root) {
  root.querySelectorAll('.series-episodes').forEach((section) => selectoresEpisodios.get(section)?.destroy());
}

function renderDetail(data, tipo, id) {
  const fragment = document.createDocumentFragment();
  const title = data.title || data.name || 'Título no disponible';
  const video = createElement('div', 'detail__video');
  const candidates = getTrailerCandidates(data.videos?.results);
  trailerMetadata.set(video, { candidates, title });
  if (candidates.length) video.append(createElement('p', '', 'Cargando tráiler…'));
  else showTrailerFallback(video);
  const copy = createElement('div', 'detail__copy');
  const heading = createElement('h2', 'detail__title', title);
  heading.id = 'detail-title';
  const meta = createElement('div', 'detail__meta');
  const date = data.release_date || data.first_air_date || '';
  const year = /^\d{4}/.test(date) ? date.slice(0, 4) : 'Año no disponible';
  const genres = Array.isArray(data.genres)
    ? data.genres
        .map((genre) => genre.name)
        .filter(Boolean)
        .join(' · ')
    : '';
  const rating = Number.isFinite(data.vote_average) ? data.vote_average.toFixed(1) + ' / 10' : 'Sin nota';
  meta.append(
    createElement('span', '', year),
    createElement('span', '', genres || 'Géneros no disponibles'),
    createElement('span', 'media-card__rating', rating),
  );
  const synopsis =
    typeof data.overview === 'string' && data.overview.trim()
      ? data.overview.trim()
      : 'Todavía no hay una sinopsis disponible en español para este título.';
  copy.append(heading, meta, createElement('p', 'detail__synopsis', synopsis));
  detailRecords.set(copy, { data, tipo, id, title });
  if (tipo === 'tv') {
    copy.append(crearSelectorEpisodios(data, id, title));
  } else actualizarAccionPelicula(copy, { data, tipo, id, title });
  fragment.append(video, copy);
  return fragment;
}

function actualizarAccionPelicula(copy, { data, tipo, id, title }) {
  copy.querySelector('.detail__play')?.remove();
  copy.querySelector('.detail__availability')?.remove();
  if (estaDisponible(tipo, id)) {
    const play = createElement('button', 'button detail__play', '▶ Ver ahora');
    play.type = 'button';
    play.addEventListener('click', () => abrirReproductor({ tipo, id, titulo: title }, play));
    copy.append(play);
  } else
    copy.append(createElement('p', 'detail__availability', obtenerEstadoContenido({ ...data, id }, tipo).etiqueta));
}

function detenerReproductores(root) {
  // Destruir la API antes de quitar el iframe; invalida callbacks pendientes.
  for (const host of youtubeSessions.keys()) {
    if (root === host || root.contains(host)) destroyTrailer(host);
  }
  root.querySelectorAll('video').forEach((player) => {
    player.pause();
    player.removeAttribute('src');
    player.load();
  });
  root.querySelectorAll('iframe').forEach((frame) => frame.remove());
}

// REPRODUCTOR · Reproductor. Las fuentes se resuelven exclusivamente en obtenerFuente.
let playbackController;

function cargarHls() {
  if (window.FekaMedia) return window.FekaMedia.loadHls();
  if (window.Hls) return Promise.resolve(window.Hls);
  return Promise.reject(new Error('Reproductor HLS no disponible'));
}

function formatearTiempo(seconds) {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const minutes = Math.floor(total / 60);
  const rest = String(total % 60).padStart(2, '0');
  return minutes >= 60
    ? Math.floor(minutes / 60) + ':' + String(minutes % 60).padStart(2, '0') + ':' + rest
    : String(minutes).padStart(2, '0') + ':' + rest;
}

function leerRutaReproduccion(hash) {
  const match = /^#\/ver\/(movie|tv)-(\d+)(?:\/(\d+)\/(\d+))?$/.exec(hash);
  return match
    ? {
        tipo: match[1],
        id: match[2],
        temporada: match[3] ? Number(match[3]) : undefined,
        episodio: match[4] ? Number(match[4]) : undefined,
      }
    : null;
}

function abrirReproductor(info, trigger) {
  if (!playbackController) setupPlayback();
  return playbackController?.open(info, trigger) || false;
}

// Resolver el capítulo consecutivo de TMDB; nunca saltar capítulos sin publicar.
async function obtenerSiguienteCapitulo(info) {
  if (
    info.tipo !== 'tv' ||
    !Number.isInteger(info.temporada) ||
    info.temporada < 0 ||
    !Number.isInteger(info.episodio) ||
    info.episodio < 1
  )
    return null;
  async function episodes(season) {
    const key = info.id + '/' + season;
    if (temporadasCache.has(key)) return temporadasCache.get(key);
    const data = await consultarTMDB('/tv/' + info.id + '/season/' + season);
    if (!Array.isArray(data.episodes)) throw new Error('No hay información de capítulos');
    temporadasCache.set(key, data.episodes);
    if (temporadasCache.size > 60) temporadasCache.delete(temporadasCache.keys().next().value);
    return data.episodes;
  }
  const ordered = (items) =>
    items
      .filter((item) => Number.isInteger(item.episode_number) && item.episode_number > 0)
      .sort((a, b) => a.episode_number - b.episode_number);
  const current = ordered(await episodes(info.temporada));
  const index = current.findIndex((episode) => episode.episode_number === info.episodio);
  if (index < 0) return null;
  let season = info.temporada;
  let next = current[index + 1];
  let series;
  if (!next && season > 0) {
    series = await consultarTMDB('/tv/' + info.id);
    const nextSeason = (series.seasons || [])
      .filter((item) => Number.isInteger(item.season_number) && item.season_number > season)
      .sort((a, b) => a.season_number - b.season_number)[0];
    if (nextSeason) {
      season = nextSeason.season_number;
      next = ordered(await episodes(season))[0];
    }
  }
  if (!next) return null;
  const serieTitulo = info.serieTitulo || series?.name || (info.titulo || 'Serie').split(' · T')[0];
  return {
    tipo: 'tv',
    id: info.id,
    temporada: season,
    episodio: next.episode_number,
    serieTitulo,
    titulo:
      serieTitulo +
      ' · T' +
      season +
      ':E' +
      next.episode_number +
      ' · ' +
      (next.name || 'Capítulo ' + next.episode_number),
    disponible: estaDisponible('tv', info.id, season, next.episode_number),
  };
}

function setupPlayback() {
  if (playbackController) return playbackController;
  const dialog = document.getElementById('playback-dialog');
  if (!dialog) return;
  const surface = dialog.querySelector('.playback__surface');
  const host = document.getElementById('playback-video');
  const heading = document.getElementById('playback-title');
  const topbar = dialog.querySelector('.playback__topbar');
  const controls = document.getElementById('playback-controls');
  const play = document.getElementById('playback-play');
  const mute = document.getElementById('playback-mute');
  const volume = document.getElementById('playback-volume');
  const progress = document.getElementById('playback-progress');
  const time = document.getElementById('playback-time');
  const fullscreen = document.getElementById('playback-fullscreen');
  const subtitles = document.getElementById('playback-subtitles');
  const buffering = document.getElementById('playback-buffering');
  const errorBox = document.getElementById('playback-error');
  const errorText = document.getElementById('playback-error-text');
  const hint = document.getElementById('playback-hint');
  const demo = document.getElementById('playback-demo');
  const episodeControls = document.getElementById('playback-episodes');
  const nextButton = document.getElementById('playback-next');
  const autoNext = document.getElementById('playback-autonext');
  const serverControl = document.getElementById('playback-servers');
  const sourceSelect = document.getElementById('playback-source');
  let session, video, hls, fade;
  let sequence = 0;
  let idleTimer;
  let orientationLocked = false;

  const active = (token) => dialog.open && session?.token === token;

  function resetSurface() {
    for (const property of ['opacity', 'transform', 'translate', 'rotate', 'scale', 'visibility', 'will-change'])
      surface.style.removeProperty(property);
  }

  function showControls() {
    surface.classList.remove('controls-hidden');
    clearTimeout(idleTimer);
    if (!video || video.paused || video.ended || !errorBox.hidden || !buffering.hidden) return;
    idleTimer = setTimeout(() => {
      if (controls.contains(document.activeElement) || topbar.contains(document.activeElement)) return;
      surface.classList.add('controls-hidden');
    }, 3000);
  }

  function updateControls() {
    if (!video) return;
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const current = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    progress.disabled = duration <= 0;
    progress.value = duration ? String((current / duration) * 100) : '0';
    progress.setAttribute('aria-valuetext', formatearTiempo(current) + ' de ' + formatearTiempo(duration));
    time.textContent = formatearTiempo(current) + ' / ' + formatearTiempo(duration);
    play.textContent = video.paused ? '▶' : 'Ⅱ';
    play.setAttribute('aria-label', video.paused ? 'Reproducir' : 'Pausar');
    mute.textContent = video.muted || video.volume === 0 ? 'Sonido: no' : 'Sonido: sí';
    mute.setAttribute('aria-label', video.muted ? 'Activar sonido' : 'Silenciar');
    mute.setAttribute('aria-pressed', String(video.muted));
    volume.value = String(video.muted ? 0 : video.volume);
  }

  function showError(message = 'No pudimos reproducir el video. Comprueba tu conexión y vuelve a intentarlo.') {
    buffering.hidden = true;
    errorText.textContent = message;
    errorBox.hidden = false;
    video?.pause();
    showControls();
  }

  function disposeVideo() {
    clearTimeout(idleTimer);
    if (hls) {
      hls.destroy();
      hls = null;
    }
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
      video = null;
    }
    host.querySelectorAll('iframe').forEach((frame) => {
      frame.src = 'about:blank';
    });
    host.replaceChildren();
  }

  async function requestPlay(token = session?.token) {
    if (!video || !active(token)) return;
    try {
      await video.play();
    } catch {
      if (!active(token)) return;
      buffering.hidden = true;
      hint.textContent = 'Pulsa reproducir para empezar.';
      showControls();
    }
  }

  function togglePlay() {
    if (!video) return;
    if (video.paused) {
      if (video.ended) video.currentTime = 0;
      void requestPlay();
    } else video.pause();
    showControls();
  }

  function seek(delta) {
    if (!video || !Number.isFinite(video.duration)) return;
    video.currentTime = Math.min(video.duration, Math.max(0, video.currentTime + delta));
    updateControls();
    showControls();
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (surface.requestFullscreen) {
        await surface.requestFullscreen();
        if (window.matchMedia('(max-width: 680px)').matches && window.screen?.orientation?.lock) {
          try {
            await window.screen.orientation.lock('landscape');
            orientationLocked = true;
          } catch {
            /* La orientación depende del soporte y permisos del navegador. */
          }
          if (!dialog.open && orientationLocked) {
            window.screen.orientation.unlock();
            orientationLocked = false;
          }
        }
      } else if (video?.webkitEnterFullscreen) video.webkitEnterFullscreen();
      else hint.textContent = 'La pantalla completa no está disponible en este navegador.';
    } catch {
      hint.textContent = 'No se pudo activar la pantalla completa.';
    }
    showControls();
  }

  function prepareNext(info, token) {
    const episodic = info.tipo === 'tv' && Number.isInteger(info.temporada) && Number.isInteger(info.episodio);
    episodeControls.hidden = !episodic;
    nextButton.disabled = true;
    nextButton.textContent = 'Buscando siguiente…';
    if (!episodic) return Promise.resolve(null);
    return obtenerSiguienteCapitulo(info)
      .then((next) => {
        if (!active(token)) return null;
        nextButton.disabled = !next?.disponible;
        nextButton.textContent = next
          ? next.disponible
            ? 'Siguiente capítulo →'
            : 'Siguiente no disponible'
          : 'Último capítulo';
        nextButton.setAttribute(
          'aria-label',
          next
            ? 'Siguiente capítulo: temporada ' +
                next.temporada +
                ', capítulo ' +
                next.episodio +
                (next.disponible ? '' : ', no disponible')
            : 'No hay más capítulos',
        );
        return next;
      })
      .catch(() => {
        if (active(token)) nextButton.textContent = 'No pudimos consultar el siguiente';
        return null;
      });
  }

  async function advanceEpisode(automatic = false, token = session?.token) {
    if (!active(token) || session.advancing) return;
    const current = session;
    current.advancing = true;
    const next = await current.nextReady;
    if (!active(token)) return;
    if (automatic && (!autoNext.checked || !video?.ended || !errorBox.hidden)) {
      current.advancing = false;
      return;
    }
    if (!next?.disponible || !estaDisponible('tv', next.id, next.temporada, next.episodio)) {
      current.advancing = false;
      hint.textContent = next
        ? 'El siguiente capítulo todavía no está disponible.'
        : 'No hay otro capítulo disponible para continuar.';
      showControls();
      return;
    }
    // Mantener la misma ventana, pantalla completa y entrada de historial.
    const route = routeFor(next);
    window.history.replaceState(window.history.state, '', route);
    begin(next, current.trigger, { ...current.navigation, route });
  }

  function mountIframe(sources, info, token, index = 0) {
    if (!active(token) || !sources[index]) return;
    host.querySelectorAll('iframe').forEach((frame) => {
      frame.src = 'about:blank';
    });
    const frame = window.LumenCatalog.createFrame(sources[index], info.titulo || 'Reproductor');
    buffering.hidden = false;
    frame.addEventListener('load', () => {
      if (active(token)) buffering.hidden = true;
    });
    host.replaceChildren(frame);
    surface.classList.add('is-embed');
    const episodic = info.tipo === 'tv' && Number.isInteger(info.episodio);
    surface.style.setProperty(
      '--embed-bottom',
      sources.length > 1 ? (episodic ? '200px' : '100px') : episodic ? '140px' : '0px',
    );
    session.embedSources = sources;
    if (sourceSelect) {
      sourceSelect.replaceChildren();
      sources.forEach((source, position) => {
        const option = createElement(
          'option',
          '',
          source.label + ' · ' + (window.LumenCatalog.providers[source.provider] || source.provider),
        );
        option.value = String(position);
        sourceSelect.append(option);
      });
      sourceSelect.value = String(index);
    }
    if (serverControl) serverControl.hidden = sources.length < 2;
    if (episodic)
      hint.textContent = 'Usa Siguiente capítulo para continuar. El avance automático depende del proveedor.';
    showControls();
  }

  async function mountVideo(info, token, index = 0) {
    if (!active(token)) return;
    const original = obtenerFuente(info.tipo, info.id, info.temporada, info.episodio);
    const selected = original?.sources?.[index];
    const source = selected
      ? {
          ...original,
          url: selected.embed_url,
          tipo: ['mp4', 'hls'].includes(selected.provider) ? 'video' : 'iframe',
        }
      : original;
    if (source?.sources) {
      session.embedSources = source.sources;
      sourceSelect.replaceChildren();
      source.sources.forEach((entry, position) => {
        const option = createElement(
          'option',
          '',
          entry.label + ' · ' + (window.LumenCatalog.providers[entry.provider] || entry.provider),
        );
        option.value = String(position);
        sourceSelect.append(option);
      });
      sourceSelect.value = String(index);
      serverControl.hidden = source.sources.length < 2;
    }
    surface.classList.toggle('is-embed', source?.tipo === 'iframe');
    if (!source) {
      showError('Aún no disponible. Puedes volver a los detalles y ver el tráiler.');
      return;
    }
    if (source.tipo === 'iframe') {
      mountIframe(source.sources, info, token, index);
      return;
    }
    const element = createElement('video');
    video = element;
    element.playsInline = true;
    element.preload = 'metadata';
    element.controls = false;
    const initialVolume = Number(volume.value);
    element.volume = Number.isFinite(initialVolume) ? Math.min(1, Math.max(0, initialVolume)) : 0.8;
    element.muted = element.volume === 0;
    element.setAttribute('aria-label', info.titulo || 'Video');
    // No exigir CORS al MP4 demo. Las pistas VTT externas sí lo requieren.
    if (source.subtitulos.length) element.crossOrigin = 'anonymous';
    subtitles.replaceChildren(createElement('option', '', 'Sin subtítulos'));
    subtitles.children[0].value = '-1';
    source.subtitulos.forEach((trackInfo, index) => {
      const track = createElement('track');
      track.kind = 'subtitles';
      track.src = trackInfo.url;
      track.srclang = trackInfo.idioma;
      track.label = trackInfo.label;
      element.append(track);
      const option = createElement('option', '', trackInfo.label);
      option.value = String(index);
      subtitles.append(option);
    });
    subtitles.disabled = source.subtitulos.length === 0;
    for (const eventName of ['timeupdate', 'durationchange', 'volumechange', 'play', 'pause', 'ended']) {
      element.addEventListener(eventName, () => {
        if (active(token)) updateControls();
      });
    }
    element.addEventListener('loadedmetadata', () => {
      if (!active(token)) return;
      updateControls();
      void requestPlay(token);
    });
    for (const eventName of ['waiting', 'stalled'])
      element.addEventListener(eventName, () => {
        if (!active(token)) return;
        buffering.hidden = false;
        showControls();
      });
    for (const eventName of ['canplay', 'playing'])
      element.addEventListener(eventName, () => {
        if (!active(token)) return;
        buffering.hidden = true;
        hint.textContent = '';
        showControls();
      });
    element.addEventListener('pause', () => {
      if (active(token)) showControls();
    });
    element.addEventListener('ended', () => {
      if (!active(token)) return;
      showControls();
      if (autoNext.checked && info.tipo === 'tv') void advanceEpisode(true, token);
    });
    element.addEventListener('error', () => {
      if (active(token)) showError();
    });
    element.addEventListener('click', togglePlay);
    host.replaceChildren(element);
    try {
      const isHls = new URL(source.url).pathname.toLowerCase().endsWith('.m3u8');
      if (
        isHls &&
        (!element.canPlayType('application/vnd.apple.mpegurl') || window.MediaSource || window.ManagedMediaSource)
      ) {
        const HlsClass = await cargarHls();
        if (!active(token) || video !== element) return;
        if (!HlsClass.isSupported()) {
          if (!element.canPlayType('application/vnd.apple.mpegurl')) throw new Error('HLS no soportado');
          element.src = source.url;
          element.load();
          void requestPlay(token);
          return;
        }
        hls = new HlsClass({ enableWorker: true });
        hls.on(HlsClass.Events.ERROR, (_event, data) => {
          if (active(token) && data.fatal) showError();
        });
        hls.attachMedia(element);
        hls.loadSource(source.url);
        void requestPlay(token);
      } else {
        element.src = source.url;
        element.load();
        void requestPlay(token);
      }
    } catch {
      if (active(token)) showError();
    }
  }

  function begin(info, trigger, navigation) {
    const token = ++sequence;
    fade?.kill();
    fade = null;
    disposeVideo();
    resetSurface();
    session = { info, trigger, navigation, token };
    surface.classList.remove('is-embed');
    surface.style.removeProperty('--embed-bottom');
    if (serverControl) serverControl.hidden = true;
    heading.textContent = info.titulo || (info.tipo === 'movie' ? 'Película' : 'Serie') + ' · ' + info.id;
    demo.hidden = !MODO_DEMO;
    errorBox.hidden = true;
    buffering.hidden = false;
    hint.textContent = '';
    progress.value = '0';
    progress.disabled = true;
    time.textContent = '00:00 / 00:00';
    surface.classList.remove('controls-hidden');
    const alreadyOpen = dialog.open;
    if (!alreadyOpen) {
      lockBodyScroll('player');
      try {
        dialog.showModal();
      } catch {
        session = null;
        unlockBodyScroll('player');
        return;
      }
    }
    session.nextReady = prepareNext(info, token);
    // El tráiler se destruye antes de montar cualquier fuente de reproducción.
    detenerReproductores(document.getElementById('detail-dialog'));
    const placeholder = document.querySelector('#detail-dialog .detail__video');
    if (placeholder && !placeholder.children.length)
      placeholder.append(createElement('p', '', 'Tráiler detenido durante la reproducción.'));
    surface.focus({ preventScroll: true });
    const ready = () => {
      resetSurface();
      fade = null;
      if (active(token)) void mountVideo(info, token);
    };
    if (!alreadyOpen && window.gsap && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      fade = gsap.fromTo(
        surface,
        { opacity: 0 },
        { opacity: 1, duration: 0.4, ease: 'power2.out', clearProps: OVERLAY_CLEAR_PROPS, onComplete: ready },
      );
    } else ready();
    if (!info.titulo)
      consultarTMDB('/' + info.tipo + '/' + info.id)
        .then((data) => {
          if (active(token)) heading.textContent = data.title || data.name || heading.textContent;
        })
        .catch(() => {});
  }

  function release() {
    if (!session && !bodyScrollOwners.has('player')) return null;
    const previous = session;
    ++sequence;
    session = null;
    episodeControls.hidden = true;
    nextButton.disabled = true;
    fade?.kill();
    fade = null;
    disposeVideo();
    resetSurface();
    if (document.fullscreenElement && surface.contains(document.fullscreenElement))
      document.exitFullscreen().catch(() => {});
    if (orientationLocked) {
      window.screen.orientation.unlock();
      orientationLocked = false;
    }
    unlockBodyScroll('player');
    if (previous?.trigger?.isConnected) previous.trigger.focus({ preventScroll: true });
    else {
      const details = document.getElementById('detail-dialog');
      const search = document.getElementById('search-dialog');
      const target = details?.open
        ? details.querySelector('.detail__close')
        : search?.open
          ? document.getElementById('search-input')
          : document.getElementById('hero-watch');
      target?.focus({ preventScroll: true });
    }
    return previous;
  }

  function closePlayer(navigate = true) {
    if (!dialog.open && !session) return;
    const previous = session;
    if (dialog.open) dialog.close();
    release();
    if (!navigate || !previous) return;
    if (previous.navigation.pushed && window.location.hash === previous.navigation.route) window.history.back();
    else window.history.replaceState(window.history.state, '', previous.navigation.returnHash || '#inicio');
  }

  function routeFor(info) {
    const chapter =
      Number.isInteger(info.temporada) && info.temporada >= 0 && Number.isInteger(info.episodio) && info.episodio > 0;
    return '#/ver/' + info.tipo + '-' + info.id + (chapter ? '/' + info.temporada + '/' + info.episodio : '');
  }

  function open(info, trigger) {
    if (
      !['movie', 'tv'].includes(info.tipo) ||
      !/^\d+$/.test(String(info.id)) ||
      !estaDisponible(info.tipo, info.id, info.temporada, info.episodio)
    )
      return false;
    const route = routeFor(info);
    if (session?.navigation.route === route && dialog.open) {
      showControls();
      surface.focus();
      return true;
    }
    const returnHash = window.location.hash || '#inicio';
    window.history.pushState(window.history.state, '', route);
    begin(info, trigger, { pushed: true, route, returnHash });
    return true;
  }

  function syncRoute() {
    const info = leerRutaReproduccion(window.location.hash);
    if (!info) {
      if (session) closePlayer(false);
      return;
    }
    if (session?.navigation.route === window.location.hash && dialog.open) return;
    begin(info, null, { pushed: false, route: window.location.hash, returnHash: '#inicio' });
  }

  document.getElementById('playback-close').addEventListener('click', () => closePlayer());
  play.addEventListener('click', togglePlay);
  nextButton.addEventListener('click', () => void advanceEpisode());
  sourceSelect?.addEventListener('change', () => {
    if (!session?.embedSources) return;
    const index = Number(sourceSelect.value);
    disposeVideo();
    session.token = ++sequence;
    session.nextReady = prepareNext(session.info, session.token);
    errorBox.hidden = true;
    buffering.hidden = false;
    hint.textContent = '';
    void mountVideo(session.info, session.token, index);
  });
  mute.addEventListener('click', () => {
    if (video) {
      video.muted = !video.muted;
      updateControls();
      showControls();
    }
  });
  volume.addEventListener('input', () => {
    if (video) {
      video.volume = Number(volume.value);
      video.muted = Number(volume.value) === 0;
      updateControls();
    }
  });
  progress.addEventListener('input', () => {
    if (video && Number.isFinite(video.duration)) {
      video.currentTime = (Number(progress.value) / 100) * video.duration;
      updateControls();
      showControls();
    }
  });
  fullscreen.addEventListener('click', () => void toggleFullscreen());
  subtitles.addEventListener('change', () => {
    if (video)
      [...video.textTracks].forEach((track, index) => {
        track.mode = String(index) === subtitles.value ? 'showing' : 'disabled';
      });
  });
  document.getElementById('playback-retry').addEventListener('click', () => {
    if (session) begin(session.info, session.trigger, session.navigation);
  });
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    closePlayer();
  });
  dialog.addEventListener('close', () => {
    if (!dialog.open && bodyScrollOwners.has('player')) {
      const previous = release();
      if (previous) window.history.replaceState(window.history.state, '', previous.navigation.returnHash || '#inicio');
    }
  });
  dialog.addEventListener('keydown', (event) => {
    showControls();
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closePlayer();
      return;
    }
    if (event.target.closest('input, select, textarea')) return;
    const key = event.key.toLowerCase();
    if (event.code === 'Space' && !event.target.closest('button, a')) {
      event.preventDefault();
      togglePlay();
    } else if (key === 'arrowleft') {
      event.preventDefault();
      seek(-10);
    } else if (key === 'arrowright') {
      event.preventDefault();
      seek(10);
    } else if (key === 'f') {
      event.preventDefault();
      void toggleFullscreen();
    } else if (key === 'm') {
      event.preventDefault();
      if (video) {
        video.muted = !video.muted;
        updateControls();
      }
    }
  });
  for (const eventName of ['pointermove', 'pointerdown', 'focusin', 'focusout'])
    surface.addEventListener(eventName, showControls);
  document.addEventListener('fullscreenchange', () => {
    fullscreen.setAttribute(
      'aria-label',
      document.fullscreenElement ? 'Salir de pantalla completa' : 'Pantalla completa',
    );
    if (!document.fullscreenElement && orientationLocked) {
      window.screen.orientation.unlock();
      orientationLocked = false;
    }
    showControls();
  });
  window.addEventListener('hashchange', syncRoute);
  window.addEventListener('popstate', syncRoute);
  playbackController = { open, close: closePlayer, sync: syncRoute };
  syncRoute();
  return playbackController;
}

// Los overlays adquieren un propietario; cerrar uno no desbloquea al otro.
const bodyScrollOwners = new Set();
let bodyScrollPosition = 0;
let bodyStyleBeforeLock;

const pausedBackgroundTweens = new Set();
const pausedBackgroundTriggers = new Set();

function pauseBackgroundMotion() {
  document.body.classList.toggle('modal-open', true);
  const main = document.querySelector('main');
  // Nunca pausar globalTimeline: los overlays deben poder animarse.
  if (window.gsap?.getTweensOf) {
    const targets = document.querySelectorAll('main, main *');
    for (const tween of gsap.getTweensOf(targets)) {
      if (!tween.paused()) {
        tween.pause();
        pausedBackgroundTweens.add(tween);
      }
    }
  }
  if (main && window.ScrollTrigger?.getAll) {
    for (const trigger of ScrollTrigger.getAll()) {
      if (trigger.enabled && trigger.trigger && main.contains(trigger.trigger)) {
        trigger.disable(false);
        pausedBackgroundTriggers.add(trigger);
      }
    }
  }
}

function resumeBackgroundMotion() {
  document.body.classList.toggle('modal-open', false);
  for (const trigger of pausedBackgroundTriggers) trigger.enable(false, false);
  pausedBackgroundTriggers.clear();
  for (const tween of pausedBackgroundTweens) {
    if (tween.parent && tween.paused()) tween.resume();
  }
  pausedBackgroundTweens.clear();
}

function trackBackgroundAnimation(animation) {
  // Un fetch del catálogo puede crear un tween mientras el modal ya está abierto.
  if (bodyScrollOwners.size) {
    if (!animation.paused()) {
      animation.pause();
      pausedBackgroundTweens.add(animation);
    }
    if (animation.scrollTrigger?.enabled) {
      animation.scrollTrigger.disable(false);
      pausedBackgroundTriggers.add(animation.scrollTrigger);
    }
  }
  return animation;
}

function lockBodyScroll(owner) {
  if (bodyScrollOwners.has(owner)) return;
  if (!bodyScrollOwners.size) {
    bodyScrollPosition = window.scrollY;
    pauseBackgroundMotion();
    bodyStyleBeforeLock = document.body.getAttribute('style');
    Object.assign(document.body.style, {
      position: 'fixed',
      top: '-' + bodyScrollPosition + 'px',
      width: '100%',
      overflow: 'hidden',
    });
  }
  bodyScrollOwners.add(owner);
}

function unlockBodyScroll(owner) {
  if (!bodyScrollOwners.delete(owner) || bodyScrollOwners.size) return;
  if (bodyStyleBeforeLock === null) document.body.removeAttribute('style');
  else document.body.setAttribute('style', bodyStyleBeforeLock);
  window.scrollTo({ top: bodyScrollPosition, behavior: 'instant' });
  resumeBackgroundMotion();
}

// Persistencia opcional: un fallo de localStorage desactiva recientes, no la búsqueda.
const RECENT_SEARCHES_KEY = 'lumen_busquedas';
let recentStorageAvailable = true;

function leerBusquedasRecientes() {
  if (!recentStorageAvailable) return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(RECENT_SEARCHES_KEY) || '[]');
    const seen = new Set();
    return (Array.isArray(value) ? value : [])
      .filter((text) => {
        if (typeof text !== 'string' || text.trim().length < 2) return false;
        const key = text.trim().toLocaleLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((text) => text.trim())
      .slice(0, 8);
  } catch {
    recentStorageAvailable = false;
    return [];
  }
}

function escribirBusquedasRecientes(texts) {
  if (!recentStorageAvailable) return;
  try {
    window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(texts.slice(0, 8)));
  } catch {
    recentStorageAvailable = false;
  }
}

function guardarBusquedaReciente(text) {
  const query = typeof text === 'string' ? text.trim() : '';
  if (query.length < 2) return;
  const previous = leerBusquedasRecientes();
  const key = query.toLocaleLowerCase();
  escribirBusquedasRecientes([query, ...previous.filter((entry) => entry.toLocaleLowerCase() !== key)]);
}

// Mantener también la promesa: abrir/cerrar y volver a escribir no repite el fetch.
let tendenciasCache = null;
let tendenciasPromise;
function obtenerTendenciasDiarias() {
  if (tendenciasCache) return Promise.resolve(tendenciasCache);
  if (!tendenciasPromise) {
    tendenciasPromise = consultarTMDB('/trending/all/day').then((data) => {
      if (!Array.isArray(data.results)) throw new Error('Respuesta inesperada');
      tendenciasCache = data.results
        .filter((item) => item && ['movie', 'tv'].includes(item.media_type) && item.poster_path && item.id)
        .slice(0, 12);
      return tendenciasCache;
    });
  }
  return tendenciasPromise;
}

let activeSection = 'inicio';
function refreshNavigation(id = activeSection) {
  activeSection = id;
  const searching = document.getElementById('search-dialog')?.open;
  document.querySelectorAll('.nav a, .bottom-nav a').forEach((link) => {
    const active = link.hash === '#' + id && !(searching && link.classList.contains('bottom-nav__item'));
    if (active) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });
  const searchTab = document.getElementById('mobile-search');
  if (searching) searchTab?.setAttribute('aria-current', 'page');
  else searchTab?.removeAttribute('aria-current');
  document
    .querySelectorAll('[data-open-search]')
    .forEach((control) => control.setAttribute('aria-expanded', String(!!searching)));
}

const initializedSearchDialogs = new WeakSet();

function setupSearch() {
  const dialog = document.getElementById('search-dialog');
  if (!dialog || initializedSearchDialogs.has(dialog)) return;
  initializedSearchDialogs.add(dialog);
  const input = document.getElementById('search-input');
  const grid = document.getElementById('search-results');
  const status = document.getElementById('search-status');
  const retry = document.getElementById('search-retry');
  const title = document.getElementById('search-title');
  const typeFilters = document.getElementById('search-type-filters');
  const initial = document.getElementById('search-initial');
  const recents = document.getElementById('search-recents');
  const chips = document.getElementById('recent-chips');
  const trends = document.getElementById('trends-results');
  const trendsStatus = document.getElementById('trends-status');
  const inner = dialog.querySelector('.search__inner');
  const detail = document.getElementById('detail-dialog');
  let timer, request, lastTrigger;
  let version = 0;
  let filter = 'all';
  let items = [];
  let completedQuery = '';
  let panelAnimation, resultsAnimation, trendsAnimation, chipsAnimation;

  function clearAnimation(target, animation) {
    animation?.kill();
    for (const element of target) {
      for (const property of ['opacity', 'transform', 'translate', 'rotate', 'scale', 'visibility', 'will-change'])
        element.style.removeProperty(property);
    }
  }

  function animate(nodes) {
    if (!window.gsap || !nodes.length || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    return gsap.fromTo(
      nodes,
      { opacity: 0, y: 16 },
      { opacity: 1, y: 0, duration: 0.45, stagger: 0.035, ease: 'power3.out', clearProps: 'opacity,transform' },
    );
  }

  function renderRecents() {
    clearAnimation(chips.querySelectorAll('.recent-chip'), chipsAnimation);
    const searches = leerBusquedasRecientes();
    const fragment = document.createDocumentFragment();
    searches.forEach((query, index) => {
      const chip = createElement('div', 'recent-chip');
      chip.setAttribute('role', 'listitem');
      // Botones hermanos: nunca anidar el botón ✕ dentro de otro botón.
      const button = createElement('button', 'recent-chip__query', query);
      button.type = 'button';
      button.id = 'recent-query-' + index;
      button.dataset.recentAction = 'search';
      button.dataset.query = query;
      button.setAttribute('aria-label', 'Buscar ' + query);
      const remove = createElement('button', 'recent-chip__remove', '✕');
      remove.type = 'button';
      remove.dataset.recentAction = 'remove';
      remove.dataset.query = query;
      remove.setAttribute('aria-label', 'Quitar búsqueda');
      remove.setAttribute('aria-describedby', button.id);
      chip.append(button, remove);
      fragment.append(chip);
    });
    chips.replaceChildren(fragment);
    recents.hidden = !searches.length;
    if (!initial.hidden) chipsAnimation = animate(chips.querySelectorAll('.recent-chip'));
  }

  async function showInitialView(currentVersion) {
    initial.hidden = false;
    typeFilters.hidden = true;
    grid.hidden = true;
    retry.hidden = true;
    title.textContent = 'Encuentra tu próxima historia';
    status.textContent = 'Escribe al menos 2 caracteres para buscar.';
    renderRecents();
    clearAnimation(trends.querySelectorAll('.media-card'), trendsAnimation);
    trends.setAttribute('aria-busy', 'true');
    if (!tendenciasCache) {
      trendsStatus.textContent = 'Cargando…';
      renderSkeletons(trends);
    }
    try {
      const dailyItems = await obtenerTendenciasDiarias();
      // Una respuesta de tendencias nunca sustituye resultados de una búsqueda.
      if (!dialog.open || currentVersion !== version || input.value.trim().length >= 2) return;
      const fragment = document.createDocumentFragment();
      dailyItems.forEach((item) => fragment.append(crearTarjeta(item, item.media_type)));
      trends.replaceChildren(fragment);
      trendsStatus.textContent = dailyItems.length
        ? 'Las historias que están marcando el día.'
        : 'Hoy no hay tendencias para mostrar.';
      trendsAnimation = animate(trends.querySelectorAll('.media-card'));
    } catch {
      if (!dialog.open || currentVersion !== version || input.value.trim().length >= 2) return;
      trends.replaceChildren();
      trendsStatus.textContent = 'No pudimos cargar las tendencias. Puedes seguir buscando películas y series.';
    } finally {
      if (currentVersion === version) trends.setAttribute('aria-busy', 'false');
    }
  }

  function renderResults() {
    clearAnimation(grid.querySelectorAll('.media-card'), resultsAnimation);
    const visible = items.filter((item) => filter === 'all' || item.media_type === filter);
    const fragment = document.createDocumentFragment();
    visible.forEach((item) => fragment.append(crearTarjeta(item, item.media_type)));
    grid.replaceChildren(fragment);
    status.textContent = visible.length
      ? visible.length + ' resultados para «' + completedQuery + '»'
      : 'No encontramos resultados para «' +
        completedQuery +
        '»' +
        (filter === 'movie' ? ' en Películas.' : filter === 'tv' ? ' en Series.' : '.');
    resultsAnimation = animate(grid.querySelectorAll('.media-card'));
  }

  async function search(query, currentVersion) {
    const controller = new AbortController();
    request = controller;
    try {
      const data = await window.FekaTMDB.get('/search/multi?include_adult=false&query=' + encodeURIComponent(query), {
        signal: controller.signal,
      });
      if (currentVersion !== version || !dialog.open) return;
      if (!Array.isArray(data.results)) throw new Error('Respuesta inesperada');
      items = data.results.filter(
        (item) => item && ['movie', 'tv'].includes(item.media_type) && item.poster_path && item.id,
      );
      completedQuery = query;
      renderResults();
    } catch (error) {
      if (error.name === 'AbortError' || currentVersion !== version || !dialog.open) return;
      grid.replaceChildren();
      status.textContent = 'No pudimos buscar tus historias. Comprueba tu conexión y vuelve a intentarlo.';
      retry.hidden = false;
    } finally {
      if (currentVersion === version) {
        grid.setAttribute('aria-busy', 'false');
        request = null;
      }
    }
  }

  function scheduleSearch(immediate = false) {
    clearTimeout(timer);
    request?.abort();
    request = null;
    const currentVersion = ++version;
    const query = input.value.trim();
    completedQuery = '';
    items = [];
    retry.hidden = true;
    clearAnimation(grid.querySelectorAll('.media-card'), resultsAnimation);
    if (query.length < 2) {
      grid.replaceChildren();
      grid.setAttribute('aria-busy', 'false');
      void showInitialView(currentVersion);
      return;
    }
    initial.hidden = true;
    typeFilters.hidden = false;
    grid.hidden = false;
    title.textContent = 'Resultados para “' + query + '”';
    grid.setAttribute('aria-busy', 'true');
    status.textContent = 'Buscando…';
    renderSkeletons(grid);
    if (immediate === true) void search(query, currentVersion);
    else
      timer = setTimeout(() => {
        if (currentVersion === version && dialog.open) void search(query, currentVersion);
      }, 350);
  }

  // visualViewport se reduce al abrir el teclado, sin cambiar el zoom del usuario.
  function fitSearchViewport() {
    if (!dialog.open || !window.visualViewport) return;
    dialog.style.setProperty('--search-height', window.visualViewport.height + 'px');
    dialog.style.setProperty('--search-viewport-top', window.visualViewport.offsetTop + 'px');
    if (document.activeElement === input && !detail.open) input.scrollIntoView({ block: 'nearest' });
  }
  window.visualViewport?.addEventListener('resize', fitSearchViewport, { passive: true });
  window.visualViewport?.addEventListener('scroll', fitSearchViewport, { passive: true });

  function openSearch(trigger) {
    if (detail.open) return;
    lastTrigger = trigger;
    if (!dialog.open) {
      lockBodyScroll('search');
      try {
        dialog.showModal();
      } catch {
        unlockBodyScroll('search');
        return;
      }
      if (window.gsap && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        clearAnimation([inner], panelAnimation);
        panelAnimation = gsap.fromTo(
          inner,
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, duration: 0.45, ease: 'power3.out', clearProps: OVERLAY_CLEAR_PROPS },
        );
      }
      scheduleSearch();
    }
    refreshNavigation();
    fitSearchViewport();
    input.focus({ preventScroll: true });
  }

  function releaseSearch() {
    clearTimeout(timer);
    request?.abort();
    request = null;
    version++;
    clearAnimation([inner], panelAnimation);
    clearAnimation(grid.querySelectorAll('.media-card'), resultsAnimation);
    clearAnimation(trends.querySelectorAll('.media-card'), trendsAnimation);
    clearAnimation(chips.querySelectorAll('.recent-chip'), chipsAnimation);
    input.value = '';
    grid.replaceChildren();
    trends.replaceChildren();
    chips.replaceChildren();
    grid.setAttribute('aria-busy', 'false');
    trends.setAttribute('aria-busy', 'false');
    items = [];
    completedQuery = '';
    filter = 'all';
    document
      .querySelectorAll('[data-search-filter]')
      .forEach((control) => control.setAttribute('aria-pressed', String(control.dataset.searchFilter === 'all')));
    unlockBodyScroll('search');
    dialog.style.removeProperty('--search-height');
    dialog.style.removeProperty('--search-viewport-top');
    refreshNavigation();
    if (lastTrigger?.isConnected) lastTrigger.focus({ preventScroll: true });
  }

  function closeSearch() {
    if (!dialog.open || detail.open || document.getElementById('playback-dialog')?.open) return;
    dialog.close();
    releaseSearch();
  }

  document.querySelectorAll('[data-open-search]').forEach((control) => {
    control.addEventListener('click', () => openSearch(control));
  });
  input.addEventListener('input', (event) => {
    if (!event.isComposing) scheduleSearch();
  });
  input.addEventListener('compositionend', () => scheduleSearch());
  document.getElementById('search-form').addEventListener('submit', (event) => {
    event.preventDefault();
    guardarBusquedaReciente(input.value);
    scheduleSearch(true);
  });
  // Chips con delegación: búsquedas y borrado usan botones independientes.
  chips.addEventListener('click', (event) => {
    const control = event.target.closest('[data-recent-action]');
    if (!control || !chips.contains(control)) return;
    const query = control.dataset.query;
    if (control.dataset.recentAction === 'remove') {
      escribirBusquedasRecientes(
        leerBusquedasRecientes().filter((entry) => entry.toLocaleLowerCase() !== query.toLocaleLowerCase()),
      );
      renderRecents();
      input.focus({ preventScroll: true });
    } else {
      input.value = query;
      input.focus({ preventScroll: true });
      scheduleSearch(true);
    }
  });
  document.getElementById('recent-clear').addEventListener('click', () => {
    escribirBusquedasRecientes([]);
    renderRecents();
    input.focus({ preventScroll: true });
  });
  document.getElementById('search-cancel').addEventListener('click', closeSearch);
  retry.addEventListener('click', () => scheduleSearch(true));
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeSearch();
  });
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !detail.open) {
      event.preventDefault();
      event.stopPropagation();
      closeSearch();
    }
  });
  dialog.addEventListener('close', () => {
    if (!dialog.open && bodyScrollOwners.has('search')) releaseSearch();
  });
  document.querySelectorAll('[data-search-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      filter = button.dataset.searchFilter;
      document
        .querySelectorAll('[data-search-filter]')
        .forEach((control) => control.setAttribute('aria-pressed', String(control === button)));
      if (completedQuery) renderResults();
    });
  });
  document.addEventListener('keydown', (event) => {
    const focused = document.activeElement;
    const editing = focused && (['INPUT', 'TEXTAREA', 'SELECT'].includes(focused.tagName) || focused.isContentEditable);
    if (
      event.key === '/' &&
      !editing &&
      !event.defaultPrevented &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !event.repeat &&
      !event.isComposing &&
      !detail.open &&
      !document.getElementById('playback-dialog')?.open
    ) {
      event.preventDefault();
      openSearch(focused);
    }
  });
}

const initializedDetailDialogs = new WeakSet();

function setupDetailModal() {
  const dialog = document.getElementById('detail-dialog');
  if (!dialog || initializedDetailDialogs.has(dialog)) return;
  const panel = dialog.querySelector('.detail__panel');
  const content = dialog.querySelector('.detail__content');
  const status = dialog.querySelector('.detail__status');
  const close = dialog.querySelector('.detail__close');
  if (!panel || !content || !status || !close) return;
  initializedDetailDialogs.add(dialog);

  let request;
  let lastTrigger;
  let openingAnimation;
  let entryFinished = Promise.resolve(true);
  let settleEntry;
  let scrollLocked = false;
  let startedOnBackdrop = false;

  function resetEntryStyles() {
    for (const property of ['opacity', 'transform', 'translate', 'rotate', 'scale', 'visibility', 'will-change']) {
      panel.style.removeProperty(property);
    }
  }

  function clearOpeningAnimation() {
    const settle = settleEntry;
    settleEntry = null;
    openingAnimation?.kill();
    openingAnimation = null;
    resetEntryStyles();
    settle?.(false);
    entryFinished = Promise.resolve(true);
  }

  function animateEntry() {
    if (!window.gsap || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      entryFinished = Promise.resolve(true);
      return;
    }
    entryFinished = new Promise((resolve) => {
      settleEntry = resolve;
      const mobileSheet = matchMedia('(max-width: 680px)').matches;
      openingAnimation = gsap.fromTo(
        panel,
        { opacity: 0, scale: mobileSheet ? 1 : 0.96, y: mobileSheet ? 48 : 0 },
        {
          opacity: 1,
          scale: 1,
          y: 0,
          duration: 0.45,
          ease: 'power3.out',
          overwrite: 'auto',
          clearProps: OVERLAY_CLEAR_PROPS,
          onComplete() {
            if (settleEntry !== resolve) return;
            resetEntryStyles();
            openingAnimation = null;
            settleEntry = null;
            resolve(true);
          },
          onInterrupt() {
            if (settleEntry !== resolve) return;
            resetEntryStyles();
            openingAnimation = null;
            settleEntry = null;
            resolve(false);
          },
        },
      );
    });
  }

  function releaseModal() {
    drag = null;
    dragTween?.kill();
    request?.abort();
    request = null;
    startedOnBackdrop = false;
    clearOpeningAnimation();
    detenerSelectoresEpisodios(content);
    detenerReproductores(content);
    content.replaceChildren();
    content.setAttribute('aria-busy', 'false');
    status.textContent = '';
    if (!scrollLocked) return;
    scrollLocked = false;
    unlockBodyScroll('detail');
    if (lastTrigger?.isConnected) lastTrigger.focus({ preventScroll: true });
  }

  function closeDetail() {
    if (!dialog.open || document.getElementById('playback-dialog')?.open) return;
    dialog.close();
    // Limpiar aquí: el evento nativo close se entrega en una tarea posterior.
    releaseModal();
  }

  async function openDetail(id, type, trigger, playImmediately = false) {
    if (!['movie', 'tv'].includes(type) || !/^\d+$/.test(String(id))) return;
    request?.abort();
    const currentRequest = new AbortController();
    request = currentRequest;
    lastTrigger = trigger;
    startedOnBackdrop = false;
    let timeout;
    try {
      detenerSelectoresEpisodios(content);
      detenerReproductores(content);
      content.replaceChildren();
      const loadingTitle = createElement('h2', 'detail__title', 'Detalles del título');
      loadingTitle.id = 'detail-title';
      const loadingCopy = createElement('div', 'detail__copy');
      loadingCopy.append(loadingTitle);
      content.append(loadingCopy);
      content.setAttribute('aria-busy', 'true');
      status.textContent = 'Cargando...';
      if (!dialog.open) {
        clearOpeningAnimation();
        lockBodyScroll('detail');
        scrollLocked = true;
        dialog.showModal();
        animateEntry();
      }
      dialog.scrollTop = 0;
      close.focus({ preventScroll: true });
      timeout = setTimeout(() => currentRequest.abort(), 15000);
      const data = await window.FekaTMDB.get(
        '/' + type + '/' + id + '?append_to_response=videos&include_video_language=es,en,null',
        { signal: currentRequest.signal },
      );
      if (!dialog.open || request !== currentRequest) return;
      content.replaceChildren(renderDetail(data, type, id));
      iniciarSelectoresEpisodios(content);
      // renderDetail solo crea texto/placeholder. El iframe espera onComplete;
      // si el fetch tarda más, espera también a que estén listos los datos.
      const ready = await entryFinished;
      if (!ready || !dialog.open || request !== currentRequest) return;
      if (playImmediately && type === 'movie' && estaDisponible(type, id))
        abrirReproductor({ tipo: type, id, titulo: data.title || data.name || 'Video' }, trigger);
      else if (!document.getElementById('playback-dialog')?.open) void initializeTrailers(content);
      status.textContent = '';
    } catch {
      if (request !== currentRequest) return;
      if (!dialog.open) {
        releaseModal();
        return;
      }
      clearOpeningAnimation();
      status.textContent = 'No pudimos cargar los detalles. Comprueba tu conexión y vuelve a intentarlo.';
      const retry = createElement('button', 'button button--secondary', 'Volver a intentar');
      retry.type = 'button';
      retry.addEventListener('click', () => openDetail(id, type, lastTrigger, playImmediately));
      const actions = createElement('div', 'detail__error');
      actions.append(retry);
      content.append(actions);
    } finally {
      clearTimeout(timeout);
      if (request === currentRequest) content.setAttribute('aria-busy', 'false');
    }
  }

  // Una misma delegación para carruseles y resultados; nunca dentro de fetch.
  document.querySelectorAll('.carousel, .search-results').forEach((carousel) => {
    carousel.addEventListener('click', (event) => {
      const trigger = event.target.closest('.media-card__link[data-id][data-type]');
      if (!trigger) return;
      event.preventDefault();
      // Solo confirmar consultas al abrir un resultado, nunca una tendencia.
      if (carousel.id === 'search-results') guardarBusquedaReciente(document.getElementById('search-input').value);
      openDetail(trigger.dataset.id, trigger.dataset.type, trigger);
    });
  });
  const heroWatch = document.getElementById('hero-watch');
  heroWatch?.addEventListener('click', () => {
    if (!heroWatch.dataset.id) {
      cargarHero();
      return;
    }
    openDetail(heroWatch.dataset.id, heroWatch.dataset.type, heroWatch, heroWatch.dataset.play === 'true');
  });
  // Gesto solo en el asa: no captura los controles del tráiler ni el scroll de la sinopsis.
  const handle = dialog.querySelector('.detail__sheet-handle');
  let drag;
  let dragTween;
  handle?.addEventListener('pointerdown', (event) => {
    if (!matchMedia('(max-width: 680px)').matches || event.button !== 0 || openingAnimation || !dialog.open) return;
    dragTween?.kill();
    drag = { id: event.pointerId, start: event.clientY, distance: 0 };
    handle.setPointerCapture?.(event.pointerId);
  });
  handle?.addEventListener('pointermove', (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    drag.distance = Math.max(0, event.clientY - drag.start);
    if (window.gsap) gsap.set(panel, { y: drag.distance });
    else panel.style.transform = 'translateY(' + drag.distance + 'px)';
  });
  const finishDrag = (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    const dismiss = event.type !== 'pointercancel' && drag.distance > 100;
    drag = null;
    if (handle.hasPointerCapture?.(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    if (dismiss) {
      resetEntryStyles();
      closeDetail();
    } else if (window.gsap && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      dragTween = gsap.to(panel, { y: 0, duration: 0.2, ease: 'power2.out', clearProps: OVERLAY_CLEAR_PROPS });
    } else resetEntryStyles();
  };
  handle?.addEventListener('pointerup', finishDrag);
  handle?.addEventListener('pointercancel', finishDrag);
  dialog.addEventListener('close', () => {
    if (!dialog.open) {
      drag = null;
      dragTween?.kill();
      resetEntryStyles();
    }
  });
  close.addEventListener('click', closeDetail);
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeDetail();
  });

  function isBackdrop(event) {
    if (event.target !== dialog) return false;
    const rect = dialog.getBoundingClientRect();
    return (
      event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom
    );
  }
  dialog.addEventListener('pointerdown', (event) => {
    startedOnBackdrop = event.button === 0 && isBackdrop(event);
  });
  dialog.addEventListener('pointercancel', () => {
    startedOnBackdrop = false;
  });
  dialog.addEventListener('click', (event) => {
    const shouldClose = startedOnBackdrop && isBackdrop(event);
    startedOnBackdrop = false;
    if (shouldClose) closeDetail();
  });
  dialog.addEventListener('close', () => {
    // Un close encolado de la apertura anterior no debe vaciar una nueva.
    if (!dialog.open && scrollLocked) releaseModal();
  });
}

async function actualizarCatalogoPublicado() {
  if (!window.LumenCatalog?.configured) return;
  try {
    await window.LumenCatalog.load();
    await cargarHero();
    await cargarFila('published', document.getElementById('disponibles-carousel'), null);
    document.querySelectorAll('.media-card[data-id]').forEach((card) => {
      const state = obtenerEstadoContenido(
        { id: card.dataset.id, release_date: card.dataset.releaseDate, first_air_date: card.dataset.releaseDate },
        card.dataset.type,
      );
      aplicarEstadoTarjeta(card, state);
    });
    document.querySelectorAll('.carousel').forEach(aplicarFiltroFila);
    document.querySelectorAll('.series-episodes').forEach((section) => selectoresEpisodios.get(section)?.refresh());
    heroSlider?.refreshAvailability();
    document.querySelectorAll('.detail__copy').forEach((copy) => {
      const info = detailRecords.get(copy);
      if (!info || info.tipo !== 'movie') return;
      actualizarAccionPelicula(copy, info);
    });
  } catch {
    /* Conservar la última lectura de la visita si falla la red. */
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  if (window.LumenCatalog?.configured) {
    try {
      await window.LumenCatalog.load();
    } catch {
      const status = document.getElementById('catalog-connection');
      if (status) {
        status.hidden = false;
        status.textContent = 'No pudimos consultar los reproductores publicados. Recarga para volver a intentarlo.';
      }
    }
  }
  if (window.LumenCatalog?.configured) {
    window.addEventListener('focus', () => void actualizarCatalogoPublicado());
    if ('BroadcastChannel' in window) {
      const updates = new BroadcastChannel('lumen-catalog');
      updates.onmessage = () => void actualizarCatalogoPublicado();
    }
  }
  setupPlayback();
  setupDetailModal();
  setupSearch();
  configurarFiltros();
  // Header transparente al inicio; scroll pasivo sin recalcular el layout.
  const header = document.querySelector('.header');
  const updateHeader = () => header.classList.toggle('is-scrolled', window.scrollY > 12);
  updateHeader();
  window.addEventListener('scroll', updateHeader, { passive: true });
  // Carruseles: scroll táctil, teclado nativo y botones anterior/siguiente.
  if (window.gsap && window.ScrollTrigger) gsap.registerPlugin(ScrollTrigger);
  const catalogues = [
    ['published', 'disponibles-carousel', null],
    ['/movie/now_playing', 'peliculas-carousel', 'movie'],
    ['upcoming', 'proximamente-carousel', null],
    ['/trending/all/week', 'mas-vistos-carousel', null],
    ['/tv/popular', 'series-carousel', 'tv'],
  ];
  const resizeObserver = window.ResizeObserver
    ? new ResizeObserver((entries) => {
        entries.forEach(({ target }) => updateControls(target));
      })
    : null;
  catalogues.forEach(([endpoint, id, explicitType]) => {
    const container = document.getElementById(id);
    container.addEventListener('scroll', () => updateControls(container), { passive: true });
    resizeObserver?.observe(container);
    cargarFila(endpoint, container, explicitType);
  });
  cargarHero();
  document.querySelectorAll('[data-carousel]').forEach((button) => {
    button.addEventListener('click', () => {
      const container = document.getElementById(button.dataset.carousel);
      container.scrollBy({
        left: Number(button.dataset.direction) * container.clientWidth * 0.85,
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      });
    });
  });
  // Enlace activo según la sección visible, también al navegar con el teclado.
  if ('IntersectionObserver' in window) {
    const sectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          refreshNavigation(entry.target.id);
        });
      },
      { rootMargin: '-20% 0px -50% 0px' },
    );
    document
      .querySelectorAll('main section[id]:not(.offline-status)')
      .forEach((section) => sectionObserver.observe(section));
  }

  // Pausar efectos decorativos al salir de pantalla o cambiar de pestaña.
  // La suspensión por modal sigue siendo independiente (body.modal-open).
  const heroElement = document.querySelector('.hero');
  let heroVisible = true;
  const syncHeroMotion = () => heroElement.classList.toggle('hero--paused', !heroVisible || document.hidden);
  document.addEventListener('visibilitychange', syncHeroMotion);
  if ('IntersectionObserver' in window) {
    const heroObserver = new IntersectionObserver(
      (entries) => {
        heroVisible = entries[0].isIntersecting;
        syncHeroMotion();
      },
      { threshold: 0 },
    );
    heroObserver.observe(heroElement);
  }
  syncHeroMotion();

  // Mejora progresiva: todo permanece visible si GSAP no está disponible.
  if (!window.gsap) return;
  if (window.ScrollTrigger) gsap.registerPlugin(ScrollTrigger);
  gsap.matchMedia().add('(prefers-reduced-motion: no-preference)', () => {
    trackBackgroundAnimation(
      gsap
        .timeline({ defaults: { ease: 'power3.out' } })
        .from('.eyebrow', { opacity: 0, y: 12, duration: 0.6 }, 0.1)
        .from('.hero__description', { opacity: 0, y: 16, duration: 0.6 }, 0.65)
        .from('.hero__actions', { opacity: 0, y: 14, duration: 0.6 }, 0.85)
        .from('.hero__bottom, .scroll-indicator', { opacity: 0, duration: 0.6 }, 1),
    );
    // El fondo permanece fijo dentro del hero; evitar transformar toda la escena al hacer scroll.
  });
});
