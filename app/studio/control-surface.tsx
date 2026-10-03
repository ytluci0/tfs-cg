'use client';
import {useEffect,useLayoutEffect,useRef,useState,type ReactNode,type PointerEvent} from 'react';
import {MoveDiagonal2,Lock,Hand,Minus,Plus,Maximize2,Minimize2} from 'lucide-react';
import type {Control,Panel} from '@/lib/studio-model';
import {controlBounds,panelSize,type ControlBounds} from '@/lib/panel-layout';
import {expandSelection,isControlLocked,moveSelection,resizeSelection,selectionBounds} from '@/lib/panel-builder';

type Gesture={kind:'move'|'resize'|'box';pointer:number;x:number;y:number;scale:number;document:Panel;before:Panel;ids:string[];originalSelection:string[];additive:boolean;next:Panel};
export function ControlSurface({panel,building,selected,onSelect,onCommit,onDelete,onDuplicate,onGroup,zoom='workspace',onZoomChange,expanded=false,onExpand,children}:{panel:Panel;building:boolean;selected:string[];onSelect:(ids:string[])=>void;onCommit:(panel:Panel)=>void;onDelete:()=>void;onDuplicate:()=>void;onGroup:(ungroup:boolean)=>void;zoom?:number|'fit'|'workspace';onZoomChange:(zoom:number|'fit'|'workspace')=>void;expanded?:boolean;onExpand:()=>void;children:(control:Control)=>ReactNode}){
 const surface=useRef<HTMLDivElement>(null),scroll=useRef<HTMLDivElement>(null),gesture=useRef<Gesture|null>(null),[draft,setDraft]=useState<Panel|null>(null),[marquee,setMarquee]=useState<ControlBounds|null>(null),[available,setAvailable]=useState({width:960,height:540});
 const [hand,setHand]=useState(false),[space,setSpace]=useState(false),[panning,setPanning]=useState(false);
 const pan=useRef<{pointer:number;x:number;y:number;left:number;top:number}|null>(null),suppressClick=useRef(false);
 const anchor=useRef<{x:number;y:number;vx:number;vy:number}|'reset'|null>(null);
 const storedSize=panelSize(panel),touch=!building&&panel.touchMode,fill=zoom==='workspace'||touch;
 const size=fill?{width:Math.min(3840,Math.max(storedSize.width,available.width)),height:Math.min(10000,Math.max(storedSize.height,available.height))}:storedSize;
 const scale=fill?1:zoom==='fit'?Math.max(.1,available.width/size.width):zoom as number;
 const workspacePanel=()=>({...panel,canvasWidth:size.width,canvasHeight:size.height,controls:panel.controls.map((c,i)=>({...c,placement:controlBounds(panel,c,i)}))});
 const shown=draft||panel,box=selectionBounds(shown,selected),selectionLocked=panel.controls.some(c=>selected.includes(c.id)&&isControlLocked(panel,c));
 useEffect(()=>{const el=scroll.current;if(!el)return;const observer=new ResizeObserver(()=>setAvailable({width:Math.max(100,el.clientWidth-16),height:Math.max(160,el.clientHeight-16)}));observer.observe(el);return()=>observer.disconnect();},[]);
 useEffect(()=>{cancel();endPan(true);setHand(false);setSpace(false);scroll.current?.scrollTo(0,0);},[panel.id,building,panel.freeLayout]);
 // The display project may be cloned during selection; only a real document change invalidates a drag.
 useEffect(()=>{const g=gesture.current;if(g&&(g.scale!==scale||JSON.stringify(g.document)!==JSON.stringify(panel)))cancel();},[panel,scale]);
 useEffect(()=>{const g=gesture.current;if(g&&g.kind!=='box'&&(g.ids.length!==selected.length||g.ids.some(id=>!selected.includes(id))))cancel();},[selected]);
 useEffect(()=>{const up=(e:KeyboardEvent)=>{if(e.code==='Space')setSpace(false);};const blur=()=>{setSpace(false);cancel();endPan(true);};window.addEventListener('keyup',up);window.addEventListener('blur',blur);return()=>{window.removeEventListener('keyup',up);window.removeEventListener('blur',blur);};},[]);
 useLayoutEffect(()=>{const el=scroll.current,s=surface.current,a=anchor.current;if(!el||!s||!a)return;anchor.current=null;if(a==='reset'){el.scrollTo(0,0);return;}const r=s.getBoundingClientRect(),v=el.getBoundingClientRect();el.scrollLeft+=r.left+a.x*scale-v.left-a.vx;el.scrollTop+=r.top+a.y*scale-v.top-a.vy;},[scale,zoom]);
 function changeZoom(next:number|'fit'|'workspace',point?:{x:number;y:number}){
  if(touch||gesture.current||pan.current)return;const el=scroll.current,s=surface.current;if(!el||!s)return;
  const v=el.getBoundingClientRect(),r=s.getBoundingClientRect(),x=point?.x??v.left+el.clientWidth/2,y=point?.y??v.top+el.clientHeight/2;
  anchor.current=typeof next==='string'?'reset':{x:(x-r.left)/scale,y:(y-r.top)/scale,vx:x-v.left,vy:y-v.top};
  if(next===zoom){if(typeof next==='string')el.scrollTo(0,0);anchor.current=null;}else onZoomChange(typeof next==='string'?next:Math.max(.1,Math.min(4,Number(next.toFixed(3)))));
 }
 useEffect(()=>{const el=scroll.current;if(!el)return;const wheel=(e:WheelEvent)=>{if(!panel.freeLayout||!e.ctrlKey&&!e.metaKey)return;e.preventDefault();changeZoom(scale*Math.exp(-e.deltaY*.002),{x:e.clientX,y:e.clientY});};el.addEventListener('wheel',wheel,{passive:false});return()=>el.removeEventListener('wheel',wheel);},[scale,zoom,touch,panel.freeLayout,onZoomChange]);
 function endPan(cancelled=false){const p=pan.current;if(!p)return;pan.current=null;setPanning(false);const el=scroll.current;if(cancelled)el?.scrollTo(p.left,p.top);if(el?.hasPointerCapture(p.pointer))el.releasePointerCapture(p.pointer);suppressClick.current=true;setTimeout(()=>{suppressClick.current=false;},0);}
 function beginPan(e:PointerEvent<HTMLDivElement>){if(!panel.freeLayout||!(e.button===1||building&&(hand||space)&&e.button===0))return;e.preventDefault();e.stopPropagation();cancel();const el=e.currentTarget;el.focus({preventScroll:true});pan.current={pointer:e.pointerId,x:e.clientX,y:e.clientY,left:el.scrollLeft,top:el.scrollTop};setPanning(true);el.setPointerCapture(e.pointerId);}
 function start(e:PointerEvent<HTMLDivElement>){
  if(!building||e.button!==0||!surface.current)return;
  const tile=(e.target as HTMLElement).closest<HTMLElement>('[data-control-id]'),resize=!!(e.target as HTMLElement).closest('[data-resize]'),id=tile?.dataset.controlId;
  let ids=selected;
  if(id){const clicked=expandSelection(panel,[id],e.altKey);ids=e.shiftKey?selected.some(v=>clicked.includes(v))?selected.filter(v=>!clicked.includes(v)):[...new Set([...selected,...clicked])]:e.altKey?clicked:selected.includes(id)?selected:clicked;onSelect(ids);tile?.focus({preventScroll:true});}
  if(!panel.freeLayout)return;
  if(id&&e.shiftKey)return;
  if((id||resize)&&panel.controls.some(c=>ids.includes(c.id)&&isControlLocked(panel,c)))return;
  const rect=surface.current.getBoundingClientRect();
  gesture.current={kind:id||resize?resize?'resize':'move':'box',pointer:e.pointerId,x:(e.clientX-rect.left)/scale,y:(e.clientY-rect.top)/scale,scale,document:panel,before:fill?workspacePanel():panel,ids,originalSelection:selected,additive:e.shiftKey,next:panel};
  e.currentTarget.setPointerCapture(e.pointerId);e.preventDefault();if(!id&&!resize){surface.current.focus();setMarquee({x:gesture.current.x,y:gesture.current.y,width:0,height:0});if(!e.shiftKey)onSelect([]);}
 }
 function finish(e:PointerEvent<HTMLDivElement>,cancel=false){
  const g=gesture.current;if(!g||g.pointer!==e.pointerId)return;gesture.current=null;setDraft(null);setMarquee(null);
  if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
  if(cancel){if(g.kind==='box')onSelect(g.originalSelection);return;}
  if(g.kind!=='box'&&JSON.stringify(g.before.controls)!==JSON.stringify(g.next.controls))onCommit(g.next);
 }
 function cancel(){const g=gesture.current;if(!g)return;gesture.current=null;setDraft(null);setMarquee(null);if(g.kind==='box')onSelect(g.originalSelection);}
 return <>{panel.freeLayout&&<div className="panel-canvas-toolbar" role="toolbar" aria-label="Panel canvas navigation">
  <span className="panel-canvas-info">{panel.controls.length} controls · {size.width} × {size.height}</span>
  <span className="spacer"/>
  {building&&<button type="button" aria-label="Pan panel canvas" aria-pressed={hand} title="Hand tool · Space-drag or middle-drag to pan" onClick={()=>setHand(v=>!v)}><Hand size={14}/></button>}
  <button type="button" aria-label="Zoom out panel" disabled={touch||scale<=.1} onClick={()=>changeZoom(scale/1.2)}><Minus size={14}/></button>
  <label className="panel-tool-select"><select aria-label="Panel zoom" disabled={touch} value={touch?1:zoom} onChange={e=>changeZoom(['fit','workspace'].includes(e.target.value)?e.target.value as 'fit'|'workspace':Number(e.target.value))}><option value="workspace">Fill area · 100%</option><option value="fit">Fit width · {Math.round(scale*100)}%</option>{[...new Set([.25,.5,.75,1,1.25,1.5,2,3,4,...(typeof zoom==='number'?[zoom]:[])])].sort((a,b)=>a-b).map(n=><option key={n} value={n}>{Math.round(n*100)}%</option>)}</select></label>
  <button type="button" aria-label="Zoom in panel" disabled={touch||scale>=4} onClick={()=>changeZoom(scale*1.2)}><Plus size={14}/></button>
  <button type="button" disabled={touch} aria-pressed={zoom==='workspace'} onClick={()=>changeZoom('workspace')}>Fill area</button><button type="button" disabled={touch} onClick={()=>changeZoom('fit')}>Fit width</button><button type="button" disabled={touch} onClick={()=>changeZoom(1)}>100%</button>
  {building&&<button type="button" aria-label={expanded?'Restore panel sidebars':'Expand panel canvas'} aria-pressed={expanded} onClick={onExpand}>{expanded?<Minimize2 size={14}/>:<Maximize2 size={14}/>}<span>{expanded?'Show panels':'Canvas only'}</span></button>}
  <span className="panel-canvas-help">{touch?'Touch · 100%':building?'Ctrl+wheel zoom · Space-drag pan':'Ctrl+wheel zoom · Middle-drag pan'}</span>
 </div>}
 <div ref={scroll} tabIndex={panel.freeLayout?0:undefined} aria-label={panel.freeLayout?'Panel canvas viewport':undefined} className={panel.freeLayout?'free-controls-scroll panel-canvas-scroll'+(building&&(hand||space)?' hand-ready':'')+(panning?' is-panning':''):''}
  onPointerDownCapture={beginPan} onPointerMoveCapture={e=>{const p=pan.current;if(!p||p.pointer!==e.pointerId)return;e.preventDefault();e.stopPropagation();e.currentTarget.scrollTo(p.left-e.clientX+p.x,p.top-e.clientY+p.y);}}
  onPointerUpCapture={e=>{if(pan.current?.pointer===e.pointerId){e.preventDefault();e.stopPropagation();endPan();}}} onPointerCancel={e=>{if(pan.current?.pointer===e.pointerId)endPan(true);}} onLostPointerCapture={e=>{if(pan.current?.pointer===e.pointerId)endPan(true);}}
  onClickCapture={e=>{if(suppressClick.current||building&&(hand||space)){e.preventDefault();e.stopPropagation();}}} onAuxClick={e=>{if(e.button===1)e.preventDefault();}}
  onKeyDownCapture={e=>{if((e.target as HTMLElement).closest('input,textarea,select,[contenteditable=true],[role=combobox]'))return;if(e.key==='Escape'){if(pan.current){e.preventDefault();e.stopPropagation();endPan(true);}setSpace(false);setHand(false);}if(building&&e.code==='Space'){e.preventDefault();e.stopPropagation();setSpace(true);}}}>
 <div className={panel.freeLayout?'panel-canvas-extent':''} style={panel.freeLayout?{width:size.width*scale,height:size.height*scale}:undefined}>
 <div ref={surface} tabIndex={building?0:undefined} className={panel.freeLayout?'free-controls '+(building?'editing':''):'control-grid'} role="group" aria-label="Custom control canvas" style={panel.freeLayout?{width:size.width,height:size.height,transform:`scale(${scale})`,transformOrigin:'0 0',backgroundSize:(panel.snapGrid||16)+'px '+(panel.snapGrid||16)+'px'}:{gridTemplateColumns:`repeat(${panel.columns},minmax(0,1fr))`}}
  onPointerDown={start} onPointerMove={e=>{
   const g=gesture.current;if(!g||g.pointer!==e.pointerId||!surface.current)return;const rect=surface.current.getBoundingClientRect(),x=(e.clientX-rect.left)/g.scale,y=(e.clientY-rect.top)/g.scale,dx=x-g.x,dy=y-g.y;
   if(g.kind==='box'){const b={x:Math.min(x,g.x),y:Math.min(y,g.y),width:Math.abs(dx),height:Math.abs(dy)};setMarquee(b);const hits=panel.controls.flatMap((c,i)=>{const p=controlBounds(panel,c,i);return !c.hidden&&b.x<p.x+p.width&&b.x+b.width>p.x&&b.y<p.y+p.height&&b.y+b.height>p.y?[c.id]:[];});onSelect([...new Set([...(g.additive?g.originalSelection:[]),...expandSelection(panel,hits)])]);return;}
   const original=selectionBounds(g.before,g.ids)!;const snap=e.altKey?0:panel.snapGrid||0;
   g.next=g.kind==='move'?moveSelection(g.before,g.ids,dx,dy,snap):resizeSelection(g.before,g.ids,snap?Math.round((original.width+dx)/snap)*snap:original.width+dx,snap?Math.round((original.height+dy)/snap)*snap:original.height+dy,e.shiftKey);setDraft(g.next);
  }} onPointerUp={e=>finish(e)} onPointerCancel={e=>finish(e,true)} onLostPointerCapture={e=>finish(e,true)} onKeyDown={e=>{
   if(!building||(e.target as HTMLElement).closest('input,textarea,[role=combobox]'))return;
   if(e.key==='Escape'){e.preventDefault();cancel();return;}
   const tile=(e.target as HTMLElement).closest<HTMLElement>('[data-control-id]'),id=tile?.dataset.controlId;
   const ids=id&&!selected.includes(id)?expandSelection(panel,[id]):selected;
   if((e.key==='Enter'||e.key===' ')&&id){e.preventDefault();onSelect(expandSelection(panel,[id]));return;}
   if(e.ctrlKey||e.metaKey){const key=e.key.toLowerCase();if(key==='a'){e.preventDefault();onSelect(panel.controls.filter(c=>!c.hidden).map(c=>c.id));}if(key==='d'){e.preventDefault();onDuplicate();}if(key==='g'){e.preventDefault();onGroup(e.shiftKey);}return;}
   if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();onDelete();return;}
   if(!panel.freeLayout||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
   e.preventDefault();const step=e.shiftKey?10:1,dx=e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0,dy=e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0;
   onSelect(ids);const working=fill?workspacePanel():panel,b=selectionBounds(working,ids);if(!b)return;onCommit((e.target as HTMLElement).closest('[data-resize]')?resizeSelection(working,ids,b.width+dx,b.height+dy):moveSelection(working,ids,dx,dy));
  }}>
  {shown.controls.map((c,index)=>{
   if(c.hidden&&!building)return null;const b=controlBounds(shown,c,index),locked=isControlLocked(panel,c),group=panel.groups?.find(g=>g.id===c.groupId);
   return <div key={c.id} tabIndex={building?0:undefined} role="group" aria-label={building?c.label+(group?' · '+group.name:'')+(locked?' · locked':''):undefined} data-control-id={c.id} data-selected={selected.includes(c.id)} className={'control-tile '+(c.artwork||c.kind==='artwork'?'art-control-tile ':'')+(building&&selected.includes(c.id)?'selected ':'')+(building&&c.hidden?'panel-item-hidden ':'')+(locked?'panel-item-locked':'')} style={{zIndex:"auto",borderTopColor:c.color,...(panel.freeLayout?{position:'absolute',left:b.x,top:b.y,width:b.width,height:b.height}:{gridColumn:`span ${Math.min(c.span,panel.columns)}`})}}>
    {children(c)}{building&&locked&&<span className="panel-lock-badge"><Lock size={12}/></span>}
   </div>;
  })}
  {building&&panel.freeLayout&&box&&<div className="panel-selection-box" style={{left:box.x,top:box.y,width:box.width,height:box.height}}><span className="panel-selection-measure">{selected.length} selected · {box.width} × {box.height}</span>{!selectionLocked&&<button type="button" data-resize className="control-resize" aria-label="Resize selected controls" title="Drag to resize selection. Shift preserves proportions; arrows resize."><MoveDiagonal2 size={15}/></button>}</div>}
  {marquee&&<div className="panel-marquee" style={{left:marquee.x,top:marquee.y,width:marquee.width,height:marquee.height}}/>}
 </div></div></div></>;
}
