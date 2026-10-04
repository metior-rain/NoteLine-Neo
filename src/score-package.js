import {normalizeCharts,encodeCharts,firstChart} from './difficulties.js';
import {normalizeChart,parseChartText,encodeScore} from './engine.js';
const MAGIC='NLCHART2',HEADER=12,MAX_META=8e6,MAX_AUDIO=100e6,MAX_COVER=5e6;
const audioTypes=new Set(['audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/wave','audio/vnd.wave','audio/ogg','audio/flac','audio/x-flac','audio/mp4','audio/aac','audio/webm','audio/x-m4a','application/octet-stream']);
const coverTypes=new Set(['image/png','image/jpeg','image/webp']);
function asset(blob,kind){
 const max=kind==='audio'?MAX_AUDIO:MAX_COVER,types=kind==='audio'?audioTypes:coverTypes;
 if(!blob||!Number.isSafeInteger(blob.size)||blob.size<=0||blob.size>max)throw Error(kind==='audio'?'音频需要有效内容，最多 100MB':'封面需要有效内容，最多 5MB');
 const mime=blob.type||'application/octet-stream';if(!types.has(mime))throw Error(kind==='audio'?'不支持的音频类型':'封面仅支持 PNG / JPG / WebP');return {bytes:blob.size,mime};
}
export function createScorePackage(score,audioBlob,coverBlob=null){
 const charts=normalizeCharts(score?.charts||null,score?.charts?null:score),audio=asset(audioBlob,'audio'),cover=coverBlob?asset(coverBlob,'cover'):null;
 const meta=new TextEncoder().encode(JSON.stringify({format:'noteline.package',revision:3,title:firstChart(charts).name,charts:encodeCharts(charts),assets:{audio,cover}}));
 if(meta.length>MAX_META)throw Error('谱面数据最多 8MB');
 const header=new Uint8Array(HEADER);header.set(new TextEncoder().encode(MAGIC));new DataView(header.buffer).setUint32(8,meta.length,true);
 return new Blob([header,meta,audioBlob,...(coverBlob?[coverBlob]:[])],{type:'application/octet-stream'});
}
export async function readScorePackage(file){
 if(!file||file.size<=0||file.size>HEADER+MAX_META+MAX_AUDIO+MAX_COVER)throw Error('谱面文件大小无效');
 const header=await file.slice(0,HEADER).arrayBuffer();
 if(new TextDecoder().decode(new Uint8Array(header,0,Math.min(8,header.byteLength)))!==MAGIC){
  if(file.size>MAX_META)throw Error('旧 JSON 谱面最多 8MB');
  const chart=parseChartText(await file.text());return {chart,charts:{normal:chart},audioBlob:null,coverBlob:null,legacy:true};
 }
 if(header.byteLength!==HEADER)throw Error('谱面文件头不完整');
 const length=new DataView(header).getUint32(8,true);if(length<=0||length>MAX_META||HEADER+length>file.size)throw Error('谱面元数据长度无效');
 let meta;try{meta=JSON.parse(await file.slice(HEADER,HEADER+length).text());}catch{throw Error('谱面元数据损坏');}
 if(meta.format!=='noteline.package'||![2,3].includes(meta.revision))throw Error('不支持的谱面包版本');
 const validate=(a,kind)=>{if(!a||!Number.isSafeInteger(a.bytes)||a.bytes<=0)throw Error('谱面资源长度无效');asset({size:a.bytes,type:a.mime},kind);};
 validate(meta.assets?.audio,'audio');if(meta.assets.cover!==null)validate(meta.assets.cover,'cover');
 const end=HEADER+length+meta.assets.audio.bytes,coverEnd=end+(meta.assets.cover?.bytes||0);
 if(coverEnd!==file.size)throw Error('谱面资源长度与文件内容不一致');
 const charts=normalizeCharts(meta.revision===3?meta.charts:null,meta.revision===2?meta.score:null);
 // Own the extracted bytes: WebKit may persist sliced file Blobs as the entire backing file.
 const bytes=new Uint8Array(await file.arrayBuffer());
 if(bytes.byteLength!==file.size)throw Error('谱面文件读取不完整');
 return {chart:firstChart(charts),charts,audioBlob:new Blob([bytes.slice(HEADER+length,end)],{type:meta.assets.audio.mime}),coverBlob:meta.assets.cover?new Blob([bytes.slice(end,coverEnd)],{type:meta.assets.cover.mime}):null,legacy:false};
}
