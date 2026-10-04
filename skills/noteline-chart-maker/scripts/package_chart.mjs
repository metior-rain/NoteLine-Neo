#!/usr/bin/env node
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {resolve,dirname,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';

const usage='node package_chart.mjs --repo PROJECT --charts SOURCE_JSON --audio AUDIO --out FILE.nlchart [--cover IMAGE] [--report JSON] [--difficulties easy,normal,hard]';
if(process.argv.includes('--help')){console.log(usage);process.exit(0);}
const flags=new Set(['repo','charts','audio','out','cover','report','difficulties']),args={};
for(let i=2;i<process.argv.length;i+=2){const key=process.argv[i]?.replace(/^--/,'');if(!flags.has(key)||!process.argv[i+1]||process.argv[i+1].startsWith('--'))throw Error(usage);args[key]=process.argv[i+1];}
for(const key of ['repo','charts','audio','out'])if(!args[key])throw Error('Missing --'+key+'\n'+usage);
const repo=resolve(args.repo),sourcePath=resolve(args.charts),audioPath=resolve(args.audio),out=resolve(args.out),report=resolve(args.report||out+'.report.json');
const coverPath=args.cover?resolve(args.cover):null;
if(out===report||[sourcePath,audioPath,coverPath].includes(out)||[sourcePath,audioPath,coverPath].includes(report))throw Error('Outputs must be distinct from inputs and each other.');
if(extname(out)!=='.nlchart')throw Error('Output must use .nlchart extension.');
for(const file of [out,report]){try{await access(file);throw Error('Refusing to overwrite existing output: '+file);}catch(error){if(error.code!=='ENOENT')throw error;}}
const {createScorePackage,readScorePackage}=await import(pathToFileURL(resolve(repo,'src/score-package.js')));
const {normalizeChart,RhythmSession}=await import(pathToFileURL(resolve(repo,'src/engine.js')));
const {decodeScore,FORMAT}=await import(pathToFileURL(resolve(repo,'src/chart-format.js')));
const {pathPoints,pathPosition,occupiedSpans,judgmentCount,isPath}=await import(pathToFileURL(resolve(repo,'src/path-notes.js')));
const requested=(args.difficulties||'easy,normal,hard').split(',');
if(!requested.length||new Set(requested).size!==requested.length||requested.some(k=>!['easy','normal','hard'].includes(k)))throw Error('Invalid --difficulties.');
const source=JSON.parse(await readFile(sourcePath,'utf8'));
if(!source.charts||typeof source.charts!=='object'||Array.isArray(source.charts))throw Error('Expected {charts:{easy?,normal?,hard?}}.');
assert.deepEqual(Object.keys(source.charts).sort(),[...requested].sort(),'Difficulty slots differ from requested slots.');
const mime={'.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg','.flac':'audio/flac','.m4a':'audio/mp4','.mp4':'audio/mp4','.aac':'audio/aac','.webm':'audio/webm','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'};
const audioBytes=await readFile(audioPath);if(audioBytes.length>100e6)throw Error('Audio exceeds 100MB.');
const audioMime=mime[extname(audioPath).toLowerCase()];if(!audioMime?.startsWith('audio/'))throw Error('Unsupported audio extension.');
// Count fully decoded samples rather than trusting MP3 tag/container duration.
const decodedDuration=await new Promise((accept,reject)=>{
 const child=spawn('ffmpeg',['-v','error','-i',audioPath,'-map','0:a:0','-ac','1','-ar','22050','-f','f32le','-']);let bytes=0,message='';
 child.stdout.on('data',chunk=>{bytes+=chunk.length;});child.stderr.on('data',chunk=>{message+=chunk.toString();});child.on('error',reject);
 child.on('close',code=>code===0&&bytes>0?accept(bytes/4/22050*1000):reject(Error('Audio decode failed: '+message.trim())));
});
const charts={},stats={};
for(const key of requested){
 const raw=source.charts[key].format===FORMAT?decodeScore(source.charts[key]):source.charts[key];
 if(!Number.isFinite(raw.duration)||Math.abs(raw.duration-decodedDuration)>1)throw Error(key+': declared duration must match decoded music within 1ms.');
 if(!Number.isFinite(raw.bpm)||raw.bpm<20||raw.bpm>400||!Number.isFinite(raw.beatOffset))throw Error(key+': BPM and explicit beatOffset are required.');
 if(!Array.isArray(raw.notes)||raw.notes.some(n=>!Number.isFinite(n?.time)||!Number.isFinite(n?.end??n?.time)||(n.end??n.time)>decodedDuration))throw Error(key+': note exceeds actual audio or has an invalid time.');
 const chart=normalizeChart(raw);charts[key]=chart;
 const run=new RhythmSession(chart),active=new Set();
 // Explicit hits for taps/bounce arrivals; sustained contact follows meteor geometry.
 const presses=chart.notes.flatMap(n=>n.kind==='bounce'?pathPoints(n).map(p=>({...p,kind:'bounce'})):[n]).sort((a,b)=>a.time-b.time||a.lane-b.lane);
 const events=presses.map(n=>({time:n.time,n,head:true}));
 for(const n of chart.notes)if(n.end!==undefined&&n.kind!=='bounce'){
  events.push({time:n.end,n,release:true});
  if(n.kind==='meteor')for(const p of n.path)events.push({time:p.time,n,checkpoint:true});
 }
 events.sort((a,b)=>a.time-b.time||Number(b.release)-Number(a.release));
 const inputsAt=time=>{
  const held=Array.from({length:4},()=>new Set());
  for(const n of active)held[n.kind==='meteor'?Math.round(pathPosition(n,time).lane):n.lane].add(n);
  return held;
 };
 let previousTime=0;
 for(let i=0;i<events.length;){
  const time=events[i].time;
  if([...active].some(n=>n.kind==='meteor'))for(let t=previousTime+5;t<time;t+=5)run.tick(t,inputsAt(t));
  run.tick(time,inputsAt(time));
  const simultaneous=[];while(i<events.length&&events[i].time===time)simultaneous.push(events[i++]);
  for(const event of simultaneous)if(event.release){run.release(event.n.kind==='meteor'?Math.round(pathPosition(event.n,time).lane):event.n.lane,time);active.delete(event.n);}
  for(const event of simultaneous)if(event.head){
   assert.equal(run.hit(event.n.lane,time)?.rating,'perfect',key+': exact hit failed at '+time+'ms on lane '+event.n.lane);
   if(event.n.end!==undefined)active.add(event.n);
  }
  run.tick(time,inputsAt(time));previousTime=time;
 }
 run.finish();const total=judgmentCount(chart.notes);
 assert.equal(run.score,1000000,key+': exact manual simulation must full-combo.');assert.equal(run.counts.miss,0);assert.equal(run.maxCombo,total);
 const groups=new Map();for(const note of presses){const tick=Math.round(note.time*1000);groups.set(tick,(groups.get(tick)||0)+1);}
 const judgments=chart.notes.flatMap(n=>isPath(n)?pathPoints(n):[{lane:n.lane,time:n.time}]).sort((a,b)=>a.time-b.time);
 let peak=0,left=0;for(let right=0;right<judgments.length;right++){while(judgments[right].time-judgments[left].time>=1000)left++;peak=Math.max(peak,right-left+1);}
 let minGap=Infinity,minRecovery=Infinity;const previous=[null,null,null,null];
 for(const note of presses){const last=previous[note.lane];if(last)minGap=Math.min(minGap,note.time-last.time);previous[note.lane]=note;}
 const spans=chart.notes.flatMap((n,owner)=>occupiedSpans(n).map(s=>({...s,owner})));
 // Inclusive occupancy at endpoints; adjacent meteor segments share a contact.
 const occupancy=spans.flatMap(s=>[{time:s.start,lane:s.lane,delta:1},{time:s.end,lane:s.lane,delta:-1}]).sort((a,b)=>a.time-b.time||b.delta-a.delta);
 const occupied=[0,0,0,0];let maxFingers=0,maxLeft=0,maxRight=0;
 for(const e of occupancy){occupied[e.lane]+=e.delta;const down=occupied.map(v=>v>0);maxFingers=Math.max(maxFingers,down.filter(Boolean).length);maxLeft=Math.max(maxLeft,Number(down[0])+Number(down[1]));maxRight=Math.max(maxRight,Number(down[2])+Number(down[3]));}
 const ownedPresses=chart.notes.flatMap((n,owner)=>(n.kind==='bounce'?pathPoints(n):[{lane:n.lane,time:n.time}]).map(p=>({...p,owner})));
 for(let lane=0;lane<4;lane++){
  const endings=spans.filter(s=>s.lane===lane).sort((a,b)=>a.end-b.end),heads=ownedPresses.filter(p=>p.lane===lane).sort((a,b)=>a.time-b.time);
  let cursor=0,recent=[];
  for(const p of heads){
   while(cursor<endings.length&&endings[cursor].end<p.time){const s=endings[cursor++];recent=[s,...recent.filter(r=>r.owner!==s.owner)].sort((a,b)=>b.end-a.end).slice(0,2);}
   const last=recent.find(s=>s.owner!==p.owner);if(last)minRecovery=Math.min(minRecovery,p.time-last.end);
  }
 }
 stats[key]={notes:chart.notes.length,judgments:total,taps:chart.notes.filter(n=>n.end===undefined).length,holds:chart.notes.filter(n=>n.end!==undefined&&!isPath(n)).length,meteors:chart.notes.filter(n=>n.kind==='meteor').length,bounces:chart.notes.filter(n=>n.kind==='bounce').length,doubleGroups:[...groups.values()].filter(n=>n===2).length,multiGroups:[...groups.values()].filter(n=>n>2).length,peak1s:peak,maxConcurrentKeys:maxFingers,maxLeftHandKeys:maxLeft,maxRightHandKeys:maxRight,minSameLaneHeadGapMs:Number.isFinite(minGap)?minGap:null,minReleaseToNextHeadMs:Number.isFinite(minRecovery)?Math.round(minRecovery*1000)/1000:null,lanes:[0,1,2,3].map(l=>chart.notes.filter(n=>n.lane===l).length),perfectSimulation:true};
}
let coverBytes=null,coverMime=null;
if(coverPath){coverBytes=await readFile(coverPath);coverMime=mime[extname(coverPath).toLowerCase()];if(!coverMime?.startsWith('image/'))throw Error('Cover must be PNG, JPEG or WebP.');}
const pack=createScorePackage({charts},new Blob([audioBytes],{type:audioMime}),coverBytes?new Blob([coverBytes],{type:coverMime}):null);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const roundtrip=await readScorePackage(pack);
assert.deepEqual(Object.keys(roundtrip.charts).sort(),[...requested].sort());
for(const key of requested)assert.deepEqual(roundtrip.charts[key],charts[key],key+': roundtrip changes chart data; quantize timestamps to microsecond precision.');
assert.equal(hash(Buffer.from(await roundtrip.audioBlob.arrayBuffer())),hash(audioBytes),'Audio bytes changed.');
if(coverBytes)assert.equal(hash(Buffer.from(await roundtrip.coverBlob.arrayBuffer())),hash(coverBytes),'Cover bytes changed.');else assert.equal(roundtrip.coverBlob,null);
await mkdir(dirname(out),{recursive:true});await mkdir(dirname(report),{recursive:true});
await writeFile(out,Buffer.from(await pack.arrayBuffer()),{flag:'wx'});
const result={file:out,bytes:pack.size,durationMs:decodedDuration,charts:stats,audioSha256:hash(audioBytes),coverSha256:coverBytes?hash(coverBytes):null,validation:'Structure, exact manual-engine play and byte-preserving package roundtrip. Musical feel requires separate checking.'};
await writeFile(report,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result,null,2));
