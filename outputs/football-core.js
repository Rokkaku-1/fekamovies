/* Reglas de fútbol compartidas por navegador, servidor y pruebas. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FekaFootball = api;
})(typeof window === 'object' ? window : this, function () {
  'use strict';
  const competitions = [
    ['libertadores', 'Copa Libertadores', 'Sudamérica', /\blibertadores\b/],
    ['sudamericana', 'Copa Sudamericana', 'Sudamérica', /\bsudamericana\b/],
    ['brasileirao', 'Brasil · Brasileirão', 'Sudamérica', /brasileir[a-z]*|campeonato brasileiro|brazil(?:ian)? serie a/],
    ['copa-brasil', 'Brasil · Copa do Brasil', 'Sudamérica', /copa (?:do |de )brasil|brazil(?:ian)? cup/],
    ['argentina', 'Argentina · Primera División', 'Sudamérica', /liga profesional|liga argentina|primera divisi[oó]n argentina|argentin(?:a|e|ian) (?:primera|premier|liga)/],
    ['copa-argentina', 'Argentina · Copa Argentina', 'Sudamérica', /copa argentina/],
    ['peru', 'Perú · Liga 1', 'Sudamérica', /liga\s?1(?:\s+(?:max|te apuesto|teapuesto|per[uú]))?|primera divisi[oó]n peruana|peruvian (?:primera|liga)/],
    ['colombia', 'Colombia · Liga BetPlay', 'Sudamérica', /liga betplay|liga [aá]guila|liga dimayor|colombi[a-z]* (?:primera|liga)|primera a colombi/],
    ['premier', 'Inglaterra · Premier League', 'Europa', /(?:english |england )?premier league/],
    ['laliga', 'España · LaLiga', 'Europa', /\bla\s?liga\b|spanish (?:primera|league)|primera divisi[oó]n espa[nñ]ola/],
    ['ligue1', 'Francia · Ligue 1', 'Europa', /\bligue\s?1\b|french league/],
    ['seriea', 'Italia · Serie A', 'Europa', /italian serie a|italia.*serie a|serie a (?:tim|enilive)|lega serie a|\bserie a\b/],
    ['bundesliga', 'Alemania · Bundesliga', 'Europa', /\bbundesliga\b/],
    ['portugal', 'Portugal · Primeira Liga', 'Europa', /primeira liga|liga portugal|liga (?:nos|bwin)/],
    ['eredivisie', 'Países Bajos · Eredivisie', 'Europa', /eredivisie/],
    ['champions', 'UEFA Champions League', 'Europa', /(?:uefa )?champions league|liga de campeones/],
    ['europa', 'UEFA Europa League', 'Europa', /(?:uefa )?europa league/],
    ['conference', 'UEFA Conference League', 'Europa', /(?:uefa )?(?:europa )?conference league/],
  ];
  const clean = (value, limit = 240) => typeof value === 'string' ? value.replace(/[\x00-\x1f]/g, ' ').trim().slice(0, limit) : '';
  const fold = value => clean(value, 1200).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  function classifyCompetition(value) {
    const text = fold(value);
    // No confundir la Premier escocesa o egipcia, la Bundesliga austríaca ni fútbol femenino con otras competiciones.
    if (/women|femenin|feminina|scottish|egyptian|austrian|saudi|indian super|russian premier/.test(text)) return null;
    return competitions.find(([, , , pattern]) => pattern.test(text))?.[0] || null;
  }
  function channelKind(channel) {
    if (!channel || channel.closed || channel.is_nsfw) return null;
    const name = fold(channel.name);
    if (/nfl|nba|nhl|golf|tennis|cricket|motorsport|motorvision|racing|fight|ufc|boxing|wrestling|combat|darts|heldinnen|the ocho|espn\s?8/.test(name)) return null;
    if (/\b(?:football|futbol|futebol|soccer|calcio|solocalcio)\b|liga\s?1|gol\s?(?:tv|play)|realmadrid|real madrid tv|barca tv|barcatv|lfc tv|lfctv|mufc tv|mutv/.test(name)) return 'football';
    if (!channel.categories?.includes('sports')) return null;
    if (/^(?:espn(?:\s|\d|$)|bein sports|tnt sports|tyc sports|win sports|sport ?tv|premiere(?:\s|$)|dazn|movistar.*(?:deportes|liga)|dsports|directv sports|fox sports|sky sports|tudn|sportitalia|premier sports)/.test(name)) return 'mixed';
    return null;
  }
  function normalizeProgramme(input, now = Date.now()) {
    if (!input || typeof input !== 'object') return null;
    const channel = clean(input.channel, 120), title = clean(input.title), competition = competitions.find(([id]) => id === input.competition)?.[0] || classifyCompetition(input.competition || title);
    const start = typeof input.start === 'number' ? input.start : Date.parse(input.start), stop = typeof input.stop === 'number' ? input.stop : Date.parse(input.stop);
    if (!/^[\w.-]+$/.test(channel) || !title || !competition || !Number.isFinite(start) || !Number.isFinite(stop) || stop <= start || stop - start > 8 * 3600000 || stop <= now || start > now + 7 * 86400000) return null;
    // Una tertulia, resumen o documental no es un partido confirmado.
    if (/highlights|resumen|magazine|documental|noticias|previa|review|debate/.test(fold(title))) return null;
    if (!/\s(?:vs?\.?|x|[-–—])\s/i.test(title)) return null;
    return { channel, title, competition, start, stop, live: start <= now && now < stop };
  }
  function normalizeGuide(data, now = Date.now()) {
    if (!Array.isArray(data?.programmes)) return [];
    return data.programmes.slice(0, 10000).map(p => normalizeProgramme(p, now)).filter(Boolean).sort((a, b) => a.start - b.start);
  }
  function channelMatches(channel, query = '', competition = '', confirmedOnly = false, now = Date.now()) {
    const matches = (channel.programmes || []).filter(p => p.stop > now && (!competition || p.competition === competition));
    if ((competition || confirmedOnly) && !matches.length) return false;
    const text = fold([channel.name, ...(channel.alt_names || []), ...matches.map(p => p.title)].join(' '));
    return !query || text.includes(fold(query));
  }
  return Object.freeze({ competitions: competitions.map(([id, label, region]) => ({id, label, region})), clean, classifyCompetition, channelKind, normalizeProgramme, normalizeGuide, channelMatches });
});
