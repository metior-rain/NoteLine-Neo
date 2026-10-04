import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeChart,RhythmSession,encodeScore} from '../src/engine.js';
import {ChartDocument,findNote} from '../src/editor-model.js';
import {pathPosition,moveNote} from '../src/path-notes.js';
import {createScorePackage,readScorePackage} from '../src/score-package.js';
import {hitSoundLane} from '../src/hit-feedback.js';
const meteor={kind:'meteor',lane:0,time:1000,end:3000,path:[{lane:1,time:2000},{lane:2,time:3000}]};
const bounce={kind:'bounce',lane:3,time:4000,end:6000,path:[{lane:1,time:5000},{lane:2,time:6000}]};
const chart=(notes=[meteor,bounce])=>normalizeChart({name:'Paths',bpm:120,duration:8000,notes});
const inputs=(...lanes)=>Array.from({length:4},(_,lane)=>new Set(lanes.includes(lane)?['held']:[]));
test('Score 2 preserves absolute microsecond paths and bundled audio on all difficulties',async()=>{
 const source=chart(),encoded=encodeScore(source);assert.equal(encoded.revision,2);assert.deepEqual(normalizeChart(encoded),source);
 const pack=createScorePackage({charts:{easy:source,normal:source,hard:source}},new Blob(['exact audio'],{type:'audio/mpeg'}));const read=await readScorePackage(pack);assert.deepEqual(read.charts.hard.notes,source.notes);assert.equal(await read.audioBlob.text(),'exact audio');
});
test('reject malformed, unordered, too close, out of bounds or ambiguous path notes',()=>{
 for(const patch of [{path:[]},{path:[{lane:4,time:3000}]},{path:[{lane:1,time:1100}]},{end:3100},{kind:'tap'},{path:[{lane:1,time:2500},{lane:2,time:2400}]}])assert.throws(()=>chart([{...meteor,...patch}]));
 assert.throws(()=>chart([meteor,{lane:0,time:1800}]));
 assert.doesNotThrow(()=>chart([meteor,{lane:1,time:1800}]));
 assert.throws(()=>chart([bounce,{lane:1,time:5000}]));
});
test('meteor scores its head and each reached node, with sound only at head',()=>{
 const session=new RhythmSession(chart([meteor]));const head=session.hit(0,1000);assert.equal(head.head,true);assert.equal(hitSoundLane(head),0);
 for(let t=1010;t<=3000;t+=10){const lane=Math.round(pathPosition(meteor,t).lane);const results=session.tick(t,inputs(lane));if(t!==2000&&t!==3000)assert.equal(results.length,0);else{assert.equal(results[0].rating,'perfect');assert.equal(hitSoundLane(results[0]),null);}}
 assert.equal(session.score,1000000);assert.equal(session.combo,3);assert.equal(session.complete,true);assert.deepEqual(session.holds,[null,null,null,null]);
});
test('meteor tolerates a short handoff but fails an unfollowed lane or released sustain',()=>{
 const short=new RhythmSession(chart([meteor]));short.hit(0,1000);short.tick(1880,inputs(0));short.tick(1950,inputs(1));assert.equal(short.counts.miss,0);
 short.tick(2000,inputs(1));short.tick(2880,inputs(1));short.tick(3000,inputs(1));assert.equal(short.counts.miss,1);assert.equal(short.holds.some(Boolean),false);
 const released=new RhythmSession(chart([meteor]));released.hit(0,1000);released.release(0,1100);released.tick(3000,inputs());assert.equal(released.counts.miss,2);
});
test('a late re-press cannot recover a broken meteor and Early cannot start it',()=>{
 const s=new RhythmSession(chart([meteor]));s.hit(0,1000);s.release(0,1100);s.hit(0,1340);assert.equal(s.counts.miss,2);
 const early=new RhythmSession(chart([meteor]));assert.equal(early.hit(0,820).reason,'early');assert.equal(early.hit(0,1000),null);assert.equal(early.notes[0].holding,false);
});
test('paused time does not accumulate a meteor handoff gap',()=>{
 const s=new RhythmSession(chart([meteor]));s.hit(0,1000);s.tick(1880,inputs());for(let i=0;i<100;i++)s.tick(1880,inputs());s.tick(1930,inputs(1));assert.equal(s.counts.miss,0);
});
test('bounce judges each arrival separately; one missed landing leaves later landings playable',()=>{
 const s=new RhythmSession(chart([bounce]));assert.equal(s.notes.length,3);assert.equal(hitSoundLane(s.hit(3,4000)),3);s.release(3,4010);assert.equal(s.tick(5150)[0].rating,'miss');assert.equal(s.hit(2,6000).rating,'perfect');assert.equal(s.complete,true);assert.equal(s.counts.perfect,2);assert.equal(s.counts.miss,1);assert.equal(s.combo,1);
});
test('bounce Early consumes only its own landing and empty presses stay harmless',()=>{
 const s=new RhythmSession(chart([bounce]));assert.equal(s.hit(0,3500),null);assert.equal(s.hit(3,3820).reason,'early');assert.equal(s.hit(1,5000).rating,'perfect');assert.equal(s.hit(2,6000).rating,'perfect');assert.equal(s.counts.miss,1);
});
test('autoplay advances meteor holds and every bounce landing exactly once',()=>{
 const s=new RhythmSession(chart());let sounds=0;for(let t=0;t<=7000;t+=10)for(const r of s.auto(t))if(hitSoundLane(r)!==null)sounds++;
 assert.equal(s.score,1000000);assert.equal(s.combo,6);assert.equal(sounds,4);assert.equal(s.auto(7100).length,0);
});
test('editor moves entire paths, hits path bodies and deep restores undo/redo',()=>{
 const doc=new ChartDocument(chart([meteor])),id=doc.notes[0].id;
 assert.equal(findNote(doc.notes,2000,1,20).id,id);
 doc.update([id],n=>moveNote(n,500,1));assert.equal(doc.notes[0].path[1].lane,3);assert.equal(doc.notes[0].end,3500);
 doc.undo();assert.deepEqual(doc.notes[0].path,meteor.path);doc.redo();assert.equal(doc.notes[0].path[1].time,3500);
 assert.throws(()=>doc.update([id],n=>moveNote(n,0,1)));assert.equal(doc.notes[0].path[1].lane,3);
 const reopened=new ChartDocument(doc.export());assert.deepEqual(reopened.notes[0].path,doc.notes[0].path);
});

test('meteor tail tolerance is 90ms and does not stack with handoff tolerance',()=>{
 for(const [releaseAt,expected] of [[2910,'perfect'],[2900,'miss']]){const s=new RhythmSession(chart([meteor]));s.hit(0,1000);for(let t=1010;t<=releaseAt;t+=10)s.tick(t,inputs(Math.round(pathPosition(meteor,t).lane)));s.release(2,releaseAt);s.tick(3000,inputs());assert.equal(s.notes[0].rating,expected);}
});

test('meteor stays centered on its lane and shifts only shortly before each node',()=>{
 assert.equal(pathPosition(meteor,1500).lane,0);
 assert.equal(pathPosition(meteor,1760).lane,0);
 assert.equal(pathPosition(meteor,1880).lane,.5);
 assert.equal(pathPosition(meteor,2000).lane,1);
 assert.equal(pathPosition(meteor,2500).lane,1);
 assert.equal(pathPosition(meteor,3000).lane,2);
 const before=pathPosition(meteor,1761).lane,after=pathPosition(meteor,1999).lane;
 assert.ok(before<.001&&after>.999);
});
test('bounce interpolation is unchanged by meteor lane-dwell behavior',()=>{
 assert.equal(pathPosition(bounce,4500).lane,2);
});

test('meteor permits a 200ms keyboard gap, including release then press on the new lane',()=>{
 const s=new RhythmSession(chart([meteor]));s.hit(0,1000);s.tick(1780,inputs(0));s.release(0,1780);s.tick(1900,inputs());s.hit(1,1980);assert.equal(s.counts.miss,0);
 s.tick(2500,inputs(1));assert.equal(s.notes[0].holding,true);
});
test('touch slide stays continuous and never hits nearby tap or bounce notes',()=>{
 const s=new RhythmSession(chart([meteor,{lane:1,time:1800}]));s.hit(0,1000);
 const held=inputs(0);for(let t=1010;t<=3000;t+=10){const lane=Math.round(pathPosition(meteor,t).lane),old=held.findIndex(set=>set.size);if(lane!==old){held[old].clear();held[lane].add('finger');s.slide(old,lane,t,held);}else s.tick(t,held);}
 assert.equal(s.notes.find(n=>n.kind==='meteor').rating,'perfect');
 const tap=s.notes.find(n=>n.kind!=='meteor');assert.equal(tap.rating,'miss');assert.equal(tap.reason,undefined);
});
