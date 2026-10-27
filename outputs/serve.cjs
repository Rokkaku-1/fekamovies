/* Servidor local con el mismo proxy que Netlify; no publica configuración privada. */
'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createAPI } = require('./server/api.cjs');
const { settingsScript } = require('./server/settings.cjs');
const { securityHeaders } = require('./server/headers.cjs');
const { files } = require('./server/public-files.cjs');
const root = __dirname;
const port = Number(process.env.PORT || 4173);
// .env vive fuera de la carpeta pública. En Netlify se usan variables del proyecto.
try {
  process.loadEnvFile(path.join(root, '.env'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  try {
    process.loadEnvFile(path.resolve(root, '..', '.env'));
  } catch (fallbackError) {
    if (fallbackError.code !== 'ENOENT') throw fallbackError;
  }
}
const handle = createAPI({readGuide: () => fs.readFile(path.join(root, 'data/football-guide.json'), 'utf8')});
require('./server/epg-refresh.cjs').startEPGRefresh();
const allowed = new Set(files);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};
const server = http.createServer(async (req, res) => {
  try {
    const host = req.headers.host;
    if (!['127.0.0.1:' + port, 'localhost:' + port].includes(host)) {
      res.writeHead(403, securityHeaders).end();
      return;
    }
    const url = new URL(req.url, 'http://' + host);
    if (url.pathname.startsWith('/api/')) {
      const response = await handle({
        method: req.method,
        url: url.href,
        ip: req.socket.remoteAddress,
        origin: req.headers.origin,
        expectedOrigin: url.origin,
        fetchSite: req.headers['sec-fetch-site'],
      });
      res.writeHead(response.statusCode, { ...securityHeaders, ...response.headers }).end(response.body);
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { ...securityHeaders, Allow: 'GET, HEAD' }).end();
      return;
    }
    const pathname = decodeURIComponent(url.pathname);
    let relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    if (relative === 'dmca') relative = 'dmca.html';
    if (relative === 'supabase-config.js') {
      res
        .writeHead(200, { ...securityHeaders, 'Content-Type': types['.js'], 'Cache-Control': 'no-store' })
        .end(req.method === 'HEAD' ? '' : settingsScript());
      return;
    }
    const file = path.resolve(root, relative);
    if (!allowed.has(relative) || !file.startsWith(root + path.sep)) {
      res.writeHead(404, securityHeaders).end('No encontrado');
      return;
    }
    const content = await fs.readFile(file);
    res
      .writeHead(200, {
        ...securityHeaders,
        'Content-Type': types[path.extname(file)],
        'Cache-Control': 'no-store',
        ...(relative.startsWith('admin') ? { 'X-Robots-Tag': 'noindex, nofollow' } : {}),
      })
      .end(req.method === 'HEAD' ? '' : content);
  } catch {
    res.writeHead(500, securityHeaders).end('No pudimos completar la petición.');
  }
});
server.listen(port, '127.0.0.1', () =>
  console.log('FekaMovies: http://127.0.0.1:' + port + '/ · Admin: /admin.html · DMCA: /dmca.html'),
);
