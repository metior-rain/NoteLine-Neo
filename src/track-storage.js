import {readScorePackage} from './score-package.js';
const isPackage=bytes=>bytes instanceof ArrayBuffer&&new TextDecoder().decode(new Uint8Array(bytes,0,Math.min(8,bytes.byteLength)))==='NLCHART2';
// Persist owned bytes, never File/Blob handles backed by a browser's temporary file.
export async function encodeStoredTrack(entry){
 const stored={...entry,storageVersion:2};
 for(const kind of ['audio','cover']){
  const blob=entry[kind+'Blob'];
  if(blob){stored[kind+'Bytes']=await blob.arrayBuffer();stored[kind+'Type']=blob.type||'application/octet-stream';}
  else if(blob===null){delete stored[kind+'Bytes'];delete stored[kind+'Type'];}
  delete stored[kind+'Blob'];
 }
 if(isPackage(stored.audioBytes)){
  const recovered=await readScorePackage(new Blob([stored.audioBytes]));
  stored.audioBytes=await recovered.audioBlob.arrayBuffer();stored.audioType=recovered.audioBlob.type;
  if(isPackage(stored.coverBytes)){if(recovered.coverBlob){stored.coverBytes=await recovered.coverBlob.arrayBuffer();stored.coverType=recovered.coverBlob.type;}else{delete stored.coverBytes;delete stored.coverType;}}
 }else if(isPackage(stored.coverBytes)){
  const recovered=await readScorePackage(new Blob([stored.coverBytes]));
  if(recovered.coverBlob){stored.coverBytes=await recovered.coverBlob.arrayBuffer();stored.coverType=recovered.coverBlob.type;}else{delete stored.coverBytes;delete stored.coverType;}
 }
 delete stored.storageNeedsRepair;delete stored.storageError;
 if(!(stored.audioBytes instanceof ArrayBuffer)||!stored.audioBytes.byteLength)throw Error('歌曲音频已不可读取，请重新导入对应谱面包');
 return stored;
}
export function decodeStoredTrack(entry){
 if(!entry)return entry;
 const loaded={...entry};if(isPackage(entry.audioBytes)||isPackage(entry.coverBytes))loaded.storageNeedsRepair=true;
 for(const kind of ['audio','cover'])if(entry[kind+'Bytes']!==undefined){
  const bytes=entry[kind+'Bytes'];if(!(bytes instanceof ArrayBuffer)||!bytes.byteLength)throw Error('保存的歌曲资源不完整');
  loaded[kind+'Blob']=new Blob([bytes],{type:entry[kind+'Type']||'application/octet-stream'});delete loaded[kind+'Bytes'];
 }
 return loaded;
}
export function decodeStoredTracks(entries){return entries.map(entry=>{try{return decodeStoredTrack(entry);}catch(error){return {...entry,storageError:error.message};}});}
