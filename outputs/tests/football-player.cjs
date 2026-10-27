const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
class Element {
 constructor(tag='div'){this.tag=tag;this.children=[];this.dataset={};this.attrs={};this.listeners={};this.value='';this.hidden=false;this.scrollTop=0;this.style={setProperty(){}};}
 append(...items){for(const item of items){if(item.tag==='#fragment')this.append(...item.children);else this.children.push(item);}}
 replaceChildren(...items){this.children=[];this.append(...items);}
 setAttribute(name,value){this.attrs[name]=value;}
 addEventListener(name,fn){(this.listeners[name]||=[]).push(fn);}
 emit(name,event={}){for(const fn of this.listeners[name]||[])fn(event);}
 querySelectorAll(){return this.children.filter(child=>child.dataset.channel);}
 closest(){return this;}
 focus(){} scrollIntoView(){}
}
const names=['tv-confirmed','tv-guide-status','tv-programme','tv-online','tv-grid','tv-status','tv-query','tv-country','tv-category','tv-more','tv-retry','tv-video','tv-player-status','tv-placeholder','tv-play','tv-stop','tv-channel-scroll','tv-ready-title','tv-ready-help','tv-playback-state','tv-player-title','tv-stage','tv-signal','tv-signal-label'];
const ids=new Map(names.map(name=>[name,new Element()]));
let modal=false,observerCallback,requests=0;
const document={body:{classList:{contains:()=>modal}},hidden:false,listeners:{},getElementById:name=>ids.get(name),createElement:tag=>new Element(tag),createTextNode(text){const element=new Element('#text');element.textContent=text;return element;},createDocumentFragment:()=>new Element('#fragment'),addEventListener(name,fn){(this.listeners[name]||=[]).push(fn);}};
const curation=require('../tv-curation.js');
const channels=Object.entries(curation.countries).flatMap(([country,ids])=>ids.slice(0,5).map(id=>({id,country}))).slice(0,60).map((item,index)=>({...item,name:'ESPN Canal '+String(index).padStart(2,'0'),categories:['sports']}));
channels[59].categories=['movies','music'];
const feeds=channels.map(item=>({channel:item.id,id:'main',is_main:true,languages:['spa']}));
const streams=channels.slice(1).flatMap(item=>[0,1].map(index=>({channel:item.id,url:'https://media.example/'+item.id+'/'+index+'.m3u8',title:'Señal '+index,quality:'720p'})));
const mounts=[];
const opened=[];
const window={open(...args){opened.push(args);},FekaFootball:require('../football-core.js'),FekaTVCuration:curation,MutationObserver:true,FekaMedia:{mount(host,url,callbacks){const mounted={url,callbacks,destroyed:false,video:new Element('video'),destroy(){this.destroyed=true;}};mounts.push(mounted);host.replaceChildren(mounted.video);return mounted;}}};
const context={window,document,URL,Intl,AbortController,AbortSignal,setTimeout,clearTimeout,setInterval:()=>0,matchMedia:()=>({matches:false}),MutationObserver:class{constructor(fn){observerCallback=fn;}observe(){}},fetch:async url=>{requests++;return{ok:true,json:async()=>url.endsWith('streams.json')?streams:url.endsWith('feeds.json')?feeds:url.endsWith('logos.json')?[{channel:channels[0].id,url:'https://example.com/logo.png',in_use:true}]:url==='/api/football-guide'?{programmes:[{channel:channels[1].id,title:'Arsenal vs Chelsea',competition:'Premier League',start:new Date(Date.now()-60000).toISOString(),stop:new Date(Date.now()+3600000).toISOString()}]}:channels};}};
vm.runInNewContext(fs.readFileSync(require.resolve('../tv-online.js'),'utf8'),context);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 window.FekaTV.init();await tick();
 assert.equal(requests,5);assert.equal(mounts.length,0,'Inicializar no reproduce ni crea video');
 const grid=ids.get('tv-grid');assert.equal(grid.children.length,24);assert.equal(ids.get('tv-play').disabled,false);assert.match(ids.get('tv-programme').children[1].textContent,/Arsenal vs Chelsea/);
 assert.equal(ids.get('tv-player-title').textContent,channels[1].name,'La selección inicial prefiere un canal reproducible dentro de la página');
 const identity=grid.children[0].children[0];assert.equal(identity.children[0].tag,'img');identity.children[0].emit('error');assert.equal(identity.children[0].textContent,'AM','Un logo roto recupera las iniciales sin afectar la selección');
 grid.emit('click',{target:grid.children[0]});
 assert.equal(opened.length,0,'El sitio oficial no se abre al seleccionar el canal');
 ids.get('tv-play').emit('click');assert.deepEqual(opened,[['https://tvgo.americatv.com.pe/','_blank','noopener,noreferrer']]);assert.equal(mounts.length,0,'América TV abre su emisión oficial sin crear un reproductor HLS');
 grid.emit('click',{target:grid.children[1]});assert.equal(mounts.length,0,'Seleccionar tampoco reproduce');
 ids.get('tv-play').emit('click');assert.equal(mounts.length,1);assert.equal(ids.get('tv-placeholder').hidden,true);
 const first=mounts[0];grid.emit('click',{target:grid.children[2]});assert.equal(first.destroyed,true);assert.equal(mounts.length,1);assert.equal(ids.get('tv-placeholder').hidden,false);
 // Un callback tardío de la señal anterior no vuelve a iniciar audio.
 first.callbacks.onError();assert.equal(mounts.length,1);
 ids.get('tv-signal').value='1';ids.get('tv-signal').emit('change');assert.equal(mounts.length,1);
 ids.get('tv-play').emit('click');assert.equal(mounts.length,2);assert(mounts[1].url.endsWith('/1.m3u8'));
 ids.get('tv-stop').emit('click');assert.equal(mounts[1].destroyed,true);assert.equal(ids.get('tv-video').children.length,0);
 ids.get('tv-play').emit('click');modal=true;observerCallback();assert.equal(mounts[2].destroyed,true);assert.equal(ids.get('tv-placeholder').hidden,false);
 modal=false;observerCallback();assert.equal(mounts.length,3,'Cerrar otro modal no reanuda TV');
 ids.get('tv-play').emit('click');const backgroundPlayer=mounts[3];document.hidden=true;
 for(const listener of document.listeners.visibilitychange||[])listener();
 assert.equal(backgroundPlayer.destroyed,false,'Pasar a segundo plano conserva el reproductor');
 assert.equal(ids.get('tv-video').children[0],backgroundPlayer.video,'Se conserva el mismo video');
 assert.equal(ids.get('tv-placeholder').hidden,true,'El canal permanece en reproducción');
 document.hidden=false;for(const listener of document.listeners.visibilitychange||[])listener();
 assert.equal(backgroundPlayer.destroyed,false);assert.equal(mounts.length,4,'Volver a la pestaña no crea ni reinicia el reproductor');
 ids.get('tv-more').emit('click');assert.equal(grid.children.length,48);
 const scroll=ids.get('tv-channel-scroll');scroll.scrollHeight=100;scroll.clientHeight=80;scroll.emit('scroll');assert.equal(grid.children.length,60);
 ids.get('tv-query').value='Canal 02';ids.get('tv-query').emit('input');assert.equal(grid.children.length,1);assert.equal(mounts.length,4);
 ids.get('tv-query').value='No existe';ids.get('tv-query').emit('input');assert.equal(grid.children.length,0);assert.match(ids.get('tv-status').textContent,/No encontramos/);
 ids.get('tv-query').value='';ids.get('tv-category').value='movies';ids.get('tv-category').emit('change');assert.equal(grid.children.length,1,'Cine funciona sin guía de partidos');
 ids.get('tv-category').value='music';ids.get('tv-category').emit('change');assert.equal(grid.children.length,1,'Canal con múltiples categorías');
 ids.get('tv-country').value='PE';ids.get('tv-country').emit('change');assert.equal(grid.children.length,0,'Combina país y categoría');
 ids.get('tv-country').value='';ids.get('tv-category').value='sports';ids.get('tv-category').emit('change');assert.equal(grid.children.length,24,'Deportes no exige partido confirmado');
 ids.get('tv-confirmed').checked=true;ids.get('tv-confirmed').emit('change');assert.equal(grid.children.length,1,'Se conserva el filtro de partidos confirmados');
 ids.get('tv-category').value='kids';ids.get('tv-category').emit('change');assert.equal(grid.children.length,0,'No inventa canales infantiles');
 window.FekaTV.init();assert.equal(requests,5,'Init y carga no se duplican');
 console.log('OK: Play explícito; cambio y Stop destruyen; callbacks obsoletos; modales detienen; segundo plano conserva el mismo video sin reiniciarlo; lista incremental, filtros e init únicos.');
})().catch(error=>{console.error(error);process.exitCode=1;});
