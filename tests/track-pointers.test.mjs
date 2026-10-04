import test from 'node:test';
import assert from 'node:assert/strict';
import {bindTrackPointers} from '../src/track-pointers.js';
import {RhythmSession,normalizeChart} from '../src/engine.js';
import {pathPosition} from '../src/path-notes.js';
function setup(){
 const captures=new Set(),events=[],canvas={setPointerCapture:id=>captures.add(id),hasPointerCapture:id=>captures.has(id),releasePointerCapture:id=>captures.delete(id)};
 const control=bindTrackPointers(canvas,{geometry:()=>({left:0,width:400,top:0}),enabled:()=>true,press:(...args)=>events.push(['press',...args]),slide:(...args)=>events.push(['slide',...args]),release:(...args)=>events.push(['release',...args])});
 const event=(id,x)=>({pointerId:id,pointerType:'touch',clientX:x,clientY:500,button:0,preventDefault(){}});
 return {canvas,control,captures,events,event};
}
test('one finger crosses four lanes through captured moves without release or repeated hit',()=>{
 const {canvas,captures,events,event}=setup();canvas.onpointerdown(event(7,50));
 for(const x of [150,250,350])canvas.onpointermove(event(7,x));
 assert.ok(captures.has(7));assert.deepEqual(events,[['press',0,'pointer-7'],['slide',0,1,'pointer-7'],['slide',1,2,'pointer-7'],['slide',2,3,'pointer-7']]);
 canvas.onpointerup(event(7,350));canvas.onlostpointercapture(event(7,350));assert.equal(events.filter(e=>e[0]==='release').length,1);
});
test('multiple contacts remain independent; cancel and pause leave no stuck contacts',()=>{
 const {canvas,control,captures,events,event}=setup();canvas.onpointerdown(event(1,50));canvas.onpointerdown(event(2,350));canvas.onpointermove(event(1,150));canvas.onpointercancel(event(1,150));canvas.onpointermove(event(2,250));
 assert.deepEqual(events.at(-1),['slide',3,2,'pointer-2']);control.clear();assert.equal(captures.has(2),false);const length=events.length;canvas.onpointermove(event(2,150));canvas.onlostpointercapture(event(2,150));assert.equal(events.length,length);
});
test('real pointer handler plus session sustains a meteor through forward and reverse swipes',()=>{
 const n={kind:'meteor',lane:0,time:1000,end:5000,path:[{lane:3,time:2000},{lane:0,time:3500},{lane:0,time:5000}]};
 const session=new RhythmSession(normalizeChart({duration:6000,notes:[n]})),inputs=Array.from({length:4},()=>new Set());let time=1000;
 const canvas={setPointerCapture(){},hasPointerCapture(){return true;},releasePointerCapture(){}};
 bindTrackPointers(canvas,{geometry:()=>({left:0,width:400,top:0}),enabled:()=>true,
 press(lane,token){inputs[lane].add(token);session.hit(lane,time);},
 slide(from,to,token){inputs[from].delete(token);inputs[to].add(token);session.slide(from,to,time,inputs);},
 release(lane,token){inputs[lane].delete(token);session.release(lane,time);}});
 const event=()=>({pointerId:1,pointerType:'touch',button:0,clientY:500,clientX:(pathPosition(n,time).lane+.5)*100,preventDefault(){}});
 canvas.onpointerdown(event());for(time=1010;time<=5000;time+=10){canvas.onpointermove(event());session.tick(time,inputs);}
 canvas.onpointerup(event());assert.equal(session.score,1000000);assert.equal(session.counts.miss,0);assert.equal(inputs.some(set=>set.size),false);
});
