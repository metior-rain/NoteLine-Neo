import test from 'node:test';
import assert from 'node:assert/strict';
import {RhythmSession,normalizeChart} from '../src/engine.js';
import {summarizeResult} from '../src/result-summary.js';
import {PathPulses,pulseAppearance} from '../src/path-pulses.js';
import {judgmentCount,pathPosition} from '../src/path-notes.js';
const meteor={kind:'meteor',lane:0,time:1000,end:4000,path:[{lane:1,time:2000},{lane:2,time:3000},{lane:2,time:4000}]};
const bounce={kind:'bounce',lane:0,time:5000,end:7000,path:[{lane:1,time:6000},{lane:2,time:7000}]};
const chart=normalizeChart({name:'Combo',duration:8000,notes:[meteor,bounce]});
const held=lane=>Array.from({length:4},(_,i)=>new Set(i===lane?['finger']:[]));
test('manual flow scores every node once and the three bounce landings each add combo',()=>{
 const s=new RhythmSession(chart);const head=s.hit(0,1000);assert.equal(head.combo,1);let checkpoints=1;
 for(let time=1010;time<=4000;time+=10){const results=s.tick(time,held(Math.round(pathPosition(meteor,time).lane)));checkpoints+=results.filter(r=>r.checkpoint).length;const expected=1+meteor.path.filter(p=>p.time<=time).length;assert.equal(s.combo,expected);}
 assert.equal(checkpoints,4);assert.equal(s.tick(4100).length,0);assert.equal(s.combo,4);
 for(const [lane,time] of [[0,5000],[1,6000],[2,7000]]){const before=s.combo;s.hit(lane,time);assert.equal(s.combo,before+1);s.release(lane,time+10);}
 assert.equal(s.combo,7);assert.equal(s.total,judgmentCount(chart.notes));assert.equal(s.score,1000000);assert.equal(s.complete,true);
 const summary=summarizeResult(s);assert.equal(summary.total,7);assert.equal(summary.counts.perfect,7);assert.equal(summary.combo,7);
});
test('a broken flow preserves completed checkpoints and cannot score again',()=>{
 const s=new RhythmSession(chart);s.hit(0,1000);for(let t=1010;t<=2100;t+=10)s.tick(t,held(Math.round(pathPosition(meteor,t).lane)));
 assert.equal(s.counts.perfect,2);s.release(1,2100);s.tick(2400,held(-1));assert.equal(s.counts.perfect,2);assert.equal(s.counts.miss,2);assert.equal(s.combo,0);
 s.hit(2,3000);s.tick(4000,held(2));assert.equal(s.counts.perfect,2);s.finish();assert.equal(s.complete,true);assert.equal(s.counts.miss,5);
});
test('manual and auto full combo share identical denominator and grade',()=>{
 const s=new RhythmSession(chart);s.auto(8000);assert.equal(s.combo,7);assert.equal(s.score,1000000);assert.equal(s.auto(9000).length,0);
});
test('path hit silhouettes scale and fade, expire, reset and stay bounded',()=>{
 const pulses=new PathPulses();pulses.add({note:meteor,rating:'perfect',lane:2,checkpoint:true,terminal:true});pulses.add({note:bounce,rating:'perfect',lane:1});
 assert.equal(pulses.items.length,2);const start=pulseAppearance(pulses.items[0]);for(let i=0;i<4;i++)pulses.step(.05);const middle=pulseAppearance(pulses.items[0]);assert.ok(middle.alpha<start.alpha);assert.notEqual(middle.scale,start.scale);assert.equal(pulseAppearance(pulses.items[0],true).scale,1);
 for(let i=0;i<6;i++)pulses.step(.05);assert.equal(pulses.items.length,0);
 pulses.add({note:meteor,rating:'miss'});assert.equal(pulses.items.length,0);for(let i=0;i<100;i++)pulses.add({note:bounce,rating:'perfect'});assert.equal(pulses.items.length,64);pulses.clear();assert.equal(pulses.items.length,0);
});
