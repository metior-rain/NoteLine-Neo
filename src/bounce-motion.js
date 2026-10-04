import {pathPoints} from './path-notes.js';
import {noteY} from './scroll-geometry.js';
// The first landing has a full normal approach; only subsequent landings bounce.
export function bounceMotion(note,time,{hitY,height,speed=1}){
 const points=pathPoints(note.route||note),index=note.routeIndex??0,target=points[index];
 if(index===0)return {lane:target.lane,y:noteY(hitY,target.time-time,speed),phase:'approach'};
 const previous=points[index-1],t=Math.max(0,Math.min(1,(time-previous.time)/(target.time-previous.time)));
 return {lane:previous.lane+(target.lane-previous.lane)*t,y:hitY-Math.sin(t*Math.PI)*height,phase:'bounce'};
}
