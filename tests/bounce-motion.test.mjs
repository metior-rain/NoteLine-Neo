import test from 'node:test';
import assert from 'node:assert/strict';
import {bounceMotion} from '../src/bounce-motion.js';
import {approachMs} from '../src/scroll-geometry.js';
import {LaunchClock} from '../src/launch-clock.js';
const route={kind:'bounce',lane:1,time:1000,path:[{lane:3,time:2000}],end:2000};
const head={...route,route,routeIndex:0};
test('bounce head falls at 600 CSS px/s with a full approach at every window height',()=>{
 for(const hitY of [400,700,1100]){const topY=100,travel=approachMs(topY,hitY,1),options={hitY,height:105,speed:1};
 assert.equal(bounceMotion(head,1000-travel,options).y,topY);
 const a=bounceMotion(head,500,options),b=bounceMotion(head,600,options);
 assert.equal(b.y-a.y,60);assert.equal(a.lane,1);assert.equal(a.phase,'approach');assert.equal(bounceMotion(head,1000,options).y,hitY);
 }
});
test('first bounce at audio zero receives full preroll after countdown',()=>{
 const hitY=700,topY=100,travel=approachMs(topY,hitY,1),clock=new LaunchClock(0,travel);
 clock.start(3000);assert.equal(bounceMotion({...head,route:{...route,time:0}},clock.time(3000),{hitY,height:100}).y,topY);
});
test('after the initial landing the next node follows its existing bounce arc',()=>{
 const next={lane:3,time:2000,kind:'bounce',route,routeIndex:1},options={hitY:700,height:100};
 assert.deepEqual(bounceMotion(next,1000,options),{lane:1,y:700,phase:'bounce'});
 assert.deepEqual(bounceMotion(next,1500,options),{lane:2,y:600,phase:'bounce'});
 assert.equal(bounceMotion(next,2000,options).y,700);
});
