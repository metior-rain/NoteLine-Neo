import test from 'node:test';
import assert from 'node:assert/strict';
import {groupChords} from '../src/chords.js';
import {RhythmSession,normalizeChart} from '../src/engine.js';
import {summarizeResult} from '../src/result-summary.js';

test('chords connect simultaneous heads across lanes, not near notes or hold tails',()=>{
 const notes=[{lane:2,time:1000,end:2000},{lane:0,time:1000},{lane:3,time:1000.001},{lane:1,time:2000},{lane:3,time:3000},{lane:0,time:3000},{lane:2,time:3000}];
 const chords=groupChords(notes);assert.equal(chords.length,2);
 assert.deepEqual(chords.map(g=>g.map(n=>n.lane)),[[0,2],[0,2,3]]);
 notes[0].judged=true;assert.equal(chords[0][1].judged,true);
});
test('results split Early from Miss and measure successful hit timing only',()=>{
 const session=new RhythmSession(normalizeChart({notes:[{lane:0,time:1000},{lane:1,time:2000},{lane:2,time:3000},{lane:3,time:4000}]}));
 session.hit(0,1010);session.hit(1,1980);session.hit(2,2820);session.finish();
 const result=summarizeResult(session,{songId:'a',difficulty:'normal',records:[{songId:'a',difficulty:'hard',score:1000000},{songId:'a',difficulty:'normal',score:400000}]});
 assert.deepEqual(result.counts,{perfect:2,great:0,good:0,early:1,miss:1});assert.equal(result.average,15);assert.equal(result.combo,2);assert.equal(result.record,true);assert.equal(result.best,400000);
 assert.equal(Object.values(result.counts).reduce((a,b)=>a+b),result.total);
});
test('autoplay does not claim a personal record and unhit charts have no timing average',()=>{
 const session=new RhythmSession(normalizeChart({notes:[{lane:0,time:1000}]}));session.finish();
 const result=summarizeResult(session,{demo:true});assert.equal(result.record,false);assert.equal(result.average,null);assert.equal(result.caption,'AUTOPLAY');
});
