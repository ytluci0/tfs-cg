'use client';
import {useEffect,useRef,useState,type PointerEvent} from 'react';

type Props={value:number;label:string;onCommit:(value:number)=>void;disabled?:boolean;min?:number;max?:number;step?:number;scrubStep?:number;context?:unknown;onScrubStart?:()=>void;onPreview?:(value:number|null)=>void};
type Gesture={pointer:number;startX:number;lastX:number;value:number;original:number;context:unknown;active:boolean};
const format=(value:number)=>String(Math.round(value*1000)/1000);

// Scrubbing is an editor preview until release, giving each gesture one Undo step.
export default function TimelineNumber(props:Props){
 const {value,label,onCommit,disabled=false,min,max,step=.01,scrubStep}=props;
 const [draft,setDraft]=useState(format(value)),[scrubbing,setScrubbing]=useState(false);
 const input=useRef<HTMLInputElement>(null),editing=useRef(false),gesture=useRef<Gesture|null>(null),latest=useRef(props);latest.current=props;
 const bounded=(n:number)=>Math.max(latest.current.min??-Infinity,Math.min(latest.current.max??Infinity,n));
 function release(g:Gesture){if(input.current?.hasPointerCapture(g.pointer))input.current.releasePointerCapture(g.pointer);}
 function cancel(){const g=gesture.current;gesture.current=null;if(g){release(g);if(g.active)latest.current.onPreview?.(null);editing.current=false;setDraft(format(latest.current.value));setScrubbing(false);}}
 useEffect(()=>{const g=gesture.current;if(g&&(disabled||g.original!==value||g.context!==props.context))cancel();if(!editing.current)setDraft(format(value));},[value,disabled,props.context]);
 useEffect(()=>{window.addEventListener('blur',cancel);return()=>{window.removeEventListener('blur',cancel);const g=gesture.current;gesture.current=null;if(g?.active)latest.current.onPreview?.(null);};},[]);
 function commit(){if(!editing.current)return;editing.current=false;const n=Number(draft);if(draft.trim()&&Number.isFinite(n)){const next=bounded(n);if(next!==value)onCommit(next);setDraft(format(next));}else setDraft(format(value));}
 function move(e:PointerEvent<HTMLInputElement>){
  const g=gesture.current;if(!g||g.pointer!==e.pointerId)return;
  if(!g.active){if(Math.abs(e.clientX-g.startX)<3)return;g.active=true;setScrubbing(true);}
  e.preventDefault();const multiplier=e.altKey ? 0.1 : e.shiftKey ? 10 : 1;
  g.value=bounded(Math.round((g.value+(e.clientX-g.lastX)*(scrubStep??1)*multiplier)*1e6)/1e6);g.lastX=e.clientX;
  setDraft(format(g.value));latest.current.onPreview?.(g.value);
 }
 function finish(e:PointerEvent<HTMLInputElement>){
  const g=gesture.current;if(!g||g.pointer!==e.pointerId)return;
  if(latest.current.disabled||g.context!==latest.current.context||g.original!==latest.current.value){cancel();return;}
  gesture.current=null;release(g);setScrubbing(false);
  if(g.active){editing.current=false;latest.current.onPreview?.(null);if(g.value!==latest.current.value)latest.current.onCommit(g.value);e.currentTarget.blur();}
  else e.currentTarget.select();
 }
 return <input ref={input} className={'tl-number'+(scrubStep!==undefined?' tl-scrubbable':'')} data-scrubbing={scrubbing||undefined} type="number" aria-label={label} title={scrubStep===undefined?undefined:'Drag left/right to adjust · Shift: faster · Alt: finer · Click to type · Escape: cancel'} value={draft} min={min} max={max} step={step} disabled={disabled}
  onFocus={()=>{editing.current=true;}} onChange={e=>setDraft(e.target.value)} onBlur={()=>{if(gesture.current)cancel();else commit();}}
  onPointerDown={e=>{if(disabled||scrubStep===undefined||e.button!==0||!e.isPrimary)return;e.preventDefault();e.stopPropagation();e.currentTarget.focus();editing.current=true;const typed=Number(draft);gesture.current={pointer:e.pointerId,startX:e.clientX,lastX:e.clientX,value:bounded(draft.trim()&&Number.isFinite(typed)?typed:value),original:value,context:props.context,active:false};e.currentTarget.setPointerCapture(e.pointerId);props.onScrubStart?.();}}
  onPointerMove={move} onPointerUp={finish} onPointerCancel={cancel} onLostPointerCapture={cancel}
  onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();cancel();editing.current=false;setDraft(format(value));e.currentTarget.blur();}else if(e.key==='Enter'){e.preventDefault();if(gesture.current)cancel();e.currentTarget.blur();}}}/>;
}
