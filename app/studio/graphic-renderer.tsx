'use client';
import React from 'react';
import {sceneTree,type SceneNode} from '@/lib/psd-model';
import {atTime,layerTransform,layerActive,Layer,Project,Scene,safeImage,textValue} from '@/lib/studio-model';

let context:CanvasRenderingContext2D|null=null;
const textSizes=new Map<string,number>();
function fittedSize(l:Layer,text:string){
 if(!l.visual?.autoFit||typeof document==='undefined')return l.fontSize;
 const key=JSON.stringify([text,l.fontFamily,l.fontWeight,l.fontSize,l.width,l.height,l.visual.letterSpacing,l.visual.lineHeight]);
 const cached=textSizes.get(key);if(cached!==undefined)return cached;
 context??=document.createElement('canvas').getContext('2d');if(!context)return l.fontSize;
 context.font=`${l.fontWeight} ${l.fontSize}px ${JSON.stringify(l.fontFamily)}`;
 const lines=text.split('\n'),widthScale=Math.min(1,...lines.map(line=>Math.max(0,l.width-Math.max(0,line.length-1)*(l.visual?.letterSpacing||0))/Math.max(1,context!.measureText(line).width)));
 // Leave a small font-rasterization margin: SVG glyph bounds can exceed canvas advances.
 const size=Math.max(1,l.fontSize*Math.min(1,widthScale*.99,l.height/(l.fontSize*(1+(lines.length-1)*(l.visual.lineHeight||1.18)))));
 if(textSizes.size>512)textSizes.clear();textSizes.set(key,size);return size;
}
export function Graphic({scene,time=2,variables={},selected,selectedIds,onSelect,onDrag,guides=false,id='graphic',images={}}:{scene:Scene;time?:number;variables?:Project['variables'];selected?:string;selectedIds?:string[];onSelect?:(id:string,additive?:boolean)=>void;onDrag?:(id:string,x:number,y:number,done:boolean)=>void;guides?:boolean;id?:string;images?:Record<string,string>}){
 const drag=React.useRef<{id:string;x:number;y:number;px:number;py:number}|null>(null);
 const renderNodes=(nodes:SceneNode[]):React.ReactNode=>nodes.map(node=>node.kind==='group'?node.group.visible?<g key={node.group.id} data-group-id={node.group.id} opacity={node.group.opacity}>{renderNodes(node.children)}</g>:null:layerActive(node.layer,time,scene.duration)?renderLayer(node.layer):null);
 const renderLayer=(base:Layer)=>{
  const l=atTime(base,time),v=l.visual||{},text=textValue(l.text,variables),color=textValue(l.color,variables),ref=`${id}-${l.id.replace(/[^a-zA-Z0-9_-]/g,'_')}`;
  const filter=!!(l.shadow||v.glow||v.blur),fill=v.fill==='none'?'none':v.fill==='linear'||v.fill==='radial'?`url(#${ref}-fill)`:color;
  const paint={fill,stroke:textValue(v.stroke||color,variables),strokeWidth:v.strokeWidth||0,paintOrder:'stroke fill' as const};
  const radians=(v.gradientAngle||0)*Math.PI/180,size=fittedSize(l,text),points=v.points||[{x:0,y:1},{x:.5,y:0},{x:1,y:1}],src=textValue(l.src,variables),zoom=v.cropZoom||1;
  return <g key={l.id} data-layer-id={l.id} transform={layerTransform(l)} style={{cursor:onSelect&&!l.locked?'move':undefined}} onPointerDown={e=>{if(!onSelect||l.locked)return;e.stopPropagation();onSelect(l.id,e.shiftKey||e.ctrlKey||e.metaKey);if(onDrag&&!e.shiftKey&&!e.ctrlKey&&!e.metaKey){e.currentTarget.ownerSVGElement?.setPointerCapture(e.pointerId);drag.current={id:l.id,x:base.x,y:base.y,px:e.clientX,py:e.clientY};}}}>
   <defs>
    {v.fill==='linear'&&<linearGradient id={ref+'-fill'} x1={.5-Math.cos(radians)/2} y1={.5-Math.sin(radians)/2} x2={.5+Math.cos(radians)/2} y2={.5+Math.sin(radians)/2}><stop stopColor={color}/><stop offset="1" stopColor={textValue(v.gradientColor||'#233b55',variables)}/></linearGradient>}
    {v.fill==='radial'&&<radialGradient id={ref+'-fill'}><stop stopColor={color}/><stop offset="1" stopColor={textValue(v.gradientColor||'#233b55',variables)}/></radialGradient>}
    {filter&&<filter id={ref+'-fx'} x="-100%" y="-100%" width="300%" height="300%" colorInterpolationFilters="sRGB">{v.blur?<feGaussianBlur stdDeviation={v.blur}/>:null}{v.glow?<feDropShadow dx="0" dy="0" stdDeviation={v.glow} floodColor={textValue(v.glowColor||color,variables)} floodOpacity="1"/>:null}{l.shadow&&<feDropShadow dx={v.shadowX??0} dy={v.shadowY??10} stdDeviation={v.shadowBlur??15} floodColor={textValue(v.shadowColor||'#000000',variables)} floodOpacity=".6"/>}</filter>}
    <clipPath id={ref+'-mask'}>{v.mask==='ellipse'?<ellipse cx={l.width/2} cy={l.height/2} rx={l.width/2} ry={l.height/2}/>:<rect width={l.width} height={l.height} rx={v.mask==='rounded'?l.radius||24:0}/>}</clipPath>
    {l.type==='arrow'&&<marker id={ref+'-arrow'} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill={textValue(v.stroke||color,variables)}/></marker>}
   </defs>
   <g opacity={Math.max(0,Math.min(1,l.opacity))} filter={filter?`url(#${ref}-fx)`:undefined}>
    {l.type==='rect'&&<rect width={l.width} height={l.height} rx={l.radius} {...paint}/>}
    {l.type==='ellipse'&&<ellipse cx={l.width/2} cy={l.height/2} rx={l.width/2} ry={l.height/2} {...paint}/>}
    {(l.type==='line'||l.type==='arrow')&&<line x1="0" y1={l.height/2} x2={l.width} y2={l.height/2} stroke={textValue(v.stroke||color,variables)} strokeWidth={v.strokeWidth||6} markerEnd={l.type==='arrow'?`url(#${ref}-arrow)`:undefined}/>}
    {l.type==='path'&&<path d={points.map((p,i)=>(i?'L':'M')+p.x*l.width+' '+p.y*l.height).join(' ')+(v.closed!==false?' Z':'')} {...paint}/>}
    {l.type==='text'&&<text x={l.textOriginX??(l.align==='center'?l.width/2:l.align==='right'?l.width:0)} y={l.textBaseline??size*.85} textAnchor={l.align==='center'?'middle':l.align==='right'?'end':'start'} fontSize={size} fontFamily={l.fontFamily} fontWeight={l.fontWeight} letterSpacing={v.letterSpacing||0} style={{unicodeBidi:'plaintext'}} {...paint}>{text.split('\n').map((line,i)=><tspan key={i} x={l.textOriginX??(l.align==='center'?l.width/2:l.align==='right'?l.width:0)} dy={i?size*(v.lineHeight||1.18):0}>{line}</tspan>)}</text>}
    {l.type==='image'&&(safeImage(src)?<g clipPath={`url(#${ref}-mask)`}><image href={images[src]||src} x={(l.width-l.width*zoom)*(v.cropX??50)/100} y={(l.height-l.height*zoom)*(v.cropY??50)/100} width={l.width*zoom} height={l.height*zoom} preserveAspectRatio={v.imageFit==='stretch'?'none':v.imageFit==='contain'?'xMidYMid meet':'xMidYMid slice'}/></g>:<g><rect width={l.width} height={l.height} fill="#31465a"/><text x={l.width/2} y={l.height/2} fill="#b8c8d8" fontSize="28" textAnchor="middle">Add image</text></g>)}
   </g>
   {onSelect&&<rect width={l.width} height={l.height} fill="transparent" stroke={(selectedIds||[selected]).includes(l.id)?'#ff994d':'none'} strokeWidth={3}/>}
  </g>;
 };
 return <svg className="graphic" data-testid="graphic" viewBox={`0 0 ${scene.width} ${scene.height}`} xmlns="http://www.w3.org/2000/svg" role="img" aria-label={scene.name} onPointerMove={e=>{if(!drag.current||!onDrag)return;const r=e.currentTarget.getBoundingClientRect(),d=drag.current;onDrag(d.id,Math.round(d.x+(e.clientX-d.px)*scene.width/r.width),Math.round(d.y+(e.clientY-d.py)*scene.height/r.height),false);}} onPointerUp={e=>{if(drag.current&&onDrag){const d=drag.current,r=e.currentTarget.getBoundingClientRect();onDrag(d.id,Math.round(d.x+(e.clientX-d.px)*scene.width/r.width),Math.round(d.y+(e.clientY-d.py)*scene.height/r.height),true);}drag.current=null;}} onPointerCancel={()=>{const d=drag.current;if(d&&onDrag)onDrag(d.id,d.x,d.y,true);drag.current=null;}}>{renderNodes(sceneTree(scene))}{guides&&<rect x={scene.width*.05} y={scene.height*.05} width={scene.width*.9} height={scene.height*.9} fill="none" stroke="#bdcddd55" strokeDasharray="10 9" strokeWidth="2" pointerEvents="none"/>}</svg>;
}
