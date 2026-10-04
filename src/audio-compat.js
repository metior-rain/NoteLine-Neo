export function audioAccessError(){const error=new Error('音频尚未获准播放，请点击“继续”重试');error.name='NotAllowedError';return error;}
export function resumeAudio(context,timeoutMs=4000){
 if(context.state==='running')return Promise.resolve();
 // Call resume and start a silent buffer synchronously inside the trusted gesture.
 let pending;try{
  pending=context.resume();
  if(context.createBuffer){const source=context.createBufferSource();source.buffer=context.createBuffer(1,1,context.sampleRate||44100);source.connect(context.destination);source.onended=()=>source.disconnect();source.start(0);}
 }catch(error){return Promise.reject(error);}
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(audioAccessError()),timeoutMs);
  Promise.resolve(pending).then(()=>{clearTimeout(timer);context.state==='running'?resolve():reject(audioAccessError());},error=>{clearTimeout(timer);reject(error);});
 });
}
// Older WebKit provides decodeAudioData callbacks without a returned Promise.
export function decodeAudio(context,bytes){
 return new Promise((resolve,reject)=>{
  try{const result=context.decodeAudioData(bytes,resolve,reject);if(result?.then)result.then(resolve,reject);}catch(error){reject(error);}
 });
}
