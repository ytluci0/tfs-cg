import {z} from 'zod';
const point=z.object({x:z.number().min(0).max(1),y:z.number().min(0).max(1)});
export const layerMaskSchema=z.object({enabled:z.boolean(),invert:z.boolean(),density:z.number().min(0).max(1),feather:z.number().min(0).max(100),shape:z.enum(['full','rectangle','ellipse','polygon']),x:z.number().min(0).max(1),y:z.number().min(0).max(1),width:z.number().min(.0001).max(1),height:z.number().min(.0001).max(1),points:z.array(point).max(100).optional(),strokes:z.array(z.object({mode:z.enum(['hide','reveal']),size:z.number().min(.001).max(1),points:z.array(point).min(1).max(300)})).max(100).optional()});
export type LayerMask=z.infer<typeof layerMaskSchema>;
export const defaultLayerMask=():LayerMask=>({enabled:true,invert:false,density:1,feather:0,shape:'full',x:0,y:0,width:1,height:1,strokes:[]});
