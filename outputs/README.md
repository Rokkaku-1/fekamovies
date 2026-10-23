# FekaMovies

Aplicación de cine, series y TV online en HTML/CSS/JavaScript, con GSAP, Supabase y un proxy privado de TMDB para Netlify.

## Ejecutar en esta PC

Desde la raíz del repositorio: `node outputs/serve.cjs`. Abre http://127.0.0.1:4173/; el panel está en /admin.html y la política en /dmca.html. Requiere Node 22 o posterior. Para esta instalación ya se migró la configuración a .env privado.

Para otra instalación, copia outputs/.env.example como .env en la raíz del repositorio y completa sus valores. Si usas el ZIP independiente, puedes poner .env junto a serve.cjs. Nunca copies .env a dist ni lo subas a Git.

**Live Server y file:// ya no sirven para ejecutar el catálogo:** se necesita el servidor local o Netlify Functions para mantener la clave privada fuera del navegador.

## Organización

| Archivo | Responsabilidad |
| --- | --- |
| index.html / app.css / app.js | Estructura, estilos y lógica de la aplicación principal |
| tmdb-client.js | Consultas al proxy del mismo origen; sin claves privadas |
| server/api.cjs | Proxy TMDB con host fijo, consultas permitidas, caché y control básico de frecuencia |
| server/public-files.cjs | Lista explícita de archivos que se sirven y publican |
| scripts/build.cjs | Genera dist sin secretos, históricos, ZIP, SQL ni código del servidor |
| netlify/functions/api.mjs | Adaptador de la API para Netlify |
| admin.html / admin.css / admin.js | Panel protegido por Supabase Auth y RLS |
| embed-catalog.js / media-source.js | Catálogo publicado, normalización y reproducción MP4/HLS/iframe |
| hero-slider.js / tv-online.js / tv-online.css | Portada y TV con Play manual y lista lateral |
| mobile.css / pwa.js / sw.js | Adaptación móvil, instalación y caché |
| dmca.html / legal.css / legal.js | Política de derechos de autor y contacto configurable |
| supabase/ | Instalación, invitaciones, permisos y verificaciones SQL |

## Netlify

El netlify.toml de la raíz configura outputs como base. El de outputs permite desplegar el ZIP como proyecto independiente. El comando de build es `node scripts/build.cjs` y la carpeta publicada es **dist**. No publiques outputs completo ni uses arrastrar solo los archivos estáticos: el catálogo necesita la función de servidor.

Configura estas variables en el proyecto Netlify, fuera del repositorio:

| Variable | Uso |
| --- | --- |
| TMDB_API_KEY | Privada. Alcances Functions y Build; nunca se incorpora a dist |
| SUPABASE_URL | URL del proyecto de este propietario |
| SUPABASE_PUBLISHABLE_KEY | Clave publicable; se incorpora al cliente y está limitada por RLS |
| DMCA_EMAIL | Correo público para reclamaciones; Functions |

Los valores publicables de Supabase necesitan estar disponibles durante Build. Cambiar variables requiere un nuevo despliegue. Configura el dominio de producción y /admin.html en las URLs permitidas de Supabase Auth.

## Funciones

El catálogo conserva sus estados, filtros, búsqueda, recientes, temporadas, capítulos, tráileres, fuentes MP4/HLS e iframes y cuatro destacados administrables. TV online muestra reproductor y lista con scroll: no se crea un video hasta que el usuario pulsa Play. Cambiar canal o señal detiene el anterior. La PWA no almacena Auth, borradores, videos ni respuestas del contacto DMCA.

## Plantilla para terceros

Cada comprador configura su propio proyecto Supabase, usuarios, claves TMDB y correo DMCA. El paquete no contiene sesiones ni tus credenciales. El correo personal del creador no se usa como contacto predeterminado. Si DMCA_EMAIL está vacío, el contacto aparece pendiente de habilitación; no se envían avisos a una dirección inventada.

Consulta **ADMIN.md** para los pasos del panel y **SEGURIDAD.md** para los límites de seguridad, pruebas y requisitos antes de publicar.
