import {layer,type Layer} from './studio-model.ts';
import {drawingBounds,polygonLayer,type Point} from './design-tools.ts';
import {curveLayer} from './editing-tools.ts';

export type SelectionMode='replace'|'add'|'subtract';
export function mergeSelection(current:string[],hits:string[],mode:SelectionMode){
 return mode==='add'?[...new Set([...current,...hits])]:mode==='subtract'?current.filter(id=>!hits.includes(id)):[...new Set(hits)];
}
export function insidePolygon(p:Point,polygon:Point[]){
 let inside=false;
 for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const a=polygon[i],b=polygon[j];
  if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
 }
 return inside;
}
const cross=(a:Point,b:Point,c:Point)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
function intersects(a:Point,b:Point,c:Point,d:Point){
 const between=(x:number,y:number,z:number)=>z>=Math.min(x,y)-1e-7&&z<=Math.max(x,y)+1e-7;
 const on=(x:Point,y:Point,z:Point)=>Math.abs(cross(x,y,z))<1e-7&&between(x.x,y.x,z.x)&&between(x.y,y.y,z.y);
 return cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b);
}
/** Hit testing uses transformed layer quadrilaterals, including rotated/grouped layers. */
export function polygonsOverlap(a:Point[],b:Point[],contained=false){
 if(a.length<3||b.length<3)return false;
 if(contained)return b.every(p=>insidePolygon(p,a));
 return a.some(p=>insidePolygon(p,b))||b.some(p=>insidePolygon(p,a))||a.some((p,i)=>b.some((q,j)=>intersects(p,a[(i+1)%a.length],q,b[(j+1)%b.length])));
}
export function marqueePolygon(a:Point,b:Point,ellipse=false){
 const r=drawingBounds(a,b);
 return ellipse?Array.from({length:48},(_,i)=>({x:r.x+r.width/2+Math.cos(i*Math.PI/24)*r.width/2,y:r.y+r.height/2+Math.sin(i*Math.PI/24)*r.height/2})):[{x:r.x,y:r.y},{x:r.x+r.width,y:r.y},{x:r.x+r.width,y:r.y+r.height},{x:r.x,y:r.y+r.height}];
}
export function shapeFromDrag(kind:string,a:Point,b:Point,square:boolean,color:string,sides=5,inner=.45):Layer{
 const r=drawingBounds(a,b,square);
 if(kind==='rounded-rect')return layer('rect',{...r,name:'Rounded rectangle',color,radius:Math.min(r.width,r.height)*.16});
 const star=kind==='star',count=kind==='triangle'?3:Math.max(3,Math.min(12,Math.round(sides))),n=star?count*2:count;
 const points=Array.from({length:n},(_,i)=>{const angle=i*Math.PI*2/n-Math.PI/2,ratio=star&&i%2?inner:1;return{x:r.x+r.width/2+Math.cos(angle)*r.width/2*ratio,y:r.y+r.height/2+Math.sin(angle)*r.height/2*ratio};});
 return {...polygonLayer(points,color),name:kind==='triangle'?'Triangle':star?'Star':'Regular polygon'};
}
function distance(p:Point,a:Point,b:Point){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}
export function simplifyStroke(points:Point[],tolerance:number):Point[]{
 if(points.length<3)return points;
 let index=0,max=tolerance;for(let i=1;i<points.length-1;i++){const d=distance(points[i],points[0],points.at(-1)!);if(d>max){max=d;index=i;}}
 return index?[...simplifyStroke(points.slice(0,index+1),tolerance).slice(0,-1),...simplifyStroke(points.slice(index),tolerance)]:[points[0],points.at(-1)!];
}
export function brushLayer(points:Point[],color:string,size:number,opacity:number,smoothing=2):Layer{
 if(!points.length)throw Error('Draw a brush stroke first.');
 if(points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))throw Error('Invalid brush position.');
 size=Math.max(1,Math.min(100,size));opacity=Math.max(0,Math.min(1,opacity));
 if(points.every(p=>Math.hypot(p.x-points[0].x,p.y-points[0].y)<.5))return layer('ellipse',{name:'Brush dot',x:points[0].x-size/2,y:points[0].y-size/2,width:size,height:size,color,opacity});
 let reduced=simplifyStroke(points,Math.max(.1,smoothing));for(let tolerance=Math.max(.5,smoothing);reduced.length>100;tolerance*=1.5)reduced=simplifyStroke(points,tolerance);
 const l=curveLayer(reduced,false,color);return {...l,name:'Brush stroke',opacity,visual:{...l.visual,stroke:color,strokeWidth:size,strokeCap:'round',strokeJoin:'round'}};
}
export function fillLayer(original:Layer,color:string,gradient?:{end:string;angle:number;kind:'linear'|'radial'}):Layer{
 if(original.locked)throw Error('Unlock this layer before changing its fill.');
 if(!['rect','ellipse','path','text','line','arrow','ticker','countdown'].includes(original.type))throw Error('Fill tools work on shapes and text. Use masks on photos and videos.');
 if(gradient&&['line','arrow'].includes(original.type))throw Error('Gradient fills work on closed shapes and text.');
 return {...original,color,visual:{...original.visual,fill:gradient?.kind||'solid',...(gradient?{gradientAngle:gradient.angle,gradientColor:gradient.end,gradientStops:[{offset:0,color},{offset:1,color:gradient.end}]}:{gradientStops:undefined,...(['line','arrow'].includes(original.type)||original.visual?.fill==='none'?{stroke:color}:{})})}};
}
