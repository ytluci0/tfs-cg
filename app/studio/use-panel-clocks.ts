'use client';
import {useEffect,useRef,useState} from 'react';
import {api} from '@/lib/client-api';
import {desktopBridge} from '@/lib/desktop';
import type {Control,Project} from '@/lib/studio-model';
import {clockAt,clockSeconds,clockText} from '@/lib/broadcast-tools';
type Clock={at:number;base:number;direction:'up'|'down';formatted:boolean};
export function usePanelClocks(project:Project,change:(fn:(p:Project)=>Project)=>void,execute:(fields:Record<string,unknown>)=>Promise<unknown>,onError:(error:unknown)=>void){
 const desktop=!!desktopBridge(),[remote,setRemote]=useState<Record<string,{seconds:number;value:string|number;direction:'up'|'down';running:boolean;interrupted:boolean}>>({}),[connectionLost,setConnectionLost]=useState(false);
 const remoteRef=useRef(remote);remoteRef.current=remote;
 async function refresh(){const id=projectRef.current.id;try{const value=await api<typeof remote>('/api/clocks?projectId='+encodeURIComponent(id));if(projectRef.current.id===id){if(JSON.stringify(remoteRef.current)!==JSON.stringify(value)){remoteRef.current=value;setRemote(value);}setConnectionLost(false);}}catch{setConnectionLost(true);}}
 useEffect(()=>{if(!desktop)return;setRemote({});let active=true;const poll=async()=>{if(active)await refresh();};poll();const timer=setInterval(poll,250);return()=>{active=false;clearInterval(timer);};},[project.id,desktop]);
 async function send(fields:Record<string,unknown>){try{await execute(fields);await refresh();return true;}catch(e){onError(e);return false;}}
 const [timers,setTimers]=useState<Record<string,Clock>>({}),ref=useRef(timers),projectRef=useRef(project),projectId=useRef(project.id);ref.current=timers;projectRef.current=project;
 useEffect(()=>{if(projectId.current!==project.id){projectId.current=project.id;ref.current={};setTimers({});}},[project.id]);
 useEffect(()=>{if(desktop||!Object.keys(timers).length)return;const tick=setInterval(()=>{
  const now=Date.now(),finished:string[]=[];
  change(p=>{const variables={...p.variables};let modified=false;for(const [key,t] of Object.entries(ref.current)){const result=clockAt(t.base,t.at,now,t.direction);const value=t.formatted?clockText(result.seconds):result.seconds;if(variables[key]!==value){variables[key]=value;modified=true;}if(result.finished)finished.push(key);}return modified?{...p,variables}:p;});
  if(finished.length)setTimers(v=>Object.fromEntries(Object.entries(v).filter(([key])=>!finished.includes(key))));
 },250);return()=>clearInterval(tick);},[timers,change]);
 function stop(key:string){const next={...ref.current};delete next[key];ref.current=next;setTimers(next);}
 async function toggleClock(key:string,direction?:'up'|'down'){
  direction=direction||remoteRef.current[key]?.direction||'up';
  if(desktop)return send({kind:'clock',variable:key,clock:{op:remoteRef.current[key]?.running?'pause':'start',direction}});
  if(!key)return;
  if(ref.current[key]){const t=ref.current[key],seconds=clockAt(t.base,t.at,Date.now(),t.direction).seconds;stop(key);change(p=>({...p,variables:{...p.variables,[key]:t.formatted?clockText(seconds):seconds}}));return;}
  const value=projectRef.current.variables[key],base=clockSeconds(value);if(direction==='down'&&base===0)return;
  const next={...ref.current,[key]:{at:Date.now(),base,direction,formatted:typeof value==='string'}};ref.current=next;setTimers(next);
 }
 async function setClock(key:string,seconds:number,direction?:'up'|'down'){if(desktop)return send({kind:'clock',variable:key,clock:{op:'reset',seconds:Math.max(0,seconds),direction}});if(!key)return;const current=projectRef.current.variables[key],formatted=typeof current==='string';stop(key);change(p=>({...p,variables:{...p.variables,[key]:formatted?clockText(seconds):Math.max(0,seconds)}}));}
 async function adjustClock(key:string,seconds:number){if(desktop)return send({kind:'clock',variable:key,clock:{op:'adjust',seconds}});return setClock(key,clockSeconds(projectRef.current.variables[key])+seconds);}
 async function counter(key:string,delta:number|undefined,value?:number,c?:Control){if(desktop){const panel=projectRef.current.panels.find(p=>p.controls.some(x=>x.id===c?.id));return send({kind:'counter',variable:key,delta,value,controlId:c?.id,panelId:panel?.id});}change(p=>({...p,variables:{...p.variables,[key]:value??Math.max(c?.minimum??0,Math.min(c?.maximum??999999,Number(p.variables[key])+Number(delta)))}}));return true;}
 return {timers:desktop?Object.fromEntries(Object.entries(remote).filter(([,c])=>c.running)):timers,values:desktop?Object.fromEntries(Object.entries(remote).map(([key,c])=>[key,c.value])):{},remote,connectionLost,toggleClock,setClock,adjustClock,counter,desktop};
}
export type PanelClocks=ReturnType<typeof usePanelClocks>;
