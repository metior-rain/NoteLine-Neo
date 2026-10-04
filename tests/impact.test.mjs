import test from 'node:test';
import assert from 'node:assert/strict';
import { ImpactField } from '../src/impact.js';
test('dense chords keep feedback bounded and expire fully',()=>{const f=new ImpactField(()=>.5);for(let i=0;i<100;i++)f.burst(i%4,'perfect');assert.equal(f.items.length,480);for(let i=0;i<60;i++)f.step(1/60,[],false);assert.equal(f.items.length,0);assert.equal(f.shake,0);});
test('held streams emit by elapsed time and stop while paused',()=>{const a=new ImpactField(()=>.5),b=new ImpactField(()=>.5);for(let i=0;i<12;i++)a.step(1/60,[true],true);for(let i=0;i<24;i++)b.step(1/120,[true],true);assert.equal(a.items.length,b.items.length);assert.equal(a.items.length,5);for(let i=0;i<60;i++)a.step(1/60,[true],false);assert.equal(a.items.length,0);});
test('reduced motion removes camera movement and lowers particle density',()=>{const normal=new ImpactField(()=>.5),reduced=new ImpactField(()=>.5,true);normal.burst(0,'perfect');reduced.burst(0,'perfect');assert.equal(reduced.shake,0);assert.ok(reduced.items.length<normal.items.length);});
test('early and missed hits never emit successful bursts',()=>{const f=new ImpactField(()=>.5);f.burst(2,'break');assert.deepEqual(f.items.map(p=>p.kind),['miss']);assert.equal(f.energy[2],0);f.reset();assert.equal(f.items.length,0);assert.deepEqual(f.kicks,[0,0,0,0]);});
