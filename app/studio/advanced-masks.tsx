import type {ShapeMask} from '@/lib/motion-schema';
/** Each stage composes alpha without destroying the earlier mask's holes. */
export function AdvancedMasks({masks,width:w,height:h,id}:{masks:ShapeMask[];width:number;height:number;id:string}){
 const enabled=masks.filter(m=>m.enabled);
 return <>{enabled.map((m,i)=>{const key=id+'-'+i,shape=m.shape==='ellipse'?<ellipse cx={(m.x+m.width/2)*w} cy={(m.y+m.height/2)*h} rx={m.width*w/2} ry={m.height*h/2}/>:m.shape==='polygon'?<polygon points={m.points?.map(p=>`${(m.x+p.x*m.width)*w},${(m.y+p.y*m.height)*h}`).join(' ')}/>:<rect x={m.x*w} y={m.y*h} width={m.width*w} height={m.height*h}/>;return <g key={m.id}>
 <filter id={key+'-shape-fx'} x="0" y="0" width={w} height={h} filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">{m.feather>0&&<feGaussianBlur stdDeviation={m.feather}/>}<feComponentTransfer><feFuncA type="linear" slope={m.invert?-m.density:m.density} intercept={m.invert?m.density:0}/></feComponentTransfer></filter>
 <mask id={key+'-shape'} maskUnits="userSpaceOnUse" x="0" y="0" width={w} height={h} style={{maskType:'alpha'}}><g fill="white" filter={`url(#${key}-shape-fx)`}>{shape}</g></mask>
 <filter id={key+'-inverse'} x="0" y="0" width={w} height={h} filterUnits="userSpaceOnUse"><feComponentTransfer><feFuncA type="linear" slope="-1" intercept="1"/></feComponentTransfer></filter>
 <mask id={key+'-subtract'} maskUnits="userSpaceOnUse" x="0" y="0" width={w} height={h} style={{maskType:'alpha'}}><g filter={`url(#${key}-inverse)`}><rect width={w} height={h} fill="white" mask={`url(#${key}-shape)`}/></g></mask>
 <mask id={i===enabled.length-1?id:key} maskUnits="userSpaceOnUse" x="0" y="0" width={w} height={h} style={{maskType:'alpha'}}>{m.operation==='add'?<>{i>0&&<rect width={w} height={h} fill="white" mask={`url(#${id}-${i-1})`}/>}<rect width={w} height={h} fill="white" mask={`url(#${key}-shape)`}/></>:<g mask={i>0?`url(#${id}-${i-1})`:undefined}><rect width={w} height={h} fill="white" mask={`url(#${key}${m.operation==='subtract'?'-subtract':'-shape'})`}/></g>}</mask>
 </g>;})}</>;
}
