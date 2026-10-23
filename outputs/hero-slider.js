/* FekaMovies · Cuatro escenas, una sola imagen visible y temporizador suspendible. */
(() => {
  'use strict';
  window.FekaHero = {
    create({ query, available, catalog }) {
      const hero = document.querySelector('.hero');
      const content = hero.querySelector('.hero__content');
      const title = document.getElementById('hero-title');
      const description = document.getElementById('hero-description');
      const button = document.getElementById('hero-watch');
      const status = document.getElementById('hero-status');
      const backdrop = document.getElementById('hero-backdrop');
      const controls = document.getElementById('hero-slider-controls');
      const dots = document.getElementById('hero-slider-dots');
      const counter = document.getElementById('hero-slider-count');
      const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
      let items = [],
        index = 0,
        timer,
        generation = 0,
        touchStart;
      let signature = '',
        request,
        imageVersion = 0,
        entryTween;
      const element = (tag, text) => {
        const node = document.createElement(tag);
        if (text !== undefined) node.textContent = text;
        return node;
      };
      function canRotate() {
        return (
          items.length > 1 &&
          !reducedMotion.matches &&
          !document.hidden &&
          !document.body.classList.contains('modal-open') &&
          !hero.classList.contains('hero--paused')
        );
      }
      function schedule() {
        clearTimeout(timer);
        if (canRotate()) timer = setTimeout(() => show(index + 1), 7500);
      }
      function refreshAvailability() {
        const item = items[index];
        if (!item) return;
        const playable = available(item.media_type, item.id);
        button.textContent = playable ? '▶ Ver ahora' : 'Ver tráiler';
        button.dataset.play = String(playable);
        status.textContent = playable ? 'Disponible para ver ahora' : 'Descubre el tráiler y los detalles';
      }
      function show(next, manual = false) {
        if (!items.length) return;
        index = (next + items.length) % items.length;
        const item = items[index],
          name = item.title || item.name || 'Tu próxima historia';
        const titleText = element('span', name);
        titleText.className = 'hero-slider__title-text';
        title.replaceChildren(titleText);
        const synopsis = item.overview?.trim() || 'Descubre esta historia, sus detalles y su tráiler.';
        description.textContent =
          synopsis.length > 220 ? synopsis.slice(0, 217).replace(/\s+\S*$/, '') + '…' : synopsis;
        button.dataset.id = String(item.id);
        button.dataset.type = item.media_type;
        button.disabled = false;
        refreshAvailability();
        const imageToken = ++imageVersion;
        const imageURL = item.backdrop_path ? 'https://image.tmdb.org/t/p/w1280' + item.backdrop_path : '';
        backdrop.onload = () => {
          if (imageToken === imageVersion) {
            backdrop.hidden = false;
            hero.classList.add('hero--has-backdrop');
          }
        };
        backdrop.onerror = () => {
          if (imageToken === imageVersion) {
            backdrop.hidden = true;
            hero.classList.remove('hero--has-backdrop');
          }
        };
        if (imageURL) backdrop.src = imageURL;
        else {
          backdrop.hidden = true;
          backdrop.removeAttribute('src');
          hero.classList.remove('hero--has-backdrop');
        }
        hero.setAttribute('aria-label', 'Destacados · ' + (index + 1) + ' de ' + items.length);
        counter.textContent = String(index + 1).padStart(2, '0') + ' / ' + String(items.length).padStart(2, '0');
        [...dots.children].forEach((dot, i) => {
          dot.setAttribute('aria-pressed', String(i === index));
          if (i === index) dot.setAttribute('aria-current', 'true');
          else dot.removeAttribute('aria-current');
        });
        entryTween?.kill();
        if (window.gsap && !reducedMotion.matches && !document.body.classList.contains('modal-open')) {
          entryTween = gsap.fromTo(
            content,
            { opacity: 0.25, y: 8 },
            { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out', clearProps: 'opacity,transform' },
          );
        } else {
          content.style.removeProperty('opacity');
          content.style.removeProperty('transform');
        }
        if (manual)
          document.getElementById('hero-slider-announcement').textContent =
            name + ', destacado ' + (index + 1) + ' de ' + items.length;
        schedule();
      }
      function renderDots() {
        const fragment = document.createDocumentFragment();
        items.forEach((item, i) => {
          const dot = element('button');
          dot.type = 'button';
          dot.className = 'hero-slider__dot';
          dot.dataset.slide = i;
          dot.setAttribute('aria-label', 'Mostrar ' + (item.title || item.name));
          dot.setAttribute('aria-controls', 'hero-title');
          fragment.append(dot);
        });
        dots.replaceChildren(fragment);
        controls.hidden = items.length < 2;
      }
      async function performLoad() {
        const token = ++generation;
        if (!items.length) {
          content.setAttribute('aria-busy', 'true');
          button.disabled = true;
          status.textContent = 'Cargando destacados…';
        }
        try {
          let selected;
          try {
            selected = (await catalog?.getFeatured?.()) || [];
          } catch {
            if (items.length) return;
            selected = [];
          }
          let candidates;
          if (selected.length) {
            const details = await Promise.allSettled(selected.map((item) => query('/' + item.type + '/' + item.id)));
            candidates = details.flatMap((result, i) =>
              result.status === 'fulfilled' ? [{ ...result.value, media_type: selected[i].type }] : [],
            );
            if (!candidates.length) throw new Error('No hay destacados disponibles');
          } else {
            const data = await query('/movie/now_playing');
            candidates = (data.results || [])
              .filter((item) => item.backdrop_path && item.id)
              .slice(0, 4)
              .map((item) => ({ ...item, media_type: 'movie' }));
          }
          if (token !== generation || !candidates.length) {
            if (!candidates.length) throw new Error('Sin destacados');
            return;
          }
          const nextSignature = candidates.map((item) => item.media_type + '-' + item.id).join(',');
          if (signature === nextSignature && items.length) {
            refreshAvailability();
            return;
          }
          const previous = items[index];
          items = candidates;
          signature = nextSignature;
          const preserved = previous
            ? items.findIndex((item) => item.id === previous.id && item.media_type === previous.media_type)
            : 0;
          renderDots();
          show(Math.max(0, preserved));
        } catch {
          if (!items.length) {
            title.textContent = 'Tu próxima gran historia.';
            description.textContent = 'Explora el catálogo mientras recuperamos los destacados.';
            status.textContent = 'No pudimos cargar la portada.';
            button.textContent = 'Volver a intentar';
            button.disabled = false;
            delete button.dataset.id;
          }
        } finally {
          if (token === generation) content.setAttribute('aria-busy', 'false');
        }
      }
      function load() {
        if (!request)
          request = performLoad().finally(() => {
            request = null;
          });
        return request;
      }
      controls.addEventListener('click', (event) => {
        const control = event.target.closest('button');
        if (!control) return;
        if (control.dataset.slide !== undefined) show(Number(control.dataset.slide), true);
        else if (control.dataset.step) show(index + Number(control.dataset.step), true);
      });
      controls.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
          event.preventDefault();
          show(index + (event.key === 'ArrowRight' ? 1 : -1), true);
          dots.children[index]?.focus();
        }
      });
      hero.addEventListener(
        'touchstart',
        (event) => {
          if (!event.target.closest('button,a,input'))
            touchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY };
        },
        { passive: true },
      );
      hero.addEventListener(
        'touchcancel',
        () => {
          touchStart = null;
        },
        { passive: true },
      );
      hero.addEventListener(
        'touchend',
        (event) => {
          if (!touchStart) return;
          const dx = event.changedTouches[0].clientX - touchStart.x,
            dy = event.changedTouches[0].clientY - touchStart.y;
          touchStart = null;
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4) show(index + (dx < 0 ? 1 : -1), true);
        },
        { passive: true },
      );
      document.addEventListener('visibilitychange', schedule);
      reducedMotion.addEventListener('change', schedule);
      const observer = new MutationObserver(schedule);
      observer.observe(hero, { attributes: true, attributeFilter: ['class'] });
      observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
      return { load, refreshAvailability };
    },
  };
})();
