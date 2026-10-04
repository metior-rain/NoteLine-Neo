import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeStoredTrack,decodeStoredTrack,decodeStoredTracks} from '../src/track-storage.js';
test('file slices persist as independent audio and cover bytes and survive a storage roundtrip',async()=>{
 const file=new Blob(['headerMUSICimage']);const entry={id:'test',name:'Song',chart:{a:1},audioBlob:file.slice(6,11,'audio/mpeg'),coverBlob:file.slice(11,16,'image/png')};
 const saved=await encodeStoredTrack(entry);assert.equal(saved.audioBlob,undefined);assert.equal(saved.coverBlob,undefined);assert.equal(saved.storageVersion,2);
 const loaded=decodeStoredTrack(structuredClone(saved));assert.equal(await loaded.audioBlob.text(),'MUSIC');assert.equal(loaded.audioBlob.type,'audio/mpeg');assert.equal(await loaded.coverBlob.text(),'image');assert.deepEqual(loaded.chart,entry.chart);
});
test('editor audio replacement and cover removal override previously stored bytes',async()=>{
 const initial=await encodeStoredTrack({id:'test',audioBlob:new Blob(['old']),coverBlob:new Blob(['cover'])});const edited=decodeStoredTrack(initial);edited.audioBlob=new Blob(['new']);edited.coverBlob=null;
 const stored=await encodeStoredTrack(edited);assert.equal(await decodeStoredTrack(stored).audioBlob.text(),'new');assert.equal(stored.coverBytes,undefined);
});
test('legacy blob entries can migrate without changing their audio contents',async()=>{
 const legacy={id:'old',audioBlob:new Blob(['legacy'],{type:'audio/mpeg'})};assert.equal(decodeStoredTrack(legacy).audioBlob,legacy.audioBlob);assert.equal(await decodeStoredTrack(await encodeStoredTrack(legacy)).audioBlob.text(),'legacy');
});
test('one broken resource does not prevent healthy entries from loading',async()=>{
 const healthy=await encodeStoredTrack({id:'good',audioBlob:new Blob(['music'])});const result=decodeStoredTracks([{id:'broken',audioBytes:null},healthy]);assert.ok(result[0].storageError);assert.equal(await result[1].audioBlob.text(),'music');
});
test('unreadable old blobs fail migration without overwriting the source entry',async()=>{
 const broken={id:'old',audioBlob:{size:8,arrayBuffer:async()=>{throw Error('NotReadableError');}}};await assert.rejects(encodeStoredTrack(broken),/NotReadableError/);assert.equal(broken.storageVersion,undefined);assert.equal(broken.audioBlob.size,8);
});

test('recover Safari assets that return the complete backing .nlchart instead of their slice',async()=>{
 const {createScorePackage}=await import('../src/score-package.js');
 const chart={name:'Source',bpm:120,duration:4000,notes:[{lane:0,time:1000}]};
 const pack=createScorePackage(chart,new Blob(['REAL AUDIO'],{type:'audio/mpeg'}),new Blob(['REAL COVER'],{type:'image/png'}));const bytes=await pack.arrayBuffer();
 const broken={id:'keep-id',name:'Edited title',charts:{normal:{...chart,name:'Edited title'}},audioBytes:bytes,coverBytes:bytes,audioType:'audio/mpeg',coverType:'image/png',storageVersion:2};
 const loaded=decodeStoredTrack(broken);assert.equal(loaded.storageNeedsRepair,true);
 const repaired=await encodeStoredTrack(loaded),roundtrip=decodeStoredTrack(structuredClone(repaired));
 assert.equal(await roundtrip.audioBlob.text(),'REAL AUDIO');assert.equal(await roundtrip.coverBlob.text(),'REAL COVER');assert.equal(roundtrip.id,'keep-id');assert.equal(roundtrip.charts.normal.name,'Edited title');assert.equal(roundtrip.storageNeedsRepair,undefined);
});
