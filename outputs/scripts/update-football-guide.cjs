'use strict';
// Ejecutar solo en el servidor local; nunca desde una petición del visitante.
const fs = require('node:fs/promises');
const path = require('node:path');
const {mergeGuide} = require('../server/epg-import.cjs');
const repository = path.resolve(__dirname, '../../work/tv-review/iptv-epg');
const guideFile = path.resolve(__dirname, '../data/football-guide.json');
const sources = [
  ['mi.tv','ar#tyc-sports','TyCSports.ar'],
  ['mi.tv','pe#tv-peru','TVPeru.pe'],
  ['mi.tv','co#caracol','CaracolTV.co'],
  ['mi.tv','co#canal-rcn-hd','CanalRCN.co'],
  ['movistarplus.es','TDEP','Teledeporte.es'],
];
async function update() {
  const dayjs = require(path.join(repository,'node_modules/dayjs'));
  dayjs.extend(require(path.join(repository,'node_modules/dayjs/plugin/utc')));
  const now = Date.now();
  const previous = JSON.parse(await fs.readFile(guideFile,'utf8'));
  const results=[];
  for (const [site,site_id,channel] of sources) {
    const result={site,channel,ok:false,count:0,rows:[]};
    try {
      const config=require(path.join(repository,'sites',site,`${site}.config.js`));
      for(let offset=0;offset<2;offset++) {
        const context={date:dayjs.utc(now).startOf('day').add(offset,'day'),channel:{site_id,xmltv_id:channel}};
        const response=await fetch(config.url(context),{signal:AbortSignal.timeout(15000),headers:config.request?.headers});
        if(!response.ok) throw Error(`HTTP ${response.status}`);
        let bytes=0;const chunks=[];
        for await (const chunk of response.body) {
          bytes+=chunk.byteLength;if(bytes>5*1024*1024) throw Error('Respuesta demasiado grande');
          chunks.push(Buffer.from(chunk));
        }
        let content=Buffer.concat(chunks).toString('utf8');
        if(site==='movistarplus.es') {
          // Usar solo la parrilla: no visitar enlaces de fichas externas.
          const data=JSON.parse(content);
          content=JSON.stringify((Array.isArray(data)?data:[data]).map(p=>({...p,Ficha:null})));
        }
        const rows=await config.parser({...context,content});
        if(!Array.isArray(rows)||!rows.length) throw Error('Parrilla vacía');
        // Convertir las fechas de dayjs antes de normalizar a UTC.
        result.rows.push(...JSON.parse(JSON.stringify(rows)));
      }
      result.ok=true;result.count=result.rows.length;
    } catch(error) { console.warn(`EPG ${channel}: ${error.message}`); }
    results.push(result);
    console.log(`EPG ${channel}: ${result.ok?result.count+' programas':'se conserva la guía anterior'}`);
  }
  if(!results.some(r=>r.ok)) throw Error('Ninguna fuente devolvió una parrilla completa; no se modifica la guía.');
  const guide=mergeGuide(previous,results,now);
  const temporary=guideFile+`.${process.pid}.tmp`;
  try {
    await fs.writeFile(temporary,JSON.stringify(guide,null,2)+'\n');
    await fs.rename(temporary,guideFile);
  } finally { await fs.rm(temporary,{force:true}); }
  console.log(`Guía actualizada: ${guide.programmes.length} partidos confirmados.`);
}
if(require.main===module) update().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={update,sources};
