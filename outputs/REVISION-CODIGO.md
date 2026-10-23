# Limpieza general de FekaMovies

## Cambios

- Formato uniforme y bloques legibles en HTML, JavaScript, CSS y configuración.
- Variables CSS principales agrupadas; estilos duplicados consolidados.
- Eliminados estilos de títulos y flechas anteriores, errores de video del modal antiguo y menú móvil sin uso.
- Eliminadas variables sin referencias.
- Estado de tarjetas y acción Ver ahora centralizados para evitar diferencias entre carga inicial y actualización.
- Lecturas públicas de Supabase y validación de destacados compartidas entre web y panel.
- Estado de los botones del editor de portada centralizado.
- Dependencia compartida del panel versionada para evitar mezclar código nuevo con una caché anterior.
- README actualizado con arquitectura, funcionamiento, configuración y límites actuales.
- Service worker actualizado a v14 y archivo de distribución regenerado.

## Verificación

- Análisis de JavaScript: sin variables no usadas, referencias indefinidas, claves duplicadas, código inalcanzable ni los demás errores estáticos comprobados en los siete archivos de lógica activos.
- Doce suites de regresión aprobadas: slider, estados, catálogo remoto, iframe, reproductor, siguiente capítulo, series, buscador, ciclo de modales, YouTube, caché PWA e instalación PWA.
- Validación de rutas locales e identificadores HTML únicos.
- Validación de destacados inválidos, duplicados y límite de cuatro.
- Comparación en Brave de ocho elementos principales: sin diferencias en las propiedades visuales comprobadas, con el mismo viewport.
- Comprobación real de búsqueda, detalle, Ver ahora y carga del catálogo/portada del administrador; sin errores de consola observados.

Las pruebas de medios, PWA y varios casos de interacción usan DOM y red simulados. No representan una medición de FPS ni una certificación de navegadores/dispositivos.

## Compatibilidad

Se conservan el diseño, los controles y el cambio automático del slider. No se modificaron las claves locales, el contenido publicado, la selección de portada, las tablas ni los permisos remotos de Supabase. Los nombres internos de configuración y almacenamiento existentes se conservan para evitar incompatibilidades.

Las herramientas de formato y análisis están en work/, no se cargan en el navegador ni se incluyen en FekaMovies.zip. Los entregables históricos y capturas se conservan fuera del paquete de ejecución. config.local.js y las credenciales privadas quedan excluidos del ZIP.

## MP4, HLS y TV online · 22 octubre 2026

- Catálogo, panel y restricciones de Supabase ampliados a MP4/HLS sin cambiar políticas RLS ni el iframe publicado existente.
- URLs firmadas conservadas; rechazo de HTTP, credenciales, esquemas ejecutables y extensiones incoherentes.
- Selector de fuentes mixtas iframe/MP4/HLS, con destrucción del medio anterior. Conservado avance de episodios.
- TV online independiente de los filtros de películas: catálogo iptv-org, búsqueda, país/categoría, carga diferida, 24 por página y diálogo con alternativas de señal.
- Verificación SQL real con inserciones de ambos formatos, rechazo de URL insegura, borradores invisibles y escritura anónima rechazada. Transacción revertida; no se dejó contenido de demostración publicado.
- 14 suites de regresión y nuevos casos MP4/HLS/TV pasaron con medios simulados. Vista previa HLS real de RTVE reprodujo con readyState 4 y tiempo avanzando. Se verificaron cierre, eliminación de video y restauración del scroll.
- Una señal de Bitel devolvió manifiesto con CORS pero no llegó a reproducirse. No se promete operatividad de todas las emisoras externas ni se afirma medición de FPS.
- Inspección visual en Brave: escritorio y viewport móvil de 390 px dentro de una vista de QA aislada; grilla de dos columnas, filtros y navegación móvil de cinco accesos.

## TV online con lista lateral y Play manual

- Reproductor integrado a la izquierda y lista lateral con scroll propio; apilado en móvil/tablet.
- Seleccionar canal o señal no crea video ni solicita HLS; la conexión solo comienza tras pulsar Play.
- Cambio de canal, Detener, apertura de otro modal y pestaña oculta destruyen el medio. No hay reanudación automática.
- Canales accesibles en bloques de 24 al deslizar o pulsar Mostrar más; búsqueda y filtros conservados.
- Pruebas nuevas del controlador verifican ausencia de autoplay, callbacks obsoletos, limpieza, señales y scroll incremental. Regresiones de reproducción, series, buscador, rendimiento de overlays y PWA pasaron.
- Verificado en Brave: cero elementos video antes de Play; RTVE reprodujo con readyState 4 tras Play; seleccionar otro canal dejó cero videos. Vista móvil de 390 px revisada con lista independiente y selección sin autoplay.

## Limpieza, DMCA y preparación para Netlify · 23 octubre 2026

- Separados HTML, estilos y lógica principal en index.html, app.css y app.js, conservando el diseño.
- Cliente TMDB compartido entre catálogo, búsqueda, temporadas y administrador; eliminado código duplicado de consultas y carga HLS.
- Clave privada TMDB migrada al entorno del servidor. Proxy con rutas y parámetros permitidos, timeout, caché limitada, validación de origen y límite básico por IP e instancia.
- Servidor local y Netlify Functions comparten la implementación. Build con lista explícita de archivos públicos; nunca publica .env, SQL, ZIP ni código interno.
- Configuración Supabase publicable generada por instalación. La clave publicable y las URLs de reproducción son visibles por naturaleza; los permisos dependen de Auth/RLS, no de ocultar JavaScript.
- Nueva política DMCA responsive con enlace en el footer. El contacto depende de DMCA_EMAIL y queda pendiente mientras no se configure; no se incorporó el correo personal del administrador. Cada comprador configura su contacto y credenciales.
- Cabeceras CSP, Referrer-Policy y protección de contenido; caché PWA actualizada a v24. Conservado referrer compatible con YouTube.
- 16 suites de regresión aprobadas, incluido el nuevo proxy. Análisis estático de los 17 archivos nuevos/modificados del trabajo de seguridad sin incidencias.
- Peticiones HTTP reales: catálogo TMDB operativo por el proxy, archivos privados denegados, borradores y tabla de administradores inaccesibles anónimamente en Supabase.
- Brave: catálogo, cuatro destacados, búsqueda, detalle, temporadas, cierre y retorno al buscador verificados con la nueva versión; panel cargó portada y catálogo sincronizados. Sin errores de consola observados en esa comprobación.
- DMCA revisado en escritorio y en iframe de QA de 390 px de ancho real. Capturas de ambas vistas guardadas fuera del paquete de ejecución.
- No se afirma medición de FPS ni reproducción de todas las señales externas. No se desplegó en Netlify ni se subió a GitHub en esta revisión.
- La clave TMDB estuvo antes en el frontend: retirarla del código no invalida copias antiguas. Debe rotarse antes de la publicación pública.
- Para desarrollo usar node outputs/serve.cjs y http://127.0.0.1:4173. Live Server y file:// no ejecutan el nuevo backend.
