'use client';
import {useEffect,useRef,useState} from 'react';
import {Input} from '@/components/ui/input';
import {controlActions,controlCondition,selectorOptions,type ControlEvent} from '@/lib/creative-tools';
import {safeImage,textValue,type Control,type Project} from '@/lib/studio-model';

type Run=(c:Control,event?:ControlEvent,value?:string)=>Promise<void>;
export function ActionButton({control:c,project,disabled,run,onError}:{control:Control;project:Project;disabled:boolean;run:Run;onError:(e:unknown)=>void}){
 const [pressed,setPressed]=useState(false),[working,setWorking]=useState(false),timer=useRef<ReturnType<typeof setTimeout>|null>(null),down=useRef(false),held=useRef(false),mounted=useRef(true),pending=useRef(Promise.resolve()),failed=useRef(false),latest=useRef({c,run,onError});latest.current={c,run,onError};
 useEffect(()=>{mounted.current=true;const cancel=()=>{down.current=false;setPressed(false);if(timer.current)clearTimeout(timer.current);};window.addEventListener('blur',cancel);return()=>{mounted.current=false;cancel();window.removeEventListener('blur',cancel);};},[]);
 const live=!!c.liveWhen&&controlCondition(c.liveWhen,project.variables),state=disabled&&!working?'disabled':pressed?'pressed':live?'live':'normal';
 const style={background:c.color,foreground:'#ffffff',radius:8,fontSize:c.fontSize||18,borderWidth:0,borderColor:c.color,...c.appearance,...(state==='normal'?{}:c.stateStyles?.[state])};
 const value=(s:string|undefined)=>textValue(s||'',project.variables),image=value(style.image);
 function fire(event:ControlEvent){
  const actions=controlActions(latest.current.c,event);if(!actions.length)return pending.current;
  pending.current=pending.current.then(async()=>{if(!mounted.current||failed.current)return;setWorking(true);try{await latest.current.run(latest.current.c,event);}catch(e){failed.current=true;down.current=false;if(timer.current)clearTimeout(timer.current);latest.current.onError(e);}finally{if(mounted.current)setWorking(false);}});return pending.current;
 }
 function start(){if(disabled||down.current)return;failed.current=false;held.current=false;down.current=true;setPressed(true);void fire('press');if(c.events?.hold?.length){const repeat=async()=>{if(!down.current||!mounted.current||failed.current)return;held.current=true;await fire('hold');if(down.current&&!failed.current)timer.current=setTimeout(repeat,latest.current.c.holdRepeat||200);};timer.current=setTimeout(repeat,c.holdDelay||500);}}
 function stop(cancel=false){const was=down.current;down.current=false;setPressed(false);if(timer.current)clearTimeout(timer.current);if(was&&!cancel)void fire('release');if(cancel)held.current=true;}
 return <button className="control-build advanced-action-button" data-state={state} disabled={disabled&&!working&&!down.current} aria-label={value(style.label||c.label)} style={{alignItems:'center',justifyContent:'center',textAlign:'center',background:value(style.background),color:value(style.foreground),border:`${style.borderWidth||0}px solid ${value(style.borderColor)}`,borderRadius:style.radius,fontSize:style.fontSize,fontFamily:style.fontFamily,fontWeight:style.fontWeight||600,opacity:state==='disabled'&&!c.stateStyles?.disabled?.background?0.5:1}}
  onPointerDown={e=>{if(e.button!==0)return;e.currentTarget.setPointerCapture(e.pointerId);start();}} onPointerUp={e=>{stop();if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}} onPointerCancel={()=>stop(true)} onLostPointerCapture={()=>{if(down.current)stop(true);}}
  onKeyDown={e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();if(!e.repeat)start();}}} onKeyUp={e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();stop();if(!held.current)void fire('click');}}}
  onClick={e=>{if(disabled&&!working)return;if(e.detail===0){failed.current=false;void fire('click');}else if(!held.current)void fire('click');}}>
  {safeImage(image)&&<img alt="" src={image}/>} {style.icon&&<span aria-hidden="true">{value(style.icon)}</span>}<strong style={{font:'inherit'}}>{value(style.label||c.label)}</strong><small>{working?'Running…':state==='live'?'Live':c.shortcut?'Shortcut '+c.shortcut.toUpperCase():controlActions(c).length+' actions'}</small>
 </button>;
}
export function DataSelector({control:c,project,disabled,run,onError}:{control:Control;project:Project;disabled:boolean;run:Run;onError:(e:unknown)=>void}){
 const [query,setQuery]=useState(''),options=selectorOptions(c,project),filtered=options.filter(o=>o.label.toLowerCase().includes(query.toLowerCase())),selected=String(project.variables[c.variable]??'');
 return <div className="control-field broadcast-control"><label>{textValue(c.label,project.variables)}</label><Input aria-label={'Search '+c.label} placeholder="Search players / choices…" value={query} disabled={disabled} onChange={e=>setQuery(e.target.value)}/><div className="selector-results" role="group" aria-label={c.label+' choices'}>{filtered.map(row=><button key={row.value} disabled={disabled} aria-pressed={selected===row.value} onClick={()=>run(c,'click',row.value).catch(onError)}>{row.photo&&safeImage(row.photo)&&<img src={row.photo} alt=""/>}<span>{row.label}</span></button>)}</div>{!filtered.length&&<small>{options.length?'No matching choices':c.optionSource?'Fetch the connected API source to load choices':'No players available'}</small>}</div>;
}
export function Indicator({control:c,project}:{control:Control;project:Project}){
 const value=project.variables[c.variable],min=c.minimum??0,max=c.maximum??100,percent=Math.min(100,Math.max(0,(Number(value)-min)/Math.max(.00001,max-min)*100)),live=!!c.liveWhen&&controlCondition(c.liveWhen,project.variables),style={background:c.color,foreground:'#fff',...c.appearance,...(live?c.stateStyles?.live:{})};
 return <div className="control-field broadcast-control"><label>{textValue(c.label,project.variables)}</label>{c.kind==='progress'?<><progress className="broadcast-progress" aria-label={c.label} max={100} value={Number.isFinite(percent)?percent:0}/><output>{String(value??'')} / {max}</output></>:<div className="broadcast-status" style={{background:textValue(style.background,project.variables),color:textValue(style.foreground,project.variables)}}>{textValue(style.label||String(value??''),project.variables)}</div>}</div>;
}
