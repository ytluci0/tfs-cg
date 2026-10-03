import {z} from 'zod';

const number=z.number().finite();
const color=z.string().max(100);
export const curvePointSchema=z.object({x:number.min(-20000).max(20000),y:number.min(-20000).max(20000),inX:number.min(-40000).max(40000).optional(),inY:number.min(-40000).max(40000).optional(),outX:number.min(-40000).max(40000).optional(),outY:number.min(-40000).max(40000).optional()});
export const effectSchema=z.object({id:z.string().min(1).max(100),type:z.enum(['brightness','contrast','saturation','hue','blur','shadow','outline']),enabled:z.boolean(),amount:number.min(-360).max(500),color:color.optional(),x:number.min(-200).max(200).optional(),y:number.min(-200).max(200).optional()});
export const typographySchema=z.object({direction:z.enum(['auto','ltr','rtl']).optional(),wrap:z.boolean().optional(),paragraphSpacing:number.min(0).max(500).optional(),runs:z.array(z.object({start:number.int().min(0).max(20000),end:number.int().min(0).max(20000),fontFamily:z.string().max(100).optional(),fontSize:number.min(1).max(2000).optional(),fontWeight:number.min(100).max(900).optional(),color:color.optional(),italic:z.boolean().optional(),underline:z.boolean().optional()})).max(200).optional()});
export const textAnimationSchema=z.object({unit:z.enum(['letter','word','line']),effect:z.enum(['fade','slide','reveal','typewriter']),start:number.min(0).max(600),duration:number.min(.01).max(600),stagger:number.min(0).max(10),x:number.min(-2000).max(2000),y:number.min(-2000).max(2000)});
export const motionPathSchema=z.object({points:z.array(curvePointSchema).min(2).max(100),start:number.min(0).max(600),end:number.min(.01).max(600),orient:z.boolean(),ease:z.enum(['linear','smooth']),loop:z.boolean()}).refine(p=>p.end>p.start,'Motion path end must be after its start.');
export const compositionSchema=z.object({sceneId:z.string().min(1).max(100),variables:z.record(z.string().max(100),z.union([z.string().max(20000),number,z.boolean()])),offset:number.min(-600).max(600),speed:number.min(.01).max(20),loop:z.boolean()});
export const compoundSchema=z.object({operation:z.enum(['union','subtract']),width:number.positive().max(20000),height:number.positive().max(20000),paths:z.array(z.object({d:z.string().max(24000).regex(/^[MmLlHhVvCcSsQqTtAaZz0-9eE+.,\s-]+$/),transform:z.tuple([number,number,number,number,number,number])})).min(2).max(50)});
export const guideSchema=z.object({id:z.string().min(1).max(100),axis:z.enum(['x','y']),position:number.min(-20000).max(20000),locked:z.boolean()});
export type CurvePoint=z.infer<typeof curvePointSchema>;
export type LayerEffect=z.infer<typeof effectSchema>;

export function sampleCurve(points:CurvePoint[],progress:number){
 const position=Math.max(0,Math.min(1,progress))*(points.length-1),index=Math.min(points.length-2,Math.floor(position)),t=position-index,a=points[index],b=points[index+1],u=1-t;
 if(a.outX===undefined&&a.outY===undefined&&b.inX===undefined&&b.inY===undefined)return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,rotation:Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI};
 const ax=a.outX??a.x,ay=a.outY??a.y,bx=b.inX??b.x,by=b.inY??b.y;
 const x=u*u*u*a.x+3*u*u*t*ax+3*u*t*t*bx+t*t*t*b.x,y=u*u*u*a.y+3*u*u*t*ay+3*u*t*t*by+t*t*t*b.y;
 const dx=3*u*u*(ax-a.x)+6*u*t*(bx-ax)+3*t*t*(b.x-bx),dy=3*u*u*(ay-a.y)+6*u*t*(by-ay)+3*t*t*(b.y-by);
 return{x,y,rotation:Math.atan2(dy,dx)*180/Math.PI};
}
export function curvePath(points:CurvePoint[],closed=false){return points.length?`M ${points[0].x} ${points[0].y} `+points.slice(1).map((p,i)=>{const a=points[i];return `C ${a.outX??a.x} ${a.outY??a.y} ${p.inX??p.x} ${p.inY??p.y} ${p.x} ${p.y}`;}).join(' ')+(closed?` C ${points.at(-1)!.outX??points.at(-1)!.x} ${points.at(-1)!.outY??points.at(-1)!.y} ${points[0].inX??points[0].x} ${points[0].inY??points[0].y} ${points[0].x} ${points[0].y} Z`:''):'';}
