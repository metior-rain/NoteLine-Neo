// NoteLine Score 1/2: integer microseconds, explicit note types, independent timing origin.
export const FORMAT='noteline.score';
export function decodeScore(data){
  if(data.format!==FORMAT||![1,2].includes(data.revision))throw Error('不支持的 NoteLine Score 版本');
  const integer=(n,label,min=0)=>{if(!Number.isSafeInteger(n)||n<min||n>3600000000)throw Error(label+'需要有效的整数微秒');return n/1000;};
  if(!Array.isArray(data.tracks)||data.tracks.length!==4)throw Error('NoteLine Score 需要四条轨道');
  if(!Number.isFinite(data.timing?.bpm)||data.timing.bpm<20||data.timing.bpm>400)throw Error('谱面 BPM 无效');
  const seen=new Set(),notes=[];
  for(const track of data.tracks){if(!Number.isInteger(track.key)||track.key<0||track.key>3||seen.has(track.key)||!Array.isArray(track.events))throw Error('谱面轨道无效或重复');seen.add(track.key);for(const e of track.events){const time=integer(e.atUs,'音符时间');if(e.kind==='tap'){if(e.lengthUs!==undefined)throw Error('单击不能有持续时间');notes.push({lane:track.key,time});}else if(e.kind==='hold'){const length=integer(e.lengthUs,'长按时长',80000);notes.push({lane:track.key,time,end:(e.atUs+e.lengthUs)/1000});}else if(data.revision===2&&['meteor','bounce'].includes(e.kind)){if(!Array.isArray(e.nodes))throw Error('路径节点无效');const path=e.nodes.map(p=>({lane:p.key,time:integer(p.atUs,'节点时间')}));notes.push({lane:track.key,time,kind:e.kind,path,end:path.at(-1)?.time});}else throw Error('未知音符类型');if((notes.at(-1).end??time)*1000>data.audio?.durationUs)throw Error('音符超出谱面声明的音频时长');}}
  return {name:data.meta?.title,bpm:data.timing?.bpm,beatOffset:integer(data.timing?.originUs??0,'首拍位置',-3600000000),duration:integer(data.audio?.durationUs,'音乐时长',1),notes};
}
export function encodeScore(chart){
  const us=ms=>Math.round(ms*1000);
  return {format:FORMAT,revision:chart.notes.some(n=>n.path)?2:1,meta:{title:chart.name},audio:{durationUs:us(chart.duration)},timing:{bpm:chart.bpm,originUs:us(chart.beatOffset??0)},tracks:Array.from({length:4},(_,key)=>({key,events:chart.notes.filter(n=>n.lane===key).map(n=>({atUs:us(n.time),kind:n.kind|| (n.end===undefined?'tap':'hold'),...(n.path?{nodes:n.path.map(p=>({key:p.lane,atUs:us(p.time)}))}:n.end!==undefined?{lengthUs:us(n.end-n.time)}:{})}))}))};
}
