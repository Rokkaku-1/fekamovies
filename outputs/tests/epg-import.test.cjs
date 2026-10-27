'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {importProgrammes, mergeGuide} = require('../server/epg-import.cjs');
const {createFootballGuide} = require('../server/football-guide.cjs');
const now = Date.parse('2026-10-26T12:00:00Z');
const row = {title:'Arsenal vs Chelsea',category:'Premier League', start:'2026-10-27T18:00:00Z',stop:'2026-10-27T20:00:00Z'};
test('EPG imports tomorrow, deduplicates and rejects generic, expired and unclassified broadcasts', () => {
  const result = importProgrammes('Channel.xx', [row,row,{...row,title:'Resumen Arsenal vs Chelsea'},
    {...row,title:'Fútbol'}, {...row,category:'',description:'Premier League'},
    {...row,start:'2026-10-25T18:00:00Z',stop:'2026-10-25T20:00:00Z'}], now);
  assert.equal(result.length,1);
  assert.equal(result[0].competition,'premier');
  assert.equal(result[0].live,false);
});
test('failed sources retain valid previous matches; a successful empty schedule clears them', () => {
  const previous={programmes:importProgrammes('Channel.xx',[row],now)};
  assert.equal(mergeGuide(previous,[{channel:'Channel.xx',ok:false}],now).programmes.length,1);
  assert.equal(mergeGuide(previous,[{channel:'Channel.xx',ok:true,rows:[]}],now).programmes.length,0);
});
test('local API reloads guide after cache expiry without a server restart',async()=>{
  let clock=now, reads=0;
  const guide=createFootballGuide({env:{},now:()=>clock,readGuide:async()=>{
    reads++;return JSON.stringify({updatedAt:new Date(now).toISOString(),programmes: reads===1?[]:importProgrammes('Channel.xx',[row],now)});
  }});
  assert.equal((await guide()).available,false);
  await guide();assert.equal(reads,1);
  clock+=300001;
  assert.equal((await guide()).available,true);
  assert.equal((await guide()).updatedAt,new Date(now).toISOString());
});
