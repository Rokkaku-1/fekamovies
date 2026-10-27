'use strict';
const {spawn} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
function startEPGRefresh() {
  const root = path.resolve(__dirname,'..');
  const dependency=path.resolve(root,'../work/tv-review/iptv-epg/node_modules/dayjs/package.json');
  if(process.env.FOOTBALL_GUIDE_URL || !fs.existsSync(dependency)) return;
  let running;
  const refresh=()=>{
    if(running) return;
    try {
      const guide=JSON.parse(fs.readFileSync(path.join(root,'data/football-guide.json'),'utf8'));
      if(Date.now()-Date.parse(guide.updatedAt)<6*3600000) return;
    } catch { /* Una guía inicial sin fecha debe actualizarse. */ }
    running=spawn(process.execPath,[path.join(root,'scripts/update-football-guide.cjs')],{
      cwd:root,windowsHide:true,stdio:'inherit',timeout:240000
    });
    running.on('error',()=>{console.warn('No se pudo iniciar la actualización EPG.');running=null;});
    running.on('close',()=>{running=null;});
  };
  refresh();
  const timer=setInterval(refresh,6*3600000);timer.unref();
  process.once('exit',()=>{if(running)running.kill();});
}
module.exports={startEPGRefresh};
