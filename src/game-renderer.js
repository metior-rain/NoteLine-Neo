import {PathPulses,pulseAppearance} from './path-pulses.js';
import {TargetFeedback} from './target-feedback.js';
import {drawBounceSymbol} from './bounce-symbol.js';
import {traceMeteorStar} from './meteor-symbol.js';
import {drawPathNote} from './path-renderer.js';
import { Application, Container, Graphics, Sprite } from 'pixi.js';
import { ImpactField } from './impact.js';
import { FailedNotes,mixColor } from './note-visual.js';
import { approachMs,noteY,scrollVelocity } from './scroll-geometry.js';
import {palette} from './theme.js';
import {groupChords} from './chords.js';
export class GameRenderer {
  static async create(canvas){const renderer=new GameRenderer();renderer.app=new Application();await renderer.app.init({canvas,preference:'webgl',backgroundAlpha:0,antialias:true,resolution:Math.min(devicePixelRatio||1,2),autoDensity:true,autoStart:false});renderer.init();canvas.dataset.renderer='pixi-webgl';return renderer;}
  init(){
    this.failures=new FailedNotes();this.pathPulses=new PathPulses();this.contacts=new TargetFeedback();this.reduced=matchMedia('(prefers-reduced-motion: reduce)');this.effects=new ImpactField(Math.random,this.reduced.matches);this.reduced.addEventListener('change',()=>{this.effects.reduced=this.reduced.matches;});
    const app=this.app;this.world=new Container();app.stage.addChild(this.world);this.rails=new Graphics();this.bodies=new Graphics();this.world.addChild(this.rails,this.bodies);
    this.textures={};
    const texture=(name,draw)=>{const g=new Graphics();draw(g);this.textures[name]=app.renderer.generateTexture({target:g,resolution:2});g.destroy();};
    texture('orb',g=>{g.circle(18,18,17).fill({color:0xffffff,alpha:.85});g.circle(17,16,13).fill(0xffffff);});
    texture('glow',g=>{for(let r=64;r>0;r-=3)g.circle(64,64,r).fill({color:0xffffff,alpha:.015+(1-r/64)*.013});});
    texture('ring',g=>g.circle(48,48,43).stroke({color:0xffffff,width:2}));
    texture('spark',g=>g.moveTo(5,0).lineTo(10,5).lineTo(5,10).lineTo(0,5).closePath().fill(0xffffff));
    texture('streak',g=>g.roundRect(0,0,24,3,1.5).fill(0xffffff));
    this.glows=palette.map(color=>{const s=new Sprite(this.textures.glow);s.anchor.set(.5);s.tint=color;this.world.addChild(s);return s;});
    this.targets=palette.map(()=>{const c=new Container();c.face=new Graphics();c.addChild(c.face);this.world.addChild(c);return c;});
    this.noteLayer=new Container();this.pathHeads=new Graphics();this.effectLayer=new Container();this.world.addChild(this.noteLayer,this.pathHeads,this.effectLayer);this.notePool=[];this.fxPool=[];this.previous=0;
  }
  warmup(session,speed){
    // Exercise note, hold and impact pipelines before any timed play begins.
    const notes=Array.from({length:128},(_,i)=>({lane:i%4,time:i*8,end:i%3===0?i*8+900:undefined}));
    notes.push({kind:'meteor',lane:0,time:0,end:1500,path:[{lane:2,time:1500}]},{kind:'bounce',lane:1,time:1000,routeIndex:0,route:{lane:1,time:1000,path:[{lane:3,time:2000}]}});
    for(let i=0;i<4;i++){this.press(i);this.effects.burst(i,'perfect',false);}
    this.draw(performance.now(),500,{notes,holds:notes.slice(0,4)},'playing',Array.from({length:4},()=>new Set()),speed);
    this.reset();this.draw(performance.now(),0,null,'loading',Array.from({length:4},()=>new Set()),speed);
  }
  resize({w,h,left,trackWidth,hitY,topY}){Object.assign(this,{w,h,left,trackWidth,hitY,topY});this.app.renderer.resize(w,h);this.rails.clear();for(let lane=0;lane<4;lane++){const x=this.x(lane);for(let i=0;i<16;i++){const a=this.topY+(this.hitY-this.topY)*i/16,b=this.topY+(this.hitY-this.topY)*(i+1)/16;this.rails.moveTo(x,a).lineTo(x,b).stroke({color:palette[lane],width:3,alpha:.08+i*.025});}}}
  x(lane){return this.left+(lane+.5)*this.trackWidth/4;}
  approachTime(speed){return approachMs(this.topY,this.hitY,speed);}
  sprite(pool,layer,index,texture){let s=pool[index];if(!s){s=new Sprite();s.anchor.set(.5);pool.push(s);layer.addChild(s);}s.texture=this.textures[texture];s.visible=true;s.rotation=0;s.alpha=1;s.scale.set(1);return s;}
  press(lane){this.contacts.press(lane);}
  feedback(result){if(!result)return;this.pathPulses.add(result);if(result.rating==='miss')this.failures.record(result.note,performance.now(),result.time??this.lastTime??0);const lane=result.lane??result.note?.currentLane??result.note?.lane;if(lane!==undefined){if(result.rating!=='miss'&&result.rating!=='break')this.press(lane);this.effects.burst(lane,result.rating,!!result.note?.end&&!result.head);}if(result.note&&!result.head&&result.rating!=='miss'&&result.combo>0&&result.combo%10===0)for(let i=0;i<4;i++)this.effects.add({lane:i,kind:'ring',life:.85,angle:0,speed:0,delay:i*.045});}
  reset(){this.effects.reset();this.failures.clear();this.pathPulses.clear();this.contacts.reset();}
  draw(now,time,session,state,inputs,speed){
    this.lastTime=time;const dt=this.previous?(now-this.previous)/1000:0;this.previous=now;const active=state==='playing',holds=session?.holds||[];this.effects.step(dt,holds,active);this.contacts.step(dt,inputs);this.pathPulses.step(dt);this.bodies.clear();this.pathHeads.clear();const g=this.bodies,travel=this.approachTime(speed)+20/scrollVelocity(speed);let ni=0,fi=0;
    this.world.position.set(0,this.effects.shake*Math.sin(now*.09)*2);
    for(let lane=0;lane<4;lane++){
      const x=this.x(lane),color=palette[lane],hold=active&&!!holds[lane],energy=this.effects.energy[lane];
      const contact=this.contacts.appearance(lane,energy,this.reduced.matches),target=this.targets[lane],charge=contact.charge;
      target.position.set(x,this.hitY);target.scale.set(contact.scale);
      const glow=this.glows[lane];glow.position.set(x,this.hitY);glow.alpha=charge*.42;glow.scale.set(.65+charge*.25);
      const face=target.face;face.clear();face.circle(0,3,24).fill({color,alpha:.24});face.circle(0,0,23).fill({color:mixColor(0xffffff,color,charge*.58),alpha:.98}).stroke({color,width:1.8+charge*1.8});face.circle(0,0,6+charge*8).fill(color);
      if(hold){g.arc(x,this.hitY,29,now*.004,now*.004+Math.PI*1.5).stroke({color,width:2.5,alpha:.8});}
      if(state==='idle')for(let i=0;i<2;i++){const p=(now*.000018+lane*.2+i*.48)%1;const s=this.sprite(this.notePool,this.noteLayer,ni++,'orb');s.position.set(x,this.topY+p*(this.hitY-this.topY));s.tint=color;s.scale.set(.23);s.alpha=.15+Math.sin(p*Math.PI)*.23;}
    }
    if(session){
      if(this.chordSource!==session.notes){this.chordSource=session.notes;this.chords=groupChords(session.notes.filter(n=>n.kind!=='bounce'||n.routeIndex===0));}
      for(const group of this.chords){
        const delta=group[0].time-time;if(delta>travel)break;
        const y=noteY(this.hitY,delta,speed);if(y<this.topY||y>this.hitY+35)continue;
        const pending=group.filter(n=>!n.judged&&!n.holding);if(pending.length<2)continue;
        for(let j=1;j<pending.length;j++){
          const a=pending[j-1],b=pending[j],x1=this.x(a.lane),x2=this.x(b.lane);
          for(let k=0;k<24;k++){
            const color=mixColor(palette[a.lane],palette[b.lane],(k+.5)/24);
            g.moveTo(x1+(x2-x1)*k/24,y).lineTo(x1+(x2-x1)*(k+1)/24,y).stroke({color,width:3,alpha:.72});
          }
        }
      }
    }
    if(session)for(const n of session.notes){if(n.kind==='meteor'||n.kind==='bounce'){drawPathNote(this,n,time,now,speed,travel);continue;}const failed=n.judged&&n.rating==='miss',visual=failed?this.failures.appearance(n,now,time):null;if(n.judged&&!visual)continue;const visualTime=visual?.time??time,alpha=visual?.alpha??1;const delta=n.time-visualTime,endDelta=(n.end??n.time)-visualTime;if(delta>travel)continue;if(endDelta<-200)continue;
      const x=this.x(n.lane),color=visual?mixColor(palette[n.lane],0x96a4ae,visual.gray):palette[n.lane],head=noteY(this.hitY,delta,speed),tail=noteY(this.hitY,endDelta,speed),radius=Math.min(13,this.trackWidth/4*.15);
      if(n.end!==undefined){const from=Math.max(this.topY-25,tail),to=Math.min(this.hitY+35,n.holding?this.hitY:head);if(to>from){g.roundRect(x-8,from,16,to-from,7).fill({color,alpha:n.holding?.65:failed?.4:.32});g.roundRect(x-2,from,4,to-from,2).fill({color:0xffffff,alpha:n.holding?.72:failed?.2:.5});if(n.holding&&active)for(let i=0;i<5;i++){const y=to-((now*.16+i*67)%(to-from));g.circle(x,y,3).fill({color:0xffffff,alpha:.8});}}if(tail>this.topY&&tail<this.hitY+35)g.circle(x,tail,9).stroke({color,width:2.5});}
      const y=n.holding?this.hitY:failed&&n.end===undefined?Math.min(this.hitY+35,head):head;if(y<this.topY-20||y>this.hitY+45)continue;
      g.moveTo(x,y-28).lineTo(x,y-5).stroke({color,width:5,alpha:.15*alpha});const s=this.sprite(this.notePool,this.noteLayer,ni++,'orb');s.position.set(x,y);s.tint=color;s.alpha=alpha;s.scale.set(radius/18*(n.holding?1.1:1));g.circle(x-3,y-4,3).fill({color:0xffffff,alpha:.9*alpha});
    }
    for(const p of this.pathPulses.items){
      const {alpha,scale,radius}=pulseAppearance(p,this.reduced.matches),x=this.x(p.lane),y=this.hitY,color=palette[p.lane],heads=this.pathHeads;
      heads.circle(x,y,radius).stroke({color,width:2.5,alpha});
      if(p.kind==='meteor')traceMeteorStar(heads,x,y,20*scale).fill({color,alpha}).stroke({color:0xffffff,width:1.5,alpha});
      else drawBounceSymbol(heads,x,y,17*scale,{color,alpha});
    }
    for(const p of this.effects.items){const age=p.age-(p.delay||0);if(age<0)continue;const t=age/p.life,x=this.x(p.lane),color=palette[p.lane];let kind=['ring','miss'].includes(p.kind)?'ring':p.kind==='flash'?'glow':p.kind==='streak'?'streak':'spark';const s=this.sprite(this.fxPool,this.effectLayer,fi++,kind);s.tint=p.kind==='miss'?0xd487a3:color;s.position.set(x,this.hitY);s.alpha=(1-t)**2;
      if(p.kind==='ring'){s.scale.set(.4+Math.sin(t*Math.PI/2)*1.55);s.alpha=(1-t)*.95;}
      else if(p.kind==='flash'){s.scale.set(.35+t*.65);s.alpha=(1-t)*.95;}
      else if(p.kind==='miss'){s.scale.set(1+t*.4,.2);s.alpha=(1-t)*.6;}
      else {const distance=p.speed*age*(1-t*.35);s.position.set(x+Math.cos(p.angle)*distance,this.hitY+Math.sin(p.angle)*distance+age*age*65);s.rotation=p.kind==='streak'?p.angle:age*5;s.scale.set(p.kind==='streak'?.45*(1-t):p.size/10*(1-t*.65));}
    }
    for(let i=ni;i<this.notePool.length;i++)this.notePool[i].visible=false;for(let i=fi;i<this.fxPool.length;i++)this.fxPool[i].visible=false;
    this.app.render();
  }
}
