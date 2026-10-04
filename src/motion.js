// Sample a damped spring, then let the compositor play it without per-frame layout.
export function springFrames(from=0,to=1,{stiffness=240,damping=20,duration=700,velocity=0}={}) {
  let x=from,v=velocity;const frames=[],dt=1/240,steps=Math.round(duration/1000/dt);
  for(let i=0;i<=steps;i++){if(i%4===0)frames.push({value:x,offset:i/steps});v+=(-stiffness*(x-to)-damping*v)*dt;x+=v*dt;}
  frames.push({value:to,offset:1});return frames;
}
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const pending=new WeakMap(),buttons=new Map();
export const isUIVisible=el=>!el.hidden&&el.dataset.closing!=='true';
function cancel(el){pending.get(el)?.cancel();pending.delete(el);}
export function setUIVisible(el,visible){
  document.querySelectorAll('[aria-controls]').forEach(control=>{if(control.getAttribute('aria-controls')===el.id){control.setAttribute('aria-expanded',String(visible));control.classList.toggle('active',visible);}});
  const wasVisible=isUIVisible(el);if(wasVisible===visible)return;
  const card=el.matches('.soft-overlay')?el.firstElementChild:null;
  const target=card||el,from=el.hidden?.88:(Number.parseFloat(getComputedStyle(target).scale)||1),alpha=el.hidden?0:(Number.parseFloat(getComputedStyle(el).opacity)||0);
  cancel(el);el.dataset.closing=visible?'false':'true';
  if(reduced()){el.hidden=!visible;return;}
  el.hidden=false;
  const frames=visible?springFrames(from,1,{velocity:.4}):springFrames(from,.94,{duration:220,damping:28});
  const anim=target.animate(frames.map(({value,offset})=>['library','result-overlay'].includes(el.id)?{translate:`0 ${(1-value)*70}px`,offset}:{scale:String(value),offset}),{duration:visible?700:220,easing:'linear'});
  const opacity=el.animate([{opacity:alpha},{opacity:visible?1:0}],{duration:visible?180:180,fill:'both'});
  pending.set(el,anim);
  anim.onfinish=()=>{if(pending.get(el)!==anim)return;el.hidden=!visible;opacity.cancel();anim.cancel();pending.delete(el);};
  anim.oncancel=()=>opacity.cancel();
}
function buttonSpring(el,to,velocity=0){
  const current=Number.parseFloat(getComputedStyle(el).scale)||1;buttons.get(el)?.cancel();buttons.delete(el);if(reduced()||el.disabled)return;
  const animation=el.animate(springFrames(current,to,{stiffness:340,damping:19,duration:550,velocity}).map(({value,offset})=>({scale:String(value),offset})),{duration:550,fill:'forwards'});buttons.set(el,animation);animation.onfinish=()=>{if(to===1&&buttons.get(el)===animation){animation.cancel();buttons.delete(el);}};
}
export function showDialog(el){el.showModal();if(!reduced())el.animate(springFrames(.88,1,{velocity:.4}).map(({value,offset})=>({scale:String(value),offset})),{duration:700});}
export function closeDialog(el,done){if(reduced()){el.close();done?.();return;}const anim=el.animate([{scale:'1',opacity:1},{scale:'.94',opacity:0}],{duration:180,easing:'cubic-bezier(.3,0,.7,1)'});anim.onfinish=()=>{el.close();anim.cancel();done?.();};}
export function installMotion(){
  const editable='input:not([type=range]):not([type=file]):not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=reset]),textarea,[contenteditable=true],[contenteditable=""]';
  const isEditable=event=>event.target.closest?.(editable);
  document.addEventListener('selectstart',event=>{if(!isEditable(event))event.preventDefault();});
  document.addEventListener('dragstart',event=>{if(!isEditable(event))event.preventDefault();});
  document.addEventListener('contextmenu',event=>{if(document.body.classList.contains('player')&&!isEditable(event))event.preventDefault();});
  const paintRange=el=>{const min=Number(el.min||0),max=Number(el.max||100);el.style.setProperty('--range-fill',`${max>min?Math.max(0,Math.min(100,(Number(el.value)-min)/(max-min)*100)):0}%`);};
  requestAnimationFrame(()=>document.querySelectorAll('input[type=range]').forEach(paintRange));
  document.addEventListener('input',e=>{if(e.target.matches('input[type=range]'))paintRange(e.target);});
  const controls='button, a.icon-button, .file-button';
  const reset=()=>{for(const animation of buttons.values())animation.cancel();buttons.clear();};
  window.addEventListener('blur',reset);document.addEventListener('visibilitychange',()=>{if(document.hidden)reset();});
  new MutationObserver(()=>{for(const [el,animation] of buttons)if(!el.isConnected||el.disabled){animation.cancel();buttons.delete(el);}}).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['disabled']});
  const target=e=>{const el=e.target.closest?.(controls);return el?.matches('.song-pick, .gallery-options button')?null:el;};
  document.addEventListener('pointerover',e=>{const el=target(e);if(el&&!el.contains(e.relatedTarget))buttonSpring(el,1.025);});
  document.addEventListener('pointerout',e=>{const el=target(e);if(el&&!el.contains(e.relatedTarget))buttonSpring(el,1);});
  document.addEventListener('pointerdown',e=>{const el=target(e);if(el&&!el.disabled)buttonSpring(el,.91,-1.2);});
  document.addEventListener('pointerup',e=>{const el=target(e);if(el)buttonSpring(el,el.matches(':hover')?1.025:1,2.8);});
  document.addEventListener('pointercancel',e=>{const el=target(e);if(el)buttonSpring(el,1);});
  document.addEventListener('keydown',e=>{const el=target(e);if(el&&['Enter',' '].includes(e.key)&&!e.repeat)buttonSpring(el,.93);});
  document.addEventListener('keyup',e=>{const el=target(e);if(el&&['Enter',' '].includes(e.key))buttonSpring(el,1,2);});
}
