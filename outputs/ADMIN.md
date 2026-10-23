# Estudio FekaMovies · Supabase y fuentes de video

El panel es `admin.html`. La URL y la **clave publicable** de cada instalación se generan desde variables de entorno. No necesita contraseña de PostgreSQL ni claves secret/service_role en el navegador.

## Abrir en esta PC

Con Node.js instalado, ejecuta `node outputs/serve.cjs` desde la carpeta del proyecto, o abre `start-lumen.cmd` dentro de esta carpeta. Visita **http://127.0.0.1:4173/admin.html**. El servidor local únicamente sirve archivos; Supabase conserva cuentas y catálogo. Al apagar la PC se detiene esta URL local. Un despliegue en Netlify funciona independientemente de la PC.

La cuenta del propietario se registra desde **Primera vez: crear mi cuenta** y confirma su correo. Cada instalación autoriza administradores por invitación de la base de datos; registrarse con otro correo no concede acceso. Las contraseñas se gestionan con Supabase Auth, no se guardan en los archivos de la plantilla.

## Añadir contenido

1. Busca la película o serie en TMDB. También puedes introducir su ID y título manualmente.
2. Para una serie, indica temporada y capítulo. Temporada 0 corresponde a especiales. Las sugerencias se consultan en TMDB.
3. Elige el formato o proveedor: MP4, HLS (.m3u8), OK.ru, YouTube, Vimeo o Dailymotion. Escribe el nombre del servidor y pega la URL HTTPS o un único iframe compatible.
4. Usa **Comprobar reproductor** para abrir una vista previa y cerrarla para detenerla.
5. **Guardar borrador** mantiene la fuente privada. **Publicar contenido** la hace visible en FekaMovies y habilita reproducción.
6. Desde la biblioteca puedes editar, retirar o eliminar. Varios registros para el mismo título/capítulo permiten varias opciones de servidor.

La web consulta solo fuentes publicadas. Al publicar o retirar se notifica a las pestañas del mismo origen mediante BroadcastChannel; también se actualiza al volver a la pestaña. En otros dispositivos, recargar consulta los cambios. No se afirma sincronización Realtime instantánea entre dispositivos.

## Proveedores y reproducción

Incluidos: **OK.ru, YouTube, Vimeo y Dailymotion**. Se normalizan enlaces de página y de inserción a URLs embed HTTPS. Los atributos y scripts del HTML pegado se descartan. La base de datos también valida proveedor y URL. No admite proveedores arbitrarios ni scraping; para ampliar la lista hay que actualizar el normalizador y la restricción SQL.

Los iframes se crean mediante DOM, con sandbox que permite scripts, origen del reproductor y presentación, sin navegación superior ni ventanas emergentes. Al cambiar de servidor o cerrar el reproductor se descarga el iframe para detener el audio. Algunos proveedores pueden exigir permisos adicionales o bloquear la inserción; **publicado significa aprobado por el administrador, no una garantía de que el proveedor esté disponible**. La vista previa permite comprobar cada enlace. Los enlaces privados o firmados con parámetros especiales pueden necesitar un adaptador.

Los controles de reproducción internos pertenecen al proveedor. FekaMovies ofrece cerrar, elegir servidor y siguiente capítulo manual, incluso en otra temporada. El avance automático funciona para las fuentes HTML5 existentes. Con iframes no se ofrece avance automático sin una API de eventos compatible del proveedor; no se intenta leer un iframe de otro origen.

## Instalar la plantilla en otro proyecto

1. Crea un proyecto Supabase propio.
2. Ejecuta `supabase/setup.sql` en SQL Editor. Crea catálogo, RLS y tabla de administradores, sin borrar contenido.
3. Ejecuta `supabase/admin-invitations.sql`. Crea la infraestructura privada de invitaciones.
4. Autoriza el correo del propietario mediante SQL:

```sql
insert into lumen_private.admin_invitations(email)
values(lower('correo-del-propietario@ejemplo.com'))
on conflict do nothing;
```

5. Si ese usuario ya existe y su correo está confirmado, asígnale el rol directamente:

```sql
insert into public.lumen_admins(user_id)
select id from auth.users
where lower(email)=lower('correo-del-propietario@ejemplo.com')
  and email_confirmed_at is not null
on conflict do nothing;
```

6. Configura SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY y TMDB_API_KEY en .env local o en las variables de Netlify. No edites supabase-config.js ni crees config.local.js; el servidor y el build generan solo la configuración publicable.
7. En Supabase → Authentication → URL Configuration establece el Site URL y las redirecciones de `admin.html` para tu dominio. No uses comodines amplios en producción.
8. Registra la cuenta del propietario desde el panel, confirma el correo y entra. La invitación se consume una sola vez después de la confirmación de Supabase Auth.

Cada comprador debe usar su propio proyecto, usuarios y claves. No entregar una copia de datos, sesiones, contraseñas ni enlaces privados del vendedor.

## Netlify

Usa el build y las variables descritos en README.md. La carpeta pública es dist, no outputs ni el directorio raíz. Las funciones quedan fuera de dist. TMDB_API_KEY solo existe en el servidor. No basta subir una carpeta estática manualmente: hay que desplegar también Netlify Functions. Consulta SEGURIDAD.md antes de publicar o distribuir la plantilla.

## Seguridad y comprobaciones

- `lumen_admins`: cada usuario autenticado solo puede consultar su propio rol; no puede asignarse permisos.
- `lumen_embeds`: visitantes y cuentas normales solo leen publicados; escritura solo para administradores. Las políticas de UPDATE comprueban tanto la fila existente como la nueva.
- No se utiliza `user_metadata` para autorizar acciones. La autorización procede de una tabla protegida y se comprueba en Supabase.
- La única función SECURITY DEFINER está en el esquema privado, sin EXECUTE público, y solo opera como trigger de Auth para consumir una invitación interna de un correo confirmado. No es una RPC pública.
- El service worker excluye Supabase y el panel: no cachea sesiones, borradores, consultas de Auth ni iframes.
- `supabase/verify.sql` prueba RLS dentro de una transacción que termina en rollback. Está pensada para SQL Editor con rol postgres; no se ejecuta desde el navegador público.

Comprobado durante la instalación: tablas con RLS activo, auditoría transaccional de permisos, acceso real del propietario, guardado/publicación/retirada de un registro temporal y API pública que lo muestra únicamente publicado. El registro temporal se retira y elimina al acabar las pruebas. También hay pruebas simuladas del normalizador, catálogo, iframe/servidores, detención al cerrar y regresión de temporadas/reproductor.

Comprobación visual real: panel de escritorio y móvil a 390 px, sin desbordamiento horizontal ni errores de consola. Búsqueda real de una serie y carga de las sugerencias de temporadas/capítulos verificadas. Capturas: `admin-panel.jpg` y `admin-movil.jpg`. La invitación del propietario quedó consumida al confirmar su cuenta y entrar correctamente.

La reproducción de cada video, las políticas de inserción de cada proveedor y el despliegue HTTPS deben comprobarse con sus enlaces reales. No se incluyen películas o series en el paquete: solo código y configuración.

## Slider de portada
En el panel, busca un título en TMDB y selecciónalo. En Portada pulsa Añadir título seleccionado; admite hasta cuatro películas o series. Usa Subir/Bajar/Quitar y Guarda la portada para publicar el orden completo. Sin títulos elegidos se usan cuatro películas de cartelera. En instalaciones nuevas ejecuta supabase/featured.sql después de setup.sql. La portada es pública; solo administradores pueden modificarla. No cambia la disponibilidad de los reproductores. El slider cambia cada 7,5 segundos y se pausa con movimiento reducido, pestaña oculta, fuera de pantalla o un modal abierto.


## Publicar MP4 y HLS (.m3u8)

El panel guarda enlaces, no sube ni convierte archivos. Aloja el MP4 o la carpeta HLS completa en tu servidor de video y pega su URL HTTPS. El formato HLS requiere un manifiesto .m3u8 y sus segmentos accesibles, con CORS permitido para el dominio de la web. Se conservan parámetros de URLs firmadas; si caducan, habrá que renovar la fuente.

En **Formato o proveedor** selecciona **Video directo · MP4** o **Streaming HLS · .m3u8**. Comprueba el reproductor, asigna película o temporada/capítulo y publica. Los borradores no habilitan “Ver ahora”. Puedes combinar fuentes directas e iframes para el mismo título y cambiarlas desde el selector del reproductor. El siguiente episodio automático funciona con MP4/HLS cuando finaliza el video, siempre que el siguiente capítulo esté publicado.

En esta instalación ya se aplicó **supabase/media-sources.sql**. Para actualizar una instalación anterior, ejecútalo una vez en SQL Editor. Amplía las validaciones sin cambiar RLS, administradores ni contenido. En instalaciones nuevas, setup.sql ya incluye ambos formatos. Se conserva el nombre interno embed_url por compatibilidad; también almacena URLs directas.

## TV online

La sección usa streams.json y channels.json de https://github.com/iptv-org/api, con señales del repositorio https://github.com/iptv-org/iptv. El repositorio https://github.com/iptv-org/epg contiene herramientas para generar guías XMLTV, no videos. No se instala su scraper en el navegador y no se muestra una programación inventada.

El catálogo se consulta una vez por visita al acercarse a la sección. Los canales aparecen en una lista lateral con scroll, búsqueda, países y categorías. Se añaden en bloques de 24 al deslizar hasta el final; también hay un botón para cargar más. Solo se incluyen HLS HTTPS con metadatos, sin canales adultos/cerrados ni señales que declaren cabeceras especiales o bloqueo geográfico. Esto no verifica que todas estén operativas: pueden fallar por CORS, caducidad, conexión o restricciones del emisor.

El reproductor está a la izquierda de la lista; en móvil y tablet va encima. Seleccionar un canal o cambiar su señal solo lo prepara: no crea un video ni solicita el manifiesto. El usuario debe pulsar Play para iniciar la reproducción. Cambiar de canal o pulsar Detener destruye el video anterior. Si se abre otro modal o se oculta la pestaña, se detiene y no se reanuda automáticamente. Las alternativas ante error se prueban únicamente después de una reproducción iniciada por el usuario. Los canales externos no se guardan como películas disponibles en Supabase. Esta versión no incluye un editor de canales propio ni una guía EPG de horarios.
