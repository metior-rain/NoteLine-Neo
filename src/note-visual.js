// Visual lifetimes are independent of scoring: a failed hold remains judged.
export class FailedNotes {
  constructor(){this.entries=new Map();}
  record(note,now,time){if(note&&!this.entries.has(note))this.entries.set(note,{born:now,time});}
  clear(){this.entries.clear();}
  appearance(note,now,time){
    const entry=this.entries.get(note);if(!entry)return null;
    const age=Math.max(0,now-entry.born),hold=note.end!==undefined;
    if(hold ? time>note.end+200 : age>=380)return null;
    return {gray:Math.min(1,age/100),alpha:hold?1:1-Math.max(0,(age-130)/250),time:hold?time:entry.time};
  }
}
export function mixColor(from,to,amount){let color=0;for(const shift of [16,8,0])color|=Math.round(((from>>shift)&255)*(1-amount)+((to>>shift)&255)*amount)<<shift;return color;}
