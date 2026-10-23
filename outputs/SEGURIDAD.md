# Seguridad y distribución de FekaMovies

## Qué cambió

- TMDB se consulta por `/api/tmdb/...` en el mismo origen. La clave se añade en el servidor y no se incorpora al HTML, JavaScript, respuestas del proxy ni dist.
- El proxy solo permite consultas de lectura a un host fijo y rutas/parámetros utilizados por la aplicación. No admite URLs arbitrarias, autenticación TMDB, credenciales aportadas por el cliente ni operaciones de escritura.
- Incluye timeout, caché de cinco minutos para catálogo, consultas concurrentes compartidas y un límite básico de 80 consultas por IP/minuto **por instancia**. Las búsquedas no se conservan en esa caché. No es un sistema global de mitigación de abuso: las instancias de Netlify no comparten memoria.
- Errores de proveedores se sustituyen por mensajes genéricos. No se registran las claves ni las URLs privadas enviadas a TMDB.
- El servidor local y el build usan una lista explícita de archivos. No sirven `.env`, código de servidor, SQL, Git, ZIP, archivos de trabajo ni versiones antiguas.
- Se añadieron CSP, nosniff, restricciones de cámara/micrófono/geolocalización y protección contra inserción del sitio en orígenes ajenos. La política de referrer conserva la compatibilidad con YouTube.

## Qué seguirá siendo visible

La URL y clave **publicable** de Supabase deben llegar a su SDK del navegador. No son claves secretas; permiten únicamente lo que autoricen RLS y los permisos de Postgres. No utilices `secret`, `service_role` ni contraseñas de base de datos en este cliente. Las comprobaciones de la interfaz administrativa no sustituyen las políticas de la base de datos.

Los endpoints de la web, imágenes, iframes y URLs de reproducción también son inspeccionables por el navegador. El catálogo de IPTV y la API de YouTube utilizada aquí no requieren una clave privada. Este cambio protege credenciales; no promete ocultar tráfico, impedir toda copia de video ni convertir URLs públicas en privadas.

Referencia: [claves de Supabase](https://supabase.com/docs/guides/getting-started/api-keys) y [seguridad de datos](https://supabase.com/docs/guides/database/secure-data).

## Claves existentes

La clave de TMDB se usó anteriormente desde el frontend y pudo ser vista o guardada por visitantes. Migrarla al servidor no revoca copias previas: antes de una publicación pública, el propietario debe rotarla en TMDB y actualizar `TMDB_API_KEY`. No se ha revocado automáticamente ninguna credencial.

El `.env` de esta PC queda fuera de Git y de la distribución. Los ZIP antiguos y capturas se conservan como entregables históricos, pero no se publican, no se incluyen en el ZIP nuevo y no deben usarse para un despliegue seguro.

## Publicar en Netlify

Configura variables mediante el panel de Netlify. Los secretos no van en `netlify.toml`: las variables declaradas allí tampoco están disponibles para Functions. La clave TMDB necesita los alcances Functions y Build. Las variables publicables de Supabase necesitan Build. `DMCA_EMAIL` necesita Functions. Redespiega después de cambiarlas.

El build genera `dist`. La función `netlify/functions/api.mjs` y los módulos `server/` quedan fuera de ese directorio. El repositorio completo usa `netlify.toml` en la raíz; el paquete independiente usa el de la aplicación. No subas `outputs` completo como carpeta estática.

Referencia: [variables para Functions](https://docs.netlify.com/build/functions/environment-variables/) y [directorio de funciones](https://docs.netlify.com/build/functions/configuration/).

## DMCA y venta de la plantilla

`DMCA_EMAIL` es un correo **público**, propio de cada instalación. No se hereda el del creador y no se toma de Supabase Auth. Sin un valor válido, la página muestra que el contacto está pendiente de habilitación y no presenta un envío ficticio.

Cada comprador necesita sus propias cuentas, claves, proyecto Supabase y datos de contacto. El paquete contiene código y SQL reutilizable, no sesiones, datos del catálogo ni credenciales de este propietario.

La página es una plantilla de política y procedimiento. No declara que exista un agente DMCA registrado ni garantiza la aplicación de un puerto seguro legal. El responsable debe revisar su adecuación y publicar sus datos de contacto; si busca acogerse al régimen de la DMCA, debe atender los requisitos aplicables de designación del agente y funcionamiento del procedimiento.

Referencia: [U.S. Copyright Office: sección 512](https://www.copyright.gov/512/).

## Comprobado

- Pruebas del proxy: rutas, parámetros, origen, método, timeout/errores genéricos, caché, límite y ausencia de claves en la salida.
- Build con archivos privados de prueba: no aparecen en dist; construir sin configuración requerida falla.
- HTTP local real: el catálogo funciona mediante el proxy; `.env`, ZIP, SQL, Git y código del servidor no son accesibles.
- Consultas anónimas reales a Supabase: sin acceso a borradores ni tabla de administradores.
- Regresiones del catálogo, temporadas, búsqueda, detalle, reproducción y TV con Play manual.

No se ha hecho un despliegue en Netlify ni un análisis de carga distribuida desde esta tarea. Se debe verificar el dominio HTTPS final, las URLs de Auth y las señales externas en producción.
