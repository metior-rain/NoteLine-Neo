export class LaunchClock {
  constructor(firstNoteMs,travelMs){this.value=Math.min(0,firstNoteMs-travelMs);this.anchor=0;this.running=false;}
  start(now){this.anchor=now;this.running=true;}
  time(now){return Math.min(0,this.value+(this.running?Math.max(0,now-this.anchor):0));}
  pause(now){this.value=this.time(now);this.running=false;}
  ready(now){return this.time(now)>=0;}
}
