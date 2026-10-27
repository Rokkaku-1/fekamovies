# TV de fútbol

La sección TV usa ahora una selección editorial de canales destacados por país, incluidos canales generales, noticias y deportes; los criterios están en [TV-ONLINE.md](TV-ONLINE.md). La clasificación de fútbol se conserva para la programación de los canales seleccionados. No incorpora automáticamente todas las marcas deportivas de iptv-org. Activar Solo partidos confirmados limita la selección a canales con un partido verificado; clasificarlos como deportivos no confirma qué emiten ahora.

Solo se conservan señales HTTPS HLS sin cabeceras especiales ni etiquetas de bloqueo geográfico. No se añaden señales privadas ni se evaden restricciones de emisión. Una señal en el catálogo no garantiza que funcione desde cualquier país.

El selector visible ahora filtra categorías de canales (cine, música, infantiles, deportes, etc.); ya no selecciona competiciones.

## Competiciones

La clasificación interna de la guía reconoce Libertadores, Sudamericana, Brasileirão, Copa do Brasil, Primera División y Copa Argentina, Liga 1 de Perú, Liga BetPlay de Colombia, Premier League, LaLiga, Ligue 1, Serie A, Bundesliga, Primeira Liga, Eredivisie y competiciones UEFA Champions, Europa y Conference League.

El país del canal es distinto del país de la competición. No se deducen derechos ni partidos por el país de la emisora. Solo partidos confirmados muestra únicamente canales con programación confirmada; si no hay datos, la lista queda vacía con explicación.

## Guía local automática

El servidor local consulta hoy y mañana mediante los lectores de [iptv-org/epg](https://github.com/iptv-org/epg). La primera consulta del 26/10/2026 obtuvo 160 programas: TyC Sports (33), TV Perú (47) y Teledeporte (80). Ninguno aportó un enfrentamiento con competición reconocida para estos filtros. Caracol y RCN no devolvieron una parrilla completa; Sportitalia tampoco produjo datos en la prueba y no quedó activado. Esto no significa que no existan partidos: la cobertura de estas fuentes es limitada.

`scripts/update-football-guide.cjs` usa mi.tv y movistarplus.es a través de sus lectores, con una selección fija de cinco canales. No busca señales de vídeo ni modifica el catálogo. Solo acepta equipos en el título y competición en el título/categoría; una mención en una sinopsis no confirma un partido. Las fechas se conservan en UTC. Los filtros admiten hasta siete días, pero esta consulta pide dos días, que incluyen mañana.

La descarga se ejecuta al iniciar `serve.cjs` si la guía tiene más de seis horas y vuelve a comprobarse cada seis horas mientras el servidor esté abierto. Si existe `FOOTBALL_GUIDE_URL`, prevalece ese proveedor y no se inicia el descargador local. No se crea ninguna tarea de Windows ni despliegue en Netlify. La API local relee el archivo al vencer su caché de cinco minutos, sin reiniciar el servidor. En Netlify se conserva la guía empaquetada o el proveedor remoto.

Actualizar manualmente desde la raíz:

```powershell
node outputs/scripts/update-football-guide.cjs
```

Dependencia local fuera de la carpeta pública: `work/tv-review/iptv-epg`, revisión `2c3e24fdab86140181878af00e01e9b440962d9b`. Para reinstalar en otra PC:

```powershell
git clone https://github.com/iptv-org/epg.git work/tv-review/iptv-epg
git -C work/tv-review/iptv-epg checkout 2c3e24fdab86140181878af00e01e9b440962d9b
npm --prefix work/tv-review/iptv-epg ci --ignore-scripts --no-audit --no-fund
```

No se actualiza automáticamente el código del proveedor. Las peticiones tienen límite de tiempo/tamaño y el proceso completo tiene un límite de cuatro minutos cuando lo inicia el servidor. La escritura de la guía es atómica. Una fuente fallida conserva sus partidos anteriores no vencidos; si fallan todas, no se sobrescribe la guía. `sources` registra el resultado de cada fuente. Nunca se publican sus dependencias o respuestas completas en `dist`.

## Partidos y limitación inicial

Los archivos channels.json y streams.json de iptv-org no incluyen equipos ni horarios. guides.json es un índice de fuentes EPG, no una parrilla directamente utilizable. En la revisión del 23/10/2026, muchos canales no tenían fuentes y la guía pública enlazada consultada devolvió 403. No se dispone de otra API del propietario.

La instalación muestra Partido sin confirmar cuando no hay datos. La descarga local ahora alimenta /api/football-guide, pero no ofrece cobertura de todos los partidos ni garantiza datos para cada competición. Solo se muestran encuentros que la parrilla permita asociar a canal, competición y horario.

## Conectar programación verificada

Se puede mantener `data/football-guide.json` en el servidor o configurar la variable privada FOOTBALL_GUIDE_URL con una URL HTTPS de un proveedor autorizado que publique JSON en este formato. No se aceptan URLs suministradas por visitantes. La URL configurada no se devuelve al navegador.

```json
{
  "programmes": [
    {
      "channel": "ID_EXACTO_DE_IPTV_ORG",
      "title": "Equipo local vs Equipo visitante",
      "competition": "Copa Libertadores",
      "start": "2026-10-23T23:00:00Z",
      "stop": "2026-10-24T01:00:00Z"
    }
  ]
}
```

Es un ejemplo de formato, no un partido real. Usar horarios ISO 8601 con zona horaria y el ID exacto de la señal. No usar nombres aproximados de canales. El importador valida competiciones, enfrentamientos, intervalos y vencimientos; no trata resúmenes, tertulias ni programas genéricos como partidos. La franja indica En emisión según la guía; no certifica que el encuentro sea en vivo ni que una retransmisión esté autorizada en todas las regiones.

El servidor conserva una caché de cinco minutos y limita el JSON remoto a 2 MiB y ocho segundos. El cliente actualiza cada cinco minutos y descarta partidos vencidos cada minuto mientras la página está visible. Sin guía conserva los canales y explica la falta de programación.

En Netlify `included_files` incluye la guía privada en la función; no se publica en dist. No añadir claves ni URLs con credenciales al JSON. La renovación de producción requiere un proveedor que actualice FOOTBALL_GUIDE_URL u otro mecanismo de despliegue autorizado; el descargador descrito arriba solo funciona en local.

## Verificación

Ejecutar `node --test outputs/tests/football.test.cjs` desde la raíz del repositorio. Incluye exclusión de canales ajenos al fútbol, clasificación de las 18 competiciones, datos vencidos/malformados, señales inseguras, caché y restricciones del endpoint.

`node --test outputs/tests/epg-import.test.cjs` comprueba partidos de mañana, exclusión de programas genéricos, duplicados, conservación ante fallos y recarga de la API local.
