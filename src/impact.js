// All animation uses seconds; music judgement never uses this visual clock.
export class ImpactField {
  constructor(random = Math.random, reduced = false) { this.random=random; this.reduced=reduced; this.items=[]; this.kicks=[0,0,0,0]; this.energy=[0,0,0,0]; this.holdDebt=[0,0,0,0]; this.shake=0; }
  add(p) { if(this.items.length>=480)this.items.shift();this.items.push({...p,age:0}); }
  burst(lane, rating, tail=false) {
    if(rating==='miss'||rating==='break'){this.add({lane,kind:'miss',life:.3,angle:0,speed:0});this.kicks[lane]=.35;return;}
    this.kicks[lane]=1;this.energy[lane]=1;this.shake=this.reduced?0:1;
    const perfect=rating==='perfect';
    this.add({lane,kind:'ring',life:.5,angle:0,speed:0});
    this.add({lane,kind:'flash',life:.16,angle:0,speed:0});
    if(perfect&&!this.reduced)this.add({lane,kind:'ring',life:.7,angle:0,speed:0,delay:.07});
    const count=this.reduced?4:tail?28:perfect?22:14;
    for(let i=0;i<count;i++)this.add({lane,kind:i%3===0?'streak':'spark',life:.28+this.random()*.4,angle:Math.PI*2*i/count+(this.random()-.5)*.3,speed:65+this.random()*175,size:2.5+this.random()*3.5});
  }
  step(dt, holds, active) {
    dt=Math.max(0,Math.min(dt,.05));this.shake=Math.max(0,this.shake-dt*8);
    for(let lane=0;lane<4;lane++){
      this.kicks[lane]=Math.max(0,this.kicks[lane]-dt*5);this.energy[lane]=Math.max(0,this.energy[lane]-dt*3.5);
      if(active&&holds[lane]){this.holdDebt[lane]+=dt;const interval=this.reduced?.12:.035;while(this.holdDebt[lane]>=interval){this.holdDebt[lane]-=interval;this.add({lane,kind:'flow',life:.45,angle:-Math.PI/2+(this.random()-.5)*.8,speed:75+this.random()*90,size:2+this.random()*2});}}
      else this.holdDebt[lane]=0;
    }
    for(const p of this.items)p.age+=dt;
    this.items=this.items.filter(p=>p.age<p.life+(p.delay||0));
  }
  reset(){this.items=[];this.kicks.fill(0);this.energy.fill(0);this.holdDebt.fill(0);this.shake=0;}
}
