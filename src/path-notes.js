// Paths store absolute milliseconds; the head is separate from subsequent nodes.
export const isPath = note => note.kind === 'meteor' || note.kind === 'bounce';
export const pathPoints = note => [{lane:note.lane,time:note.time},...(note.path||[])];
export const meteorTransitionMs=(a,b)=>Math.min(240,(b.time-a.time)*.35);
const smooth=t=>t*t*(3-2*t);
export function segmentPosition(kind,a,b,time){
  const start=kind==='meteor'?b.time-meteorTransitionMs(a,b):a.time;
  const linear=Math.max(0,Math.min(1,(time-start)/(b.time-start)));
  const t=kind==='meteor'?smooth(linear):linear;
  return {lane:a.lane+(b.lane-a.lane)*t,t,a,b};
}
export function pathPosition(note,time){
  const points=pathPoints(note);
  for(let i=1;i<points.length;i++)if(time<=points[i].time)return {...segmentPosition(note.kind,points[i-1],points[i],time),index:i};
  const last=points.at(-1);return {lane:last.lane,index:points.length-1,t:1,a:last,b:last};
}
// Shared geometry keeps the editor, game ribbon and held-lane judgment in agreement.
export function pathVertices(note){
  const points=pathPoints(note),vertices=[points[0]];
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i];
    if(note.kind!=='meteor'||a.lane===b.lane){vertices.push(b);continue;}
    const start=b.time-meteorTransitionMs(a,b);vertices.push({lane:a.lane,time:start});
    for(let j=1;j<=20;j++){const time=start+(b.time-start)*j/20;vertices.push({lane:segmentPosition('meteor',a,b,time).lane,time});}
  }
  return vertices;
}
export function moveNote(note,delta=0,laneDelta=0){return {...note,lane:note.lane+laneDelta,time:note.time+delta,...(note.end!==undefined?{end:note.end+delta}:{}),...(note.path?{path:note.path.map(p=>({lane:p.lane+laneDelta,time:p.time+delta}))}:{})};}
export function validatePath(note){
  if(!isPath(note)){if(note.kind==='tap'&&note.end!==undefined||note.kind==='hold'&&note.end===undefined)throw Error('音符类型与持续时间不一致');if(note.path!==undefined)throw Error('只有流星和弹跳可以包含路径');if(note.kind!==undefined&&!['tap','hold'].includes(note.kind))throw Error('未知音符类型');return;}
  if(!Array.isArray(note.path)||!note.path.length||note.path.length>256)throw Error('路径音符需要 1–256 个后续节点');
  let previous=note.time;
  for(const p of note.path){if(!Number.isInteger(p.lane)||p.lane<0||p.lane>3||!Number.isFinite(p.time)||p.time-previous<160||p.time>3600000)throw Error('路径节点需要有效轨道，且间隔至少 160ms');previous=p.time;}
  if(note.end!==previous)throw Error('路径结束时间必须与最后一个节点一致');
}
export function occupiedSpans(note){
  if(note.kind==='bounce')return pathPoints(note).map(p=>({lane:p.lane,start:p.time,end:p.time}));
  if(note.kind!=='meteor')return [{lane:note.lane,start:note.time,end:note.end??note.time}];
  const spans=[];const points=pathPoints(note);
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],distance=Math.abs(b.lane-a.lane),direction=Math.sign(b.lane-a.lane);
    // Invert the same easing used for drawing to locate lane-boundary crossings.
    const crossing=f=>{if(f<=0)return a.time;if(f>=1)return b.time;let lo=0,hi=1;for(let k=0;k<40;k++){const mid=(lo+hi)/2;if(smooth(mid)<f)lo=mid;else hi=mid;}const duration=meteorTransitionMs(a,b);return b.time-duration+duration*(lo+hi)/2;};
    for(let j=0;j<=distance;j++){const from=distance?Math.max(0,(j-.5)/distance):0,to=distance?Math.min(1,(j+.5)/distance):1;spans.push({lane:a.lane+direction*j,start:crossing(from),end:crossing(to)});}

  }
  return spans;
}
export function expandNotes(notes){return notes.flatMap(n=>n.kind==='bounce'?pathPoints(n).map((p,index)=>({...p,kind:'bounce',route:n,routeIndex:index})): [{...n,...(n.path?{path:n.path.map(p=>({...p}))}:{})}]).sort((a,b)=>a.time-b.time||a.lane-b.lane);}

export const judgmentCount=notes=>notes.reduce((sum,n)=>sum+(isPath(n)?1+n.path.length:1),0);
