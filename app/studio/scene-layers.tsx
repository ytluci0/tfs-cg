'use client';
import {useState} from 'react';
import {Eye,EyeOff,ChevronDown,ChevronRight} from 'lucide-react';
import type {Scene} from '@/lib/studio-model';
import {sceneTree,type SceneNode} from '@/lib/psd-model';
export default function SceneLayers({scene,selected,selectedIds,select,update}:{scene:Scene;selected:string;selectedIds?:string[];select:(id:string,additive?:boolean)=>void;update:(fn:(s:Scene)=>Scene)=>void}){
 const [collapsed,setCollapsed]=useState<Set<string>>(new Set());
 const render=(nodes:SceneNode[],depth=0)=>[...nodes].reverse().map(node=>{
  if(node.kind==='layer'){const l=node.layer;return <div key={l.id} style={{paddingLeft:depth*10}} className={'layer-row '+((selectedIds||[selected]).includes(l.id)?'selected':'')}><button className="layer-select" onClick={e=>select(l.id,e.shiftKey||e.ctrlKey||e.metaKey)}><span>{l.type==='text'?'T':l.type==='image'?'▧':'◇'}</span>{l.name}</button><button aria-label={(l.visible?'Hide ':'Show ')+l.name} onClick={()=>update(s=>({...s,layers:s.layers.map(x=>x.id===l.id?{...x,visible:!x.visible}:x)}))}>{l.visible?<Eye size={14}/>:<EyeOff size={14}/>}</button></div>;}
  const g=node.group;return <div key={g.id} className="scene-layer-group" style={{marginLeft:depth?8:0}}><div className="layer-row"><button aria-label={(collapsed.has(g.id)?'Expand ':'Collapse ')+g.name} onClick={()=>setCollapsed(v=>{const next=new Set(v);next.has(g.id)?next.delete(g.id):next.add(g.id);return next;})}>{collapsed.has(g.id)?<ChevronRight size={14}/>:<ChevronDown size={14}/>}</button><input aria-label={'Group name '+g.name} value={g.name} maxLength={200} onChange={e=>update(s=>({...s,groups:s.groups?.map(v=>v.id===g.id?{...v,name:e.target.value}:v)}))}/><button aria-label={(g.visible?'Hide group ':'Show group ')+g.name} onClick={()=>update(s=>({...s,groups:s.groups?.map(v=>v.id===g.id?{...v,visible:!v.visible}:v)}))}>{g.visible?<Eye size={14}/>:<EyeOff size={14}/>}</button></div>{!collapsed.has(g.id)&&<><label className="scene-group-opacity">Group opacity<input aria-label={'Group opacity '+g.name} type="range" min="0" max="1" step=".01" value={g.opacity} onChange={e=>update(s=>({...s,groups:s.groups?.map(v=>v.id===g.id?{...v,opacity:Number(e.target.value)}:v)}))}/></label>{render(node.children,depth+1)}</>}</div>;
 });
 return <>{render(sceneTree(scene))}</>;
}
