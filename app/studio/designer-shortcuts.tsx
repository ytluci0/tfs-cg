'use client';
import {useEffect,useState} from 'react';
import {toast} from 'sonner';
import {atTime,validateProject,type Project,type Scene} from '@/lib/studio-model';
import {copyLayers,pasteLayers,ungroupLayers,type LayerClipboard} from '@/lib/layer-clipboard';
import {deleteDesignLayers,duplicateDesignLayers,groupDesignLayers} from '@/lib/design-tools';
import {editValues} from '@/lib/editing-tools';
let clipboard:LayerClipboard|null=null;
const rows=[['Ctrl+S','Save project'],['Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y','Undo / Redo'],['Ctrl+C / Ctrl+X / Ctrl+V','Copy / Cut / Paste layers in this project'],['Ctrl+J / Ctrl+D','Duplicate selected layers'],['Ctrl+A / Ctrl+Shift+A','Select all / Deselect'],['Ctrl+G / Ctrl+Shift+G','Group / Ungroup (plain groups)'],['Delete / Backspace','Delete unlocked layers'],['F2 on a layer row','Rename layer · Enter to finish / Escape to cancel'],['Arrow keys / Shift+Arrow','Nudge 1 / 10 pixels'],['V / H / Space (hold)','Select / Hand / Pan'],['M / Shift+M / L','Rectangle / Ellipse / Lasso layer selection'],['T / U / Shift+U / P / A','Text / Shape / Cycle shapes / Pen / Path points'],['B / [ / ]','Paint brush / Decrease or increase size'],['E / Shift+E / C','Erase mask / Restore mask / Crop mask'],['G / K / I','Gradient / Fill layer / Eyedropper'],['X / D','Swap colors / Default black and white'],['Z / Alt-click','Zoom tool / Zoom out'],['Ctrl+0 / Ctrl+1','Fit canvas / Actual size'],['Ctrl++ / Ctrl+−','Zoom canvas'],['Escape','Cancel current gesture'],['F1 / ?','This shortcut reference']];
export default function DesignerShortcuts({project,scene,selection,select,update,time,animate,pause,error}:{project:Project;scene:Scene;selection:string[];select:(ids:string[])=>void;update:(scene:Scene)=>void;time:number;animate:boolean;pause:()=>void;error:(e:unknown)=>void}){
 const [open,setOpen]=useState(false);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{
  if(e.defaultPrevented||e.altKey||document.querySelector('[role=dialog],.desktop-modal-backdrop')||(e.target instanceof HTMLElement&&e.target.closest('input,textarea,select,[contenteditable=true],.advanced-timeline,.motion-graph,.text-edit-overlay')))return;
  const command=e.ctrlKey||e.metaKey,k=e.key.toLowerCase();let handled=true;
  const commit=(next:Scene)=>{validateProject({...project,scenes:project.scenes.map(s=>s.id===scene.id?next:s)});pause();update(next);};
  try{
   if(k==='f1'||k==='?')setOpen(true);
   else if(command&&k==='a')select(e.shiftKey?[]:scene.layers.filter(l=>!l.locked).map(l=>l.id));
   else if(command&&(k==='c'||k==='x')){if(k==='x'&&scene.layers.some(l=>selection.includes(l.id)&&l.locked))throw Error('Unlock selected layers before cutting.');clipboard=copyLayers(project.id,scene,selection);if(k==='x'){commit(deleteDesignLayers(scene,selection));select([]);}toast.success((k==='c'?'Copied ':'Cut ')+clipboard.layers.length+' layer'+(clipboard.layers.length===1?'':'s')+' · Ctrl+V to paste',{id:'layer-clipboard',duration:2500});}
   else if(command&&k==='v'){if(!clipboard)throw Error('Copy some layers first.');const result=pasteLayers(project.id,scene,clipboard);commit(result.scene);select(result.selection);toast.success('Pasted '+result.selection.length+' layer'+(result.selection.length===1?'':'s')+' in place',{id:'layer-clipboard',duration:2500});}
   else if(command&&(k==='j'||k==='d')){const result=duplicateDesignLayers(scene,selection);commit(result.scene);select(result.selection);}
   else if(command&&k==='g')commit(e.shiftKey?ungroupLayers(scene,selection):groupDesignLayers(scene,selection));
   else if(!command&&(k==='delete'||k==='backspace')){const next=deleteDesignLayers(scene,selection),removed=scene.layers.length-next.layers.length;if(!removed){if(selection.length)throw Error('Unlock selected layers before deleting.');return;}commit(next);select(selection.filter(id=>next.layers.some(l=>l.id===id)));toast.success('Deleted '+removed+' layer'+(removed===1?'':'s'),{id:'layer-clipboard',duration:2000});}
   else if(!command&&['arrowleft','arrowright','arrowup','arrowdown'].includes(k)){const step=e.shiftKey?10:1,dx=k==='arrowleft'?-step:k==='arrowright'?step:0,dy=k==='arrowup'?-step:k==='arrowdown'?step:0;commit({...scene,layers:scene.layers.map(l=>{if(!selection.includes(l.id)||l.locked)return l;const shown=atTime(l,time);return editValues(l,{...(dx?{x:shown.x+dx}:{}),...(dy?{y:shown.y+dy}:{})},time,animate);})});}
   else handled=false;
  }catch(err){error(err);}if(handled){e.preventDefault();e.stopPropagation();}
 };window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[project,scene,selection,time,animate,update]);
 return <><button title="Keyboard shortcuts (F1)" onClick={()=>setOpen(true)}>Shortcuts</button>{open&&<div className="desktop-modal-backdrop" onKeyDown={e=>{if(e.key==='Escape')setOpen(false);}}><section role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" className="shortcut-reference" tabIndex={-1} ref={el=>el?.focus()}><header><strong>Keyboard shortcuts</strong><button onClick={()=>setOpen(false)}>Close</button></header><p>Design and Animate. Text fields keep their standard editing keys. In the timeline, copy and paste operate on selected keyframes.</p><table><tbody>{rows.map(([key,text])=><tr key={key}><th>{key}</th><td>{text}</td></tr>)}</tbody></table></section></div>}</>;
}
