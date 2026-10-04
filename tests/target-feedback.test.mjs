import test from 'node:test';
import assert from 'node:assert/strict';
import {TargetFeedback} from '../src/target-feedback.js';
const empty=()=>Array.from({length:4},()=>new Set());
test('a brief press released before the next render retains visible feedback and expires',()=>{
 const f=new TargetFeedback();f.press(1);f.step(1/60,empty());assert.ok(f.appearance(1).charge>.5);assert.equal(f.appearance(0).charge,0);
 for(let i=0;i<60;i++)f.step(1/60,empty());assert.equal(f.appearance(1).charge,0);
});
test('held contact retains its fill, release decays and reset clears all transient state',()=>{
 const f=new TargetFeedback(),inputs=empty();inputs[2].add('finger');for(let i=0;i<60;i++)f.step(1/60,inputs);
 assert.ok(f.appearance(2).charge>.85);assert.ok(Math.abs(f.appearance(2).scale-.88)<.001);assert.equal(f.appearance(2,0,true).scale,1);
 inputs[2].clear();let peak=0;for(let i=0;i<60;i++){f.step(1/60,inputs);peak=Math.max(peak,f.appearance(2).scale);}assert.ok(peak>1);assert.ok(Math.abs(f.appearance(2).scale-1)<.001);assert.ok(f.appearance(2).charge<.001);
 f.press(3);f.reset();assert.equal(f.appearance(3).charge,0);
 assert.ok(f.appearance(2,1).charge>0);
});
