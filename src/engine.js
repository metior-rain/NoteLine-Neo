import {isPath,validatePath,occupiedSpans,expandNotes,pathPosition,pathPoints} from './path-notes.js';
import { decodeScore,encodeScore,FORMAT } from './chart-format.js';
export { encodeScore };
export const WINDOWS = Object.freeze({ perfect: 45, great: 90, good: 140, early: 220 });
export const METEOR_GAP_MS = 220;
export const WEIGHTS = Object.freeze({ perfect: 1, great: .75, good: .4, miss: 0 });
const rate = error => Math.abs(error) <= WINDOWS.perfect ? 'perfect' : Math.abs(error) <= WINDOWS.great ? 'great' : 'good';
export function parseChartText(text) {
  let raw = String(text).trim().replace(/^\uFEFF/, '');
  if (/^var\s+\w+\s*=/.test(raw)) raw = raw.replace(/^var\s+\w+\s*=\s*/, '').replace(/;\s*$/, '');
  return normalizeChart(JSON.parse(raw));
}
export function normalizeChart(data, { legacyOffset = 3000 } = {}) {
  if (!data || typeof data !== 'object') throw new Error('谱面必须是 JSON 对象');
  if(data.format===FORMAT)data=decodeScore(data);
  const beatOffset=data.beatOffset??0;
  if(!Number.isFinite(beatOffset)||Math.abs(beatOffset)>3600000)throw new Error('首拍位置需要有效的毫秒数（±3600000）');
  const modern = Array.isArray(data.notes);
  const notes = [];
  if (modern) {
    for (const n of data.notes) notes.push({ lane: n?.lane, time: n?.time, ...(n?.end !== undefined ? { end: n.end } : {}),...(n?.kind?{kind:n.kind}:{}),...(n?.path?{path:structuredClone(n.path)}:{}) });
  } else {
    for (let lane = 0; lane < 4; lane++) {
      if (!data[lane] || typeof data[lane] !== 'object') throw new Error('旧谱面需要 0–3 四条轨道');
      for (const n of Object.values(data[lane])) if (n?.start !== 'end') notes.push({ lane, time: typeof n?.start === 'number' ? n.start - legacyOffset : NaN });
    }
  }
  if (!notes.length || notes.reduce((sum,n)=>sum+1+(Array.isArray(n.path)?n.path.length:0),0) > 50000) throw new Error('音符数量应为 1–50000');
  for (const n of notes) {
    validatePath(n);
    if (!Number.isInteger(n.lane) || n.lane < 0 || n.lane > 3 || !Number.isFinite(n.time) || n.time < 0 || n.time > 3600000) throw new Error('音符需要有效轨道（0–3）与时间（毫秒）');
    if (n.end !== undefined && (!Number.isFinite(n.end) || n.end - n.time < 80 || n.end > 3600000)) throw new Error('长按结束时间必须至少晚于开始时间 80ms');
  }
  notes.sort((a,b) => a.time - b.time || a.lane - b.lane);
  const spans=notes.flatMap((n,id)=>occupiedSpans(n).map(p=>({...p,id}))).sort((a,b)=>a.start-b.start);
  const occupied=Array.from({length:4},()=>[]);
  for(const span of spans){const lane=occupied[span.lane];while(lane.length&&lane[0].end<span.start)lane.shift();if(lane.some(p=>p.id!==span.id&&p.end>=span.start))throw Error('同一轨道的音符不能重复或重叠');lane.push(span);lane.sort((a,b)=>a.end-b.end);}
  const last = Math.max(...notes.map(n => n.end ?? n.time));
  const declared = modern ? data.duration : data.musicLong - legacyOffset;
  return { version: 3, beatOffset, name: String(data.name || 'Untitled').slice(0,100), bpm: Number.isFinite(data.bpm) && data.bpm >= 20 && data.bpm <= 400 ? data.bpm : 120, duration: Number.isFinite(declared) && declared > 0 ? Math.max(declared,last) : last + 1000, notes };
}
export function chartForMode(chart, mode) {
  if (mode !== 'easy') return chart;
  return { ...chart, notes: chart.notes.filter((_,i) => i % 2 === 0) };
}
export class RhythmSession {
  constructor(chart) {
    this.notes = expandNotes(chart.notes).map((n,id) => ({ ...n, id, judged: false, holding: false }));
    for(const n of this.notes)if(n.kind==='meteor')n.checkpoints=pathPoints(n).map((p,i)=>({...p,kind:'meteor-checkpoint',judged:false,index:i}));
    this.judgments=this.notes.flatMap(n=>n.checkpoints||[n]);this.total=this.judgments.length;
    this.lanes = Array.from({length:4},(_,lane) => this.notes.filter(n => n.lane === lane));
    this.pressed=new Set(); this.meteors=this.notes.filter(n=>n.kind==='meteor');
    this.cursors = [0,0,0,0]; this.holds = [null,null,null,null];
    this.counts = { perfect:0, great:0, good:0, miss:0 };
    this.combo = 0; this.maxCombo = 0; this.points = 0; this.errors = [];
  }
  get score() { return Math.round(this.points / this.total * 1000000); }
  get accuracy() { const n = Object.values(this.counts).reduce((a,b)=>a+b,0); return n ? this.points / n * 100 : 100; }
  get complete() { return Object.values(this.counts).reduce((a,b)=>a+b,0) === this.total; }
  record(note,rating,error=null){
    if(note.judged)return null;
    note.judged=true;note.rating=rating;note.error=error;
    this.counts[rating]++;this.points+=WEIGHTS[rating];
    this.combo=rating==='miss'?0:this.combo+1;this.maxCombo=Math.max(this.combo,this.maxCombo);
    if(error!==null)this.errors.push(error);
    return {note,rating,error,lane:note.currentLane??note.lane,combo:this.combo};
  }
  meteorCheckpoints(note,time){
    const results=[];
    for(const point of note.checkpoints){
      if(point.judged||point.time>time)continue;
      const rating=point.index===0?note.headRating:'perfect',error=point.index===0?note.headError:null;
      const result=this.record(point,rating,error);
      results.push({...result,note,lane:point.lane,head:point.index===0,checkpoint:true,terminal:point.time===note.end});
    }
    return results;
  }
  judge(note,rating,error=null) {
    if (!note || note.judged) return null;
    note.holding=false;
    for(let lane=0;lane<4;lane++)if(this.holds[lane]===note)this.holds[lane]=null;
    if(note.checkpoints){
      for(const point of note.checkpoints)if(!point.judged){if(point.index===0&&note.reason)point.reason=note.reason;this.record(point,rating,point.index===0?error:null);}
      note.judged=true;note.rating=rating;note.error=error;
      return rating==='miss'?{note,rating,error,lane:note.currentLane??note.lane,combo:this.combo}:null;
    }
    return this.record(note,rating,error);
  }
  tick(time,inputs) {
    if(inputs)this.pressed=new Set(inputs.flatMap((set,lane)=>set.size?[lane]:[]));
    const results=[];
    for(const n of this.meteors){
      if(!n.holding||n.judged)continue;
      const lane=Math.round(pathPosition(n,time).lane);
      n.currentLane=lane;
      for(let i=0;i<4;i++)if(this.holds[i]===n)this.holds[i]=null;
      this.holds[lane]=n;
      const broken=n.gapSince!=null&&(time-n.gapSince>METEOR_GAP_MS||time>=n.end)&&n.gapSince<n.end-WINDOWS.great;
      if(broken){results.push(this.judge(n,'miss'));continue;}
      if(this.pressed.has(lane))n.gapSince=null;
      else {
        n.gapSince??=time;
        if(time-n.gapSince>METEOR_GAP_MS&&n.gapSince<n.end-WINDOWS.great)results.push(this.judge(n,'miss'));
      }
    }
    for(const n of this.meteors)if(n.holding&&!n.judged&&(n.gapSince==null||n.gapSince>=n.end-WINDOWS.great))results.push(...this.meteorCheckpoints(n,time));
    for (const hold of this.holds) if (hold && time >= hold.end) results.push(this.judge(hold,hold.headRating,hold.headError));
    for (let lane=0;lane<4;lane++) {
      const list=this.lanes[lane];
      while(this.cursors[lane]<list.length) {
        const note=list[this.cursors[lane]];
        if(note.judged || note.holding) { this.cursors[lane]++; continue; }
        if(time-note.time<=WINDOWS.good) break;
        results.push(this.judge(note,'miss')); this.cursors[lane]++;
      }
    }
    return results.filter(Boolean);
  }
  expire(time) { return this.tick(time); }
  hit(lane,time) {
    this.pressed.add(lane);
    this.tick(time);
    if(this.holds[lane]) return null;
    const note=this.lanes[lane]?.[this.cursors[lane]];
    if(note&&note.time-time>WINDOWS.good&&note.time-time<=WINDOWS.early){this.cursors[lane]++;note.reason='early';return {...this.judge(note,'miss',time-note.time),reason:'early'};}
    if(!note || Math.abs(time-note.time)>WINDOWS.good) return null;
    const error=time-note.time, rating=rate(error);
    this.cursors[lane]++;
    if(note.end !== undefined) {
      note.holding=true; note.headRating=rating; note.headError=error; this.holds[lane]=note;
      if(note.checkpoints)return this.meteorCheckpoints(note,note.time)[0];
      return { note,rating,error,head:true };
    }
    return this.judge(note,rating,error);
  }
  slide(from,to,time,inputs){
    // Sliding is a change of sustained contact, never a new hit or Early input.
    const results=[];
    if(!inputs[from].size&&this.holds[from]?.kind!=='meteor'){
      const result=this.release(from,time);if(result)results.push(result);
    }
    results.push(...this.tick(time,inputs));return results;
  }
  release(lane,time) {
    this.pressed.delete(lane);
    const note=this.holds[lane];
    if(!note) return null;
    if(note.kind==='meteor'){note.gapSince=time;return null;}
    if(time < note.end-WINDOWS.great) return this.judge(note,'miss',time-note.end);
    const tailRating=rate(Math.min(0,time-note.end));
    return this.judge(note,WEIGHTS[note.headRating]<=WEIGHTS[tailRating]?note.headRating:tailRating,note.headError);
  }
  auto(time) {
    const results=[];
    for(const n of this.notes) {
      if(n.judged || n.time>time) continue;
      if(n.end!==undefined) {
        if(!n.holding){
          n.holding=true; n.headRating='perfect'; n.headError=0; this.holds[n.lane]=n;
          if(!n.checkpoints)results.push({note:n,rating:'perfect',error:0,head:true});
        }
        if(n.kind==='meteor'){results.push(...this.meteorCheckpoints(n,time));for(let i=0;i<4;i++)if(this.holds[i]===n)this.holds[i]=null;n.currentLane=Math.round(pathPosition(n,time).lane);this.holds[n.currentLane]=n;}
        if(time<n.end) continue;
      }
      results.push(this.judge(n,'perfect',0));
    }
    return results.filter(Boolean);
  }
  finish() { for(const n of this.notes) if(!n.judged) this.judge(n,'miss'); }
}
export function grade(score) { return score>=990000?'S+':score>=950000?'S':score>=900000?'A':score>=800000?'B':score>=700000?'C':'D'; }
