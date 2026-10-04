// Rounded tips and concave shoulders: one outline shared by Canvas and Pixi.
export function traceMeteorStar(g,x,y,r){
 const m=(a,b)=>g.moveTo(x+a*r,y+b*r);
 const c=(a,b,d,e,f,h)=>g.bezierCurveTo(x+a*r,y+b*r,x+d*r,y+e*r,x+f*r,y+h*r);
 m(-.09,-.87);c(-.07,-1.04,.07,-1.04,.09,-.87);c(.15,-.3,.3,-.15,.87,-.09);
 c(1.04,-.07,1.04,.07,.87,.09);c(.3,.15,.15,.3,.09,.87);
 c(.07,1.04,-.07,1.04,-.09,.87);c(-.15,.3,-.3,.15,-.87,.09);
 c(-1.04,.07,-1.04,-.07,-.87,-.09);c(-.3,-.15,-.15,-.3,-.09,-.87);
 g.closePath();return g;
}
