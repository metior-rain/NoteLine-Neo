// Match exact chart timestamps at the format's microsecond precision.
export function groupChords(notes){
 const groups=new Map();
 for(const note of notes){const key=Math.round(note.time*1000);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(note);}
 return [...groups.values()].filter(group=>new Set(group.map(n=>n.lane)).size>1).map(group=>group.sort((a,b)=>a.lane-b.lane)).sort((a,b)=>a[0].time-b[0].time);
}
