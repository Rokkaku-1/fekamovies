# FekaMovies

Proyecto independiente de cine, series y TV de fútbol. La aplicación está en `outputs/` y usa HTML, CSS, JavaScript y Node.js; no requiere Next.js.

Desde esta carpeta:

- Iniciar: `node outputs/serve.cjs`
- Pruebas de fútbol: `node --test outputs/tests/football.test.cjs`
- Pruebas del reproductor: `node outputs/tests/football-player.cjs`
- Build para Netlify: `node outputs/scripts/build.cjs`

Copia `outputs/.env.example` como `.env` en esta carpeta y configura tus valores privados. No publiques ese archivo. El servidor abre http://127.0.0.1:4173/.

Netlify usa el `netlify.toml` de esta raíz y publica únicamente `outputs/dist`.

Consulta [la aplicación](outputs/README.md), [administración](outputs/ADMIN.md), [seguridad](outputs/SEGURIDAD.md) y [TV de fútbol](outputs/FUTBOL-TV.md).
