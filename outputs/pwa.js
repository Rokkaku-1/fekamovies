/* Fase 1 · Instalación, conectividad y actualización; ninguna API opcional bloquea la web. */
(() => {
  'use strict';
  const install = document.getElementById('install-app');
  const update = document.getElementById('pwa-update');
  const guide = document.getElementById('ios-guide');
  const offline = document.getElementById('offline-status');
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  let installPrompt;
  let waitingWorker;
  let reloadAccepted = false;
  let reloading = false;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    install.hidden = standalone();
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    install.hidden = true;
    guide.hidden = true;
  });
  window.matchMedia('(display-mode: standalone)').addEventListener?.('change', () => {
    if (standalone()) {
      install.hidden = true;
      guide.hidden = true;
    }
  });
  install.addEventListener('click', async () => {
    if (!installPrompt || standalone()) return;
    const prompt = installPrompt;
    installPrompt = null;
    install.hidden = true;
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch {
      /* Puede cancelarse. */
    }
  });

  // No se muestra una invitación de instalación en file:// ni en un origen inseguro.
  const secureHTTP = window.isSecureContext && /^https?:$/.test(location.protocol);
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (secureHTTP && ios && !standalone()) {
    let seen = false;
    try {
      seen = localStorage.getItem('lumen_guia_ios') === '1';
    } catch {
      /* Solo memoria en esta visita. */
    }
    if (!seen) {
      guide.hidden = false;
      try {
        localStorage.setItem('lumen_guia_ios', '1');
      } catch {
        /* No interrumpe la navegación. */
      }
    }
  }
  document.getElementById('ios-dismiss').addEventListener('click', () => {
    guide.hidden = true;
  });

  function connectionState() {
    offline.hidden = navigator.onLine !== false;
  }
  connectionState();
  window.addEventListener('online', connectionState);
  window.addEventListener('offline', connectionState);
  document.getElementById('offline-retry').addEventListener('click', () => location.reload());

  document.getElementById('pwa-reload').addEventListener('click', () => {
    if (!waitingWorker) return;
    reloadAccepted = true;
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  });
  if (!('serviceWorker' in navigator) || !secureHTTP) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadAccepted && !reloading) {
      reloading = true;
      location.reload();
    }
  });
  // Registro relativo: también funciona al servir FekaMovies desde /una/subcarpeta/.
  navigator.serviceWorker
    .register('./sw.js', { scope: './', updateViaCache: 'none' })
    .then((registration) => {
      const offerUpdate = () => {
        if (!registration.waiting || !navigator.serviceWorker.controller) return;
        waitingWorker = registration.waiting;
        update.hidden = false;
      };
      offerUpdate();
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed') offerUpdate();
        });
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void registration.update().catch(() => {});
      });
    })
    .catch(() => {
      /* Navegación normal si el navegador rechaza el registro. */
    });
})();
