# Revisión de seguridad · FekaMovies

Fecha: 23 de octubre de 2026, America/Bogota.
Objetivo: https://fekamovies.netlify.app/

## Resultado

Pasaron los siete grupos de comprobaciones activas y acotadas en producción. No se detectó exposición de la clave privada ni acceso anónimo de escritura en los casos probados. Esto no equivale a una certificación ni a un pentest exhaustivo.

| Comprobación | Evidencia |
| --- | --- |
| HTTPS y cabeceras | Portada 200; CSP con object-src none, base-uri self, form-action self y frame-ancestors self; scripts sin unsafe-inline/unsafe-eval; nosniff y referrer correcto. |
| Archivos privados | Siete rutas, incluidas .env, .git/config, SQL, ZIP y código del servidor, devolvieron 404. |
| Credenciales en frontend | Seis recursos inspeccionados sin la clave TMDB ni claves secretas de Supabase. La configuración publicable de Supabase sí es visible por diseño. |
| Proxy de API | Seis rutas/parámetros inválidos devolvieron 400; POST 405; Origin ajeno y Sec-Fetch-Site cross-site devolvieron 403. Errores sin la clave privada. |
| Lectura anónima de datos | Consulta de borradores devolvió []; tabla de administradores denegada. |
| Escritura y autoasignación | Inserciones con arrays vacíos denegadas en catálogo, administradores y portada; RPC administrativa denegada. No se insertaron ni modificaron datos. |
| Panel de administración | no-store y noindex presentes. Su HTML es público; los datos y las acciones se autorizan en Supabase Auth/RLS. |

## Código y pruebas locales

- Proxy de host fijo y lista de rutas/parámetros: comprobados límites por IP e instancia, caducidad de caché, errores genéricos y rechazo de métodos/orígenes.
- Build: lista explícita de archivos; no incluye .env, ZIP privados ni código de servidor en el directorio público.
- Catálogo de fuentes: normalización de proveedores, rechazo de esquemas y URLs inseguras, iframe construido sin insertar HTML ejecutable y sandbox.
- Análisis estático: 17 archivos sin incidencias en las reglas ejecutadas.
- Los archivos preparados para Git y el ZIP se revisaron buscando los valores reales de las credenciales locales y el correo personal, sin encontrarlos.

## Riesgos y pendientes

1. **Prioridad media: rotar la antigua clave TMDB.** Antes estuvo en el frontend. Ya no se publica, pero retirar una clave del código no invalida copias anteriores. No se ha rotado ni revocado desde esta revisión.
2. El límite de peticiones es básico y por instancia. No constituye una defensa distribuida contra abuso; no se realizaron pruebas de carga ni denegación de servicio.
3. El navegador debe recibir las URLs de reproducción y la configuración publicable de Supabase. No son secretos que puedan ocultarse mediante JavaScript.
4. Continúa la dependencia de CDN, YouTube, emisoras y proveedores externos. La CSP permite conexiones HTTPS para las fuentes HLS y estilos inline por el diseño/GSAP.
5. El contacto DMCA aún requiere configurar DMCA_EMAIL. No se publica el correo del administrador.

## Alcance y límites

Se probaron accesos anónimos, entradas inválidas y recursos públicos. No se hizo fuerza bruta, enumeración de usuarios, pruebas de volumen, explotación de terceros ni cambios persistentes en datos. No se comprobó el ciclo completo con una cuenta autenticada sin privilegios ni la recuperación de contraseña en el dominio nuevo. Las pruebas locales usan red y medios simulados donde corresponde.

El escaneo de secretos de Netlify permanece activo y sin exclusiones. El informe no garantiza ausencia de vulnerabilidades fuera de lo comprobado.
