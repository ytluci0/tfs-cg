'use client';
import {useEffect,useRef,useState} from 'react';
import type {Project} from '@/lib/studio-model';
import {clockAt,clockSeconds,clockText} from '@/lib/broadcast-tools';
type Clock={at:number;base:number;direction:'up'|'down';formatted:boolean};
export function usePanelClocks(project:Project,change:(fn:(p:Project)=>Project)=>void){
 const [timers,setTimers]=useState<Record<string,Clock>>({}),ref=useRef(timers),projectRef=useRef(project),projectId=useRef(project.id);ref.current=timers;projectRef.current=project;
 useEffect(()=>{if(projectId.current!==project.id){projectId.current=project.id;ref.current={};setTimers({});}},[project.id]);
 useEffect(()=>{if(!Object.keys(timers).length)return;const tick=setInterval(()=>{
  const now=Date.now(),finished:string[]=[];
  change(p=>{const variables={...p.variables};let modified=false;for(const [key,t] of Object.entries(ref.current)){const result=clockAt(t.base,t.at,now,t.direction);const value=t.formatted?clockText(result.seconds):result.seconds;if(variables[key]!==value){variables[key]=value;modified=true;}if(result.finished)finished.push(key);}return modified?{...p,variables}:p;});
  if(finished.length)setTimers(v=>Object.fromEntries(Object.entries(v).filter(([key])=>!finished.includes(key))));
 },250);return()=>clearInterval(tick);},[timers,change]);
 function stop(key:string){const next={...ref.current};delete next[key];ref.current=next;setTimers(next);}
 function toggleClock(key:string,direction:'up'|'down'='up'){
  if(!key)return;
  if(ref.current[key]){const t=ref.current[key],seconds=clockAt(t.base,t.at,Date.now(),t.direction).seconds;stop(key);change(p=>({...p,variables:{...p.variables,[key]:t.formatted?clockText(seconds):seconds}}));return;}
  const value=projectRef.current.variables[key],base=clockSeconds(value);if(direction==='down'&&base===0)return;
  const next={...ref.current,[key]:{at:Date.now(),base,direction,formatted:typeof value==='string'}};ref.current=next;setTimers(next);
 }
 function setClock(key:string,seconds:number){if(!key)return;const current=projectRef.current.variables[key],formatted=typeof current==='string';stop(key);change(p=>({...p,variables:{...p.variables,[key]:formatted?clockText(seconds):Math.max(0,seconds)}}));}
 return {timers,toggleClock,setClock};
}
export type PanelClocks=ReturnType<typeof usePanelClocks>;
