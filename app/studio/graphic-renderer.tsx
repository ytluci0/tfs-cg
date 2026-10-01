'use client';
import React from 'react';
import {expandRows,resolveLayout,vectorPath,groupTransform} from '@/lib/production-tools';
import {VideoLayer} from './media-layer';
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
export function Graphic({scene:sourceScene,time=2,elapsed=time,variables={},selected,selectedIds,onSelect,onDrag,guides=false,id='graphic',images={}}:{scene:Scene;time?:number;elapsed?:number;variables?:Project['variables'];selected?:string;selectedIds?:string[];onSelect?:(id:string,additive?:boolean)=>void;onDrag?:(id:string,x:number,y:number,done:boolean)=>void;guides?:boolean;id?:string;images?:Record<string,string>}){
 const expanded=React.useMemo(()=>expandRows(sourceScene,variables),[sourceScene,variables]);
 const measure=(l:Layer,text:string)=>{context??=typeof document!=='undefined'?document.createElement('canvas').getContext('2d'):null;if(!context)return text.length*l.fontSize*.6;context.font=`${l.fontWeight} ${l.fontSize}px ${JSON.stringify(l.fontFamily)}`;return Math.max(...text.split('\n').map(line=>context!.measureText(line).width+Math.max(0,line.length-1)*(l.visual?.letterSpacing||0)));};
 const scene=resolveLayout(expanded,time,variables,measure);
 const drag=React.useRef<{id:string;x:number;y:number;px:number;py:number;matrix:DOMMatrix}|null>(null);
 const renderNodes=(nodes:SceneNode[]):React.ReactNode=>nodes.map(node=>node.kind==='group'?node.group.visible?<g key={node.group.id} data-group-id={node.group.id} opacity={node.group.opacity} transform={groupTransform(node.group)}>{renderNodes(node.children)}</g>:null:layerActive(node.layer,time,scene.duration)?renderLayer(node.layer):null);
 const renderLayer=(base:Layer)=>{
  const l=base,v=l.visual||{},rawText=textValue(l.text,variables),seconds=Math.max(0,Math.ceil((Number(rawText)||0)-elapsed)),text=l.type==='countdown'?String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0'):rawText,color=textValue(l.color,variables),ref=`${id}-${l.id.replace(/[^a-zA-Z0-9_-]/g,'_')}`;
  const filter=!!(l.shadow||v.glow||v.blur),fill=v.fill==='none'?'none':v.fill==='linear'||v.fill==='radial'?`url(#${ref}-fill)`:color;
  const paint={fill,stroke:textValue(v.stroke||color,variables),strokeWidth:v.strokeWidth||0,paintOrder:'stroke fill' as const};
  const stops=(v.gradientStops||[{offset:0,color},{offset:1,color:v.gradientColor||'#233b55'}]).slice().sort((a,b)=>a.offset-b.offset);
  const radians=(v.gradientAngle||0)*Math.PI/180,size=fittedSize(l,text),points=v.points||[{x:0,y:1},{x:.5,y:0},{x:1,y:1}],src=textValue(l.src,variables),zoom=v.cropZoom||1;
  return <g key={l.id} clipPath={v.clipLayer?`url(#${id}-clip-${v.clipLayer})`:undefined} style={{mixBlendMode:v.blend||'normal'}}><g data-layer-id={l.id} transform={layerTransform(l)} style={{cursor:onSelect&&!l.locked?'move':undefined}} onPointerDown={e=>{if(!onSelect||l.locked)return;e.stopPropagation();onSelect(l.id.split('~')[0],e.shiftKey||e.ctrlKey||e.metaKey);if(onDrag&&!e.shiftKey&&!e.ctrlKey&&!e.metaKey){e.currentTarget.ownerSVGElement?.setPointerCapture(e.pointerId);const original=sourceScene.layers.find(v=>v.id===l.id.split('~')[0])||l;const matrix=(e.currentTarget.parentElement!.parentElement as unknown as SVGGraphicsElement).getScreenCTM()!.inverse();drag.current={id:original.id,x:original.x,y:original.y,px:e.clientX,py:e.clientY,matrix};}}}>
   <defs>
    {v.fill==='linear'&&<linearGradient id={ref+'-fill'} x1={.5-Math.cos(radians)/2} y1={.5-Math.sin(radians)/2} x2={.5+Math.cos(radians)/2} y2={.5+Math.sin(radians)/2}>{stops.map((s,i)=><stop key={i} offset={s.offset} stopColor={textValue(s.color,variables)}/>)}</linearGradient>}
    {v.fill==='radial'&&<radialGradient id={ref+'-fill'}>{stops.map((s,i)=><stop key={i} offset={s.offset} stopColor={textValue(s.color,variables)}/>)}</radialGradient>}
    {filter&&<filter id={ref+'-fx'} x="-100%" y="-100%" width="300%" height="300%" colorInterpolationFilters="sRGB">{v.blur?<feGaussianBlur stdDeviation={v.blur}/>:null}{v.glow?<feDropShadow dx="0" dy="0" stdDeviation={v.glow} floodColor={textValue(v.glowColor||color,variables)} floodOpacity="1"/>:null}{l.shadow&&<feDropShadow dx={v.shadowX??0} dy={v.shadowY??10} stdDeviation={v.shadowBlur??15} floodColor={textValue(v.shadowColor||'#000000',variables)} floodOpacity=".6"/>}</filter>}
    <clipPath id={ref+'-mask'}>{v.mask==='ellipse'?<ellipse cx={l.width/2} cy={l.height/2} rx={l.width/2} ry={l.height/2}/>:<rect width={l.width} height={l.height} rx={v.mask==='rounded'?l.radius||24:0}/>}</clipPath>
    {l.type==='arrow'&&<marker id={ref+'-arrow'} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill={textValue(v.stroke||color,variables)}/></marker>}
   </defs>
   <g opacity={Math.max(0,Math.min(1,l.opacity))} filter={filter?`url(#${ref}-fx)`:undefined}>
    {l.type==='rect'&&<rect width={l.width} height={l.height} rx={l.radius} {...paint}/>}
    {l.type==='ellipse'&&<ellipse cx={l.width/2} cy={l.height/2} rx={l.width/2} ry={l.height/2} {...paint}/>}
    {(l.type==='line'||l.type==='arrow')&&<line x1="0" y1={l.height/2} x2={l.width} y2={l.height/2} stroke={textValue(v.stroke||color,variables)} strokeWidth={v.strokeWidth||6} markerEnd={l.type==='arrow'?`url(#${ref}-arrow)`:undefined}/>}
    {l.type==='path'&&<path d={vectorPath(l)} {...paint}/>}
    {(l.type==='text'||l.type==='countdown')&&<text x={l.textOriginX??(l.align==='center'?l.width/2:l.align==='right'?l.width:0)} y={l.textBaseline??size*.85} textAnchor={l.align==='center'?'middle':l.align==='right'?'end':'start'} fontSize={size} fontFamily={l.fontFamily} fontWeight={l.fontWeight} letterSpacing={v.letterSpacing||0} style={{unicodeBidi:'plaintext'}} {...paint}>{text.split('\n').map((line,i)=><tspan key={i} x={l.textOriginX??(l.align==='center'?l.width/2:l.align==='right'?l.width:0)} dy={i?size*(v.lineHeight||1.18):0}>{line}</tspan>)}</text>}
    {l.type==='ticker'&&<g clipPath={`url(#${ref}-mask)`}>{Array.from({length:Math.min(100,Math.ceil(l.width/Math.max(1,measure(l,text)+(l.ticker?.gap??80)))+2)},(_,i)=>{const span=Math.max(1,measure(l,text)+(l.ticker?.gap??80)),offset=((elapsed*(l.ticker?.speed??100))%span+span)%span;return <text key={i} x={i*span-offset} y={l.fontSize*.85} fontSize={l.fontSize} fontFamily={l.fontFamily} fontWeight={l.fontWeight} {...paint}>{text}</text>;})}</g>}
    {l.type==='video'&&(l.src.startsWith('/api/assets/')?<VideoLayer layer={l} src={images[src]||src} elapsed={elapsed}/>:<text fill="#eaba80" fontSize="24">Import a local video</text>)}
    {l.type==='image'&&(safeImage(src)?<g clipPath={`url(#${ref}-mask)`}><image href={images[src]||src} x={(l.width-l.width*zoom)*(v.cropX??50)/100} y={(l.height-l.height*zoom)*(v.cropY??50)/100} width={l.width*zoom} height={l.height*zoom} preserveAspectRatio={v.imageFit==='stretch'?'none':v.imageFit==='contain'?'xMidYMid meet':'xMidYMid slice'}/></g>:<g><rect width={l.width} height={l.height} fill="#31465a"/><text x={l.width/2} y={l.height/2} fill="#b8c8d8" fontSize="28" textAnchor="middle">Add image</text></g>)}
   </g>
   {onSelect&&<rect width={l.width} height={l.height} fill="transparent" stroke={(selectedIds||[selected]).includes(l.id.split('~')[0])?'#ff994d':'none'} strokeWidth={3}/>}
  </g></g>;
 };
 return <svg className="graphic" data-testid="graphic" viewBox={`0 0 ${scene.width} ${scene.height}`} xmlns="http://www.w3.org/2000/svg" role="img" aria-label={scene.name} onPointerMove={e=>{if(!drag.current||!onDrag)return;const r=e.currentTarget.getBoundingClientRect(),d=drag.current;onDrag(d.id,Math.round(d.x+(e.clientX-d.px)*d.matrix.a+(e.clientY-d.py)*d.matrix.c),Math.round(d.y+(e.clientX-d.px)*d.matrix.b+(e.clientY-d.py)*d.matrix.d),false);}} onPointerUp={e=>{if(drag.current&&onDrag){const d=drag.current,r=e.currentTarget.getBoundingClientRect();onDrag(d.id,Math.round(d.x+(e.clientX-d.px)*d.matrix.a+(e.clientY-d.py)*d.matrix.c),Math.round(d.y+(e.clientX-d.px)*d.matrix.b+(e.clientY-d.py)*d.matrix.d),true);}drag.current=null;}} onPointerCancel={()=>{const d=drag.current;if(d&&onDrag)onDrag(d.id,d.x,d.y,true);drag.current=null;}}><defs>{scene.layers.filter(l=>['rect','ellipse','path'].includes(l.type)).map(l=><clipPath key={l.id} id={`${id}-clip-${l.id}`} clipPathUnits="userSpaceOnUse"><g transform={layerTransform(l)} clipPath={l.visual?.clipLayer?`url(#${id}-clip-${l.visual.clipLayer})`:undefined}>{l.type==='ellipse'?<ellipse cx={l.width/2} cy={l.height/2} rx={l.width/2} ry={l.height/2}/>:l.type==='path'?<path d={vectorPath(l)}/>:<rect width={l.width} height={l.height} rx={l.radius}/>}</g></clipPath>)}</defs>{renderNodes(sceneTree(scene))}{guides&&<rect x={scene.width*.05} y={scene.height*.05} width={scene.width*.9} height={scene.height*.9} fill="none" stroke="#bdcddd55" strokeDasharray="10 9" strokeWidth="2" pointerEvents="none"/>}</svg>;
}
