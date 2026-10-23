/* Estudio FekaMovies · Auth verificada por servidor y autorización mediante RLS. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const config = window.LUMEN_SUPABASE_CONFIG || {};
  const catalog = window.LumenCatalog;
  let client,
    entries = [],
    editingId = null,
    accessVersion = 0,
    canEdit = false;
  let noticeTimer, lookupRequest, seasonRequest;
  let removalRequest;
  let featured = [],
    featuredReady = false,
    featuredVersion = 0,
    featuredBusy = false;
  function syncFeaturedControls() {
    const disabled = !canEdit || !featuredReady || featuredBusy;
    $('featured-save').disabled = disabled;
    $('featured-add').disabled = disabled;
  }
  const node = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  function notify(message, error = false) {
    clearTimeout(noticeTimer);
    $('notice').textContent = message;
    $('notice').className = 'notice' + (error ? ' error' : '');
    $('notice').hidden = false;
    noticeTimer = setTimeout(
      () => {
        $('notice').hidden = true;
      },
      error ? 12000 : 6000,
    );
  }
  function friendly(error) {
    const text = error?.message || '';
    if (/invalid login/i.test(text)) return 'El correo o la contraseña no son correctos.';
    if (/email not confirmed/i.test(text)) return 'Confirma tu correo antes de entrar.';
    if (/already registered/i.test(text)) return 'Esta cuenta ya existe. Usa el botón Entrar.';
    if (/rate limit|too many/i.test(text)) return 'Hay demasiados intentos. Espera unos minutos.';
    if (error?.code === '23505') return 'Este reproductor ya está guardado para ese título o capítulo.';
    if (/permission|row-level|jwt|session/i.test(text))
      return 'No tienes permiso para esta acción. Vuelve a iniciar sesión.';
    return 'No pudimos completar la operación. Comprueba la conexión y vuelve a intentarlo.';
  }
  function signalChange() {
    try {
      const channel = new BroadcastChannel('lumen-catalog');
      channel.postMessage('updated');
      channel.close();
    } catch {
      /* Actualizar al volver al sitio. */
    }
  }
  async function checkAccess() {
    const version = ++accessVersion;
    canEdit = false;
    $('workspace').hidden = true;
    const { data, error } = await client.auth.getUser();
    if (version !== accessVersion) return;
    if (error || !data.user) {
      $('login-view').hidden = false;
      $('pending-view').hidden = true;
      return;
    }
    $('login-view').hidden = true;
    const result = await client.rpc('lumen_is_admin');
    if (version !== accessVersion) return;
    if (result.error || result.data !== true) {
      $('pending-view').hidden = false;
      return;
    }
    canEdit = true;
    $('pending-view').hidden = true;
    $('workspace').hidden = false;
    $('account-email').textContent = data.user.email || 'Administrador';
    await Promise.all([loadEntries(), loadFeatured()]);
  }
  // La portada se guarda en una sola fila: orden y selección se publican juntos.
  function renderFeatured() {
    $('featured-count').textContent = featured.length + ' / 4';
    const fragment = document.createDocumentFragment();
    featured.forEach((item, index) => {
      const row = node('li', 'featured-row');
      const copy = node('div');
      copy.append(
        node('strong', '', String(index + 1).padStart(2, '0') + ' · ' + item.title),
        node('p', 'fine', (item.type === 'tv' ? 'Serie' : 'Película') + ' · TMDB ' + item.id),
      );
      const actions = node('div', 'featured-actions');
      for (const [action, label] of [
        ['up', 'Subir'],
        ['down', 'Bajar'],
        ['remove', 'Quitar'],
      ]) {
        const button = node('button', 'text-button', label);
        button.type = 'button';
        button.dataset.featuredAction = action;
        button.dataset.index = index;
        button.setAttribute('aria-label', label + ' ' + item.title);
        button.disabled = (action === 'up' && index === 0) || (action === 'down' && index === featured.length - 1);
        actions.append(button);
      }
      row.append(copy, actions);
      fragment.append(row);
    });
    if (!featured.length)
      fragment.append(node('li', 'fine', 'Selección automática de cartelera. Añade títulos para personalizarla.'));
    $('featured-list').replaceChildren(fragment);
  }
  async function loadFeatured() {
    if (!canEdit || featuredBusy) return;
    const version = ++featuredVersion;
    featuredReady = false;
    syncFeaturedControls();
    try {
      const { data, error } = await client.from('lumen_homepage').select('slides').eq('id', 1).maybeSingle();
      if (error) throw error;
      if (!canEdit || version !== featuredVersion) return;
      featured = catalog.normalizeFeatured(data?.slides);
      featuredReady = true;
      renderFeatured();
      $('featured-status').textContent = 'Portada sincronizada. Los cambios se publican al guardar.';
    } catch {
      if (canEdit && version === featuredVersion)
        $('featured-status').textContent = 'No pudimos cargar la portada. Vuelve a intentarlo con «Descartar cambios».';
    } finally {
      if (canEdit && version === featuredVersion) syncFeaturedControls();
    }
  }
  async function addFeatured() {
    if (!canEdit || !featuredReady || featuredBusy) return;
    const id = Number($('tmdb-id').value),
      type = $('media-type').value;
    if (!Number.isSafeInteger(id) || id < 1) {
      notify('Busca y selecciona una película o serie en TMDB primero.', true);
      return;
    }
    if (featured.length >= 4) {
      notify('Ya tienes cuatro destacados. Quita uno para añadir otro.', true);
      return;
    }
    if (featured.some((item) => item.id === id && item.type === type)) {
      notify('Este título ya está en portada.', true);
      return;
    }
    const version = featuredVersion;
    featuredBusy = true;
    syncFeaturedControls();
    try {
      const data = await tmdb('/' + type + '/' + id);
      if (!canEdit || !featuredReady || version !== featuredVersion) return;
      if (!data.backdrop_path) {
        notify('Este título no tiene imagen de portada en TMDB. Elige otro.', true);
        return;
      }
      featured.push({ id, type, title: data.title || data.name || $('content-title').value });
      renderFeatured();
      $('featured-status').textContent = 'Cambios sin publicar. Pulsa «Guardar portada».';
      $('featured-editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch {
      notify('No pudimos comprobar este título en TMDB.', true);
    } finally {
      featuredBusy = false;
      syncFeaturedControls();
    }
  }
  async function saveFeatured() {
    if (!canEdit || !featuredReady || featuredBusy) return;
    const snapshot = featured.map((item) => ({ ...item }));
    featuredBusy = true;
    syncFeaturedControls();
    try {
      const { error } = await client
        .from('lumen_homepage')
        .upsert({ id: 1, slides: snapshot, updated_at: new Date().toISOString() })
        .select('id')
        .single();
      if (error) throw error;
      signalChange();
      $('featured-status').textContent = snapshot.length
        ? 'Portada publicada con ' + snapshot.length + ' destacados.'
        : 'Portada automática activada.';
      notify('La portada está publicada.');
    } catch (error) {
      notify(friendly(error), true);
    } finally {
      featuredBusy = false;
      syncFeaturedControls();
    }
  }
  async function loadEntries() {
    if (!canEdit) return;
    $('record-status').textContent = 'Cargando tu biblioteca…';
    try {
      const all = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await client
          .from('lumen_embeds')
          .select('*')
          .order('created_at', { ascending: false })
          .order('id')
          .range(offset, offset + 499);
        if (error) throw error;
        all.push(...data);
        if (data.length < 500) break;
      }
      if (!canEdit) return;
      entries = all;
      renderEntries();
    } catch (error) {
      $('record-status').textContent = friendly(error);
    }
  }
  function renderEntries() {
    $('stat-total').textContent = entries.length;
    const published = entries.filter((entry) => entry.published).length;
    $('stat-published').textContent = published;
    $('stat-drafts').textContent = entries.length - published;
    const query = $('record-search').value.trim().toLocaleLowerCase();
    const filter = $('record-filter').value;
    const visible = entries.filter(
      (entry) =>
        (filter === 'all' || entry.published === (filter === 'published')) &&
        [entry.title, entry.tmdb_id, entry.label, entry.provider].join(' ').toLocaleLowerCase().includes(query),
    );
    const fragment = document.createDocumentFragment();
    for (const entry of visible) {
      const row = node('article', 'record');
      const copy = node('div');
      const heading = node('h3', '', entry.title);
      const dot = node('span', 'status-dot' + (entry.published ? ' published' : ''));
      dot.setAttribute('aria-hidden', 'true');
      heading.prepend(dot);
      copy.append(
        heading,
        node(
          'p',
          '',
          (entry.media_type === 'tv' ? 'Serie · T' + entry.season + ':E' + entry.episode : 'Película') +
            ' · TMDB ' +
            entry.tmdb_id,
        ),
        node(
          'p',
          '',
          (catalog.providers[entry.provider] || entry.provider) +
            ' · ' +
            entry.label +
            ' · ' +
            (entry.published ? 'Publicado' : 'Borrador'),
        ),
      );
      const actions = node('div', 'record__actions');
      for (const [action, text] of [
        ['edit', 'Editar'],
        ['toggle', entry.published ? 'Retirar' : 'Publicar'],
        ['delete', 'Eliminar'],
      ]) {
        const button = node('button', '', text);
        button.type = 'button';
        button.dataset.action = action;
        button.dataset.id = entry.id;
        button.setAttribute(
          'aria-label',
          text +
            ' ' +
            entry.title +
            (entry.media_type === 'tv' ? ', temporada ' + entry.season + ', capítulo ' + entry.episode : ''),
        );
        actions.append(button);
      }
      row.append(copy, actions);
      fragment.append(row);
    }
    $('record-list').replaceChildren(fragment);
    $('record-status').textContent = visible.length
      ? visible.length + ' reproductores en esta vista.'
      : 'Aún no hay reproductores que mostrar. Añade el primero arriba.';
  }
  function updateEpisodeFields() {
    const tv = $('media-type').value === 'tv';
    $('episode-fields').hidden = !tv;
    $('season').required = tv;
    $('episode').required = tv;
  }
  function resetEditor() {
    seasonRequest?.abort();
    selectedSeries = null;
    editingId = null;
    $('content-form').reset();
    updateSourceHint();
    updateEpisodeFields();
    $('editing-badge').textContent = 'BORRADOR';
    $('editor-title').textContent = 'Nuevo reproductor';
    $('episode-help').textContent = '';
    $('season-options').replaceChildren();
    $('episode-options').replaceChildren();
  }
  function tmdb(route, signal) {
    return window.FekaTMDB.get(route, { signal });
  }
  let selectedSeries;
  async function seasonOptions(id) {
    seasonRequest?.abort();
    const request = new AbortController();
    seasonRequest = request;
    const type = $('media-type').value;
    try {
      const data = await tmdb('/tv/' + id, request.signal);
      if (seasonRequest !== request || $('tmdb-id').value !== String(id) || $('media-type').value !== type) return;
      selectedSeries = data;
      const fragment = document.createDocumentFragment();
      (data.seasons || []).forEach((season) => {
        const option = node('option');
        option.value = String(season.season_number);
        option.label = season.name;
        fragment.append(option);
      });
      $('season-options').replaceChildren(fragment);
      $('episode-help').textContent =
        data.number_of_seasons +
        ' temporadas · ' +
        data.number_of_episodes +
        ' capítulos en TMDB. Selecciona el número correspondiente.';
      void episodeOptions();
    } catch (error) {
      if (error.name !== 'AbortError')
        $('episode-help').textContent = 'Puedes indicar temporada y capítulo manualmente.';
    }
  }
  async function episodeOptions() {
    if ($('media-type').value !== 'tv' || !selectedSeries || String(selectedSeries.id) !== $('tmdb-id').value) return;
    const id = $('tmdb-id').value,
      season = $('season').value;
    if (!/^\d+$/.test(season)) return;
    try {
      const data = await tmdb('/tv/' + id + '/season/' + season);
      if ($('tmdb-id').value !== id || $('season').value !== season) return;
      const fragment = document.createDocumentFragment();
      (data.episodes || []).forEach((episode) => {
        const option = node('option');
        option.value = String(episode.episode_number);
        option.label = episode.name;
        fragment.append(option);
      });
      $('episode-options').replaceChildren(fragment);
    } catch {
      /* El formulario admite el número manual. */
    }
  }
  async function searchTitles(event) {
    event.preventDefault();
    lookupRequest?.abort();
    const request = new AbortController();
    lookupRequest = request;
    $('lookup-status').textContent = 'Buscando…';
    $('lookup-results').replaceChildren();
    const type = $('lookup-type').value;
    try {
      const data = await tmdb(
        '/search/' + type + '?query=' + encodeURIComponent($('lookup-query').value.trim()),
        request.signal,
      );
      if (lookupRequest !== request) return;
      const fragment = document.createDocumentFragment();
      (data.results || []).slice(0, 8).forEach((item) => {
        const button = node('button', 'lookup-card');
        button.type = 'button';
        if (item.poster_path) {
          const image = node('img');
          image.src = 'https://image.tmdb.org/t/p/w185' + item.poster_path;
          image.alt = '';
          image.loading = 'lazy';
          button.append(image);
        }
        const text = node('span');
        text.append(
          node('strong', '', item.title || item.name),
          node('small', '', (item.release_date || item.first_air_date || 'Sin fecha').slice(0, 4) + ' · ID ' + item.id),
        );
        button.append(text);
        button.addEventListener('click', () => {
          resetEditor();
          $('media-type').value = type;
          $('tmdb-id').value = item.id;
          $('content-title').value = item.title || item.name;
          updateEpisodeFields();
          if (type === 'tv') void seasonOptions(item.id);
          $('content-title').focus({ preventScroll: true });
          $('content-form').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        });
        fragment.append(button);
      });
      $('lookup-results').append(fragment);
      $('lookup-status').textContent = data.results?.length
        ? 'Selecciona el título que vas a publicar.'
        : 'No encontramos resultados.';
    } catch (error) {
      if (error.name !== 'AbortError')
        $('lookup-status').textContent =
          error.message === 'tmdb-config'
            ? 'Configura el catálogo en el servidor o introduce el ID manualmente.'
            : 'No pudimos consultar TMDB. Inténtalo de nuevo.';
    }
  }
  function payload(published) {
    const type = $('media-type').value,
      id = Number($('tmdb-id').value),
      season = type === 'tv' ? Number($('season').value) : 0,
      episode = type === 'tv' ? Number($('episode').value) : 0;
    if (
      !Number.isSafeInteger(id) ||
      id < 1 ||
      !Number.isInteger(season) ||
      season < 0 ||
      !Number.isInteger(episode) ||
      (type === 'tv' && episode < 1)
    )
      throw new Error('Indica un ID, una temporada y un capítulo válidos.');
    const embed = catalog.normalizeSource($('embed-input').value, $('provider').value);
    const title = $('content-title').value.trim(),
      label = $('server-label').value.trim();
    if (!title || !label) throw new Error('Escribe el título y el nombre del servidor.');
    return {
      media_type: type,
      tmdb_id: id,
      season,
      episode,
      title,
      provider: embed.provider,
      embed_url: embed.url,
      label,
      published,
    };
  }
  async function save(event) {
    event.preventDefault();
    if (!canEdit) return;
    let record;
    try {
      record = payload(event.submitter?.value === 'published');
    } catch (error) {
      notify(error.message, true);
      return;
    }
    const buttons = [...$('content-form').querySelectorAll('button[type="submit"]')];
    buttons.forEach((button) => {
      button.disabled = true;
    });
    try {
      const query = editingId
        ? client.from('lumen_embeds').update(record).eq('id', editingId)
        : client.from('lumen_embeds').insert(record);
      const { data, error } = await query.select('id').single();
      if (error || !data) throw error || new Error('No se guardó');
      signalChange();
      notify(
        record.published
          ? 'Publicado. El contenido ya está disponible en FekaMovies.'
          : 'Borrador guardado. Los visitantes todavía no pueden verlo.',
      );
      resetEditor();
      await loadEntries();
    } catch (error) {
      notify(friendly(error), true);
    } finally {
      buttons.forEach((button) => {
        button.disabled = false;
      });
    }
  }
  async function recordAction(event) {
    const button = event.target.closest('[data-action]');
    if (!button || !canEdit) return;
    const record = entries.find((entry) => entry.id === button.dataset.id);
    if (!record) return;
    if (button.dataset.action === 'edit') {
      editingId = record.id;
      $('media-type').value = record.media_type;
      $('tmdb-id').value = record.tmdb_id;
      $('content-title').value = record.title;
      $('season').value = record.season;
      $('episode').value = record.episode;
      $('provider').value = record.provider;
      updateSourceHint();
      $('embed-input').value = record.embed_url;
      $('server-label').value = record.label;
      updateEpisodeFields();
      $('editing-badge').textContent = record.published ? 'PUBLICADO' : 'BORRADOR';
      $('editor-title').textContent = 'Editar reproductor';
      if (record.media_type === 'tv') void seasonOptions(record.tmdb_id);
      $('content-form').scrollIntoView({ block: 'start', behavior: 'smooth' });
      return;
    }
    if (button.dataset.action === 'delete' && !(await confirmRemoval(record))) return;
    button.disabled = true;
    try {
      const query =
        button.dataset.action === 'delete'
          ? client.from('lumen_embeds').delete().eq('id', record.id)
          : client.from('lumen_embeds').update({ published: !record.published }).eq('id', record.id);
      const { data, error } = await query.select('id').single();
      if (error || !data) throw error || new Error('No se actualizó');
      if (editingId === record.id) resetEditor();
      signalChange();
      await loadEntries();
      notify('Biblioteca actualizada.');
    } catch (error) {
      notify(friendly(error), true);
      button.disabled = false;
    }
  }
  async function authSubmit(event) {
    event.preventDefault();
    const button = $('login-form').querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const { error } = await client.auth.signInWithPassword({
        email: $('email').value.trim(),
        password: $('password').value,
      });
      if (error) throw error;
      $('password').value = '';
      await checkAccess();
    } catch (error) {
      notify(friendly(error), true);
    } finally {
      button.disabled = false;
    }
  }
  async function register() {
    if (!$('login-form').reportValidity()) return;
    if ($('password').value.length < 12) {
      notify('Para una cuenta nueva, usa una contraseña de al menos 12 caracteres.', true);
      return;
    }
    $('register').disabled = true;
    try {
      const { error } = await client.auth.signUp({
        email: $('email').value.trim(),
        password: $('password').value,
        options: { emailRedirectTo: location.origin + location.pathname },
      });
      if (error) throw error;
      $('password').value = '';
      notify('Revisa tu correo y confirma la cuenta. Después vuelve al estudio para entrar.');
    } catch (error) {
      notify(friendly(error), true);
    } finally {
      $('register').disabled = false;
    }
  }
  async function logout() {
    canEdit = false;
    ++accessVersion;
    $('workspace').hidden = true;
    entries = [];
    if ($('preview-dialog').open) $('preview-dialog').close();
    await client.auth.signOut({ scope: 'local' });
    await checkAccess();
  }
  let previewMedia;
  function clearPreview() {
    previewMedia?.destroy();
    previewMedia = null;
    $('preview-player')
      .querySelectorAll('iframe')
      .forEach((frame) => {
        frame.src = 'about:blank';
      });
    $('preview-player').replaceChildren();
  }
  function preview() {
    try {
      const source = catalog.normalizeSource($('embed-input').value, $('provider').value);
      clearPreview();
      $('preview-dialog').showModal();
      $('preview-status').textContent = 'Cargando reproductor…';
      if (['mp4', 'hls'].includes(source.provider)) {
        previewMedia = window.FekaMedia.mount($('preview-player'), source.url, {
          onPlaying: () => {
            $('preview-status').textContent = 'Reproduciendo · ' + catalog.providers[source.provider];
          },
          onError: () => {
            clearPreview();
            $('preview-status').textContent =
              'No se pudo reproducir. Comprueba el enlace, el formato y CORS del alojamiento.';
          },
        });
      } else {
        $('preview-status').textContent = 'La reproducción depende del proveedor y de sus permisos de inserción.';
        $('preview-player').append(
          catalog.createFrame({ embed_url: source.url, provider: source.provider }, 'Vista previa'),
        );
      }
    } catch (error) {
      notify(error.message, true);
    }
  }
  function updateSourceHint() {
    const direct = ['mp4', 'hls'].includes($('provider').value);
    $('source-label').textContent = direct ? 'URL HTTPS del video' : 'Enlace o código iframe';
    $('embed-input').placeholder = direct
      ? $('provider').value === 'hls'
        ? 'https://tu-alojamiento/video/master.m3u8'
        : 'https://tu-alojamiento/video.mp4'
      : 'https://ok.ru/video/… o <iframe src=…>';
  }
  $('provider').addEventListener('change', updateSourceHint);
  function confirmRemoval(record) {
    $('delete-message').textContent =
      'Se eliminará el reproductor de «' + record.title + '». Las otras fuentes de este título se conservan.';
    return new Promise((resolve) => {
      removalRequest = resolve;
      $('delete-dialog').showModal();
    });
  }
  function settleRemoval(accepted) {
    const resolve = removalRequest;
    removalRequest = null;
    $('delete-dialog').close();
    resolve?.(accepted);
  }
  $('delete-confirm').addEventListener('click', () => settleRemoval(true));
  $('delete-cancel').addEventListener('click', () => settleRemoval(false));
  $('delete-dialog').addEventListener('cancel', (event) => {
    event.preventDefault();
    settleRemoval(false);
  });
  $('delete-dialog').addEventListener('close', () => {
    if (removalRequest) settleRemoval(false);
  });
  $('preview-close').addEventListener('click', () => $('preview-dialog').close());
  $('preview-dialog').addEventListener('close', clearPreview);
  $('preview-dialog').addEventListener('cancel', clearPreview);
  if (!window.supabase || !catalog || !config.url || !config.publishableKey) {
    notify('No pudimos iniciar Supabase. Revisa la conexión y supabase-config.js.', true);
    return;
  }
  if (location.protocol === 'file:') {
    notify('Abre el panel con localhost o HTTPS para iniciar sesión.', true);
    return;
  }
  client = window.supabase.createClient(config.url, config.publishableKey);
  $('featured-add').addEventListener('click', () => void addFeatured());
  $('featured-save').addEventListener('click', () => void saveFeatured());
  $('featured-reload').addEventListener('click', () => void loadFeatured());
  $('featured-list').addEventListener('click', (event) => {
    const button = event.target.closest('[data-featured-action]');
    if (!button || !canEdit || !featuredReady || featuredBusy) return;
    const index = Number(button.dataset.index),
      action = button.dataset.featuredAction;
    if (!featured[index]) return;
    if (action === 'remove') featured.splice(index, 1);
    else {
      const other = index + (action === 'up' ? -1 : 1);
      if (other < 0 || other >= featured.length) return;
      [featured[index], featured[other]] = [featured[other], featured[index]];
    }
    renderFeatured();
    $('featured-status').textContent = 'Cambios sin publicar. Pulsa «Guardar portada».';
  });
  $('login-form').addEventListener('submit', authSubmit);
  $('register').addEventListener('click', register);
  $('logout').addEventListener('click', logout);
  $('pending-logout').addEventListener('click', logout);
  $('check-access').addEventListener('click', () => void checkAccess());
  $('lookup-form').addEventListener('submit', searchTitles);
  $('content-form').addEventListener('submit', save);
  $('media-type').addEventListener('change', updateEpisodeFields);
  $('season').addEventListener('change', () => void episodeOptions());
  $('tmdb-id').addEventListener('change', () => {
    if ($('media-type').value === 'tv' && Number($('tmdb-id').value) > 0) void seasonOptions($('tmdb-id').value);
  });
  $('new-record').addEventListener('click', () => {
    resetEditor();
    $('content-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('record-list').addEventListener('click', recordAction);
  $('record-search').addEventListener('input', renderEntries);
  $('record-filter').addEventListener('change', renderEntries);
  $('refresh-records').addEventListener('click', () => void loadEntries());
  $('preview-button').addEventListener('click', preview);
  client.auth.onAuthStateChange(() => {
    queueMicrotask(() => void checkAccess());
  });
  void checkAccess();
})();
