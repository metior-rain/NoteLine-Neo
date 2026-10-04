import {isPath,pathPosition} from './path-notes.js';
import { normalizeChart,encodeScore } from './engine.js';
let nextId=1;
export class ChartDocument {
  constructor(chart={name:'Untitled',bpm:120,duration:60000,notes:[]}) {
    if(chart.format)chart=normalizeChart(chart);
    this.name=chart.name||'Untitled'; this.bpm=chart.bpm||120;this.beatOffset=chart.beatOffset??0;this.duration=chart.duration||60000;
    this.notes=chart.notes.map(n=>({...structuredClone(n),id:'n'+nextId++}));this.undoStack=[];this.redoStack=[];
  }
  snapshot(){return {name:this.name,bpm:this.bpm,beatOffset:this.beatOffset,notes:structuredClone(this.notes)};}
  restore(s){this.name=s.name;this.bpm=s.bpm;this.beatOffset=s.beatOffset??0;this.notes=structuredClone(s.notes);}
  transact(fn){const before=this.snapshot();try{fn();if(!Number.isFinite(this.beatOffset)||Math.abs(this.beatOffset)>3600000)throw Error('首拍位置需要有效的毫秒数（±3600000）');if(this.notes.length)normalizeChart({name:this.name,bpm:this.bpm,beatOffset:this.beatOffset,duration:this.duration,notes:this.notes});if(this.notes.some(n=>(n.end??n.time)>this.duration))throw Error('音符不能超出音乐长度');this.notes.sort((a,b)=>a.time-b.time||a.lane-b.lane);const after=this.snapshot();if(JSON.stringify(before)===JSON.stringify(after))return;this.undoStack.push(before);if(this.undoStack.length>100)this.undoStack.shift();this.redoStack=[];}catch(err){this.restore(before);throw err;}}
  add(note){const n={...note,id:'n'+nextId++};this.transact(()=>this.notes.push(n));return n.id;}
  update(ids,patch){this.transact(()=>{this.notes=this.notes.map(n=>ids.includes(n.id)?{...n,...(typeof patch==='function'?patch(n):patch)}:n);});}
  remove(ids){this.transact(()=>{this.notes=this.notes.filter(n=>!ids.includes(n.id));});}
  undo(){if(!this.undoStack.length)return;this.redoStack.push(this.snapshot());this.restore(this.undoStack.pop());}
  redo(){if(!this.redoStack.length)return;this.undoStack.push(this.snapshot());this.restore(this.redoStack.pop());}
  export(){return encodeScore(normalizeChart({version:3,name:this.name,bpm:this.bpm,beatOffset:this.beatOffset,duration:this.duration,notes:this.notes}));}
}
export function snapTime(time,bpm,subdivision,beatOffset=0){const spacing=60000/bpm/subdivision;return subdivision?beatOffset+Math.round((time-beatOffset)/spacing)*spacing:time;}
export function gridLines(min,max,bpm,subdivision,beatOffset=0){const sub=subdivision||1,spacing=60000/bpm/sub;const lines=[];for(let i=Math.ceil((min-beatOffset)/spacing);i<=Math.floor((max-beatOffset)/spacing);i++)lines.push({time:beatOffset+i*spacing,index:i,major:i%sub===0,bar:i%(sub*4)===0});return lines;}
export function findNote(notes,time,lane,tolerance){return notes.filter(n=>(isPath(n)?Math.round(pathPosition(n,time).lane)===lane:n.lane===lane)&&time>=n.time-tolerance&&time<=(n.end??n.time)+tolerance).sort((a,b)=>Math.abs(a.time-time)-Math.abs(b.time-time))[0]||null;}
