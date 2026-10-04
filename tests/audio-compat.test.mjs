import test from 'node:test';
import assert from 'node:assert/strict';
import {resumeAudio,decodeAudio} from '../src/audio-compat.js';
test('resume and silent source start synchronously before the first await',async()=>{
 const calls=[];let done;const context={state:'suspended',sampleRate:48000,destination:{},resume(){calls.push('resume');return new Promise(r=>done=()=>{this.state='running';r();});},createBuffer(){calls.push('buffer');return {};},createBufferSource(){return {connect(){},disconnect(){},start(){calls.push('start');}};}};
 const pending=resumeAudio(context);assert.deepEqual(calls,['resume','buffer','start']);done();await pending;
});
test('a blocked Safari resume cannot leave preparation pending indefinitely',async()=>{
 const context={state:'suspended',resume:()=>new Promise(()=>{})};await assert.rejects(resumeAudio(context,5),{name:'NotAllowedError'});
});
test('interrupted contexts are resumed while running contexts need no priming',async()=>{
 let calls=0;const context={state:'interrupted',resume(){calls++;this.state='running';return Promise.resolve();}};await resumeAudio(context);await resumeAudio(context);assert.equal(calls,1);
});
test('callback-only decoding waits for the actual decoded buffer',async()=>{
 const buffer={duration:45};let success;const promise=decodeAudio({decodeAudioData(bytes,resolve){success=resolve;}},new ArrayBuffer(8));success(buffer);assert.equal(await promise,buffer);
});
test('decode errors propagate and Promise decoders remain supported',async()=>{
 const buffer={duration:10};assert.equal(await decodeAudio({decodeAudioData:async()=>buffer},new ArrayBuffer(8)),buffer);await assert.rejects(decodeAudio({decodeAudioData(bytes,ok,fail){fail(new Error('bad audio'));}},new ArrayBuffer(8)),/bad audio/);
});
