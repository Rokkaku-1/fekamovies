'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const vm = require('node:vm');
const football = require('../football-core.js');
const {createFootballGuide} = require('../server/football-guide.cjs');
const {createAPI} = require('../server/api.cjs');
const now = Date.parse('2026-10-23T20:00:00Z');
const match = (extras = {}) => ({channel:'ESPNLatinAmerica.us', title:'Arsenal vs Chelsea', competition:'Premier League', start:'2026-10-23T19:00:00Z', stop:'2026-10-23T21:00:00Z', ...extras});
test('excludes general TV and unrelated sports, keeps football and identified mixed channels', () => {
  for (const name of ['CNN','Cine Premiere','ESPN8: The Ocho','NBA TV','Golf Channel','Tennis Channel','Fight Sports','DAZN Darts x Pluto TV','DAZN Combat']) assert.equal(football.channelKind({name,categories:['sports']}),null,name);
  for (const name of ['ESPN Latin America','TyC Sports','beIN SPORTS XTRA']) assert.equal(football.channelKind({name,categories:['sports']}),'mixed',name);
  assert.equal(football.channelKind({name:'Sportitalia Solocalcio',categories:['sports']}),'football');
  assert.equal(football.channelKind({name:'Futbol',closed:'2025-01-01'}),null);
});
test('classifies requested competitions without confusing country or similar league names', () => {
  const samples = {'Copa Libertadores':'libertadores','CONMEBOL Sudamericana':'sudamericana','Brasileirao Serie A':'brasileirao','Copa do Brasil':'copa-brasil','Liga Profesional Argentina':'argentina','Copa Argentina':'copa-argentina','Liga 1 Peru':'peru','Liga BetPlay':'colombia','Premier League':'premier','LaLiga':'laliga','Ligue 1':'ligue1','Italian Serie A':'seriea','Bundesliga':'bundesliga','Liga Portugal':'portugal','Eredivisie':'eredivisie','UEFA Champions League':'champions','Europa League':'europa','Conference League':'conference'};
  for(const [text,id] of Object.entries(samples)) assert.equal(football.classifyCompetition(text),id,text);
  assert.equal(football.classifyCompetition('Scottish Premier League'),null);
  assert.equal(football.classifyCompetition('NBA'),null);
});
test('guide requires competition, matchup, valid channel and current or upcoming time; expired data is excluded', () => {
  assert.equal(football.normalizeGuide({programmes:[match()]},now).length,1);
  for(const item of [match({title:'Premier League highlights'}),match({title:'Premier League'}),match({channel:'../../secret'}),match({competition:'NBA'}),match({stop:'2026-10-22T21:00:00Z'}),match({start:'invalid'})]) assert.equal(football.normalizeProgramme(item,now),null);
  const normalized=football.normalizeProgramme(match(),now);
  assert.equal(football.normalizeProgramme(normalized,now).live,true);
  assert.equal(football.normalizeProgramme(normalized,now+2*3600000),null);
  const channel={name:'ESPN',programmes:[normalized]};
  assert.equal(football.channelMatches(channel,'chelsea','premier',true,now),true);
  assert.equal(football.channelMatches(channel,'','laliga',false,now),false);
  assert.equal(football.channelMatches(channel,'','',true,now+2*3600000),false);
});
test('curated TV keeps exact selected IDs, Spanish feeds and compatible streams, with safe logos', async () => {
  const context={window:{FekaFootball:football,FekaTVCuration:require('../tv-curation.js')},URL};
  vm.runInNewContext(await fs.readFile(require.resolve('../tv-online.js'),'utf8'),context);
  const metadata=[{id:'Latina.pe',name:'Latina',country:'PE'}, {id:'Local.pe',name:'Latina local',country:'PE'}, {id:'Rai1.it',name:'Rai 1',country:'IT'}, {id:'ATV.pe',name:'ATV',country:'PE',closed:'2025-01-01'}, {id:'TVPeru.pe',name:'TV Peru',country:'PE',is_nsfw:true}];
  const streams=metadata.map(x=>({channel:x.id,url:'https://example.com/'+x.id+'.m3u8',feed:'main'}));
  const feeds=metadata.map(x=>({channel:x.id,id:'main',is_main:true,languages:[x.country==='IT'?'ita':'spa']}));
  feeds.push({channel:'Latina.pe',id:'english',languages:['eng']});
  streams.push(...[
    {url:'javascript:alert(1)'}, {url:'https://example.com/private.m3u8',referrer:'https://example.com'},
    {url:'https://example.com/geo.m3u8',labels:['Geo-blocked']}, {url:'https://example.com/headers.m3u8',user_agent:'private'},
    {url:'http://example.com/insecure.m3u8'}, {url:'https://user:password@example.com/credential.m3u8'},
    {url:'https://example.com/english.m3u8',feed:'english'}, {url:'https://example.com/unknown.m3u8',feed:'unknown'},
  ].map(x=>({channel:'Latina.pe',feed:'main',...x})));
  const logos=[{channel:'Latina.pe',url:'javascript:alert(1)'}, {channel:'Latina.pe',url:'https://example.com/latina.png',in_use:true}, {channel:'Rai1.it',url:'https://user:pass@example.com/logo.png'}];
  const channels=context.window.FekaTV.buildChannels(streams,metadata,feeds,logos);
  assert.equal(channels.length,2);assert.equal(channels[0].id,'Latina.pe');assert.equal(channels[0].sources.length,1);
  assert.equal(channels[0].logo,'https://example.com/latina.png');assert.equal(channels[1].logo,null);
  assert.equal(channels[1].sources[0].languages[0],'ita');
  assert.equal(context.window.FekaTV.buildChannels(streams,metadata,feeds).length,2,'Logos are optional');
});

test('curated TV caps each country after availability filtering, deduplicates and prefers native feeds', async () => {
  const selection=require('../tv-curation.js');
  const context={window:{FekaFootball:football,FekaTVCuration:selection},URL};
  vm.runInNewContext(await fs.readFile(require.resolve('../tv-online.js'),'utf8'),context);
  const metadata=selection.countries.PE.map(id=>({id,name:id,country:'PE'}));
  metadata.push(...selection.countries.ES.map(id=>({id,name:id,country:'ES'})));
  metadata.push({id:'Rai1.it',name:'Rai 1',country:'IT'});
  const feeds=metadata.map(c=>({channel:c.id,id:'main',is_main:true,languages:[c.country==='IT'?'ita':'spa']}));
  feeds.push({channel:'Rai1.it',id:'english',languages:['eng']});
  const streams=metadata.map(c=>({channel:c.id,url:'https://example.com/'+c.id+'.m3u8'}));
  streams.push(streams[1],{channel:'Rai1.it',feed:'english',url:'https://example.com/english.m3u8',quality:'1080p'});
  const channels=context.window.FekaTV.buildChannels(streams,metadata,feeds);
  assert.equal(channels.filter(c=>c.country==='PE').length,13,'America TV does not displace an existing Peruvian channel');
  assert.equal(channels.filter(c=>c.country==='ES').length,5,'The limit elsewhere stays unchanged');
  assert.equal(channels[0].id,selection.countries.PE[0]);
  assert.equal(channels[1].sources.length,1);
  assert.equal(channels.at(-1).sources[0].languages[0],'ita');
  const unavailable=streams.filter(s=>s.channel!==selection.countries.PE[0]);
  const available=context.window.FekaTV.buildChannels(unavailable,metadata,feeds);
  assert.equal(available[0].id,'AmericaTelevision.pe');
  assert.equal(available[0].sources[0].kind,'official-page');
  assert.equal(available[0].sources[0].url,'https://tvgo.americatv.com.pe/');
  assert.equal(available.filter(c=>c.country==='PE').length,13,'Official fallback preserves the other twelve channels');
});
test('private guide cache deduplicates fetches, rejects redirects and hides provider errors',async()=>{
  let calls=0;
  const guide=createFootballGuide({env:{FOOTBALL_GUIDE_URL:'https://guide.example.com/football.json'},now:()=>now,fetchImpl:async(url,options)=>{calls++;assert.equal(options.redirect,'error');return new Response(JSON.stringify({programmes:[match()]}));}});
  const [a,b]=await Promise.all([guide(),guide()]);assert.equal(calls,1);assert.deepEqual(a,b);assert.equal(a.available,true);
  const blocked=createFootballGuide({env:{FOOTBALL_GUIDE_URL:'http://127.0.0.1/secrets'},fetchImpl:()=>{throw Error('should not fetch');}});
  assert.equal((await blocked()).available,false);
});
test('guide endpoint has no user controlled URL, restricts methods/origins and does not require TMDB',async()=>{
  const api=createAPI({env:{},now:()=>now,readGuide:async()=>'{"programmes":[]}'});
  assert.equal((await api({url:'/api/football-guide',method:'POST'})).statusCode,405);
  assert.equal((await api({url:'/api/football-guide',fetchSite:'cross-site'})).statusCode,403);
  assert.equal((await api({url:'/api/football-guide?url=http://localhost'})).statusCode,400);
  const response=await api({url:'/api/football-guide'});assert.equal(response.statusCode,200);assert.equal(JSON.parse(response.body).programmes.length,0);
  assert.equal(response.body.includes('TMDB_API_KEY'),false);
});
