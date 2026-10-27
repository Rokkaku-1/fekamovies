# Canales destacados por país

## Página de TV

TV se abre en `tv.html`, como página propia desde los enlaces de escritorio y móvil. La portada ya no carga ni muestra el catálogo IPTV. Los enlaces antiguos a `index.html#tv-online` redirigen a la nueva página. Desde TV se puede volver al catálogo de películas y series.

El reproductor ofrece controles nativos de reproducción y volumen, reconexión de la señal actual, ajuste de imagen (completa o llenando el cuadro), modo cine de escritorio, pantalla completa y ventana flotante cuando el navegador la admite. Los controles que requieren un video se activan después de Play; la ventana flotante requiere que sus metadatos estén disponibles. Programación y detalles se agrupan en un panel desplegable. TV conserva su funcionamiento en segundo plano.

Esta vista no necesita TMDB ni Supabase para cargar los canales. Sigue utilizando `pwa.js` y comparte el precache con la portada. Los archivos nuevos se incluyen únicamente a través de la lista de archivos públicos del build.

La lista pública `tv-curation.js` contiene IDs exactos de cadenas reconocidas de iptv-org, en orden editorial de preferencia. Se muestran como máximo doce por país en Latinoamérica (incluidos Brasil y Puerto Rico), cinco en el resto y una sola entrada por canal, agrupando sus señales alternativas. Se priorizan Perú, Colombia, Latinoamérica y España; se incluyen también Brasil, Italia, Estados Unidos y otros países con candidatos seleccionados.

Esta selección no representa cifras ni posiciones de audiencia: iptv-org no publica ratings. No se rellena un país con emisoras locales desconocidas para alcanzar el máximo. Los países sin candidatos compatibles no aparecen en el filtro. Los candidatos sin señal pueden reaparecer si iptv-org incorpora una compatible.

La ampliación latinoamericana conserva los canales anteriores y añade cadenas nacionales, informativas, culturales y deportivas reconocidas donde hay señales compatibles. Incluye como candidatos a América Televisión, Panamericana y Willax TV de Perú. En la revisión del catálogo, esas tres cadenas solo tenían enlaces HTTP. América TV se incluye de forma explícita con su logo y acceso a https://tvgo.americatv.com.pe/ cuando no hay HLS compatible: Play abre la emisión oficial en otra pestaña, indicada previamente en la interfaz. No se afirma reproducción incrustada ni se evitan los requisitos regionales o de cuenta del proveedor. Panamericana y Willax siguen dependiendo de la disponibilidad de señales compatibles en la API. No se convierten URLs a HTTPS sin verificar.

Perú permite trece entradas para añadir América TV sin desplazar ninguno de los doce canales existentes. El resto de límites se conserva. Si la API incorpora un HLS compatible de América TV, se prefiere ese reproductor y el acceso oficial deja de ser el fallback.

## Datos e idiomas

- API pública: https://github.com/iptv-org/api. `channels.json` identifica canales y países; `streams.json`, señales; `feeds.json`, idiomas; `logos.json`, logos. No requiere TMDB ni una clave privada.
- En países hispanohablantes solo se admiten feeds identificados como `spa`. Un stream sin feed usa el feed principal declarado; un ID de feed desconocido no se adivina. Si no se puede verificar español, se omite esa señal.
- Para los demás países se aceptan otros idiomas y se priorizan los del país; la interfaz muestra el idioma declarado de la señal preferida. Estados Unidos admite inglés y español.
- Se omiten canales cerrados, reemplazados o para adultos. Solo se usan señales HTTPS HLS sin credenciales ni cabeceras especiales; se conserva la exclusión de señales etiquetadas `Geo-blocked`.
- Se muestra un logo HTTPS vigente de la API. Si falta, la API de logos falla o la imagen no carga, se muestran las iniciales del canal. No se inventan logos.

La presencia en la API no garantiza disponibilidad, CORS ni reproducción desde todas las regiones. La selección se calcula al cargar la sección, sin iniciar video hasta pulsar Play. No se han comprobado una por una todas las retransmisiones.

Después de Play, cambiar a otra pestaña o minimizar la ventana conserva el reproductor y su señal. La aplicación ya no lo destruye al recibir `visibilitychange`. Cambiar de canal o señal, pulsar Detener o abrir otro reproductor en un modal sigue deteniendo la fuente anterior para evitar reproducciones simultáneas. La actualización periódica de la guía espera a que la página vuelva a estar visible, sin intervenir en el video.

## Mantenimiento y publicación

Editar `countries` en `tv-curation.js` para cambiar candidatos y su orden. Las señales, nombres, idiomas y logos se actualizan desde iptv-org. No añadir canales por coincidencias parciales del nombre. Mantener el módulo en `server/public-files.cjs`, el HTML y el precache de `sw.js`; incrementar la versión de caché al publicar cambios.

La guía y los filtros de partidos siguen documentados en [FUTBOL-TV.md](FUTBOL-TV.md). El catálogo general no promete una parrilla de programas: la guía integrada solo identifica partidos de fútbol.

Verificar desde la raíz:

```
node --test outputs/tests/football.test.cjs
node outputs/tests/football-player.cjs
```

Netlify publica únicamente `outputs/dist`. Estos cambios requieren un nuevo despliegue para aparecer en producción.

## Categorías de canales

El selector Categoría reemplaza al selector de competiciones. Incluye Cine, Música, Infantiles, Deportes, Noticias, Series, Entretenimiento y General, más las categorías adicionales presentes en el catálogo seleccionado. Usa todas las etiquetas de cada canal y combina categoría, país y búsqueda. Una categoría vacía no añade canales automáticamente. Solo partidos confirmados conserva su función opcional e independiente; Deportes no necesita una guía de partidos.
