import test from 'node:test';
import assert from 'node:assert/strict';
import { noteY,approachMs } from '../src/scroll-geometry.js';
import { LaunchClock } from '../src/launch-clock.js';

test('different window heights keep identical note velocity at every speed',()=>{
 for(const speed of [.6,1,2.5])for(const height of [480,720,1080,1440]){
  const hitY=height*.77;
  const distance=noteY(hitY,400,speed)-noteY(hitY,900,speed);
  assert.ok(Math.abs(distance-300*speed)<1e-9);
  assert.equal(noteY(hitY,0,speed),hitY);
 }
});
test('hold length depends on its duration and speed, never window height',()=>{
 for(const height of [480,720,1080,1440]){
  const hitY=height*.77;
  assert.ok(Math.abs(noteY(hitY,250)-noteY(hitY,1250)-600)<1e-9);
 }
});
test('countdown hands off with first note at the top for each window height',()=>{
 for(const height of [480,720,1080,1440])for(const speed of [.6,1,2.5]){
  const topY=130,hitY=height*.77,travel=approachMs(topY,hitY,speed);
  const clock=new LaunchClock(0,travel);clock.start(3000);
  assert.ok(Math.abs(noteY(hitY,-clock.time(3000),speed)-topY)<1e-9);
  assert.equal(clock.ready(3000+travel-1),false);
  assert.ok(Math.abs(noteY(hitY,-clock.time(3000+travel),speed)-hitY)<1e-9);
 }
});
