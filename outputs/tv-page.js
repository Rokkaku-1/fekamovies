/* Controles de la página TV. El catálogo de películas no se carga en esta vista. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const screen = $('tv-screen'), host = $('tv-video');
  if (!screen || !host) return;
  const reconnect = $('tv-reconnect'), fit = $('tv-fit'), pip = $('tv-pip'), fullscreen = $('tv-fullscreen');
  const toolsStatus = $('tv-tool-status');
  let boundVideo, expanded = false;
  const events = ['loadedmetadata', 'playing', 'pause', 'emptied', 'enterpictureinpicture', 'leavepictureinpicture'];
  function announce(message) { toolsStatus.textContent = message; }
  function update() {
    const video = host.querySelector('video');
    const ready = Boolean(video?.readyState >= 1);
    reconnect.disabled = !video;
    fit.disabled = !video;
    fullscreen.disabled = !video;
    pip.hidden = !document.pictureInPictureEnabled;
    pip.disabled = !ready || Boolean(video?.disablePictureInPicture);
    pip.setAttribute('aria-pressed', String(Boolean(video && document.pictureInPictureElement === video)));
    screen.dataset.playing = String(Boolean(video && !video.paused));
    if (video) video.style.objectFit = expanded ? 'cover' : 'contain';
  }
  function bindVideo() {
    const video = host.querySelector('video');
    if (video !== boundVideo) {
      toolsStatus.textContent = '';
      if (boundVideo) for (const event of events) boundVideo.removeEventListener(event, update);
      boundVideo = video;
      if (boundVideo) for (const event of events) boundVideo.addEventListener(event, update);
    }
    update();
  }
  new MutationObserver(bindVideo).observe(host, {childList: true});
  $('tv-theater').addEventListener('click', () => {
    const active = document.body.classList.toggle('is-theater');
    $('tv-theater').setAttribute('aria-pressed', String(active));
    $('tv-theater').firstChild.textContent = active ? 'Salir de modo cine ' : 'Modo cine ';
  });
  reconnect.addEventListener('click', () => {
    if (host.querySelector('video')) { $('tv-play').click(); announce('Reconectando con la señal seleccionada.'); }
  });
  fit.addEventListener('click', () => {
    if (!host.querySelector('video')) return;
    expanded = !expanded;
    fit.setAttribute('aria-pressed', String(expanded));
    update();
    announce(expanded ? 'La imagen llena el reproductor; algunos bordes pueden quedar recortados.' : 'Imagen completa, conservando su proporción original.');
  });
  pip.addEventListener('click', async () => {
    const video = host.querySelector('video');
    if (!video || pip.disabled) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await video.requestPictureInPicture();
    } catch { announce('El navegador no pudo abrir la ventana flotante. Puedes seguir viendo el canal aquí.'); }
    update();
  });
  fullscreen.addEventListener('click', async () => {
    const video = host.querySelector('video');
    if (!video) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (screen.requestFullscreen) await screen.requestFullscreen();
      else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
      else announce('Tu navegador no admite pantalla completa en esta vista.');
    } catch { announce('No se pudo activar pantalla completa. Puedes usar los controles del video.'); }
  });
  document.addEventListener('fullscreenchange', () => {
    fullscreen.setAttribute('aria-pressed', String(document.fullscreenElement === screen));
    fullscreen.setAttribute('aria-label', document.fullscreenElement === screen ? 'Salir de pantalla completa' : 'Pantalla completa');
    fullscreen.querySelector('span').textContent = document.fullscreenElement === screen ? 'Salir' : 'Pantalla completa';
  });
  bindVideo();
  window.FekaTV?.init();
})();
