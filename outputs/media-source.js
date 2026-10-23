/* Reproductor nativo compartido por las vistas previas y TV online. */
(() => {
  'use strict';
  let pending;
  function loadHls() {
    if (window.Hls) return Promise.resolve(window.Hls);
    if (pending) return pending;
    pending = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.6.16/dist/hls.min.js';
      const timeout = setTimeout(() => finish(new Error('El reproductor tardó demasiado en cargar.')), 15000);
      function finish(error) {
        clearTimeout(timeout);
        script.onload = script.onerror = null;
        if (error) {
          script.remove();
          pending = null;
          reject(error);
        } else resolve(window.Hls);
      }
      script.onload = () => finish(window.Hls ? null : new Error('Reproductor no disponible.'));
      script.onerror = () => finish(new Error('No pudimos cargar el reproductor.'));
      document.head.append(script);
    });
    return pending;
  }

  function mount(host, url, { onError = () => {}, onPlaying = () => {} } = {}) {
    let destroyed = false,
      hls,
      timer;
    const video = document.createElement('video');
    video.controls = true;
    video.playsInline = true;
    video.preload = 'metadata';
    host.replaceChildren(video);
    let failed = false;
    function fail() {
      if (destroyed || failed) return;
      failed = true;
      clearTimeout(timer);
      onError();
    }
    video.addEventListener('error', fail);
    video.addEventListener('playing', () => {
      clearTimeout(timer);
      if (!destroyed) onPlaying();
    });
    video.addEventListener('loadedmetadata', () => {
      clearTimeout(timer);
      if (!destroyed)
        video.play().catch(() => {
          /* El control nativo permite iniciar manualmente. */
        });
    });
    timer = setTimeout(fail, 25000);
    void (async () => {
      try {
        if (
          new URL(url).pathname.toLowerCase().endsWith('.m3u8') &&
          (!video.canPlayType('application/vnd.apple.mpegurl') || window.MediaSource || window.ManagedMediaSource)
        ) {
          const Hls = await loadHls();
          if (destroyed) return;
          if (!Hls.isSupported()) {
            if (!video.canPlayType('application/vnd.apple.mpegurl')) throw new Error('HLS no soportado');
            video.src = url;
            video.load();
            return;
          }
          hls = new Hls({ enableWorker: true, maxBufferLength: 20 });
          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal) fail();
          });
          hls.attachMedia(video);
          hls.loadSource(url);
          video.play().catch(() => {});
        } else {
          video.src = url;
          video.load();
          video.play().catch(() => {});
        }
      } catch {
        fail();
      }
    })();
    return {
      video,
      destroy() {
        destroyed = true;
        clearTimeout(timer);
        hls?.destroy();
        video.pause();
        video.removeAttribute('src');
        video.load();
        video.remove();
      },
    };
  }
  window.FekaMedia = Object.freeze({ loadHls, mount });
})();
