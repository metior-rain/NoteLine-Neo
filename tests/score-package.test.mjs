import {createHash} from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createScorePackage,readScorePackage} from '../src/score-package.js';
import {normalizeChart,encodeScore} from '../src/engine.js';
const chart=normalizeChart({name:'音频包',bpm:123.456,beatOffset:-125.001,duration:3000,notes:[{lane:0,time:100.123,end:2500.456}]});
const audio=new Blob([new Uint8Array([73,68,51,255,0,80,127,128])],{type:'audio/mpeg'}),cover=new Blob([new Uint8Array([137,80,78,71])],{type:'image/png'});
test('one package roundtrips precise notes and exact audio/cover bytes',async()=>{const file=createScorePackage(encodeScore(chart),audio,cover),pack=await readScorePackage(file);assert.deepEqual(pack.chart,chart);assert.equal(pack.legacy,false);assert.equal(pack.audioBlob.type,audio.type);assert.deepEqual(await pack.audioBlob.arrayBuffer(),await audio.arrayBuffer());assert.deepEqual(await pack.coverBlob.arrayBuffer(),await cover.arrayBuffer());});
test('no cover is valid; music is always required',async()=>{const pack=await readScorePackage(createScorePackage(chart,audio));assert.equal(pack.coverBlob,null);assert.throws(()=>createScorePackage(chart,null));assert.throws(()=>createScorePackage(chart,new Blob([])));assert.throws(()=>createScorePackage(chart,new Blob(['bad'],{type:'text/html'})));});
test('truncated assets, trailing bytes, invalid lengths and corrupted metadata reject',async()=>{const file=createScorePackage(chart,audio,cover);await assert.rejects(readScorePackage(file.slice(0,file.size-1)));await assert.rejects(readScorePackage(new Blob([file,'x'])));const bytes=new Uint8Array(await file.arrayBuffer());new DataView(bytes.buffer).setUint32(8,9000000,true);await assert.rejects(readScorePackage(new Blob([bytes])));await assert.rejects(readScorePackage(new Blob(['NLCHART2'])));const corrupt=new Uint8Array(await file.arrayBuffer());corrupt[12]=0;await assert.rejects(readScorePackage(new Blob([corrupt])));});
test('legacy JSON remains available for migration without pretending to embed audio',async()=>{const pack=await readScorePackage(new Blob([JSON.stringify(encodeScore(chart))]));assert.deepEqual(pack.chart,chart);assert.equal(pack.audioBlob,null);assert.equal(pack.legacy,true);});
test('all bundled builtins include their original unmodified music and cover',async()=>{for(const id of ['song1','song2','song3','song4','sp1','hold-study']){const pack=await readScorePackage(new Blob([await readFile(new URL(`../exports/builtin-scores/${id}.nlchart`,import.meta.url))]));const audioId=id==='hold-study'?'song2':id;assert.equal(pack.legacy,false);const checksums=JSON.parse(await readFile(new URL('../exports/builtin-scores/audio-checksums.json',import.meta.url),'utf8'));assert.equal(createHash('sha256').update(new Uint8Array(await pack.audioBlob.arrayBuffer())).digest('hex'),checksums[audioId]);assert.ok(pack.coverBlob.size>0);}});
test('one package preserves three independent difficulty charts',async()=>{
 const easy=normalizeChart({...chart,notes:[{lane:0,time:400}]}),hard=normalizeChart({...chart,notes:[{lane:0,time:100},{lane:1,time:200},{lane:2,time:300}]});
 const pack=await readScorePackage(createScorePackage({charts:{easy,normal:chart,hard}},audio,cover));
 assert.deepEqual(Object.keys(pack.charts),['easy','normal','hard']);assert.deepEqual(pack.charts.easy,easy);assert.deepEqual(pack.charts.normal,chart);assert.deepEqual(pack.charts.hard,hard);
 assert.equal(pack.chart.notes.length,1);assert.deepEqual(await pack.audioBlob.arrayBuffer(),await audio.arrayBuffer());
});
test('older packages map their only chart to normal difficulty',async()=>{
 const file=createScorePackage(chart,audio),bytes=new Uint8Array(await file.arrayBuffer()),old=JSON.parse(new TextDecoder().decode(bytes.slice(12,12+new DataView(bytes.buffer).getUint32(8,true))));
 old.revision=2;old.score=old.charts.normal;delete old.charts;delete old.title;
 const meta=new TextEncoder().encode(JSON.stringify(old)),header=new Uint8Array(12);header.set(new TextEncoder().encode('NLCHART2'));new DataView(header.buffer).setUint32(8,meta.length,true);
 const pack=await readScorePackage(new Blob([header,meta,audio]));assert.deepEqual(Object.keys(pack.charts),['normal']);assert.deepEqual(pack.charts.normal,chart);
});
