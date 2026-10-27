'use strict';
const football = require('../football-core.js');

// La competición debe estar en el título/categoría, no inferida del canal
// ni de una sinopsis que podría mencionar otros encuentros.
function importProgrammes(channel, rows, now = Date.now()) {
  const unique = new Map();
  for (const row of rows) {
    const title = football.clean(row.title);
    const category = Array.isArray(row.category) ? row.category.join(' ') : row.category || '';
    const competition = football.classifyCompetition(`${title} ${category}`);
    if (!competition) continue;
    const programme = football.normalizeProgramme({ channel, title, competition,
      start: typeof row.start === 'number' ? row.start : String(row.start),
      stop: typeof row.stop === 'number' ? row.stop : String(row.stop) }, now);
    if (programme) unique.set(`${programme.start}:${title}`, programme);
  }
  return [...unique.values()];
}

function mergeGuide(previous, results, now = Date.now()) {
  const programmes = football.normalizeGuide(previous, now);
  // Una fuente caída conserva su último dato todavía vigente.
  const replaced = new Set(results.filter(r => r.ok).map(r => r.channel));
  return {
    updatedAt: new Date(now).toISOString(),
    sources: results.map(({channel, site, ok, count}) => ({channel, site, ok, count})),
    programmes: [...programmes.filter(p => !replaced.has(p.channel)),
      ...results.filter(r => r.ok).flatMap(r => importProgrammes(r.channel, r.rows, now))]
      .sort((a,b) => a.start - b.start)
  };
}
module.exports = { importProgrammes, mergeGuide };
