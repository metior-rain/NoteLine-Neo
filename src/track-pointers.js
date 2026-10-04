// Pointer capture keeps a continuous finger contact alive across lane boundaries.
export function bindTrackPointers(canvas,{geometry,enabled,press,slide,release}){
 const contacts=new Map();
 const laneAt=x=>{const {left,width}=geometry();return Math.max(0,Math.min(3,Math.floor((x-left)/width*4)));};
 canvas.onpointerdown=e=>{
  const {left,width,top}=geometry();
  if(!enabled()||e.button!==0||e.clientX<left||e.clientX>left+width||e.clientY<top)return;
  e.preventDefault();canvas.setPointerCapture(e.pointerId);
  const lane=laneAt(e.clientX);contacts.set(e.pointerId,lane);press(lane,'pointer-'+e.pointerId);
 };
 canvas.onpointermove=e=>{
  const from=contacts.get(e.pointerId);if(from===undefined)return;
  e.preventDefault();const to=laneAt(e.clientX);
  if(to!==from){contacts.set(e.pointerId,to);slide(from,to,'pointer-'+e.pointerId);}
 };
 const finish=e=>{const lane=contacts.get(e.pointerId);if(lane===undefined)return;contacts.delete(e.pointerId);release(lane,'pointer-'+e.pointerId);};
 canvas.onpointerup=finish;canvas.onpointercancel=finish;canvas.onlostpointercapture=finish;
 return {clear(){const ids=[...contacts.keys()];contacts.clear();for(const id of ids)if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);}};
}
