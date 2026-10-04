import test from 'node:test';
import assert from 'node:assert/strict';
import { springFrames } from '../src/motion.js';
import { gridLines } from '../src/editor-model.js';
import { normalizeChart } from '../src/engine.js';
test('spring has real overshoot, settles exactly and keeps ordered samples',()=>{const frames=springFrames(.88,1,{velocity:.4});assert.equal(frames[0].value,.88);assert.equal(frames.at(-1).value,1);assert.ok(frames.some(f=>f.value>1));assert.ok(frames.every((f,i)=>Number.isFinite(f.value)&&(!i||f.offset>=frames[i-1].offset)));});
test('drawn beat lines and subdivisions share the shifted origin',()=>{const lines=gridLines(0,1000,120,4,375);assert.deepEqual(lines.filter(n=>n.major).map(n=>n.time),[375,875]);assert.deepEqual(lines.filter(n=>n.bar).map(n=>n.time),[375]);assert.equal(lines.find(n=>n.time===375).index,0);assert.deepEqual(gridLines(0,500,120,1,-125).map(n=>n.time),[375]);});
test('chart parsing preserves signed offset and defaults old charts to zero',()=>{const base={name:'Test',notes:[{lane:0,time:500}]};assert.equal(normalizeChart(base).beatOffset,0);assert.equal(normalizeChart({...base,beatOffset:-125}).beatOffset,-125);for(const beatOffset of ['375',null,Infinity]){if(beatOffset!==null)assert.throws(()=>normalizeChart({...base,beatOffset}));}});
