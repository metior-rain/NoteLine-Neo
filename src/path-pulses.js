// Successful path hits retain a short-lived silhouette instead of disappearing abruptly.
export class PathPulses {
 constructor(){this.items=[];}
 add(result){
  const n=result?.note;if(!n||result.rating==='miss'||!['meteor','bounce'].includes(n.kind))return;
  const terminal=n.kind==='bounce'||result.terminal||(!result.head&&!result.checkpoint);
  this.items.push({kind:n.kind,lane:result.lane??n.currentLane??n.lane,age:0,life:terminal?.42:.28,terminal});
  if(this.items.length>64)this.items.shift();
 }
 step(dt){for(const p of this.items)p.age+=Math.max(0,Math.min(dt,.05));this.items=this.items.filter(p=>p.age<p.life);}
 clear(){this.items=[];}
}
export function pulseAppearance(p,reduced=false){const t=Math.min(1,p.age/p.life);return {alpha:(1-t)**1.5,scale:reduced?1:Math.max(.05,1+Math.sin(t*Math.PI)*.28-t*.65),radius:24+(reduced?4:30)*t};}
