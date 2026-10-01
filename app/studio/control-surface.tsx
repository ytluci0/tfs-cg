'use client';
import {useEffect,useRef,useState,type ReactNode,type PointerEvent} from 'react';
import {MoveDiagonal2,Lock} from 'lucide-react';
import type {Control,Panel} from '@/lib/studio-model';
import {controlBounds,panelSize,type ControlBounds} from '@/lib/panel-layout';
import {expandSelection,isControlLocked,moveSelection,resizeSelection,selectionBounds} from '@/lib/panel-builder';

type Gesture={kind:'move'|'resize'|'box';pointer:number;x:number;y:number;scale:number;before:Panel;ids:string[];originalSelection:string[];additive:boolean;next:Panel};
export function ControlSurface({panel,building,selected,onSelect,onCommit,onDelete,onDuplicate,onGroup,zoom='fit',children}:{panel:Panel;building:boolean;selected:string[];onSelect:(ids:string[])=>void;onCommit:(panel:Panel)=>void;onDelete:()=>void;onDuplicate:()=>void;onGroup:(ungroup:boolean)=>void;zoom?:number|'fit';children:(control:Control)=>ReactNode}){
 const surface=useRef<HTMLDivElement>(null),scroll=useRef<HTMLDivElement>(null),gesture=useRef<Gesture|null>(null),[draft,setDraft]=useState<Panel|null>(null),[marquee,setMarquee]=useState<ControlBounds|null>(null),[available,setAvailable]=useState(960);
 const size=panelSize(panel),scale=!building&&panel.touchMode?1:zoom==='fit'?Math.min(1,available/size.width):zoom;
 const shown=draft||panel,box=selectionBounds(shown,selected),selectionLocked=panel.controls.some(c=>selected.includes(c.id)&&isControlLocked(panel,c));
 useEffect(()=>{const el=scroll.current;if(!el)return;const observer=new ResizeObserver(()=>setAvailable(Math.max(100,el.clientWidth-4)));observer.observe(el);return()=>observer.disconnect();},[]);
 useEffect(()=>{gesture.current=null;setDraft(null);setMarquee(null);},[panel.id]);
 function start(e:PointerEvent<HTMLDivElement>){
  if(!building||e.button!==0||!surface.current)return;
  const tile=(e.target as HTMLElement).closest<HTMLElement>('[data-control-id]'),resize=!!(e.target as HTMLElement).closest('[data-resize]'),id=tile?.dataset.controlId;
  let ids=selected;
  if(id){const clicked=expandSelection(panel,[id],e.altKey);ids=e.shiftKey?selected.some(v=>clicked.includes(v))?selected.filter(v=>!clicked.includes(v)):[...new Set([...selected,...clicked])]:e.altKey?clicked:selected.includes(id)?selected:clicked;onSelect(ids);tile?.focus({preventScroll:true});}
  if(!panel.freeLayout)return;
  if(id&&e.shiftKey)return;
  if((id||resize)&&panel.controls.some(c=>ids.includes(c.id)&&isControlLocked(panel,c)))return;
  const rect=surface.current.getBoundingClientRect();
  gesture.current={kind:id||resize?resize?'resize':'move':'box',pointer:e.pointerId,x:(e.clientX-rect.left)/scale,y:(e.clientY-rect.top)/scale,scale,before:panel,ids,originalSelection:selected,additive:e.shiftKey,next:panel};
  e.currentTarget.setPointerCapture(e.pointerId);e.preventDefault();if(!id&&!resize){surface.current.focus();setMarquee({x:gesture.current.x,y:gesture.current.y,width:0,height:0});if(!e.shiftKey)onSelect([]);}
 }
 function finish(e:PointerEvent<HTMLDivElement>,cancel=false){
  const g=gesture.current;if(!g||g.pointer!==e.pointerId)return;gesture.current=null;setDraft(null);setMarquee(null);
  if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
  if(cancel){if(g.kind==='box')onSelect(g.originalSelection);return;}
  if(g.kind!=='box'&&JSON.stringify(g.before.controls)!==JSON.stringify(g.next.controls))onCommit(g.next);
 }
 function cancel(){const g=gesture.current;if(!g)return;gesture.current=null;setDraft(null);setMarquee(null);if(g.kind==='box')onSelect(g.originalSelection);}
 return <div ref={scroll} className={panel.freeLayout?'free-controls-scroll panel-canvas-scroll':''}>
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
   onSelect(ids);const b=selectionBounds(panel,ids);if(!b)return;onCommit((e.target as HTMLElement).closest('[data-resize]')?resizeSelection(panel,ids,b.width+dx,b.height+dy):moveSelection(panel,ids,dx,dy));
  }}>
  {shown.controls.map((c,index)=>{
   if(c.hidden&&!building)return null;const b=controlBounds(shown,c,index),locked=isControlLocked(panel,c),group=panel.groups?.find(g=>g.id===c.groupId);
   return <div key={c.id} tabIndex={building?0:undefined} role="group" aria-label={building?c.label+(group?' · '+group.name:'')+(locked?' · locked':''):undefined} data-control-id={c.id} data-selected={selected.includes(c.id)} className={'control-tile '+(c.artwork||c.kind==='artwork'?'art-control-tile ':'')+(building&&selected.includes(c.id)?'selected ':'')+(building&&c.hidden?'panel-item-hidden ':'')+(locked?'panel-item-locked':'')} style={{zIndex:"auto",borderTopColor:c.color,...(panel.freeLayout?{position:'absolute',left:b.x,top:b.y,width:b.width,height:b.height}:{gridColumn:`span ${Math.min(c.span,panel.columns)}`})}}>
    {children(c)}{building&&locked&&<span className="panel-lock-badge"><Lock size={12}/></span>}
   </div>;
  })}
  {building&&panel.freeLayout&&box&&<div className="panel-selection-box" style={{left:box.x,top:box.y,width:box.width,height:box.height}}><span className="panel-selection-measure">{selected.length} selected · {box.width} × {box.height}</span>{!selectionLocked&&<button type="button" data-resize className="control-resize" aria-label="Resize selected controls" title="Drag to resize selection. Shift preserves proportions; arrows resize."><MoveDiagonal2 size={15}/></button>}</div>}
  {marquee&&<div className="panel-marquee" style={{left:marquee.x,top:marquee.y,width:marquee.width,height:marquee.height}}/>}
 </div></div></div>;
}
