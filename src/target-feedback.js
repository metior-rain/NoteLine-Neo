// Contact feedback is independent of scoring, including taps between render frames.
export class TargetFeedback {
 constructor(){this.reset();}
 reset(){this.lanes=Array.from({length:4},()=>({age:Infinity,contact:0,down:false,scale:1,velocity:0}));}
 press(lane){this.lanes[lane].age=0;}
 step(dt,inputs){
  dt=Math.max(0,Math.min(dt,.05));
  for(let lane=0;lane<4;lane++){
   const p=this.lanes[lane],down=!!inputs[lane]?.size;
   if(down&&!p.down)this.press(lane);
   p.down=down;p.age+=dt;
   p.contact+=(Number(down)-p.contact)*(1-Math.exp(-dt*(down?45:16)));
   // One spring controls both axes: press shrinks the circle, release rebounds.
   const goal=down?.88:1-.1*Math.max(0,1-p.age/.12);
   const steps=Math.max(1,Math.ceil(dt*120)),h=dt/steps;
   for(let i=0;i<steps;i++){
    p.velocity+=((goal-p.scale)*676-p.velocity*31.2)*h;
    p.scale+=p.velocity*h;
   }
  }
 }
 appearance(lane,energy=0,reduced=false){
  const p=this.lanes[lane],pulse=Math.max(0,1-p.age/.38);
  return {scale:reduced?1:p.scale,charge:Math.min(1,p.contact*.9+pulse*.65+energy*.6)};
 }
}
