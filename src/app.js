import {bindTrackPointers} from './track-pointers.js';
import {judgmentCount} from './path-notes.js';
import {hitSoundLane} from './hit-feedback.js';
import {initResults,showResults} from './results.js';
import {summarizeResult} from './result-summary.js';
import {installDifficultySwitch} from './difficulty-switch.js';
import {DIFFICULTY_NAMES,firstChart,encodeCharts} from './difficulties.js';
import { BufferedMusic } from './buffered-music.js';
import {readScorePackage} from './score-package.js';
import { LaunchClock } from './launch-clock.js';
import { installMotion,setUIVisible,isUIVisible,springFrames } from './motion.js';
import { GameRenderer } from '../runtime/game-renderer.js';
import { RhythmSession } from './engine.js';
import { $, $$,escape,formatTime,icons,icon,read,save,loadSongs,dbAction,audioDuration } from './shared.js';
initResults($('#result-overlay'));icons();installMotion();installDifficultySwitch();
const canvas=$('#field'),audio=new BufferedMusic(getAudioContext);
const renderer=await GameRenderer.create(canvas);
const stored=read('noteline.settings',{});
const settings={volume:Math.max(0,Math.min(1,Number(stored.volume??.7))),speed:Math.max(.6,Math.min(2.5,Number(stored.speed)||1)),offset:Math.max(-300,Math.min(300,Number(stored.offset)||0)),hitSound:stored.hitSound??true};
let favorites=read('noteline.favorites',[]),records=read('noteline.records',[]);
if(!Array.isArray(favorites))favorites=[];if(!Array.isArray(records))records=[];
let songs=[],selected=new URLSearchParams(location.search).get('song')||'song1',difficulty='normal',demo=false,state='idle',session=null,activeSong=null,lead=null,pausedPhase='playing';
let w=0,h=0,trackWidth=0,left=0,hitY=0,topY=0,countEnd=0,resuming=false,lastJudge=0,toastTimer=0,audioContext=null,hitNoise=null;
const keys=['KeyD','KeyF','KeyJ','KeyK'],inputs=Array.from({length:4},()=>new Set());
let libraryFilter='all',trashedSongs=[],screen='welcome';
function setScreen(next){screen=next;document.body.dataset.screen=next;setUIVisible($('#welcome'),next==='welcome');}
function showMenu(){if(state!=='idle')stop(false);setScreen('menu');setUIVisible($('#settings'),false);setUIVisible($('#library'),true);}
$('#enter-menu').onclick=showMenu;$('#menu-home').onclick=()=>{setUIVisible($('#library'),false);setScreen('welcome');};
function toast(text){clearTimeout(toastTimer);$('#toast').textContent=text;$('#toast').classList.add('show');toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3000);}
function currentSong(){return songs.find(s=>s.id===selected&&s.charts?.[difficulty])||songs.find(s=>s.charts?.[difficulty]);}
let refreshRevision=0;
function releaseSongURLs(list){for(const song of list){if(song.audio?.startsWith('blob:'))URL.revokeObjectURL(song.audio);if(song.cover?.startsWith('blob:'))URL.revokeObjectURL(song.cover);}}
async function refresh(){
 const revision=++refreshRevision;let loaded;
 try{
  loaded=await loadSongs();const trash=(await dbAction('getAll')).filter(s=>s.trashedAt);
  if(revision!==refreshRevision){releaseSongURLs(loaded);return;}
  const previous=songs;songs=loaded;trashedSongs=trash;
  if(!songs.some(s=>s.id===selected&&s.charts?.[difficulty]))selected=songs.find(s=>s.charts?.[difficulty])?.id||null;
  renderLibrary();updateSong();releaseSongURLs(previous);
  if(songs.issues?.length)toast(songs.issues[0]);
 }catch{if(loaded&&loaded!==songs)releaseSongURLs(loaded);toast('曲目读取失败，请刷新后重试');}
}
function updateSong(){const s=currentSong();if(!s)return;$('#track-meta').textContent=`4 KEY · ${DIFFICULTY_NAMES[difficulty]}${demo?' · 演示':''}`;$('#time').textContent=state==='idle'?'D F J K · Esc 暂停':$('#time').textContent;}
function renderLibrary(){
 const trashView=libraryFilter==='trash',favoriteOnly=libraryFilter==='favorites';
 const query=$('#search').value.toLowerCase(),list=(trashView?trashedSongs:songs).filter(s=>(trashView||s.charts?.[difficulty])&&(trashView||!favoriteOnly||favorites.includes(s.id))&&s.name.toLowerCase().includes(query));
 $('#song-list').innerHTML=list.map((s,i)=>`<article class="song-card ${!s.imported?'builtin':''}">
 ${trashView?`<div class="song-art"><span class="song-placeholder">${icon('album')}</span></div><div class="card-caption"><strong title="${escape(s.name)}">${escape(s.name)}</strong><button class="restore-song toolbar-button" data-restore="${escape(s.id)}">${icon('restore')}恢复</button></div>`:
 `<button class="song-pick" data-song="${escape(s.id)}" aria-label="选择 ${escape(s.name)}"><div class="song-art">${s.cover?`<img src="${escape(s.cover)}" alt="">`:`<span class="song-placeholder">${icon('album')}</span>`}<span class="card-number">${String(i+1).padStart(2,'0')}</span></div><div class="card-caption"><strong title="${escape(s.name)}">${escape(s.name)}</strong><small>${formatTime(s.chart.duration)} · ${judgmentCount((s.charts?.[difficulty]||s.chart).notes)} NOTES</small></div></button><div class="card-actions"><button class="favorite ${favorites.includes(s.id)?'active':''}" data-favorite="${escape(s.id)}" aria-label="${favorites.includes(s.id)?'取消收藏':'收藏'} ${escape(s.name)}">${icon('heart')}</button>${s.imported?`<button class="delete-song" data-delete="${escape(s.id)}" aria-label="删除 ${escape(s.name)}" title="删除歌曲">${icon('trash')}</button>`:''}</div>`}</article>`).join('')||`<p class="small-copy">${trashView?'回收站是空的':!songs.some(s=>s.charts?.[difficulty])?'此难度暂无谱面':'没有匹配的曲目'}</p>`;
 $('#trash-filter').classList.toggle('active',trashView);$('#trash-filter').setAttribute('aria-pressed',String(trashView));$('#favorite-filter').classList.toggle('active',favoriteOnly);$('#favorite-filter').setAttribute('aria-pressed',String(favoriteOnly));
 $$('[data-song]').forEach(b=>b.onclick=()=>{if(state!=='idle')stop(false);selected=b.dataset.song;updateSong();start();});
 $$('[data-favorite]').forEach(b=>b.onclick=()=>{favorites=favorites.includes(b.dataset.favorite)?favorites.filter(id=>id!==b.dataset.favorite):[...favorites,b.dataset.favorite];save('noteline.favorites',favorites);renderLibrary();});
 $$('[data-delete]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{const entry=await dbAction('get',b.dataset.delete);if(!entry)throw Error('歌曲已不存在');await dbAction('put',{...entry,trashedAt:Date.now()});await refresh();notifyLibrary();toast('已删除 · 可在回收站恢复');}catch(err){toast(err.message);b.disabled=false;}});
 $$('[data-restore]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{const entry=await dbAction('get',b.dataset.restore);if(!entry)return;delete entry.trashedAt;await dbAction('put',entry);await refresh();notifyLibrary();toast('已恢复到曲库');}catch(err){toast(err.message);b.disabled=false;}});
}
function notifyLibrary(){try{const channel=new BroadcastChannel('noteline-library');channel.postMessage('updated');channel.close();}catch{}}
function toggleFilter(value){libraryFilter=libraryFilter===value?'all':value;renderLibrary();}
$('#trash-filter').onclick=()=>toggleFilter('trash');
function closePanels(){ if(screen!=='menu')setUIVisible($('#library'),false);setUIVisible($('#settings'),false);if(state==='paused')setUIVisible($('#pause-overlay'),true); }
function panel(id){const el=$('#'+id),open=!isUIVisible(el);if(['playing','preroll','countdown','starting','loading'].includes(state))pause();if(screen!=='menu')setUIVisible($('#library'),false);setUIVisible($('#settings'),false);if(open){setUIVisible($('#pause-overlay'),false);setUIVisible(el,true);}else if(state==='paused')setUIVisible($('#pause-overlay'),true);}
$('#menu-settings').onclick=()=>panel('settings');$$('[data-close]').forEach(b=>b.onclick=closePanels);$('#search').oninput=renderLibrary;$('#favorite-filter').onclick=()=>toggleFilter('favorites');
$$('button[data-difficulty]').forEach(b=>b.onclick=()=>{difficulty=b.dataset.difficulty;$$('button[data-difficulty]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});if(!songs.some(s=>s.id===selected&&s.charts?.[difficulty]))selected=songs.find(s=>s.charts?.[difficulty])?.id||null;renderLibrary();updateSong();});
$('#demo-toggle').onclick=()=>{demo=!demo;$('#demo-toggle').classList.toggle('active',demo);$('#demo-toggle').setAttribute('aria-pressed',String(demo));updateSong();};
$('#import-toggle').onclick=()=>setUIVisible($('#import-form'),!isUIVisible($('#import-form')));
let importPackage=null,importFile=null;
$('#import-chart').onchange=async()=>{const file=$('#import-chart').files[0];importFile=file;importPackage=null;$('#import-error').textContent='';$('#legacy-audio-field').hidden=true;$('#import-audio').required=false;if(!file)return;try{const pack=await readScorePackage(file);if(importFile!==file)return;importPackage=pack;$('#legacy-audio-field').hidden=!pack.legacy;$('#import-audio').required=pack.legacy;}catch(err){if(importFile===file)$('#import-error').textContent=err.message;}};
$('#import-form').onsubmit=async e=>{e.preventDefault();e.submitter.disabled=true;$('#import-error').textContent='';try{
 const file=$('#import-chart').files[0];if(!file)throw Error('请选择谱面文件');const pack=importPackage&&importFile===file?importPackage:await readScorePackage(file),music=pack.audioBlob||$('#import-audio').files[0];
 if(!music)throw Error('这份旧谱面没有内嵌音频，请补选音乐');if(music.size>100e6)throw Error('音频最多 100MB');const duration=await audioDuration(music),charts=pack.charts;
 for(const chart of Object.values(charts)){if(Math.max(0,...chart.notes.map(n=>n.end??n.time))>duration+100)throw Error('音符超出音乐长度');chart.duration=duration;}
 const chart=firstChart(charts),entry={id:'custom-'+crypto.randomUUID(),name:chart.name,chart:encodeCharts({normal:chart}).normal,charts:encodeCharts(charts),audioBlob:music,coverBlob:pack.coverBlob};await dbAction('put',entry);selected=entry.id;await refresh();notifyLibrary();$('#import-form').reset();importPackage=null;importFile=null;$('#legacy-audio-field').hidden=true;$('#import-audio').required=false;setUIVisible($('#import-form'),false);toast('已加入曲库');
 }catch(err){$('#import-error').textContent=err.message;}finally{e.submitter.disabled=false;}};
for(const name of ['volume','speed','offset']){$('#'+name).value=name==='volume'?settings.volume*100:settings[name];const update=()=>{$('#'+name+'-value').textContent=name==='volume'?`${Math.round(settings.volume*100)}%`:name==='speed'?`${settings.speed.toFixed(1)}×`:`${settings.offset>0?'+':''}${settings.offset}ms`;};update();$('#'+name).oninput=()=>{settings[name]=Number($('#'+name).value)/(name==='volume'?100:1);audio.volume=settings.volume;update();save('noteline.settings',settings);};}
$('#hit-sound').checked=settings.hitSound;$('#hit-sound').onchange=()=>{settings.hitSound=$('#hit-sound').checked;save('noteline.settings',settings);};
function clearInputs(){pointerControls.clear();for(const s of inputs)s.clear();$$('[data-lane]').forEach(b=>b.classList.remove('pressed'));}
function getAudioContext(){audioContext ||= new (window.AudioContext||window.webkitAudioContext)();if(!hitNoise){const length=Math.floor(audioContext.sampleRate*.035);hitNoise=audioContext.createBuffer(1,length,audioContext.sampleRate);const data=hitNoise.getChannelData(0);for(let i=0;i<length;i++)data[i]=(Math.random()*2-1)*(1-i/length)**3;}return audioContext;}
function tone(lane){if(!settings.hitSound||settings.volume===0)return;try{audioContext ||= new (window.AudioContext||window.webkitAudioContext)();audioContext.resume();const t=audioContext.currentTime;
 const o=audioContext.createOscillator(),g=audioContext.createGain();o.type='triangle';o.frequency.setValueAtTime(1100+lane*90,t);o.frequency.exponentialRampToValueAtTime(250+lane*35,t+.065);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.12*settings.volume,t+.003);g.gain.exponentialRampToValueAtTime(.0001,t+.11);o.connect(g);g.connect(audioContext.destination);o.start(t);o.stop(t+.12);
 const click=audioContext.createBufferSource(),gain=audioContext.createGain(),filter=audioContext.createBiquadFilter();click.buffer=hitNoise;filter.type='highpass';filter.frequency.value=1800;gain.gain.value=.055*settings.volume;click.connect(filter);filter.connect(gain);gain.connect(audioContext.destination);click.start(t);
}catch{}}
function feedback(result){if(!result)return;lastJudge=performance.now();const labels={perfect:'PERFECT',great:'GREAT',good:'GOOD',miss:'MISS'};$('#judgement').style.color={perfect:'#19a588',great:'#238db8',good:'#d68a31',miss:'#e84f86'}[result.rating];$('#judgement').style.opacity=1;$('#judgement').innerHTML=result.reason==='early'?'EARLY':labels[result.rating]+(result.head?'<small>HOLD</small>':'');renderer.feedback({...result,combo:result.combo??session.combo,time:musicTime()});if(result.note&&result.rating!=='miss'){const soundLane=hitSoundLane(result);if(soundLane!==null)tone(soundLane);if(!renderer.effects.reduced){$('#judgement').getAnimations().forEach(a=>a.cancel());$('#judgement').animate(springFrames(.86,1,{stiffness:300,damping:18,duration:500,velocity:.7}).map(({value,offset})=>({scale:String(value),translate:`0 ${(1-value)*30}px`,offset})),{duration:500});if((!result.head||result.checkpoint)&&session.combo>1){$('#combo').getAnimations().forEach(a=>a.cancel());$('#combo').animate(springFrames(1.14,1,{stiffness:330,damping:18,duration:500}).map(({value,offset})=>({scale:String(value),offset})),{duration:500});}}}updateHUD();}
function updateHUD(){if(!session)return;$('#score').textContent=String(session.score).padStart(7,'0');$('#accuracy').textContent=session.accuracy.toFixed(2)+'%';$('#combo').innerHTML=session.combo>1?`${session.combo}<small>COMBO</small>`:'';}
const musicTime=()=>((state==='preroll'||(state==='countdown'&&resuming&&pausedPhase==='preroll')||state==='paused'&&pausedPhase==='preroll')?lead.time(performance.now()):audio.currentTime*1000)-settings.offset;
async function start(){if(state!=='idle')return;setScreen('game');activeSong=currentSong();if(!activeSong)return;renderer.reset();session=new RhythmSession(activeSong.charts[difficulty]);clearInputs();setUIVisible($('#library'),false);setUIVisible($('#settings'),false);setUIVisible($('#idle-hint'),false);setUIVisible($('#hud'),true);setUIVisible($('#result-overlay'),false);$('#judgement').textContent='';$('#combo').textContent='';$('#progress').style.width='0%';$('#time').textContent=`0:00 / ${formatTime(activeSong.charts[difficulty].duration)}`;updateHUD();state='loading';resuming=false;document.body.classList.add('playing');$('#play').innerHTML=icon('pause');$('#play').setAttribute('aria-label','暂停');audio.volume=settings.volume;canvas.dataset.ready='false';$('#time').textContent='准备音乐…';
 const run=session;try{const unlocked=audio.unlock().then(()=>null,error=>error);const blob=activeSong.audioBlob||await fetch(activeSong.audio).then(r=>{if(!r.ok)throw Error('音乐读取失败');return r.blob();});if(session!==run)return;
 await Promise.all([audio.prepare(blob),document.fonts.ready]);const accessError=await unlocked;if(session!==run)return;
 renderer.warmup(session,settings.speed);await new Promise(requestAnimationFrame);if(session!==run)return;renderer.reset();canvas.dataset.ready='true';$('#time').textContent=`0:00 / ${formatTime(audio.duration*1000)}`;if(accessError){pausedPhase='fresh';state='paused';setCountdown('');setUIVisible($('#pause-overlay'),true);toast(accessError.message||'请点击继续以启用音频');}else if(state==='loading')beginCountdown(false);
 }catch(error){if(session!==run)return;stop();toast(error.name==='EncodingError'?'当前浏览器无法解码此音频，请换用 MP3、AAC 或 WAV':error.message||'音乐无法加载，请重新导入谱面包');}}
function setCountdown(value){const el=$('#countdown');if(el.textContent===value)return;el.textContent=value;el.getAnimations().forEach(a=>a.cancel());if(value&&!renderer.effects.reduced)el.animate(springFrames(.76,1,{stiffness:260,damping:17,duration:650,velocity:.6}).map(({value,offset})=>({scale:String(value),offset})),{duration:650});}
function beginCountdown(isResume){resuming=isResume;state='countdown';countEnd=performance.now()+3000;setUIVisible($('#pause-overlay'),false);setCountdown('3');$('#combo').style.opacity=0;$('#judgement').style.opacity=0;}
function pause(){if(!['playing','preroll','countdown','starting','loading'].includes(state))return;if(state==='preroll'){lead.pause(performance.now());pausedPhase='preroll';}else if(state==='countdown'){pausedPhase=resuming?pausedPhase:'fresh';}else if(state==='loading')pausedPhase='fresh';else pausedPhase='playing';state='paused';audio.pause();clearInputs();setCountdown('');$('#combo').style.opacity=1;setUIVisible($('#pause-overlay'),true);$('#pause-hold-hint').hidden=!session?.holds.some(Boolean);}
async function resume(){
 if(state!=='paused')return;
 const run=session;
 try{await audio.unlock();if(session!==run||state!=='paused')return;
  if(canvas.dataset.ready!=='true'){state='loading';setUIVisible($('#pause-overlay'),false);return;}
  beginCountdown(pausedPhase!=='fresh');
 }catch(error){if(session===run)toast(error.message||'请再次点击继续以启用音频');}
}
function stop(toMenu=true){renderer.reset();state='idle';lead=null;audio.pause();audio.clear();session=null;clearInputs();setUIVisible($('#pause-overlay'),false);setUIVisible($('#result-overlay'),false);setUIVisible($('#hud'),false);setUIVisible($('#idle-hint'),true);setCountdown('');$('#combo').textContent='';$('#combo').style.opacity=1;$('#judgement').textContent='';$('#progress').style.width='0%';document.body.classList.remove('playing');$('#play').innerHTML=icon('play');$('#play').setAttribute('aria-label','开始游玩');updateSong();if(toMenu)showMenu();}
$('#play').onclick=()=>state==='idle'?start():state==='paused'?resume():pause();$('#resume').onclick=resume;$('#stop').onclick=stop;$('#restart').onclick=()=>{stop(false);start();};$('#result-close').onclick=stop;$('#retry').onclick=()=>{stop(false);start();};
function finish(){if(!session||state==='result')return;state='result';audio.pause();session.finish();clearInputs();updateHUD();$('#combo').style.opacity=1;$('#play').innerHTML=icon('play');const summary=summarizeResult(session,{songId:activeSong.id,difficulty,demo,records});showResults($('#result-overlay'),summary,{song:activeSong,difficulty,speed:settings.speed,offset:settings.offset});setUIVisible($('#result-overlay'),true);if(!demo){records.unshift({songId:activeSong.id,name:activeSong.name,difficulty,mode:demo?'demo':'manual',score:session.score,accuracy:session.accuracy,maxCombo:session.maxCombo,counts:{...session.counts},date:Date.now()});records=records.slice(0,200);if(!save('noteline.records',records))toast('成绩无法保存，浏览器存储已满');}}
audio.onended=finish;audio.onerror=()=>{if(state!=='idle'&&state!=='loading'){stop();toast('音频读取失败');}};
function down(lane,token){if(!['playing','preroll','starting','countdown'].includes(state)||demo)return;const set=inputs[lane],was=set.size;set.add(token);$(`[data-lane="${lane}"]`).classList.add('pressed');if(was===0)renderer.press(lane);if(was===0&&['playing','preroll','starting'].includes(state)){const time=musicTime();session.tick(time,inputs).forEach(feedback);const result=session.hit(lane,time);feedback(result?{...result,lane}:null);}}
function up(lane,token){const set=inputs[lane];if(!set.has(token))return;set.delete(token);if(set.size===0){$(`[data-lane="${lane}"]`).classList.remove('pressed');if(['playing','preroll','starting'].includes(state)&&!demo)feedback(session.release(lane,musicTime()));}}
document.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName))return;if(e.code==='Escape'){if(isUIVisible($('#library'))||isUIVisible($('#settings'))){closePanels();}else if(state==='paused')resume();else pause();return;}const lane=keys.indexOf(e.code);if(lane>=0){e.preventDefault();if(!e.repeat)down(lane,e.code);}else if(e.code==='Space'&&!e.repeat){e.preventDefault();state==='idle'?(screen==='welcome'?showMenu():null):state==='paused'?resume():pause();}});document.addEventListener('keyup',e=>{const lane=keys.indexOf(e.code);if(lane>=0)up(lane,e.code);});
function slidePointer(from,to,token){
 if(!inputs[from].has(token))return;
 inputs[from].delete(token);inputs[to].add(token);renderer.press(to);
 for(const lane of [from,to])$(`[data-lane="${lane}"]`).classList.toggle('pressed',inputs[lane].size>0);
 if(['playing','preroll','starting'].includes(state)&&!demo)session.slide(from,to,musicTime(),inputs).forEach(feedback);
}
const pointerControls=bindTrackPointers(canvas,{
 geometry:()=>({left,width:trackWidth,top:topY}),
 enabled:()=>['playing','preroll','starting','countdown'].includes(state)&&!demo,
 press:down,slide:slidePointer,release:up
});
window.addEventListener('blur',()=>{pause();clearInputs();});document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();else if(state==='idle')refresh();});
window.addEventListener('pageshow',event=>{if(event.persisted&&state==='idle')refresh();});
function resize(){w=innerWidth;h=innerHeight;trackWidth=Math.min(680,w-38);left=(w-trackWidth)/2;hitY=h*.77;topY=w<650?153:130;renderer.resize({w,h,left,trackWidth,hitY,topY});$('.lane-inputs').style.left=left+'px';$('.lane-inputs').style.width=trackWidth+'px';}
window.addEventListener('resize',resize);resize();
function playMusic(){state='starting';audio.play().then(()=>{if(state==='starting'){state='playing';$('#combo').style.opacity=1;}else audio.pause();}).catch(error=>{if(state!=='starting')return;pausedPhase='playing';state='paused';setCountdown('');setUIVisible($('#pause-overlay'),true);toast(error.message||'请点击继续以恢复音频');});}
function frame(now){let time=state==='idle'?0:musicTime();
 if(state==='countdown'){const remaining=countEnd-now;setCountdown(remaining>0?String(Math.ceil(remaining/1000)):'');if(remaining<=0){if(!resuming){lead=new LaunchClock(session.notes[0].time,renderer.approachTime(settings.speed));lead.start(now);state='preroll';time=musicTime();}else if(pausedPhase==='preroll'){lead.start(now);state='preroll';time=musicTime();}else{if(!demo)for(let lane=0;lane<4;lane++)if(session.holds[lane]&&!inputs[lane].size)feedback(session.release(lane,musicTime()));playMusic();}$('#combo').style.opacity=1;}}
 if(state==='preroll'&&lead.ready(now)){playMusic();time=-settings.offset;}
 if(state==='playing'||state==='preroll'){(demo?session.auto(time):session.tick(time,inputs)).forEach(feedback);updateHUD();const duration=Number.isFinite(audio.duration)?audio.duration*1000:activeSong.chart.duration;$('#time').textContent=state==='preroll'?'READY · 第一拍正在靠近':`${formatTime(audio.currentTime*1000)} / ${formatTime(duration)}`;$('#progress').style.width=`${Math.min(100,audio.currentTime*1000/duration*100)}%`;}
 canvas.dataset.phase=state;canvas.dataset.timeline=String(time);canvas.dataset.remaining=String(session?session.total-Object.values(session.counts).reduce((a,b)=>a+b,0):0);
 if(now-lastJudge>600)$('#judgement').style.opacity=0;renderer.draw(now,time,(state==='loading'||state==='countdown'&&!resuming)?null:session,state,inputs,settings.speed);requestAnimationFrame(frame);}
requestAnimationFrame(frame);await refresh();const requested=new URLSearchParams(location.search).get('song');if(requested){if(songs.some(s=>s.id===requested)){selected=requested;const requestedDifficulty=new URLSearchParams(location.search).get('difficulty'),available=songs.find(s=>s.id===requested).charts;difficulty=available?.[requestedDifficulty]?requestedDifficulty:available?.normal?'normal':Object.keys(available||{})[0]||'normal';$$('button[data-difficulty]').forEach(x=>{x.classList.toggle('active',x.dataset.difficulty===difficulty);x.setAttribute('aria-pressed',String(x.dataset.difficulty===difficulty));});start();}else showMenu();}
try{const channel=new BroadcastChannel('noteline-library');channel.onmessage=()=>{if(state==='idle')refresh();};}catch{}
