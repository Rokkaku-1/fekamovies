/* El correo pertenece a esta instalación; nunca se hereda el del autor de la plantilla. */
(() => {
  'use strict';
  const status = document.getElementById('dmca-status');
  const link = document.getElementById('dmca-email');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  void (async () => {
    try {
      const response = await fetch(new URL('./api/site', document.baseURI), {
        signal: controller.signal,
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('contact');
      const { dmcaEmail } = await response.json();
      if (typeof dmcaEmail !== 'string' || !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(dmcaEmail)) {
        status.textContent =
          'El canal de contacto de derechos de autor está pendiente de habilitación por el responsable de este sitio.';
        return;
      }
      status.textContent = dmcaEmail;
      link.href =
        'mailto:' +
        dmcaEmail +
        '?subject=' +
        encodeURIComponent('Solicitud de revisión de derechos de autor · FekaMovies');
      link.hidden = false;
    } catch {
      status.textContent = 'No pudimos consultar el canal de contacto. Vuelve a intentarlo más tarde.';
    } finally {
      clearTimeout(timeout);
    }
  })();
})();
