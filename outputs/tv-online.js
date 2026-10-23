/* TV online · Catálogo de iptv-org. La guía EPG y las señales son fuentes distintas. */
(() => {
  'use strict';
  const API = 'https://iptv-org.github.io/api/';
  const PAGE_SIZE = 24;
  const categories = {
    general: 'General',
    news: 'Noticias',
    entertainment: 'Entretenimiento',
    music: 'Música',
    movies: 'Cine',
    series: 'Series',
    sports: 'Deportes',
    kids: 'Infantil',
    culture: 'Cultura',
    education: 'Educación',
    documentary: 'Documentales',
    lifestyle: 'Estilo de vida',
    religious: 'Religión',
    business: 'Economía',
    travel: 'Viajes',
    cooking: 'Cocina',
    science: 'Ciencia',
    animation: 'Animación',
    weather: 'Tiempo',
    auto: 'Motor',
    outdoor: 'Naturaleza',
    shop: 'Compras',
    comedy: 'Comedia',
    classic: 'Clásicos',
    legislative: 'Parlamento',
    family: 'Familia',
    relax: 'Relax',
    public: 'Pública',
    interactive: 'Interactiva',
  };
  const node = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  function safeHls(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password && url.pathname.toLowerCase().endsWith('.m3u8')
        ? url.href
        : null;
    } catch {
      return null;
    }
  }
  // Excluir señales que exigen cabeceras especiales: el navegador no puede configurarlas.
  function buildChannels(streams, metadata) {
    const channels = new Map(metadata.filter((item) => !item.is_nsfw && !item.closed).map((item) => [item.id, item]));
    const grouped = new Map();
    for (const stream of streams) {
      const channel = channels.get(stream.channel);
      const url = safeHls(stream.url);
      if (!channel || !url || stream.referrer || stream.user_agent || stream.labels?.includes('Geo-blocked')) continue;
      if (!grouped.has(channel.id)) grouped.set(channel.id, { ...channel, sources: [] });
      const entry = grouped.get(channel.id);
      if (!entry.sources.some((source) => source.url === url))
        entry.sources.push({ url, quality: stream.quality || 'HLS', title: stream.title || stream.feed || 'Señal' });
    }
    const preferred = ['PE', 'ES', 'AR', 'MX', 'CO', 'CL', 'EC', 'UY'];
    for (const channel of grouped.values())
      channel.sources.sort(
        (a, b) =>
          Number(/spanish|español|castellano/i.test(b.title)) - Number(/spanish|español|castellano/i.test(a.title)),
      );
    return [...grouped.values()].sort((a, b) => {
      const rank = (value) => (preferred.includes(value) ? preferred.indexOf(value) : 99);
      return rank(a.country) - rank(b.country) || a.name.localeCompare(b.name, 'es');
    });
  }

  function init() {
    const section = document.getElementById('tv-online');
    if (!section || section.dataset.ready) return;
    section.dataset.ready = 'true';
    const $ = (id) => document.getElementById(id);
    const grid = $('tv-grid'),
      status = $('tv-status'),
      search = $('tv-query'),
      country = $('tv-country'),
      category = $('tv-category');
    const more = $('tv-more'),
      retry = $('tv-retry'),
      host = $('tv-video'),
      message = $('tv-player-status');
    const placeholder = $('tv-placeholder'),
      play = $('tv-play'),
      stop = $('tv-stop'),
      scroller = $('tv-channel-scroll');
    let cache,
      pending,
      visible = PAGE_SIZE,
      filtered = [],
      player,
      current,
      sourceIndex = 0,
      generation = 0;
    const countryName = (code) => {
      try {
        return new Intl.DisplayNames(['es'], { type: 'region' }).of(code);
      } catch {
        return code;
      }
    };
    function dispose() {
      ++generation;
      player?.destroy();
      player = null;
      host.replaceChildren();
      stop.hidden = true;
    }
    function markSelection() {
      grid
        .querySelectorAll('[data-channel]')
        .forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.channel === current?.id)));
    }
    function ready(text) {
      placeholder.hidden = false;
      play.disabled = !current;
      play.setAttribute('aria-label', current ? 'Reproducir ' + current.name : 'Reproducir canal');
      $('tv-ready-title').textContent = current?.name || 'Elige un canal';
      $('tv-ready-help').textContent = 'La reproducción empieza solo cuando tú pulses play.';
      $('tv-playback-state').textContent = current ? 'LISTO PARA REPRODUCIR' : 'TV EN DIRECTO';
      message.textContent =
        text ||
        (current
          ? countryName(current.country) + ' · Pulsa play para conectar.'
          : 'Selecciona un canal de la lista para prepararlo.');
    }
    // Elegir un canal nunca crea un video ni descarga el manifiesto HLS.
    function selectChannel(channel) {
      dispose();
      current = channel;
      sourceIndex = 0;
      $('tv-player-title').textContent = channel.name;
      $('tv-stage').style.setProperty(
        '--channel-hue',
        String([...channel.id].reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % 360),
      );
      $('tv-signal').replaceChildren();
      channel.sources.forEach((source, index) => {
        const option = node('option', '', source.title + ' · ' + source.quality + ' · ' + (index + 1));
        option.value = String(index);
        $('tv-signal').append(option);
      });
      $('tv-signal-label').hidden = channel.sources.length < 2;
      ready();
      markSelection();
    }
    function channelButton(channel) {
      const button = node('button', 'tv-channel');
      button.type = 'button';
      button.dataset.channel = channel.id;
      button.setAttribute('aria-label', 'Seleccionar ' + channel.name);
      button.setAttribute('aria-pressed', String(channel.id === current?.id));
      const identity = node('span', 'tv-channel__identity', channel.name.slice(0, 2).toLocaleUpperCase());
      identity.setAttribute('aria-hidden', 'true');
      identity.style.setProperty(
        '--channel-hue',
        String([...channel.id].reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % 360),
      );
      const copy = node('span', 'tv-channel__copy');
      copy.append(
        node('strong', '', channel.name),
        node(
          'span',
          'tv-channel__meta',
          countryName(channel.country) + ' · ' + (categories[channel.categories?.[0]] || 'General'),
        ),
      );
      const indicator = node('span', 'tv-channel__indicator', '›');
      indicator.setAttribute('aria-hidden', 'true');
      button.append(identity, copy, indicator);
      return button;
    }
    function updateCount() {
      status.textContent = filtered.length
        ? Math.min(visible, filtered.length) + ' de ' + filtered.length + ' canales'
        : 'No encontramos canales con estos filtros.';
      more.hidden = filtered.length <= visible;
    }
    function appendChannels(from) {
      const fragment = document.createDocumentFragment();
      filtered.slice(from, visible).forEach((channel) => fragment.append(channelButton(channel)));
      grid.append(fragment);
      updateCount();
    }
    function render() {
      if (!cache) return;
      const query = search.value.trim().toLocaleLowerCase();
      filtered = cache.filter(
        (channel) =>
          (!country.value || channel.country === country.value) &&
          (!category.value || channel.categories?.includes(category.value)) &&
          (!query ||
            [channel.name, ...(channel.alt_names || [])].some((name) => name.toLocaleLowerCase().includes(query))),
      );
      grid.replaceChildren();
      appendChannels(0);
      scroller.scrollTop = 0;
      if (window.gsap && !matchMedia('(prefers-reduced-motion: reduce)').matches)
        gsap.fromTo(
          [...grid.children].slice(0, 8),
          { opacity: 0, y: 6 },
          { opacity: 1, y: 0, duration: 0.3, stagger: 0.025, clearProps: 'transform,opacity' },
        );
    }
    function loadMore() {
      if (visible >= filtered.length) return;
      const from = visible;
      visible += PAGE_SIZE;
      appendChannels(from);
    }
    async function load() {
      if (cache || pending) return;
      pending = true;
      retry.hidden = true;
      status.textContent = 'Cargando canales…';
      grid.setAttribute('aria-busy', 'true');
      grid.replaceChildren();
      for (let i = 0; i < 6; i++) {
        const skeleton = node('div', 'tv-skeleton');
        skeleton.setAttribute('aria-hidden', 'true');
        grid.append(skeleton);
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const fetchJSON = async (file) => {
          const response = await fetch(API + file, { signal: controller.signal });
          if (!response.ok) throw new Error('Catálogo no disponible');
          const data = await response.json();
          if (!Array.isArray(data)) throw new Error('Formato inválido');
          return data;
        };
        const [streams, metadata] = await Promise.all([fetchJSON('streams.json'), fetchJSON('channels.json')]);
        cache = buildChannels(streams, metadata);
        if (!cache.length) throw new Error('Sin señales compatibles');
        [...new Set(cache.map((channel) => channel.country))]
          .sort((a, b) => countryName(a).localeCompare(countryName(b), 'es'))
          .forEach((code) => {
            const option = node('option', '', countryName(code));
            option.value = code;
            country.append(option);
          });
        [...new Set(cache.flatMap((channel) => channel.categories || []))]
          .sort((a, b) => (categories[a] || a).localeCompare(categories[b] || b, 'es'))
          .forEach((group) => {
            const option = node('option', '', categories[group] || group);
            option.value = group;
            category.append(option);
          });
        render();
        if (!current) selectChannel(cache[0]);
      } catch {
        cache = null;
        grid.replaceChildren();
        status.textContent = 'No pudimos cargar los canales. Puedes volver a intentarlo.';
        retry.hidden = false;
      } finally {
        controller.abort();
        clearTimeout(timeout);
        pending = false;
        grid.setAttribute('aria-busy', 'false');
      }
    }
    // Solo se llama por Play o como alternativa tras un error de una reproducción iniciada.
    function playSource() {
      if (!current || document.body.classList.contains('modal-open')) return;
      dispose();
      const token = generation;
      const channel = current;
      placeholder.hidden = true;
      stop.hidden = false;
      $('tv-playback-state').textContent = 'CONECTANDO';
      message.textContent = 'Conectando con la señal…';
      $('tv-signal').value = String(sourceIndex);
      player = window.FekaMedia.mount(host, channel.sources[sourceIndex].url, {
        onPlaying: () => {
          if (token !== generation) return;
          $('tv-playback-state').textContent = 'EN DIRECTO';
          message.textContent = countryName(channel.country) + ' · ' + channel.sources[sourceIndex].quality;
        },
        onError: () => {
          if (token !== generation) return;
          dispose();
          if (sourceIndex + 1 < channel.sources.length) {
            sourceIndex++;
            playSource();
          } else ready('Esta señal no está disponible ahora. Elige otra señal o canal, o pulsa play para reintentar.');
        },
      });
      player.video.setAttribute('aria-label', 'Reproductor de ' + channel.name);
    }
    grid.addEventListener('click', (event) => {
      const button = event.target.closest('[data-channel]');
      const channel = cache?.find((item) => item.id === button?.dataset.channel);
      if (!channel) return;
      selectChannel(channel);
      if (matchMedia('(max-width: 980px)').matches)
        $('tv-stage').scrollIntoView({
          block: 'start',
          behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
        });
    });
    play.addEventListener('click', () => {
      // Un reintento explícito vuelve a la señal seleccionada (o a la primera si todas fallaron).
      playSource();
    });
    stop.addEventListener('click', () => {
      dispose();
      ready('Reproducción detenida. Pulsa play para volver a conectar.');
      play.focus({ preventScroll: true });
    });
    $('tv-signal').addEventListener('change', () => {
      if (!current) return;
      dispose();
      sourceIndex = Number($('tv-signal').value);
      ready('Señal preparada. Pulsa play para reproducir.');
    });
    [search, country, category].forEach((control) =>
      control.addEventListener(control === search ? 'input' : 'change', () => {
        visible = PAGE_SIZE;
        render();
      }),
    );
    more.addEventListener('click', loadMore);
    scroller.addEventListener(
      'scroll',
      () => {
        if (scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 100) loadMore();
      },
      { passive: true },
    );
    retry.addEventListener('click', () => void load());
    // Los otros modales ocultan main: detener esta fuente para evitar audio oculto.
    if (window.MutationObserver)
      new MutationObserver(() => {
        if (player && document.body.classList.contains('modal-open')) {
          dispose();
          ready('Reproducción detenida. Pulsa play para continuar.');
        }
      }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && player) {
        dispose();
        ready('Pulsa play para continuar viendo el canal.');
      }
    });
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            observer.disconnect();
            void load();
          }
        },
        { rootMargin: '500px' },
      );
      observer.observe(section);
    } else void load();
  }

  window.FekaTV = Object.freeze({ init, safeHls, buildChannels });
})();
