export function installDifficultySwitch(){
 const group=document.querySelector('.liquid-switch');if(!group)return;
 const indicator=group.querySelector('.difficulty-indicator'),buttons=[...group.querySelectorAll('button[data-difficulty]')];
 let animation=null;
 function sync(animate=true){
  const target=buttons.find(b=>b.getAttribute('aria-pressed')==='true')||buttons[0];
  const from=new DOMMatrixReadOnly(getComputedStyle(indicator).transform).m41,x=target.offsetLeft-5;
  animation?.cancel();animation=null;indicator.style.width=target.offsetWidth+'px';indicator.style.transform=`translateX(${x}px)`;
  if(!animate||matchMedia('(prefers-reduced-motion: reduce)').matches||Math.abs(x-from)<.5)return;
  animation=indicator.animate([{transform:`translateX(${from}px)`},{transform:`translateX(${x}px)`}],{duration:240,easing:'cubic-bezier(.22,.7,.25,1)'});
  animation.onfinish=()=>{animation=null;};
 }
 new ResizeObserver(()=>sync(false)).observe(group);
 new MutationObserver(()=>sync()).observe(group,{subtree:true,attributes:true,attributeFilter:['aria-pressed']});
 buttons.forEach((b,i)=>b.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;buttons[next].focus();buttons[next].click();}));
 sync(false);
}
