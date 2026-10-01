import type {LayerMask} from '@/lib/design-schema';
/** Luminance masks are shared by the editor, PNG exporter and every output renderer. */
export function LayerMaskDefinition({mask:m,width:w,height:h,id}:{mask:LayerMask;width:number;height:number;id:string}){
 const slope=m.invert?-m.density:m.density,intercept=m.invert?1:1-m.density;
 return <><filter id={id+'-filter'} x="-50%" y="-50%" width="200%" height="200%" colorInterpolationFilters="sRGB">
  {m.feather>0&&<feGaussianBlur stdDeviation={m.feather}/>}
  <feComponentTransfer><feFuncR type="linear" slope={slope} intercept={intercept}/><feFuncG type="linear" slope={slope} intercept={intercept}/><feFuncB type="linear" slope={slope} intercept={intercept}/></feComponentTransfer>
 </filter><mask id={id} maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" x="0" y="0" width={w} height={h} style={{maskType:'luminance'}}>
  <g filter={`url(#${id}-filter)`}>
   <rect x={-w} y={-h} width={w*3} height={h*3} fill={m.shape==='full'?'white':'black'}/>
   {m.shape==='rectangle'&&<rect x={m.x*w} y={m.y*h} width={m.width*w} height={m.height*h} fill="white"/>}
   {m.shape==='ellipse'&&<ellipse cx={(m.x+m.width/2)*w} cy={(m.y+m.height/2)*h} rx={m.width*w/2} ry={m.height*h/2} fill="white"/>}
   {m.shape==='polygon'&&<polygon points={m.points?.map(p=>`${p.x*w},${p.y*h}`).join(' ')} fill="white"/>}
   {m.strokes?.map((s,i)=>s.points.length===1?<circle key={i} cx={s.points[0].x*w} cy={s.points[0].y*h} r={s.size*Math.min(w,h)/2} fill={s.mode==='hide'?'black':'white'}/>:<polyline key={i} points={s.points.map(p=>`${p.x*w},${p.y*h}`).join(' ')} stroke={s.mode==='hide'?'black':'white'} strokeWidth={s.size*Math.min(w,h)} strokeLinecap="round" strokeLinejoin="round" fill="none"/>)}
  </g>
 </mask></>;
}
