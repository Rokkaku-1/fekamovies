/* Catálogo público: URL normalizada, proveedores permitidos y fuentes publicadas. */
(() => {
  'use strict';
  const config = window.LUMEN_SUPABASE_CONFIG || {};
  const configured = Boolean(config.url && config.publishableKey);
  const providers = Object.freeze({
    okru: 'OK.ru',
    youtube: 'YouTube',
    vimeo: 'Vimeo',
    dailymotion: 'Dailymotion',
    mp4: 'Video MP4',
    hls: 'HLS · m3u8',
  });
  let records = [];
  let pending;
  let loaded = false;

  async function readPublicTable(table, params, signal) {
    const url = new URL(config.url + '/rest/v1/' + table);
    url.search = new URLSearchParams(params);
    const response = await fetch(url, {
      headers: { apikey: config.publishableKey },
      cache: 'no-store',
      signal,
    });
    if (!response.ok) throw new Error('No pudimos consultar el catálogo publicado.');
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error('Respuesta de catálogo inválida.');
    return data;
  }

  function normalizeFeatured(slides) {
    const seen = new Set();
    return (Array.isArray(slides) ? slides : [])
      .filter((item) => {
        const key = item?.type + '-' + item?.id;
        if (!['movie', 'tv'].includes(item?.type) || !Number.isSafeInteger(item.id) || item.id <= 0 || seen.has(key))
          return false;
        seen.add(key);
        return true;
      })
      .slice(0, 4);
  }

  function normalizeEmbed(input, expectedProvider) {
    let value = String(input || '').trim();
    if (value.startsWith('<')) {
      const doc = new DOMParser().parseFromString(value, 'text/html');
      const frames = doc.querySelectorAll('iframe');
      if (frames.length !== 1) throw new Error('Pega un único iframe o un enlace de reproductor.');
      value = frames[0].getAttribute('src') || '';
    }
    if (value.startsWith('//')) value = 'https:' + value;
    let url;
    try {
      url = new URL(value);
    } catch {
      throw new Error('El enlace no es válido.');
    }
    if (url.protocol !== 'https:' || url.username || url.password)
      throw new Error('Usa una dirección HTTPS sin credenciales.');
    let provider, id, canonical;
    if (
      ['ok.ru', 'www.ok.ru'].includes(url.hostname) &&
      (id = /^\/(?:video|videoembed)\/(\d+)\/?$/.exec(url.pathname)?.[1])
    ) {
      provider = 'okru';
      canonical = 'https://ok.ru/videoembed/' + id;
    } else if (['youtube.com', 'www.youtube.com', 'www.youtube-nocookie.com', 'youtu.be'].includes(url.hostname)) {
      id =
        url.hostname === 'youtu.be'
          ? url.pathname.slice(1)
          : /^\/embed\/([\w-]{11})\/?$/.exec(url.pathname)?.[1] ||
            (url.pathname === '/watch' ? url.searchParams.get('v') : null);
      if (/^[\w-]{11}$/.test(id || '')) {
        provider = 'youtube';
        canonical = 'https://www.youtube.com/embed/' + id;
      }
    } else if (
      ['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'].includes(url.hostname) &&
      (id = /^\/(?:video\/)?(\d+)\/?$/.exec(url.pathname)?.[1])
    ) {
      provider = 'vimeo';
      canonical = 'https://player.vimeo.com/video/' + id;
    } else if (['www.dailymotion.com', 'dailymotion.com', 'dai.ly'].includes(url.hostname)) {
      id =
        url.hostname === 'dai.ly'
          ? /^\/([a-zA-Z0-9]+)\/?$/.exec(url.pathname)?.[1]
          : /^\/(?:embed\/)?video\/([a-zA-Z0-9]+)\/?$/.exec(url.pathname)?.[1];
      if (id) {
        provider = 'dailymotion';
        canonical = 'https://www.dailymotion.com/embed/video/' + id;
      }
    }
    if (!provider || !canonical) throw new Error('Proveedor no admitido. Usa OK.ru, YouTube, Vimeo o Dailymotion.');
    if (expectedProvider && provider !== expectedProvider)
      throw new Error('El proveedor seleccionado no coincide con el enlace.');
    return { provider, url: canonical };
  }

  // Los enlaces firmados conservan sus parámetros. Nunca se ejecuta HTML de una fuente directa.
  function normalizeSource(input, provider) {
    if (!['mp4', 'hls'].includes(provider)) return normalizeEmbed(input, provider);
    let url;
    try {
      url = new URL(String(input || '').trim());
    } catch {
      throw new Error('Pega una URL HTTPS del archivo de video.');
    }
    const extension = provider === 'hls' ? '.m3u8' : '.mp4';
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      !url.pathname.toLowerCase().endsWith(extension) ||
      url.href.length >= 1000
    )
      throw new Error(
        'La fuente debe ser una URL HTTPS sin credenciales que termine en ' +
          extension +
          ' (puede incluir parámetros).',
      );
    url.hash = '';
    return { provider, url: url.href };
  }

  async function load() {
    if (!configured) return [];
    if (pending) return pending;
    pending = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      try {
        const all = [];
        // Paginación: no depender del límite por defecto de PostgREST.
        for (let offset = 0; ; offset += 500) {
          const page = await readPublicTable(
            'lumen_embeds',
            {
              select: 'id,media_type,tmdb_id,season,episode,title,provider,embed_url,label,published',
              published: 'eq.true',
              order: 'created_at.asc,id.asc',
              limit: '500',
              offset: String(offset),
            },
            controller.signal,
          );
          for (const record of page) {
            try {
              const embed = normalizeSource(record.embed_url, record.provider);
              all.push({ ...record, embed_url: embed.url });
            } catch {
              /* Ignorar una fuente inválida. */
            }
          }
          if (page.length < 500) break;
        }
        records = all;
        loaded = true;
        return records;
      } finally {
        clearTimeout(timeout);
        pending = null;
      }
    })();
    return pending;
  }
  function getSources(type, id, season, episode) {
    return records.filter(
      (record) =>
        record.published === true &&
        record.media_type === type &&
        String(record.tmdb_id) === String(id) &&
        (type !== 'tv' ||
          (season === undefined && episode === undefined) ||
          (record.season === Number(season) && record.episode === Number(episode))),
    );
  }
  function createFrame(source, title) {
    const normalized = normalizeEmbed(source.embed_url || source.url, source.provider);
    const frame = document.createElement('iframe');
    frame.src = normalized.url;
    frame.title = title || 'Reproductor';
    frame.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture';
    frame.allowFullscreen = true;
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
    frame.setAttribute('allowfullscreen', '');
    return frame;
  }
  async function getFeatured() {
    if (!configured) return [];
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const rows = await readPublicTable('lumen_homepage', { select: 'slides', id: 'eq.1' }, controller.signal);
      return normalizeFeatured(rows[0]?.slides);
    } finally {
      clearTimeout(timeout);
    }
  }
  window.LumenCatalog = Object.freeze({
    configured,
    providers,
    normalizeEmbed,
    normalizeSource,
    normalizeFeatured,
    load,
    getSources,
    createFrame,
    getFeatured,
    getPublished: () => records.filter((record) => record.published === true).map((record) => ({ ...record })),
    get loaded() {
      return loaded;
    },
  });
})();
