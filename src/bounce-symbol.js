// A hollow elastic ball with two directional marks, distinct from filled tap orbs.
export function drawBounceSymbol(g,x,y,r,{color,accent=color,alpha=1,sx=1,sy=1}){
 g.ellipse(x,y,r*1.4*sx,r*1.4*sy).stroke({color:accent,width:1.6,alpha:alpha*.65});
 g.ellipse(x,y,r*sx,r*sy).fill({color,alpha}).stroke({color:0xffffff,width:2,alpha});
 g.ellipse(x,y,r*.65*sx,r*.65*sy).fill({color:0xffffff,alpha:alpha*.98});
 const line=points=>{points.forEach(([px,py],i)=>g[i?'lineTo':'moveTo'](x+px*r*sx,y+py*r*sy));g.stroke({color,width:2.5,alpha});};
 line([[-.24,-.17],[0,-.39],[.24,-.17]]);line([[-.24,.17],[0,.39],[.24,.17]]);
}
