import {useId} from 'react';
import {resolvedArtPart,type ButtonArt,type ArtState} from '@/lib/button-art';
import {textValue,safeImage,type Project} from '@/lib/studio-model';
export function ButtonArtwork({art,variables,state='normal',select,selected}:{art:ButtonArt;variables:Project['variables'];state?:ArtState;select?:(id:string)=>void;selected?:string}){
 const root=useId().replace(/[^a-zA-Z0-9_-]/g,'');
 return <svg className="button-artwork" viewBox={`0 0 ${art.width} ${art.height}`} preserveAspectRatio={art.fit==='contain'?'xMidYMid meet':'none'} aria-hidden={!select} role={select?'img':undefined} aria-label={select?'Button artwork canvas':undefined}>
  {art.parts.map(base=>{const p=resolvedArtPart(base,state),id=root+'-'+p.id.replace(/[^a-zA-Z0-9_-]/g,'_'),value=(s:string)=>textValue(s,variables),fill=p.gradient?`url(#${id})`:value(p.fill),paint={fill,stroke:value(p.stroke),strokeWidth:p.strokeWidth,vectorEffect:'non-scaling-stroke' as const},r=p.angle*Math.PI/180;return <g key={p.id} data-art-part={p.id} opacity={p.visible?p.opacity:(select ? .12 : 0)} transform={`translate(${p.x} ${p.y}) rotate(${p.rotation} ${p.width/2} ${p.height/2})`} onPointerDown={select?e=>{e.stopPropagation();select(p.id);}:undefined}>
   {p.gradient&&<defs><linearGradient id={id} x1={.5-Math.cos(r)/2} y1={.5-Math.sin(r)/2} x2={.5+Math.cos(r)/2} y2={.5+Math.sin(r)/2}><stop offset="0" stopColor={value(p.fill)}/><stop offset="1" stopColor={value(p.gradient)}/></linearGradient></defs>}
   {p.kind==='rect'&&<rect width={p.width} height={p.height} rx={p.radius} {...paint}/>}{p.kind==='ellipse'&&<ellipse cx={p.width/2} cy={p.height/2} rx={p.width/2} ry={p.height/2} {...paint}/>}{p.kind==='line'&&<line x1="0" y1={p.height/2} x2={p.width} y2={p.height/2} stroke={value(p.stroke)} strokeWidth={p.strokeWidth||2} vectorEffect="non-scaling-stroke"/>}
   {p.kind==='polygon'&&<polygon points={(p.points||[{x:.5,y:0},{x:1,y:1},{x:0,y:1}]).map(p2=>`${p2.x*p.width},${p2.y*p.height}`).join(' ')} {...paint}/>}
   {p.kind==='image'&&(safeImage(value(p.image))?<image href={value(p.image)} width={p.width} height={p.height} preserveAspectRatio={p.imageFit==='stretch'?'none':p.imageFit==='contain'?'xMidYMid meet':'xMidYMid slice'}/>:select&&<rect width={p.width} height={p.height} fill="#41536a"/>)}
   {p.kind==='text'&&<text x={p.align==='center'?p.width/2:p.align==='right'?p.width:0} y={p.fontSize} textAnchor={p.align==='center'?'middle':p.align==='right'?'end':'start'} fontFamily={p.fontFamily} fontWeight={p.fontWeight} fontSize={p.fontSize} {...paint}>{value(p.text).split('\n').map((line,i)=><tspan key={i} x={p.align==='center'?p.width/2:p.align==='right'?p.width:0} dy={i?p.fontSize*1.2:0}>{line}</tspan>)}</text>}
   {select&&<rect width={p.width} height={p.height} fill="transparent" stroke={selected===p.id?'#65d5ff':'none'} strokeWidth="1" vectorEffect="non-scaling-stroke"/>}
  </g>;})}
 </svg>;
}
