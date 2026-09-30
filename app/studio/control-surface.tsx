'use client';
import {useRef,useState,type ReactNode,type PointerEvent} from 'react';
import {MoveDiagonal2} from 'lucide-react';
import type {Control,Panel} from '@/lib/studio-model';
import {clampControlBounds,controlBounds,panelSize,type ControlBounds} from '@/lib/panel-layout';

export function ControlSurface({panel,building,selected,onSelect,onChange,children}:{panel:Panel;building:boolean;selected?:string;onSelect:(id:string)=>void;onChange:(id:string,bounds:ControlBounds)=>void;children:(control:Control)=>ReactNode}){
 const surface=useRef<HTMLDivElement>(null),gesture=useRef<{id:string;pointer:number;x:number;y:number;scaleX:number;scaleY:number;bounds:ControlBounds;resize:boolean;next:ControlBounds}|null>(null);
 const[draft,setDraft]=useState<{id:string;bounds:ControlBounds}|null>(null);
 const size=panelSize(panel);
 function start(e:PointerEvent<HTMLDivElement>,c:Control,index:number){
  if(!building||!panel.freeLayout||e.button!==0||!surface.current)return;
  const rect=surface.current.getBoundingClientRect(),bounds=controlBounds(panel,c,index);
  const resize=!!(e.target as HTMLElement).closest('[data-resize]');
  gesture.current={id:c.id,pointer:e.pointerId,x:e.clientX,y:e.clientY,scaleX:size.width/rect.width,scaleY:size.height/rect.height,bounds,resize,next:bounds};
  onSelect(c.id);e.currentTarget.setPointerCapture(e.pointerId);e.preventDefault();
  (e.currentTarget.querySelector(resize?'[data-resize]':'.control-build') as HTMLElement)?.focus();
 }
 function finish(e:PointerEvent<HTMLDivElement>,cancel=false){
  const g=gesture.current;if(!g||g.pointer!==e.pointerId)return;
  gesture.current=null;setDraft(null);
  if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
  if(!cancel&&JSON.stringify(g.bounds)!==JSON.stringify(g.next))onChange(g.id,g.next);
 }
 return <div className={panel.freeLayout?'free-controls-scroll':''}><div ref={surface} className={panel.freeLayout?'free-controls '+(building?'editing':''):'control-grid'} aria-label={panel.freeLayout?'Custom control canvas':undefined} style={panel.freeLayout?{aspectRatio:`${size.width}/${size.height}`,minWidth:Math.min(720,size.width),maxWidth:size.width}:{gridTemplateColumns:`repeat(${panel.columns},minmax(0,1fr))`}}>
  {panel.controls.map((c,index)=>{
   const b=draft?.id===c.id?draft.bounds:controlBounds(panel,c,index);
   return <div key={c.id} data-control-id={c.id} className={'control-tile '+(building&&selected===c.id?'selected':'')} style={{borderTopColor:c.color,...(panel.freeLayout?{position:'absolute',left:b.x/size.width*100+'%',top:b.y/size.height*100+'%',width:b.width/size.width*100+'%',height:b.height/size.height*100+'%'}:{gridColumn:`span ${Math.min(c.span,panel.columns)}`})}}
    onPointerDown={e=>start(e,c,index)} onPointerMove={e=>{
     const g=gesture.current;if(!g||g.pointer!==e.pointerId)return;
     const dx=(e.clientX-g.x)*g.scaleX,dy=(e.clientY-g.y)*g.scaleY;
     g.next=clampControlBounds({...g.bounds,...(g.resize?{width:Math.min(size.width-g.bounds.x,g.bounds.width+dx),height:Math.min(size.height-g.bounds.y,g.bounds.height+dy)}:{x:g.bounds.x+dx,y:g.bounds.y+dy})},size);
     setDraft({id:g.id,bounds:g.next});
    }} onPointerUp={e=>finish(e)} onPointerCancel={e=>finish(e,true)} onLostPointerCapture={e=>finish(e,true)}
    onKeyDown={e=>{
     if(!building||!panel.freeLayout||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
     e.preventDefault();const step=e.shiftKey?10:1,dx=e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0,dy=e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0;
     const resize=!!(e.target as HTMLElement).closest('[data-resize]');
     onSelect(c.id);onChange(c.id,clampControlBounds({...b,...(resize?{width:Math.min(size.width-b.x,b.width+dx),height:Math.min(size.height-b.y,b.height+dy)}:{x:b.x+dx,y:b.y+dy})},size));
    }}>
    {children(c)}
    {panel.freeLayout&&building&&<button type="button" data-resize className="control-resize" aria-label={'Resize '+(c.label||'control')} title="Drag to resize. Arrow keys resize; Shift moves 10 px."><MoveDiagonal2 size={15}/></button>}
   </div>;
  })}
 </div></div>;
}
