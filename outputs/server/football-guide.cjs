'use strict';
const builtInGuide = require('../data/football-guide.json');
const football = require('../football-core.js');
// Una guía publicada por el propietario confirma canal + partido. No inferir derechos por país.
function createFootballGuide({ env = process.env, fetchImpl = fetch, now = Date.now, readGuide = async () => JSON.stringify(builtInGuide) } = {}) {
  let cached, pending;
  return async function () {
    if (cached?.until > now()) return cached.result;
    if (pending) return pending;
    pending = (async () => {
      let result;
      try {
        let data;
        if (env.FOOTBALL_GUIDE_URL) {
          const url = new URL(env.FOOTBALL_GUIDE_URL);
          if (url.protocol !== 'https:' || url.username || url.password || !/^[a-z0-9.-]+$/i.test(url.hostname) || !url.hostname.includes('.') || /(^|\.)(localhost|local|internal)$/.test(url.hostname) || /^[\d.]+$/.test(url.hostname) || url.port) throw new Error('invalid guide');
          const response = await fetchImpl(url, { signal: AbortSignal.timeout(8000), redirect: 'error', headers: {Accept:'application/json'} });
          if (!response.ok) throw new Error('unavailable');
          const chunks = []; let bytes = 0;
          for await (const chunk of response.body) { bytes += chunk.byteLength; if (bytes > 2 * 1024 * 1024) throw new Error('too large'); chunks.push(Buffer.from(chunk)); }
          data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } else data = JSON.parse(await readGuide());
        const programmes = football.normalizeGuide(data, now());
        result = { available: programmes.length > 0, programmes, updatedAt: Number.isFinite(Date.parse(data.updatedAt)) ? new Date(data.updatedAt).toISOString() : null };
      } catch { result = {available:false, programmes:[], error:'Programación no disponible. No se han confirmado partidos.'}; }
      cached = {until:now() + 300000, result};
      return result;
    })();
    try { return await pending; } finally { pending = null; }
  };
}
module.exports = { createFootballGuide };
