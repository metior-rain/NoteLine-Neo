import {encodeStoredTrack,decodeStoredTrack,decodeStoredTracks} from './track-storage.js';
import {normalizeCharts,firstChart,encodeCharts} from './difficulties.js';
import { encodeScore } from './engine.js';
export const $ = s => document.querySelector(s);
export const $$ = s => [...document.querySelectorAll(s)];
export const escape = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export {colors} from './theme.js';
export const formatTime = ms => `${Math.floor(Math.max(0,ms)/60000)}:${String(Math.floor(Math.max(0,ms)/1000)%60).padStart(2,'0')}`;
const paths = {play:'<path d="m9 5 11 7-11 7Z"/>',pause:'<path d="M8 5v14M16 5v14"/>',music:'<path d="M9 18V5l11-2v13M9 8l11-2"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',settings:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="8" cy="18" r="2"/>',edit:'<path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-4-4L5 15l-1 5Z"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',plus:'<path d="M12 5v14M5 12h14"/>',arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',undo:'<path d="m9 4-5 5 5 5M4 9h9a7 7 0 0 1 0 14"/>',redo:'<path d="m15 4 5 5-5 5M20 9h-9a7 7 0 0 0 0 14"/>',trash:'<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/>',cursor:'<path d="m5 3 4 17 4-6 7-2Z"/>',tap:'<circle cx="12" cy="12" r="5"/>',hold:'<rect x="5" y="8" width="14" height="8" rx="4"/>',download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',folder:'<path d="M3 5h7l2 3h9v12H3Z"/>',heart:'<path d="M20.2 5.8a5 5 0 0 0-7.1 0L12 6.9l-1.1-1.1a5 5 0 0 0-7.1 7.1L12 21l8.2-8.1a5 5 0 0 0 0-7.1Z"/>',keyboard:'<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M7 16h10"/>',follow:'<circle cx="12" cy="12" r="5"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/>',album:'<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',chevron:'<path d="m8 10 4 4 4-4"/>',restore:'<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6M12 7v5l3 2"/>',restart:'<path d="M4 10a8 8 0 1 1 0 5M4 3v7h7"/>'};
export const icon = n => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[n]||paths.play}</svg>`;
export function icons(root=document) {root.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));}
export function read(key,fallback) {try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
export function save(key,value) {try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}}
let dbPromise;
export async function dbAction(action,value) {
  dbPromise ||= new Promise((resolve,reject)=>{const r=indexedDB.open('noteline-library',1);r.onupgradeneeded=()=>r.result.createObjectStore('tracks',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  // Finish async byte reads before opening the transaction (WebKit closes idle transactions).
  if(action==='put')value=await encodeStoredTrack(value);
  const db=await dbPromise;
  const result=await new Promise((resolve,reject)=>{const tx=db.transaction('tracks',['getAll','get'].includes(action)?'readonly':'readwrite');const store=tx.objectStore('tracks');const r=action==='getAll'?store.getAll():action==='get'?store.get(value):action==='put'?store.put(value):store.delete(value);let result;r.onsuccess=()=>result=r.result;tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
  return action==='getAll'?decodeStoredTracks(result):action==='get'?decodeStoredTrack(result):result;
}
export async function loadSongs() {
  const songs=[];songs.issues=[];
  for(const entry of await dbAction('getAll')){
    if(entry.trashedAt)continue;
    try{
      if(entry.storageError)throw Error(entry.storageError);
      if(!entry.audioBlob?.size)throw Error('歌曲音频已不可读取');
      const charts=normalizeCharts(entry.charts,entry.chart),chart=firstChart(charts);
      if(entry.storageVersion!==2||entry.storageNeedsRepair||!entry.charts||Object.values(entry.charts).some(c=>c.format!=='noteline.score')){
        // Validate and materialize legacy data before migration. Do not delete failures.
        const migrated=await encodeStoredTrack({...entry,chart:encodeScore(chart),charts:encodeCharts(charts)});
        try{await dbAction('put',migrated);}catch(error){songs.issues.push(`${entry.name}：保存升级失败，可重试`);}
        Object.assign(entry,decodeStoredTrack(migrated));
      }
      songs.push({...entry,chart,charts,audio:URL.createObjectURL(entry.audioBlob),cover:entry.coverBlob?URL.createObjectURL(entry.coverBlob):null,imported:true});
    }catch(error){songs.issues.push(`${entry.name||'某首歌曲'}：${error.message}，请重新导入对应谱面包`);}
  }
  return songs;
}
export async function audioDuration(file) {
  const url=URL.createObjectURL(file),a=new Audio();a.preload='metadata';
  try{return await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('读取音频超时')),8000);a.onloadedmetadata=()=>{clearTimeout(timer);Number.isFinite(a.duration)?resolve(Math.round(a.duration*1000)):reject(Error('音频时长无效'));};a.onerror=()=>{clearTimeout(timer);reject(Error('无法读取音频，请使用 MP3、WAV 或 OGG'));};a.src=url;});}finally{a.removeAttribute('src');a.load();URL.revokeObjectURL(url);}
}
