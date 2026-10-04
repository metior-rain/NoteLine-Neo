import {bounceMotion} from './bounce-motion.js';
import {drawBounceSymbol} from './bounce-symbol.js';
import {traceMeteorStar} from './meteor-symbol.js';
import {pathPoints,pathPosition,pathVertices} from './path-notes.js';
import {palette} from './theme.js';
import {mixColor} from './note-visual.js';
import {noteY} from './scroll-geometry.js';
export function drawPathNote(renderer,n,time,now,speed,travel){
 const g=renderer.bodies,hit=renderer.hitY,top=renderer.topY;
 if(n.kind==='meteor'){
  if(time<n.time-travel||time>n.end+200||n.judged&&n.rating!=='miss')return;
  const failed=n.rating==='miss',visual=failed?renderer.failures.appearance(n,now,time):null,points=pathPoints(n),colorAt=lane=>failed?mixColor(palette[lane],0x99a5b3,visual?.gray??1):palette[lane];
  const vertices=pathVertices(n);
  for(let i=1;i<vertices.length;i++){
    const a=vertices[i-1],b=vertices[i];
    const first=Math.max(a.time,time),last=Math.min(b.time,time+travel);
    if(last<=first)continue;
    const f=(first-a.time)/(b.time-a.time),t=(last-a.time)/(b.time-a.time);
    const lane1=a.lane+(b.lane-a.lane)*f,lane2=a.lane+(b.lane-a.lane)*t;
    const x1=renderer.x(lane1),x2=renderer.x(lane2),y1=noteY(hit,first-time,speed),y2=noteY(hit,last-time,speed);
    const lane=(lane1+lane2)/2,color=mixColor(colorAt(Math.floor(lane)),colorAt(Math.ceil(lane)),lane%1);
    g.moveTo(x1,y1).lineTo(x2,y2).stroke({color,width:12,alpha:failed?.22:.35});
    g.moveTo(x1,y1).lineTo(x2,y2).stroke({color,width:2,alpha:.8});
  }
  for(const p of points){const y=noteY(hit,p.time-time,speed);if(y>=top&&y<=hit)g.circle(renderer.x(p.lane),y,6).fill({color:0xffffff,alpha:.8}).stroke({color:colorAt(p.lane),width:2});}
  const fade=failed?Math.max(0,1-Math.max(0,time-n.end)/200):1;
  const pos=pathPosition(n,time),x=renderer.x(pos.lane),y=time<n.time?noteY(hit,n.time-time,speed):hit;
  if(y>=top&&y<=hit+20){const c=mixColor(colorAt(pos.a.lane),colorAt(pos.b.lane),pos.t);g.circle(x,y,24+Math.sin(now*.012)*3).fill({color:c,alpha:failed?.05:.14});traceMeteorStar(renderer.pathHeads,x,y,20).fill({color:c,alpha:failed?.45*fade:1}).stroke({color:0xffffff,width:1.5,alpha:fade});}
 }else if(n.kind==='bounce'){
  const points=pathPoints(n.route||n),index=n.routeIndex??0,target=points[index],previous=index?points[index-1]:{lane:target.lane,time:target.time-travel};
  if(time<previous.time||time>target.time+400||n.judged&&n.rating!=='miss')return;
  const t=Math.max(0,Math.min(1,(time-previous.time)/(target.time-previous.time))),x1=renderer.x(previous.lane),x2=renderer.x(target.lane),height=Math.min(105,renderer.h*.22),failed=n.rating==='miss',visual=failed?renderer.failures.appearance(n,now,time):null,color=failed?mixColor(palette[target.lane],0x99a5b3,visual?.gray??1):palette[target.lane];
  if(failed&&!visual)return;
  const opacity=failed?visual.alpha:1;
  // During the falling approach, preview the first outgoing arc near the targets.
  const arcFrom=index?previous:target,arcTo=index?target:points[1];
  if(arcTo){const fromX=renderer.x(arcFrom.lane),toX=renderer.x(arcTo.lane);for(let j=0;j<32;j++){const a=j/32,b=(j+1)/32;if(j%2===0)g.moveTo(fromX+(toX-fromX)*a,hit-Math.sin(a*Math.PI)*height).lineTo(fromX+(toX-fromX)*b,hit-Math.sin(b*Math.PI)*height).stroke({color,width:2,alpha:(index?.5:.25)*opacity});}}
  for(let j=index;j<Math.min(points.length,index+3);j++){const p=points[j];g.circle(renderer.x(p.lane),hit,29+(j-index)*4).stroke({color:failed?color:palette[p.lane],width:j===index?3:1.5,alpha:(j===index?.85:.2)*opacity});}
  const motion=bounceMotion(n,visual?.time??time,{hitY:hit,height,speed}),x=renderer.x(motion.lane),y=index?motion.y:Math.min(hit+35,motion.y);
  if(y<top-20||y>hit+45)return;
  const reduced=renderer.reduced.matches,elastic=failed||reduced?0:Math.sin(index?t*Math.PI*2:now*.012),accent=failed?color:palette[points[index+1]?.lane??target.lane];
  if(index===0&&!failed&&!reduced){
   // Outlined afterimages signal an elastic route note before its first landing.
   for(let i=1;i<=3;i++){const trailY=y-i*24;if(trailY>=top)g.ellipse(x,trailY,Math.max(4,14-i*3),9+i*2).stroke({color:accent,width:2,alpha:opacity*(.26-i*.055)});}
  }
  const sx=index?1+elastic*.12:.94+elastic*.04,sy=index?1-elastic*.12:1.12-elastic*.06;
  drawBounceSymbol(renderer.pathHeads,x,y,17,{color,accent,alpha:opacity,sx:reduced||failed?1:sx,sy:reduced||failed?1:sy});
  if(!failed&&!reduced)for(let i=0;i<2;i++){const angle=now*.004+i*Math.PI;renderer.pathHeads.circle(x+Math.cos(angle)*26,y+Math.sin(angle)*26,2.5).fill({color:accent,alpha:opacity*.85});}
  g.circle(x2,hit,16+30*(1-t)).stroke({color,width:2,alpha:.8*opacity});
 }
}
