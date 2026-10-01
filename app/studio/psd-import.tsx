'use client';
import {useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {desktopBridge} from '@/lib/desktop';
import {psdScene,type PsdDraft,type PsdOptions} from '@/lib/psd-model';
import type {Project} from '@/lib/studio-model';
import {Graphic} from './canvas';
type FontInfo={family:string;fullName:string;postscriptName:string};
export default function PsdImport({disabled,projectId,beforeCommit,afterCommit,onImported,onError}:{disabled:boolean;projectId:string;beforeCommit:()=>Promise<{projectId:string;revision:number}>;afterCommit:()=>void;onImported:(v:{project:Project;revision:number;sceneId:string})=>void;onError:(e:unknown)=>void}){
 const bridge=desktopBridge()!,dialog=useRef<HTMLDialogElement>(null),generation=useRef(0),originalProject=useRef(projectId);
 const [opened,setOpened]=useState(false),[busy,setBusy]=useState(false),[draft,setDraft]=useState<PsdDraft|null>(null),[error,setError]=useState(''),[fonts,setFonts]=useState<FontInfo[]>([]),[fontStatus,setFontStatus]=useState<PsdOptions['fontStatus']>('unavailable'),[missing,setMissing]=useState<string[]>([]),[mapping,setMapping]=useState<Record<string,string>>({}),[mode,setMode]=useState<PsdOptions['mode']>('editable');
 useEffect(()=>{if(opened&&!dialog.current?.open)dialog.current?.showModal();if(!opened&&dialog.current?.open)dialog.current?.close();},[opened]);
 useEffect(()=>()=>{generation.current++;bridge.cancelPsd().catch(()=>{});},[]);
 function close(){generation.current++;bridge.cancelPsd().catch(onError);setOpened(false);setDraft(null);setBusy(false);}
 async function begin(){
  const sequence=++generation.current;originalProject.current=projectId;setOpened(true);setBusy(true);setDraft(null);setError('');setMode('editable');
  try{
   let available:FontInfo[]=[],checked:PsdOptions['fontStatus']='unavailable';
   try{const query=(window as unknown as {queryLocalFonts?:()=>Promise<FontInfo[]>}).queryLocalFonts;if(query){available=(await query()).map(({family,fullName,postscriptName})=>({family,fullName,postscriptName}));checked='checked';}}catch{/* Keep the review usable with an explicit unverified-font report. */}
   if(sequence!==generation.current)return;
   const next=await bridge.preparePsd();if(sequence!==generation.current){await bridge.cancelPsd();return;}if(!next){close();return;}
   const names=[...new Set(next.scene.layers.flatMap(l=>l.sourceFont?[l.sourceFont]:[]))],map:Record<string,string>={},absent:string[]=[];
   for(const name of names){const match=available.find(f=>[f.postscriptName,f.fullName,f.family].some(n=>n.toLowerCase()===name.toLowerCase()));map[name]=match?.family||'Arial';if(!match&&checked==='checked')absent.push(name);}
   setFonts(available);setFontStatus(checked);setMissing(absent);setMapping(map);setDraft(next);
  }catch(e){if(sequence===generation.current)setError(e instanceof Error?e.message:'PSD inspection failed.');}finally{if(sequence===generation.current)setBusy(false);}
 }
 async function commit(){if(!draft)return;setBusy(true);setError('');try{const target=await beforeCommit();if(target.projectId!==originalProject.current)throw Error('The open project changed. Cancel and import again.');const result=await bridge.commitPsd({id:draft.id,...target,mode,fonts:mapping,fontStatus,missingFonts:missing});onImported(result);setOpened(false);setDraft(null);}catch(e){setError(e instanceof Error?e.message:'PSD import failed.');}finally{afterCommit();setBusy(false);}}
 const unavailableMappings=fontStatus==='checked'&&mode==='editable'?Object.values(mapping).filter(name=>!fonts.some(f=>f.family.toLowerCase()===name.trim().toLowerCase())):[];
 const preview=draft?psdScene(draft,{mode,fonts:mapping,fontStatus,missingFonts:missing}):null;
 return <><Button size="sm" variant="ghost" disabled={disabled} onClick={begin}>Import PSD</Button>{opened&&<dialog ref={dialog} role="dialog" aria-label="Import Photoshop PSD" className="psd-dialog" onCancel={e=>{e.preventDefault();if(!busy||!draft)close();}}><header><div><h2>Import Photoshop PSD</h2><p>{draft?draft.fileName:'Local Photoshop import'} · your source file stays unchanged</p></div><Button variant="ghost" disabled={busy&&!!draft} onClick={close}>Cancel</Button></header>{error&&<p role="alert" className="psd-error">{error}</p>}{!draft?<p className="psd-empty">{busy?'Reading the PSD and checking installed fonts…':'Choose an 8-bit RGB .psd file, up to 100 MB. PSB and 16/32-bit documents must be converted in Photoshop first.'}</p>:<>
 <div className="psd-options"><label>Import as<select aria-label="PSD import mode" value={mode} disabled={busy} onChange={e=>setMode(e.target.value as PsdOptions['mode'])}><option value="editable">Editable supported text + image layers</option><option value="pixels">Saved layer pixels</option><option value="composite" disabled={!draft.referenceSrc}>Saved Photoshop composite (one image)</option></select></label><span>{draft.scene.width} × {draft.scene.height} · {preview?.layers.length} layers · {preview?.groups?.length||0} groups</span></div>
 <div className="psd-comparison"><section><h3>Saved Photoshop composite</h3><div className="psd-preview">{draft.referenceSrc?<img alt="Saved Photoshop composite" src={draft.images[draft.referenceSrc]}/>:<p>No saved composite. Enable Maximize Compatibility in Photoshop.</p>}</div></section><section><h3>BroadcastCG result</h3><div className="psd-preview">{preview&&<Graphic scene={preview} time={preview.duration} images={draft.images} id="psd-review"/>}</div></section></div>
 <p>Images remain separate movable, resizable and animatable layers. Complex text, vectors and smart objects use saved pixels. Masks, adjustments and effects can change the layered result; use the saved composite when their appearance is required.</p>
 {!!Object.keys(mapping).length&&<section className="psd-fonts"><h3>Fonts</h3><p>{fontStatus==='checked'?'Checked against fonts installed on this computer.':'Font availability could not be checked. Review every mapping.'} Fonts are not embedded.</p><datalist id="psd-font-families">{[...new Set(['Arial',...fonts.map(f=>f.family)])].sort().map(f=><option key={f} value={f}/>)}</datalist>{Object.entries(mapping).map(([name,value])=><label key={name}>{name} {missing.includes(name)&&<strong className="psd-error">Missing</strong>}<input list="psd-font-families" maxLength={100} aria-label={'Font mapping for '+name} disabled={busy||mode!=='editable'} value={value} onChange={e=>setMapping(v=>({...v,[name]:e.target.value}))}/></label>)}</section>}
 {!!unavailableMappings.length&&<p role="alert" className="psd-error">Choose installed font families: {unavailableMappings.join(', ')}</p>}<details className="psd-report" open><summary>Conversion report · {draft.warnings.length} notes</summary><ul>{draft.warnings.map((w,i)=><li key={i}><strong>{w.layer}</strong> — {w.message}</li>)}</ul></details></>}
 <footer><span>Import adds a scene to your current project.</span>{draft?<Button disabled={busy||!preview?.layers.length||!!unavailableMappings.length||Object.values(mapping).some(v=>!v.trim())} onClick={commit}>{busy?'Saving import…':'Add scene to project'}</Button>:<Button disabled={busy} onClick={begin}>Choose PSD</Button>}</footer></dialog>}</>;
}
