import test from 'node:test';
import assert from 'node:assert/strict';
import {FailedNotes,mixColor} from '../src/note-visual.js';
test('tap turns gray before fading at its failure position',()=>{const f=new FailedNotes(),n={time:1000};f.record(n,500,850);assert.deepEqual(f.appearance(n,600,950),{gray:1,alpha:1,time:850});assert.equal(f.appearance(n,755,1105).alpha,.5);assert.equal(f.appearance(n,880,1230),null);f.record(n,900,1250);assert.equal(f.appearance(n,901,1251),null);});
test('failed hold survives arbitrarily long wall time and follows frozen music',()=>{const f=new FailedNotes(),n={time:1000,end:5000};f.record(n,100,850);assert.deepEqual(f.appearance(n,10000,2000),{gray:1,alpha:1,time:2000});assert.equal(f.appearance(n,20000,2000).time,2000);assert.equal(f.appearance(n,21000,5201),null);f.clear();assert.equal(f.appearance(n,22000,2000),null);});
test('gray transition preserves both color endpoints',()=>{assert.equal(mixColor(0xffad3d,0x96a4ae,0),0xffad3d);assert.equal(mixColor(0xffad3d,0x96a4ae,1),0x96a4ae);});
