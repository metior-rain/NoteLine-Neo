import {decodeAudio} from './audio-compat.js';
import {traceMeteorStar} from './meteor-symbol.js';
import {isPath,pathPoints,pathPosition,pathVertices,moveNote,expandNotes} from './path-notes.js';
import {DIFFICULTIES,DIFFICULTY_NAMES,normalizeCharts,firstChart,encodeCharts} from './difficulties.js';
import {createScorePackage,readScorePackage} from './score-package.js';
import { GameRenderer } from '../runtime/game-renderer.js';
import { installMotion,setUIVisible,showDialog,closeDialog } from './motion.js';
import { parseChartText,normalizeChart } from './engine.js';
import { ChartDocument,snapTime,findNote,gridLines } from './editor-model.js';
import { $, $$,escape,colors,formatTime,icons,icon,dbAction,audioDuration } from './shared.js';
icons();installMotion();
const audio=$('#editor-audio'),canvas=$('#timeline'),ctx=canvas.getContext('2d'),scroll=$('#timeline-scroll');
let doc=new ChartDocument(),charts={},difficulty='normal',selection=[],tool='select',pps=90,grid=4,follow=true;
let width=0,height=0,laneHeight=0,peaks=[],peakDuration=0,audioBlob=null,audioURL=null,documentId=null,baseline='',gesture=null,previewNotes=null,loading=0,toastTimer=0,decodeContext=null;
let coverBlob=null,coverURL=null,coverRevision=0,savedCoverRevision=0,coverRequest=0;
let pendingReplace=null,pendingCancel=null,sourceRequest=0,ready=false;
const WAVE_TOP=34,LANE_TOP=101;
const documentState=()=>JSON.stringify({charts:currentCharts(),coverRevision});
const exportedState=()=>JSON.stringify({charts:currentCharts(),coverRevision:savedCoverRevision});
const dirty=()=>ready&&documentState()!==baseline;
const noteAt=()=>doc.notes.find(n=>n.id===selection[0]);
const roundMs=ms=>Math.round(ms*1000)/1000;
const preciseTime=ms=>`${String(Math.floor(ms/60000)).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}.${String(Math.floor(ms)%1000).padStart(3,'0')}`;
function toast(text){clearTimeout(toastTimer);$('#toast').textContent=text;$('#toast').classList.add('show');toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3500);}
function snap(ms,free=false){return Math.round(Math.max(0,Math.min(doc.duration,snapTime(ms,doc.bpm,free?0:grid,doc.beatOffset)))*1000)/1000;}
function step(){return 60000/doc.bpm/(grid||1);}
function resize(){const r=scroll.getBoundingClientRect();width=r.width;height=r.height;laneHeight=Math.max(1,(height-LANE_TOP)/4);$('#timeline-space').style.width=Math.max(width,doc.duration/1000*pps+180)+'px';canvas.style.width=width+'px';canvas.style.height=height+'px';const dpr=Math.min(devicePixelRatio||1,2);canvas.width=width*dpr;canvas.height=height*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);draw();}
new ResizeObserver(resize).observe(scroll);
function synchronize(){updateDifficultyUI();selection=selection.filter(id=>doc.notes.some(n=>n.id===id));$('#chart-name').value=doc.name;$('#bpm').value=doc.bpm;$('#beat-offset').value=doc.beatOffset;$('#note-total').textContent=doc.notes.length+' notes';$('#tap-count').textContent=doc.notes.filter(n=>n.end===undefined).length;$('#hold-count').textContent=doc.notes.filter(n=>n.end!==undefined&&!isPath(n)).length;$('#meteor-count').textContent=doc.notes.filter(n=>n.kind==='meteor').length;$('#bounce-count').textContent=doc.notes.filter(n=>n.kind==='bounce').length;$('#duration').textContent=formatTime(doc.duration);$('#undo').disabled=!doc.undoStack.length;$('#redo').disabled=!doc.redoStack.length;$('#delete').disabled=!selection.length;$('#selection-count').textContent=selection.length?`${selection.length} selected`:'未选择';setUIVisible($('#inspector-empty'),selection.length!==1);setUIVisible($('#note-properties'),selection.length===1);if(selection.length===1){const n=noteAt();$('#note-lane').value=n.lane;$('#note-type').value=n.kind||(n.end===undefined?'tap':'hold');$('#note-start').value=n.time;$('#note-end').value=n.end??Math.min(doc.duration,n.time+60000/doc.bpm);$('#end-field').hidden=n.end===undefined||isPath(n);renderPathFields(n.path||[]);$('#path-fields').hidden=!isPath(n);}resize();}
function renderPathFields(path){$('#path-nodes').innerHTML=path.map((p,i)=>`<div class="path-node"><select aria-label="节点 ${i+1} 轨道">${['D','F','J','K'].map((label,lane)=>`<option value="${lane}" ${lane===p.lane?'selected':''}>${label}</option>`).join('')}</select><input aria-label="节点 ${i+1} 时间（毫秒）" type="number" min="0" step="0.001" value="${p.time}"><button class="tool" type="button" aria-label="删除节点 ${i+1}">×</button></div>`).join('');$('#path-nodes').querySelectorAll('button').forEach(button=>button.onclick=()=>button.parentElement.remove());}
function readPathFields(){return [...$('#path-nodes').children].map(row=>({lane:Number(row.querySelector('select').value),time:Number(row.querySelector('input').value)}));}
$('#add-path-node').onclick=()=>{const path=readPathFields(),last=path.at(-1)||{lane:Number($('#note-lane').value),time:Number($('#note-start').value)};renderPathFields([...path,{lane:(last.lane+1)%4,time:Math.min(doc.duration,last.time+Math.max(160,60000/doc.bpm))}]);};
function change(fn){try{fn();synchronize();}catch(err){previewNotes=null;toast(err.message);synchronize();}}
function requireReplace(action,onCancel=null){if(!dirty()){action();return;}pendingReplace=action;pendingCancel=onCancel;showDialog($('#editor-confirm'));}
const cancelReplace=()=>{pendingReplace=null;pendingCancel?.();pendingCancel=null;};
$('#confirm-cancel').onclick=()=>closeDialog($('#editor-confirm'),cancelReplace);$('#confirm-replace').onclick=()=>closeDialog($('#editor-confirm'),()=>{const fn=pendingReplace;pendingReplace=null;pendingCancel=null;fn?.();});
$('#editor-confirm').oncancel=e=>{e.preventDefault();closeDialog($('#editor-confirm'),cancelReplace);};
async function decodeWaveform(blob,token){try{decodeContext ||= new (window.AudioContext||window.webkitAudioContext)();const buffer=await decodeAudio(decodeContext,await blob.arrayBuffer());if(token!==loading)return;const samples=buffer.getChannelData(0),bins=Math.min(20000,Math.ceil(buffer.duration*100));const next=new Float32Array(bins);const stride=Math.ceil(samples.length/bins);for(let i=0;i<bins;i++){let peak=0;for(let j=i*stride;j<Math.min(samples.length,(i+1)*stride);j+=4)peak=Math.max(peak,Math.abs(samples[j]));next[i]=peak;}peaks=next;peakDuration=buffer.duration*1000;$('#audio-status').textContent='波形就绪';draw();}catch{if(token===loading)$('#audio-status').textContent='波形不可用 · 音乐仍可播放';}}
async function loadAudio(blob){const token=++loading;audio.pause();$('#editor-play').innerHTML=icon('play');if(audioURL)URL.revokeObjectURL(audioURL);audioBlob=blob;audioURL=URL.createObjectURL(blob);audio.src=audioURL;audio.currentTime=0;peaks=[];$('#audio-status').textContent='读取波形…';decodeWaveform(blob,token);}
function setCover(blob){
  if(coverURL)URL.revokeObjectURL(coverURL);coverBlob=blob;coverURL=blob?URL.createObjectURL(blob):null;coverRevision++;
  for(const id of ['cover-thumb','cover-preview']){const image=$('#'+id);image.hidden=!coverURL;if(coverURL)image.src=coverURL;else image.removeAttribute('src');}
  $('#cover-empty').hidden=!!coverURL;$('#cover-remove').disabled=!coverURL;
}
$('#cover-settings').onclick=()=>showDialog($('#cover-dialog'));
$('#cover-close').onclick=()=>closeDialog($('#cover-dialog'));
$('#cover-dialog').oncancel=e=>{e.preventDefault();closeDialog($('#cover-dialog'));};
$('#cover-remove').onclick=()=>{coverRequest++;setCover(null);};
$('#cover-file').onchange=async()=>{
  const file=$('#cover-file').files[0];if(!file)return;const request=++coverRequest,source=sourceRequest;
  let url;try{
    if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('请选择 PNG、JPG 或 WebP 图片');
    if(file.size>5e6)throw Error('封面最多 5MB');
    url=URL.createObjectURL(file);const image=new Image();image.src=url;await image.decode();
    if(request!==coverRequest||source!==sourceRequest)return;
    setCover(file);toast('封面已更新 · 保存后显示在曲库');
  }catch(err){toast(err.message);}finally{if(url)URL.revokeObjectURL(url);$('#cover-file').value='';}
};
function currentCharts(){const source={...charts,[difficulty]:doc.notes.length?doc.export():{name:doc.name,bpm:doc.bpm,beatOffset:doc.beatOffset,duration:doc.duration,notes:[]}};return Object.fromEntries(DIFFICULTIES.filter(key=>source[key]).map(key=>[key,{...(source[key].format?normalizeChart(source[key]):source[key]),name:doc.name,duration:doc.duration}]));}
function completeCharts(){const source=currentCharts(),valid=Object.fromEntries(Object.entries(source).filter(([,chart])=>chart.notes.length));if(!Object.keys(valid).length)throw Error('至少需要一档有音符的谱面');return normalizeCharts(valid);} 
function updateDifficultyUI(){
  $('#editor-difficulty').value=difficulty;
  for(const option of $('#editor-difficulty').options)option.textContent=DIFFICULTY_NAMES[option.value]+(option.value===difficulty||charts[option.value]?'':' · 新建');
  $('#remove-difficulty').disabled=Object.keys(currentCharts()).length<=1;
  $('#remove-difficulty').title=`删除${DIFFICULTY_NAMES[difficulty]}谱面`;
}
function switchDifficulty(next){
  if(next===difficulty)return;
  try{charts[difficulty]=currentCharts()[difficulty];if(!charts[next])charts[next]={name:doc.name,bpm:doc.bpm,beatOffset:doc.beatOffset,duration:doc.duration,notes:[]};
    audio.pause();difficulty=next;doc=new ChartDocument(charts[next]);selection=[];previewNotes=null;scroll.scrollLeft=0;synchronize();
    toast(`正在编辑${DIFFICULTY_NAMES[next]}谱面`);
  }catch(err){$('#editor-difficulty').value=difficulty;toast(err.message);}
}
$('#editor-difficulty').onchange=()=>switchDifficulty($('#editor-difficulty').value);
$('#remove-difficulty').onclick=()=>{
  if(Object.keys(currentCharts()).length<=1)return;
  delete charts[difficulty];difficulty=DIFFICULTIES.find(key=>charts[key]);doc=new ChartDocument(charts[difficulty]);selection=[];previewNotes=null;scroll.scrollLeft=0;synchronize();toast('已移除该难度谱面');
};
function init(){doc=new ChartDocument({name:'新歌曲',bpm:120,duration:60000,notes:[]});charts={};difficulty='normal';ready=true;baseline=documentState();$('#audio-status').textContent='打开音频或谱面包开始';synchronize();}
$('#audio-file').onchange=()=>{const file=$('#audio-file').files[0];if(!file)return;requireReplace(async()=>{try{if(file.size>100e6)throw Error('音频最多 100MB');const duration=await audioDuration(file);doc=new ChartDocument({name:file.name.replace(/\.[^.]+$/,''),duration,notes:[],bpm:120});charts={};difficulty='normal';documentId=null;selection=[];coverRequest++;setCover(null);savedCoverRevision=coverRevision;baseline=documentState();await loadAudio(file);scroll.scrollLeft=0;synchronize();toast('已新建空白谱面');}catch(err){toast(err.message);}finally{$('#audio-file').value='';}});};
$('#chart-file').onchange=()=>{const file=$('#chart-file').files[0];if(!file)return;requireReplace(async()=>{try{
 const pack=await readScorePackage(file),loadedCharts=pack.charts,chart=pack.chart;
 if(pack.audioBlob){const duration=await audioDuration(pack.audioBlob);if(Object.values(loadedCharts).some(c=>Math.max(0,...c.notes.map(n=>n.end??n.time))>duration+100))throw Error('音符超出内嵌音乐长度');for(const c of Object.values(loadedCharts))c.duration=duration;coverRequest++;setCover(pack.coverBlob);savedCoverRevision=coverRevision;await loadAudio(pack.audioBlob);}
 else {if(audioBlob&&Math.max(...chart.notes.map(n=>n.end??n.time))>doc.duration+100)throw Error('旧谱面超出当前音频，请先打开对应音乐');if(audioBlob)chart.duration=doc.duration;}
 charts={...loadedCharts};difficulty=charts.normal?'normal':DIFFICULTIES.find(key=>charts[key]);doc=new ChartDocument(charts[difficulty]);selection=[];documentId=null;baseline=documentState();scroll.scrollLeft=0;synchronize();toast(pack.legacy?'旧谱面已打开 · 使用当前音乐':'谱面、音乐与封面已打开');
 }catch(err){toast(err.message);}finally{$('#chart-file').value='';}});};
$('#new-chart').onclick=()=>requireReplace(()=>{audio.pause();doc=new ChartDocument({name:doc.name,bpm:doc.bpm,beatOffset:doc.beatOffset,duration:doc.duration,notes:[]});charts={};difficulty='normal';documentId=null;selection=[];baseline=exportedState();synchronize();});
$('#chart-name').oninput=()=>{doc.name=$('#chart-name').value.trim()||'Untitled';};
$('#chart-name').onchange=()=>change(()=>doc.transact(()=>doc.name=$('#chart-name').value.trim()||'Untitled'));
$('#bpm').onchange=()=>change(()=>{const n=Number($('#bpm').value);if(n<20||n>400)throw Error('BPM 范围为 20–400');doc.transact(()=>doc.bpm=n);});
let editingOffset=false;
$('#beat-offset').onfocus=()=>editingOffset=false;
$('#beat-offset').oninput=()=>{const value=$('#beat-offset').valueAsNumber;if(!Number.isFinite(value)||Math.abs(value)>3600000)return;try{const count=doc.undoStack.length;doc.transact(()=>doc.beatOffset=value);if(editingOffset&&doc.undoStack.length>count)doc.undoStack.pop();editingOffset=true;$('#undo').disabled=!doc.undoStack.length;$('#redo').disabled=!doc.redoStack.length;draw();}catch(err){toast(err.message);}};
$('#beat-offset').onchange=()=>change(()=>doc.transact(()=>doc.beatOffset=$('#beat-offset').valueAsNumber));
$('#beat-offset').onblur=()=>editingOffset=false;
$('#set-first-beat').onclick=()=>change(()=>doc.transact(()=>doc.beatOffset=roundMs(audio.currentTime*1000)));
$('#grid').onchange=()=>{grid=Number($('#grid').value);draw();};$('#zoom').oninput=()=>{const center=(scroll.scrollLeft+width/2)/pps;pps=Number($('#zoom').value);resize();scroll.scrollLeft=center*pps-width/2;draw();};function toggleFollow(){follow=!follow;$('#follow').classList.toggle('active',follow);$('#follow').setAttribute('aria-pressed',String(follow));$('#follow').title=`播放时跟随光标 · F · ${follow?'已开启':'已关闭'}`;}$('#follow').onclick=toggleFollow;
function setTool(value){tool=value;$$('[data-tool]').forEach(b=>{b.classList.toggle('active',b.dataset.tool===tool);b.setAttribute('aria-pressed',String(b.dataset.tool===tool));});$('#tool-hint').textContent=tool==='select'?'拖动音符移动 · 拖动路径节点调整 · Shift 多选':tool==='tap'?'点击轨道放置单击 · Alt 暂时关闭吸附':'在轨道上拖动放置长按 · Alt 暂时关闭吸附';if(tool==='meteor'||tool==='bounce')$('#tool-hint').textContent='拖到另一轨道创建路径 · 选择音符后在右侧增删、修改节点';canvas.style.cursor=tool==='select'?'default':'crosshair';}
$$('[data-tool]').forEach(b=>b.onclick=()=>setTool(b.dataset.tool));
$('#undo').onclick=()=>change(()=>doc.undo());$('#redo').onclick=()=>change(()=>doc.redo());$('#delete').onclick=()=>change(()=>doc.remove(selection));
$('#note-type').onchange=()=>{const kind=$('#note-type').value,path=kind==='meteor'||kind==='bounce';$('#end-field').hidden=kind==='tap'||path;$('#path-fields').hidden=!path;if(path&&!$('#path-nodes').children.length)$('#add-path-node').click();};
$('#note-properties').onsubmit=e=>{e.preventDefault();change(()=>{const time=Number($('#note-start').value),lane=Number($('#note-lane').value),kind=$('#note-type').value,path=['meteor','bounce'].includes(kind)?readPathFields():undefined,end=path?path.at(-1)?.time:kind==='hold'?Number($('#note-end').value):undefined;doc.update(selection,{lane,time,end,kind:kind==='tap'||kind==='hold'?undefined:kind,path});});};
async function togglePlayback(){if(!audioBlob){toast('先打开音乐');return;}if(!audio.paused){audio.pause();$('#editor-play').innerHTML=icon('play');return;}try{if(audio.currentTime>=doc.duration/1000-.01)audio.currentTime=0;await audio.play();$('#editor-play').innerHTML=icon('pause');}catch{toast('音乐无法播放');}}
for(const event of ['play','pause','ended'])audio.addEventListener(event,()=>{const playing=!audio.paused&&!audio.ended;$('#editor-play').classList.toggle('active',playing);$('#editor-play').setAttribute('aria-label',playing?'暂停':'播放');});
$('#editor-play').onclick=togglePlayback;$('#rewind').onclick=()=>{audio.pause();audio.currentTime=0;scroll.scrollLeft=0;$('#editor-play').innerHTML=icon('play');draw();};audio.onended=()=>{$('#editor-play').innerHTML=icon('play');};
function xFor(ms){return ms/1000*pps-scroll.scrollLeft;}
function eventPoint(e){const r=canvas.getBoundingClientRect();const x=e.clientX-r.left,y=e.clientY-r.top;return {x,y,time:(x+scroll.scrollLeft)/pps*1000,lane:Math.max(0,Math.min(3,Math.floor((y-LANE_TOP)/laneHeight)))};}
canvas.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();const p=eventPoint(e);canvas.setPointerCapture(e.pointerId);if(p.y<LANE_TOP||Math.abs(p.x-xFor(audio.currentTime*1000))<=12){gesture={kind:'scrub',pointer:e.pointerId};audio.currentTime=Math.min(doc.duration/1000,Math.max(0,p.time/1000));$('#editor-time').textContent=preciseTime(audio.currentTime*1000);draw();return;}if(tool==='tap'){change(()=>{selection=[doc.add({lane:p.lane,time:snap(p.time,e.altKey)})];});return;}if(['hold','meteor','bounce'].includes(tool)){const start=snap(p.time,e.altKey);gesture={kind:'add-hold',noteKind:tool,targetLane:p.lane,start:Math.min(doc.duration-(tool==='hold'?80:160),start),lane:p.lane,end:Math.min(doc.duration,start+Math.max(tool==='hold'?80:160,step())),pointer:e.pointerId};previewNotes=[...doc.notes,{id:'preview',lane:p.lane,time:gesture.start,end:gesture.end,...(gesture.noteKind!=='hold'?{kind:gesture.noteKind,path:[{lane:gesture.targetLane,time:gesture.end}]}:{})}];draw();return;}
 const n=findNote(doc.notes,p.time,p.lane,10/pps*1000);
 if(n){if(e.shiftKey)selection=selection.includes(n.id)?selection.filter(id=>id!==n.id):[...selection,n.id];else if(!selection.includes(n.id))selection=[n.id];const nodeIndex=isPath(n)?n.path.findIndex(point=>point.lane===p.lane&&Math.abs(xFor(point.time)-p.x)<12):-1;const tail=!isPath(n)&&n.end!==undefined&&Math.abs(xFor(n.end)-p.x)<10;gesture={kind:nodeIndex>=0?'node':tail?'resize':'move',nodeIndex,pointer:e.pointerId,noteId:n.id,origin:p,notes:doc.notes.filter(n=>selection.includes(n.id)).map(n=>({...n})),moved:false};}
 else{if(!e.shiftKey)selection=[];gesture={kind:'box',pointer:e.pointerId,origin:p,current:p,previous:[...selection],moved:false};}
 synchronize();};
canvas.onpointermove=e=>{const p=eventPoint(e);
 if(!gesture){canvas.style.cursor=p.y<LANE_TOP||Math.abs(p.x-xFor(audio.currentTime*1000))<=12?'ew-resize':tool==='select'?'default':'crosshair';return;}
 if(gesture.pointer!==e.pointerId)return;
 if(gesture.kind==='scrub'){audio.currentTime=Math.min(doc.duration/1000,Math.max(0,p.time/1000));$('#editor-time').textContent=preciseTime(audio.currentTime*1000);if(follow&&(p.x>width-36||p.x<36))scroll.scrollLeft=Math.max(0,scroll.scrollLeft+(p.x>width-36?12:-12));draw();return;}
 gesture.moved ||= Math.abs(p.x-gesture.origin?.x)>3||Math.abs(p.y-gesture.origin?.y)>3;
 if(gesture.kind==='add-hold'){gesture.targetLane=p.lane;gesture.end=Math.max(gesture.start+(gesture.noteKind==='hold'?80:160),snap(p.time,e.altKey));gesture.end=Math.min(doc.duration,gesture.end);previewNotes=[...doc.notes,{id:'preview',lane:gesture.lane,time:gesture.start,end:gesture.end,...(gesture.noteKind!=='hold'?{kind:gesture.noteKind,path:[{lane:gesture.targetLane,time:gesture.end}]}:{})}];}
 else if(gesture.kind==='node'){const n=doc.notes.find(n=>n.id===gesture.noteId),path=n.path.map((point,i)=>i===gesture.nodeIndex?{lane:p.lane,time:snap(p.time,e.altKey)}:point);previewNotes=doc.notes.map(v=>v.id===n.id?{...v,path,end:path.at(-1).time}:v);}
 else if(gesture.kind==='resize'){const n=doc.notes.find(n=>n.id===gesture.noteId);const end=Math.max(n.time+80,Math.min(doc.duration,snap(p.time,e.altKey)));previewNotes=doc.notes.map(v=>v.id===n.id?{...v,end}:v);}
 else if(gesture.kind==='move'){const original=gesture.notes;if(!original.length)return;const raw=p.time-gesture.origin.time;let delta=e.altKey?Math.round(raw*1000)/1000:snapTime(original[0].time+raw,doc.bpm,grid,doc.beatOffset)-original[0].time;delta=Math.round(Math.max(-Math.min(...original.map(n=>n.time)),Math.min(delta,doc.duration-Math.max(...original.map(n=>n.end??n.time))))*1000)/1000;let laneDelta=p.lane-gesture.origin.lane;laneDelta=Math.max(-Math.min(...original.flatMap(n=>pathPoints(n).map(p=>p.lane))),Math.min(laneDelta,3-Math.max(...original.flatMap(n=>pathPoints(n).map(p=>p.lane)))));previewNotes=doc.notes.map(n=>{const origin=original.find(v=>v.id===n.id);return origin?moveNote(origin,delta,laneDelta):n;});}
 else if(gesture.kind==='box'){gesture.current=p;const minT=Math.min(p.time,gesture.origin.time),maxT=Math.max(p.time,gesture.origin.time),minLane=Math.min(p.lane,gesture.origin.lane),maxLane=Math.max(p.lane,gesture.origin.lane);selection=[...new Set([...gesture.previous,...doc.notes.filter(n=>n.lane>=minLane&&n.lane<=maxLane&&n.time>=minT&&n.time<=maxT).map(n=>n.id)])];}
 draw();};
function endGesture(e,cancel=false){if(!gesture||gesture.pointer!==e.pointerId)return;const g=gesture,notes=previewNotes;gesture=null;previewNotes=null;if(g.kind==='scrub'){draw();return;}if(cancel){synchronize();return;}change(()=>{if(g.kind==='add-hold')selection=[doc.add({lane:g.lane,time:g.start,end:g.end,...(g.noteKind!=='hold'?{kind:g.noteKind,path:[{lane:g.targetLane,time:g.end}]}:{})})];else if((g.kind==='move'||g.kind==='resize'||g.kind==='node')&&g.moved&&notes){doc.transact(()=>doc.notes=notes.map(n=>({...n})));}else if(g.kind==='box'&&!g.moved){audio.currentTime=Math.max(0,Math.min(doc.duration/1000,g.origin.time/1000));}});}
canvas.onpointerup=e=>endGesture(e);canvas.onpointercancel=e=>endGesture(e,true);canvas.onlostpointercapture=e=>endGesture(e,true);
canvas.oncontextmenu=e=>{e.preventDefault();const p=eventPoint(e);if(p.y<LANE_TOP)return;const n=findNote(doc.notes,p.time,p.lane,10/pps*1000);if(n)change(()=>doc.remove([n.id]));};
scroll.onscroll=draw;
function draw(){canvas.dataset.beatOffset=String(doc.beatOffset);canvas.dataset.undoDepth=String(doc.undoStack.length);if(!width||!height)return;ctx.clearRect(0,0,width,height);ctx.fillStyle='#fafffe';ctx.fillRect(0,0,width,height);const min=scroll.scrollLeft/pps*1000,max=(scroll.scrollLeft+width)/pps*1000,beat=60000/doc.bpm,sub=grid||1;for(const {time,index:i,major,bar} of gridLines(min,max,doc.bpm,sub,doc.beatOffset)){const x=xFor(time);ctx.strokeStyle=bar?'#d6c6e340':major?'#e3d8ec65':'#eee6f280';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,LANE_TOP);ctx.lineTo(x,height);ctx.stroke();ctx.strokeStyle=bar?'#cab5df70':'#e3d8ec';ctx.beginPath();ctx.moveTo(x,bar?18:26);ctx.lineTo(x,34);ctx.stroke();if(bar&&beat*4/1000*pps>=38){ctx.fillStyle='#4f7c87';ctx.font='9px sans-serif';ctx.fillText(String(Math.floor(i/(sub*4))+1),x+5,16);}}
 const origin=xFor(doc.beatOffset);if(origin>=0&&origin<=width){ctx.fillStyle='#9c7bbd';ctx.beginPath();ctx.moveTo(origin-4,36);ctx.lineTo(origin+4,36);ctx.lineTo(origin,43);ctx.fill();}
 const tickSeconds=pps<45?5:pps<90?2:1;for(let second=Math.floor(min/1000/tickSeconds)*tickSeconds;second<=max/1000;second+=tickSeconds){const x=xFor(second*1000);ctx.fillStyle='#5b8390';ctx.font='8px sans-serif';ctx.fillText(formatTime(second*1000),x+4,31);}
 ctx.fillStyle='#f1eaf750';ctx.fillRect(0,WAVE_TOP,width,LANE_TOP-WAVE_TOP);if(peaks.length){for(let x=0;x<width;x+=2){const t=(x+scroll.scrollLeft)/pps*1000,index=Math.floor(t/peakDuration*peaks.length);if(index>=0&&index<peaks.length){const amp=Math.max(1,peaks[index]*27);ctx.fillStyle='#29bba080';ctx.fillRect(x,68-amp,1.2,amp*2);}}}
 for(let lane=0;lane<4;lane++){ctx.fillStyle=colors[lane]+'10';ctx.fillRect(0,LANE_TOP+lane*laneHeight,width,laneHeight);ctx.strokeStyle='#e7dfedaa';ctx.beginPath();ctx.moveTo(0,LANE_TOP+lane*laneHeight);ctx.lineTo(width,LANE_TOP+lane*laneHeight);ctx.stroke();}
 for(const n of previewNotes||doc.notes){const start=xFor(n.time),end=xFor(n.end??n.time),selected=selection.includes(n.id)||n.id==='preview';if(end<-15||start>width+15)continue;if(isPath(n)){const points=pathPoints(n),vertices=pathVertices(n);ctx.lineWidth=selected?5:3;ctx.setLineDash(n.kind==='bounce'?[7,5]:[]);for(let i=1;i<vertices.length;i++){const a=vertices[i-1],b=vertices[i],gradient=ctx.createLinearGradient(xFor(a.time),0,xFor(b.time),0);gradient.addColorStop(0,colors[Math.round(a.lane)]);gradient.addColorStop(1,colors[Math.round(b.lane)]);ctx.strokeStyle=gradient;ctx.beginPath();ctx.moveTo(xFor(a.time),LANE_TOP+(a.lane+.5)*laneHeight);ctx.lineTo(xFor(b.time),LANE_TOP+(b.lane+.5)*laneHeight);ctx.stroke();}ctx.setLineDash([]);for(const p of points){const x=xFor(p.time),y=LANE_TOP+(p.lane+.5)*laneHeight;ctx.fillStyle=colors[p.lane];ctx.beginPath();if(n.kind==='meteor'){traceMeteorStar(ctx,x,y,12);}else ctx.arc(x,y,10,0,Math.PI*2);ctx.fill();ctx.strokeStyle=selected?'#fff':colors[p.lane];ctx.lineWidth=2;ctx.stroke();}continue;}const y=LANE_TOP+(n.lane+.5)*laneHeight,r=Math.min(11,laneHeight*.25);if(n.end!==undefined){ctx.fillStyle=colors[n.lane]+'60';ctx.beginPath();ctx.roundRect(Math.max(-15,start),y-7,Math.max(3,Math.min(width+15,end)-Math.max(-15,start)),14,7);ctx.fill();ctx.strokeStyle=colors[n.lane];ctx.lineWidth=selected?2:1;ctx.stroke();ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(end,y,6,0,Math.PI*2);ctx.fill();ctx.strokeStyle=colors[n.lane];ctx.stroke();if(selected){ctx.fillStyle=colors[n.lane];ctx.fillRect(end-1,y-3,2,6);}}
 ctx.shadowColor=colors[n.lane]+'60';ctx.shadowBlur=selected?10:0;ctx.fillStyle=colors[n.lane];ctx.beginPath();ctx.arc(start,y,r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;if(selected){ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.beginPath();ctx.arc(start,y,r-3,0,Math.PI*2);ctx.stroke();ctx.strokeStyle=colors[n.lane]+'90';ctx.lineWidth=1;ctx.beginPath();ctx.arc(start,y,r+3,0,Math.PI*2);ctx.stroke();}}
 if(gesture?.kind==='box'&&gesture.moved){const a=gesture.origin,b=gesture.current;ctx.fillStyle='#f466a716';ctx.strokeStyle='#f466a770';ctx.lineWidth=1;ctx.fillRect(a.x,a.y,b.x-a.x,b.y-a.y);ctx.strokeRect(a.x,a.y,b.x-a.x,b.y-a.y);}
 const head=xFor(audio.currentTime*1000);if(head>=0&&head<=width){ctx.strokeStyle='#d94c8f';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(head,0);ctx.lineTo(head,height);ctx.stroke();ctx.fillStyle='#d94c8f';ctx.beginPath();ctx.roundRect(head-8,0,16,18,5);ctx.fill();ctx.fillStyle='#fff';ctx.beginPath();ctx.moveTo(head-4,6);ctx.lineTo(head+4,6);ctx.moveTo(head-4,11);ctx.lineTo(head+4,11);ctx.strokeStyle='#fff';ctx.lineWidth=1;ctx.stroke();}
 const finish=xFor(doc.duration);if(finish>=0&&finish<width){ctx.fillStyle='#d1c1df10';ctx.fillRect(finish,0,width-finish,height);ctx.strokeStyle='#d1c1df';ctx.beginPath();ctx.moveTo(finish,0);ctx.lineTo(finish,height);ctx.stroke();}
}
let previewRenderer=null,lastPreviewTime=0;
const previewCanvas=$('#editor-preview');
GameRenderer.create(previewCanvas).then(renderer=>{previewRenderer=renderer;const resizePreview=()=>{const r=previewCanvas.parentElement.getBoundingClientRect();renderer.resize({w:r.width,h:r.height,left:12,trackWidth:r.width-24,topY:20,hitY:r.height*.82});};new ResizeObserver(resizePreview).observe(previewCanvas.parentElement);resizePreview();}).catch(()=>{$('#preview-status').textContent='预览不可用';});
let cachedPreviewDoc=null,cachedPreviewSource=null,cachedPreviewLength=0,cachedPreviewNotes=[],previewHolds=[null,null,null,null];
function drawPreview(now,time){
 if(!previewRenderer)return;const source=previewNotes||doc.notes;
 if(doc!==cachedPreviewDoc||source!==cachedPreviewSource||source.length!==cachedPreviewLength){cachedPreviewDoc=doc;cachedPreviewSource=source;cachedPreviewLength=source.length;cachedPreviewNotes=expandNotes(source);}
 previewHolds.fill(null);const crossing=!audio.paused&&time>=lastPreviewTime&&time-lastPreviewTime<300;
 for(const note of cachedPreviewNotes){note.judged=(note.end??note.time)<time;note.holding=note.end!==undefined&&note.time<=time&&time<note.end;if(note.holding){note.currentLane=note.kind==='meteor'?Math.round(pathPosition(note,time).lane):note.lane;previewHolds[note.currentLane]=note;}if(crossing){if(note.time>lastPreviewTime&&note.time<=time)previewRenderer.feedback({note,rating:'perfect',head:note.end!==undefined});if(note.kind==='meteor'){for(const p of note.path)if(p.time>lastPreviewTime&&p.time<=time)previewRenderer.feedback({note,rating:'perfect',lane:p.lane,checkpoint:true,terminal:p.time===note.end});}else if(note.end!==undefined&&note.end>lastPreviewTime&&note.end<=time)previewRenderer.feedback({note,rating:'perfect'});}}
 if(!crossing&&Math.abs(time-lastPreviewTime)>300)previewRenderer.reset();lastPreviewTime=time;previewCanvas.dataset.time=String(time);previewCanvas.dataset.notes=String(source.length);previewRenderer.draw(now,time,{notes:cachedPreviewNotes,holds:previewHolds},audio.paused?'paused':'playing',Array.from({length:4},()=>new Set()),1);
}
function frame(now){const time=audio.currentTime*1000;$('#editor-time').textContent=preciseTime(time);if(!audio.paused&&follow){const x=xFor(time);if(x>width*.8||x<0)scroll.scrollLeft=Math.max(0,time/1000*pps-width*.25);}if(!audio.paused)draw();drawPreview(now,time);requestAnimationFrame(frame);}
requestAnimationFrame(frame);
function commitMetadata(){const name=$('#chart-name').value.trim()||'Untitled',bpm=Number($('#bpm').value);if(!Number.isFinite(bpm)||bpm<20||bpm>400)throw Error('BPM 范围为 20–400');const beatOffset=Number($('#beat-offset').value);doc.transact(()=>{doc.name=name;doc.bpm=bpm;doc.beatOffset=beatOffset;});}
$('#export-chart').onclick=()=>{try{commitMetadata();if(!audioBlob)throw Error('先打开音乐，再导出完整谱面包');const pack=createScorePackage({charts:completeCharts()},audioBlob,coverBlob);const url=URL.createObjectURL(pack);const a=document.createElement('a');a.href=url;a.download=doc.name.replace(/[\\/:*?"<>|]/g,'_')+'.nlchart';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);baseline=documentState();toast('已导出谱面包 · 包含音乐与封面');}catch(err){toast(err.message);}};
async function persist(){commitMetadata();if(!audioBlob)throw Error('音乐尚未加载');const allCharts=completeCharts(),chart=firstChart(allCharts),storedCharts=encodeCharts(allCharts);let id=documentId||'custom-'+crypto.randomUUID();if(documentId&&(await dbAction('get',documentId))?.trashedAt)id='custom-'+crypto.randomUUID();await dbAction('put',{id,name:doc.name,chart:storedCharts.normal||encodeCharts({normal:chart}).normal,charts:storedCharts,audioBlob,coverBlob});documentId=id;savedCoverRevision=coverRevision;baseline=documentState();try{const channel=new BroadcastChannel('noteline-library');channel.postMessage('updated');channel.close();}catch{}return id;}
$('#save-chart').onclick=async()=>{try{await persist();toast('已保存到游戏曲库');}catch(err){toast(err.message);}};
$('#test-chart').onclick=async()=>{let target;try{commitMetadata();completeCharts();if(!audioBlob)throw Error('音乐尚未加载');target=window.open('about:blank','_blank');const id=await persist();if(target)target.location.href=`./?song=${encodeURIComponent(id)}&difficulty=${difficulty}`;else toast('已保存，请在游戏曲库选择新谱面');}catch(err){if(target)target.close();toast(err.message);}};
$('#shortcuts-button').onclick=()=>showDialog($('#shortcuts-dialog'));$('#shortcuts-close').onclick=()=>closeDialog($('#shortcuts-dialog'));$('#shortcuts-dialog').oncancel=e=>{e.preventDefault();closeDialog($('#shortcuts-dialog'));};
// Handle transport before a focused control can consume Space or activate on keyup.
let transportSpaceHeld=false;
function isTyping(target){return target.isContentEditable||target.tagName==='TEXTAREA'||(target.tagName==='INPUT'&&!['button','submit','reset','checkbox','radio','range','file','color'].includes(target.type));}
document.addEventListener('keydown',e=>{
 if(e.code!=='Space'||e.isComposing||e.metaKey||e.ctrlKey||e.altKey||document.querySelector('dialog[open]')||isTyping(e.target))return;
 e.preventDefault();e.stopImmediatePropagation();
 if(!e.repeat&&!transportSpaceHeld){transportSpaceHeld=true;togglePlayback();}
},true);
document.addEventListener('keyup',e=>{
 if(e.code!=='Space'||!transportSpaceHeld)return;
 transportSpaceHeld=false;e.preventDefault();e.stopImmediatePropagation();
},true);
window.addEventListener('blur',()=>{transportSpaceHeld=false;});
document.addEventListener('keydown',e=>{
 if(document.querySelector('dialog[open]'))return;const mod=e.metaKey||e.ctrlKey;
 if(mod&&e.code==='KeyS'){e.preventDefault();if(!e.repeat)(e.shiftKey?$('#export-chart'):$('#save-chart')).click();return;}
 if(mod&&e.code==='KeyO'){e.preventDefault();if(!e.repeat)$('#chart-file').click();return;}
 if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)||e.target.isContentEditable)return;
 if(mod&&e.code==='KeyA'){e.preventDefault();selection=doc.notes.map(n=>n.id);synchronize();return;}
 if(mod&&e.code==='KeyZ'){e.preventDefault();change(()=>e.shiftKey?doc.redo():doc.undo());return;}
 if(mod&&e.code==='KeyY'){e.preventDefault();change(()=>doc.redo());return;}
 if(e.key==='?'){e.preventDefault();if(!e.repeat)showDialog($('#shortcuts-dialog'));return;}
 if(e.code==='KeyF'&&!e.repeat){e.preventDefault();toggleFollow();return;}
 if(e.code==='Home'){e.preventDefault();$('#rewind').click();return;}
 if(['BracketLeft','BracketRight'].includes(e.code)){e.preventDefault();audio.currentTime=Math.max(0,Math.min(doc.duration/1000,audio.currentTime+(e.code==='BracketRight'?1:-1)*60/doc.bpm));draw();return;}
 if(e.code==='KeyV')setTool('select');if(e.code==='KeyT')setTool('tap');if(e.code==='KeyH')setTool('hold');if(e.code==='KeyM')setTool('meteor');if(e.code==='KeyB')setTool('bounce');
 if(e.code==='Delete'||e.code==='Backspace'){e.preventDefault();change(()=>doc.remove(selection));}
 if(e.code==='Escape'){selection=[];synchronize();}
 if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.code)&&selection.length){e.preventDefault();change(()=>doc.update(selection,n=>moveNote(n,['ArrowLeft','ArrowRight'].includes(e.code)?roundMs(e.code==='ArrowRight'?step():-step()):0,e.code==='ArrowUp'?-1:e.code==='ArrowDown'?1:0)));}
});
window.addEventListener('beforeunload',e=>{if(dirty()){e.preventDefault();e.returnValue='';}});document.addEventListener('visibilitychange',()=>{if(document.hidden){audio.pause();$('#editor-play').innerHTML=icon('play');}});
init();
