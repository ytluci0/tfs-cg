import {compoundSchema} from './editing-schema.ts';
import {z} from 'zod';
import {layerMaskSchema} from './design-schema.ts';

export const bezierSchema=z.tuple([z.number().min(0).max(1),z.number().min(-2).max(3),z.number().min(0).max(1),z.number().min(-2).max(3)]);
export const appearanceSchema=z.object({
 background:z.string().max(100).optional(),foreground:z.string().max(100).optional(),borderColor:z.string().max(100).optional(),
 borderWidth:z.number().min(0).max(20).optional(),radius:z.number().min(0).max(150).optional(),
 fontSize:z.number().min(10).max(200).optional(),fontFamily:z.string().max(100).optional(),fontWeight:z.number().min(100).max(900).optional(),
 icon:z.string().max(16).optional(),image:z.string().max(2000).optional(),label:z.string().max(100).optional(),
});
export const visualSchema=z.object({
 compound:compoundSchema.optional(),layerMask:layerMaskSchema.optional(),
 blend:z.enum(['normal','multiply','screen','overlay','darken','lighten','difference','exclusion']).optional(),clipLayer:z.string().max(100).optional(),gradientStops:z.array(z.object({offset:z.number().min(0).max(1),color:z.string().max(100)})).min(2).max(12).optional(),
 fill:z.enum(['solid','linear','radial','none']).optional(),gradientColor:z.string().max(100).optional(),gradientAngle:z.number().min(-360).max(360).optional(),
 stroke:z.string().max(100).optional(),strokeWidth:z.number().min(0).max(100).optional(),
 strokeCap:z.enum(['butt','round','square']).optional(),strokeJoin:z.enum(['miter','round','bevel']).optional(),
 shadowColor:z.string().max(100).optional(),shadowX:z.number().min(-200).max(200).optional(),shadowY:z.number().min(-200).max(200).optional(),shadowBlur:z.number().min(0).max(100).optional(),
 glowColor:z.string().max(100).optional(),glow:z.number().min(0).max(100).optional(),blur:z.number().min(0).max(50).optional(),
 imageFit:z.enum(['cover','contain','stretch']).optional(),cropX:z.number().min(0).max(100).optional(),cropY:z.number().min(0).max(100).optional(),cropZoom:z.number().min(1).max(10).optional(),mask:z.enum(['none','rounded','ellipse']).optional(),
 autoFit:z.boolean().optional(),letterSpacing:z.number().min(-20).max(100).optional(),lineHeight:z.number().min(.5).max(3).optional(),
 points:z.array(z.object({x:z.number().min(0).max(1),y:z.number().min(0).max(1),inX:z.number().min(-2).max(3).optional(),inY:z.number().min(-2).max(3).optional(),outX:z.number().min(-2).max(3).optional(),outY:z.number().min(-2).max(3).optional()})).min(2).max(100).optional(),closed:z.boolean().optional(),
});
export const cueSchema=z.object({id:z.string().min(1).max(100),name:z.string().trim().min(1).max(100),start:z.number().min(0).max(600),end:z.number().min(0).max(600),loop:z.boolean(),finish:z.enum(['hold','hide'])});
export const optionSchema=z.object({value:z.string().max(500),label:z.string().max(500),photo:z.string().max(2000).optional(),fields:z.record(z.string().max(100),z.union([z.string().max(2000),z.number().finite(),z.boolean()])).optional()});
export const optionSourceSchema=z.object({sourceId:z.string().max(100),rowsPath:z.string().max(300),valuePath:z.string().max(300),labelPath:z.string().max(300),photoPath:z.string().max(300),fields:z.record(z.string().max(100),z.string().max(300)).optional()});
export function bezierProgress(t:number,curve:readonly number[]):number{
 const [x1,y1,x2,y2]=curve;
 const sample=(u:number,a:number,b:number)=>3*(1-u)*(1-u)*u*a+3*(1-u)*u*u*b+u*u*u;
 let lo=0,hi=1;for(let i=0;i<24;i++){const mid=(lo+hi)/2;if(sample(mid,x1,x2)<t)lo=mid;else hi=mid;}
 return sample((lo+hi)/2,y1,y2);
}
