/* TV online · Catálogo de iptv-org. La guía EPG y las señales son fuentes distintas. */
(() => {
  'use strict';
  const API = 'https://iptv-org.github.io/api/';
  const PAGE_SIZE = 24;
  const categoryLabels = {movies:'Cine', music:'Música', kids:'Infantiles', sports:'Deportes', news:'Noticias', series:'Series', entertainment:'Entretenimiento', general:'General', culture:'Cultura', documentary:'Documentales', education:'Educación', animation:'Animación', comedy:'Comedia', cooking:'Cocina', lifestyle:'Estilo de vida', science:'Ciencia', travel:'Viajes', business:'Economía', religious:'Religión', legislative:'Institucional', outdoor:'Naturaleza', relaxation:'Relajación', shop:'Compras', weather:'Tiempo', auto:'Motor', classic:'Clásicos', family:'Familia', other:'Otros'};
  const channelCategories = channel => channel.categories?.length ? channel.categories : ['other'];
  const football = window.FekaFootball;
  const selection = window.FekaTVCuration;
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
  function safeImage(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
    } catch { return null; }
  }
  function buildChannels(streams, metadata, feeds = [], logos = []) {
    const channels = new Map(metadata.filter((item) => selection.rank(item) >= 0).map((item) => [item.id, item]));
    const feedMap = new Map(feeds.map(feed => [feed.channel + '/' + feed.id, feed]));
    const mainFeeds = new Map(feeds.filter(feed => feed.is_main).map(feed => [feed.channel, feed]));
    const logoMap = new Map();
    for (const logo of logos) {
      const url = safeImage(logo.url);
      if (!url || !channels.has(logo.channel) || logo.in_use === false) continue;
      const score = Number(logo.in_use === true) * 4 + Number(!logo.feed) * 2 + Number(logo.tags?.includes('horizontal'));
      if (!logoMap.has(logo.channel) || logoMap.get(logo.channel).score < score)
        logoMap.set(logo.channel, {url, score});
    }
    const grouped = new Map();
    for (const stream of streams) {
      const channel = channels.get(stream.channel);
      const url = safeHls(stream.url);
      if (!channel || !url || stream.referrer || stream.user_agent || stream.labels?.includes('Geo-blocked')) continue;
      const feed = stream.feed ? feedMap.get(channel.id + '/' + stream.feed) : mainFeeds.get(channel.id);
      if (!selection.acceptsFeed(channel.country, feed)) continue;
      if (!grouped.has(channel.id)) grouped.set(channel.id, { ...channel, logo: logoMap.get(channel.id)?.url || null, footballKind: football.channelKind(channel), programmes: [], sources: [] });
      const entry = grouped.get(channel.id);
      if (!entry.sources.some((source) => source.url === url))
        entry.sources.push({ url, quality: stream.quality || 'HLS', title: stream.title || feed?.name || 'Señal', languages: feed?.languages || [], isMain: Boolean(feed?.is_main) });
    }
    // Acceso oficial explícito cuando la API no tiene una señal HLS compatible.
    for (const [id, official] of Object.entries(selection.officialPages)) {
      const channel = channels.get(id);
      if (!channel || grouped.has(id)) continue;
      grouped.set(id, {...channel, name: official.name, logo: logoMap.get(id)?.url || null,
        footballKind: football.channelKind(channel), programmes: [],
        sources: [{url: official.url, kind: 'official-page', quality: 'Sitio oficial', title: 'América tvGO', languages: official.languages, isMain: true}],
      });
    }
    const preferred = Object.keys(selection.countries);
    for (const channel of grouped.values())
      channel.sources.sort(
        (a, b) =>
          selection.languageRank(channel.country, a.languages) - selection.languageRank(channel.country, b.languages) ||
          Number(b.isMain) - Number(a.isMain) ||
          (parseInt(b.quality, 10) || 0) - (parseInt(a.quality, 10) || 0),
      );
    const counts = new Map();
    return [...grouped.values()].sort((a, b) => {
      const rank = (value) => (preferred.includes(value) ? preferred.indexOf(value) : 99);
      return rank(a.country) - rank(b.country) || selection.rank(a) - selection.rank(b);
    }).filter(channel => {
      const count = counts.get(channel.country) || 0;
      counts.set(channel.country, count + 1);
      return count < selection.limitForCountry(channel.country);
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
    const confirmed = $('tv-confirmed'), guideStatus = $('tv-guide-status');
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
    let guideProgrammes = [], guidePending = false;
    const countryName = (code) => {
      try {
        return new Intl.DisplayNames(['es'], { type: 'region' }).of(code);
      } catch {
        return code;
      }
    };
    const languageName = (channel) => {
      const languages = channel.sources[0]?.languages || [];
      if (!languages.length) return 'Idioma no indicado';
      try {
        const names = new Intl.DisplayNames(['es'], {type: 'language'});
        return languages.map(code => names.of(code)).join(', ');
      } catch { return languages.join(', '); }
    };
    const channelType = (channel) => {
      return categoryLabels[channelCategories(channel)[0]] || 'Otros';
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
      const official = current?.sources[sourceIndex]?.kind === 'official-page';
      play.setAttribute('aria-label', official ? 'Abrir emisión oficial de ' + current.name + ' (nueva pestaña)' : current ? 'Reproducir ' + current.name : 'Reproducir canal');
      $('tv-ready-title').textContent = current?.name || 'Elige un canal';
      $('tv-ready-help').textContent = official ? 'Pulsa play para abrir América tvGO en una nueva pestaña.' : 'La reproducción empieza solo cuando tú pulses play.';
      $('tv-playback-state').textContent = current ? 'LISTO PARA REPRODUCIR' : 'TV EN DIRECTO';
      message.textContent =
        text ||
        (current
          ? countryName(current.country) + (official ? ' · Emisión en el sitio oficial.' : ' · Pulsa play para conectar.')
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
      renderProgramme();
      markSelection();
    }
    function nextProgramme(channel) {
      const now = Date.now();
      return channel?.programmes?.find(p => p.stop > now);
    }
    function programmeText(programme) {
      if (!programme) return 'Partido sin confirmar';
      const when = new Intl.DateTimeFormat('es', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'}).format(programme.start);
      return (programme.start <= Date.now() ? 'En emisión' : when) + ' · ' + programme.title;
    }
    function renderProgramme() {
      const panel = $('tv-programme');
      panel.replaceChildren();
      const programme = nextProgramme(current);
      panel.append(node('span', 'tv-match-label', programme ? 'PROGRAMACIÓN CONFIRMADA' : 'PROGRAMACIÓN'));
      panel.append(node('strong', '', programme ? programmeText(programme) : current?.footballKind ? 'Partido sin confirmar' : 'Sin programación confirmada'));
      panel.append(node('span', 'tv-match-help', programme
        ? football.competitions.find(item => item.id === programme.competition).label + ' · Horario de tu dispositivo. La guía no garantiza la señal.'
        : 'Idioma: ' + (current ? languageName(current) : 'según la señal') + '. La guía disponible solo confirma partidos de fútbol.'));
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
      if (channel.logo) {
        const logo = node('img', 'tv-channel__logo');
        logo.alt = '';
        logo.loading = 'lazy';
        logo.decoding = 'async';
        logo.referrerPolicy = 'no-referrer';
        logo.addEventListener('error', () => {
          identity.replaceChildren(document.createTextNode(channel.name.slice(0, 2).toLocaleUpperCase()));
        }, {once: true});
        logo.src = channel.logo;
        identity.replaceChildren(logo);
      }
      const copy = node('span', 'tv-channel__copy');
      copy.append(
        node('strong', '', channel.name),
        node(
          'span',
          'tv-channel__meta',
          countryName(channel.country) + ' · ' + channelType(channel),
        ),
      );
      const programme = nextProgramme(channel);
      copy.append(node('span', 'tv-channel__match', channel.sources[0]?.kind === 'official-page' ? 'Español · Sitio oficial ↗' : programme ? programmeText(programme) : languageName(channel)));
      const indicator = node('span', 'tv-channel__indicator', '›');
      indicator.setAttribute('aria-hidden', 'true');
      button.append(identity, copy, indicator);
      return button;
    }
    function updateCount() {
      status.textContent = filtered.length
        ? Math.min(visible, filtered.length) + ' de ' + filtered.length + ' canales'
        : (confirmed.checked ? 'No hay partidos confirmados para estos filtros. Desactiva Solo partidos confirmados para ver canales.' : 'No encontramos canales destacados con estos filtros.');
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
          (!category.value || channelCategories(channel).includes(category.value)) &&
          football.channelMatches(channel, query, '', confirmed.checked),
      );
      grid.replaceChildren();
      appendChannels(0);
      scroller.scrollTop = 0;
      renderProgramme();
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
        const [streams, metadata, feeds, logos] = await Promise.all([
          fetchJSON('streams.json'), fetchJSON('channels.json'), fetchJSON('feeds.json'),
          fetchJSON('logos.json').catch(() => []),
        ]);
        cache = buildChannels(streams, metadata, feeds, logos);
        if (!cache.length) throw new Error('Sin señales compatibles');
        [...new Set(cache.map((channel) => channel.country))]
          .sort((a, b) => countryName(a).localeCompare(countryName(b), 'es'))
          .forEach((code) => {
            const option = node('option', '', countryName(code));
            option.value = code;
            country.append(option);
          });
        const availableCategories = new Set(cache.flatMap(channelCategories));
        for (const [id, label] of Object.entries(categoryLabels)) {
          if (!['movies', 'music', 'kids', 'sports', 'news', 'series', 'entertainment', 'general'].includes(id) && !availableCategories.has(id)) continue;
          const option = node('option', '', label); option.value = id; category.append(option);
        }
        for (const channel of cache) channel.programmes = guideProgrammes.filter(p => p.channel === channel.id);
        render();
        if (!current) selectChannel(cache.find(channel => channel.sources[0]?.kind !== 'official-page') || cache[0]);
        void loadGuide();
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
    async function loadGuide() {
      if (guidePending) return;
      guidePending = true;
      try {
        const response = await fetch('/api/football-guide', {signal:AbortSignal.timeout(10000), cache:'no-store'});
        if (!response.ok) throw new Error('guide');
        guideProgrammes = football.normalizeGuide(await response.json());
        if (cache) for (const channel of cache) channel.programmes = guideProgrammes.filter(p => p.channel === channel.id);
        guideStatus.textContent = guideProgrammes.length
          ? 'Guía actualizada · Solo se muestran partidos identificados de las competiciones seleccionadas. Horario local.'
          : 'Selección de canales destacados por país. Sin programación de fútbol confirmada; puedes explorar todos los canales.';
      } catch {
        guideStatus.textContent = 'Guía no disponible. No podemos confirmar los partidos; los canales siguen disponibles.';
      } finally { guidePending = false; render(); }
    }
    // Solo se llama por Play o como alternativa tras un error de una reproducción iniciada.
    function playSource() {
      if (!current || document.body.classList.contains('modal-open')) return;
      if (current.sources[sourceIndex].kind === 'official-page') {
        window.open(current.sources[sourceIndex].url, '_blank', 'noopener,noreferrer');
        ready('La emisión se abre en América tvGO. Su disponibilidad depende del sitio oficial y tu región.');
        return;
      }
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
    [search, country, category, confirmed].forEach((control) =>
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
    // Las fechas de la guía se vuelven a comprobar al filtrar y cada minuto; no mantener un partido vencido.
    let guideTicks = 0;
    setInterval(() => { if (!document.hidden && cache) { if (++guideTicks % 5 === 0) void loadGuide(); else render(); } }, 60000);
    // Los otros modales ocultan main: detener esta fuente para evitar audio oculto.
    if (window.MutationObserver)
      new MutationObserver(() => {
        if (player && document.body.classList.contains('modal-open')) {
          dispose();
          ready('Reproducción detenida. Pulsa play para continuar.');
        }
      }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    // Cambiar de pestaña o minimizar no detiene el canal que el usuario inició.
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
