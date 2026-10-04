import test from 'node:test';
import assert from 'node:assert/strict';
import {RhythmSession,normalizeChart} from '../src/engine.js';
import {hitSoundLane} from '../src/hit-feedback.js';
const session=()=>new RhythmSession(normalizeChart({notes:[{lane:0,time:1000,end:2000},{lane:1,time:3000}]}));
test('manual hold plays once at press, not automatic completion, and taps still sound',()=>{
 const s=session();assert.equal(hitSoundLane(s.hit(0,1000)),0);
 assert.deepEqual(s.tick(1500),[]);assert.equal(hitSoundLane(s.tick(2000)[0]),null);
 assert.equal(hitSoundLane(s.release(0,2050)),null);assert.equal(hitSoundLane(s.hit(1,3000)),1);
});
test('tolerated or failed early release does not make another sound',()=>{
 for(const time of [1500,1940]){const s=session();assert.equal(hitSoundLane(s.hit(0,1000)),0);assert.equal(hitSoundLane(s.release(0,time)),null);}
});
test('Early and empty presses remain silent',()=>{
 const s=session();assert.equal(hitSoundLane(s.hit(0,500)),null);const early=s.hit(0,820);assert.equal(early.reason,'early');assert.equal(hitSoundLane(early),null);
});
test('demonstration emits the hold head once and completes silently',()=>{
 const s=session();const head=s.auto(1000);assert.equal(head.length,1);assert.equal(hitSoundLane(head[0]),0);
 assert.deepEqual(s.auto(1001),[]);assert.equal(hitSoundLane(s.auto(2000)[0]),null);assert.equal(hitSoundLane(s.auto(3000)[0]),1);
 assert.equal(s.counts.perfect,2);
});
