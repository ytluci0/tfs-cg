'use client';
import {useEffect,useRef,useState} from 'react';
import {textValue,type Layer,type Project} from '@/lib/studio-model';
import {VIDEO_ACCEPT,isLocalVideoSource} from '@/lib/video-tools';
import {inspectVideoFile} from './video-import';
import {Choice,Num} from './controls';

export default function VideoSourceEditor({item,patch,upload,onError,variables={},preview,playing=false}:{item:Layer;patch:(v:Partial<Layer>)=>void;upload:(f:File)=>Promise<string>;onError:(e:unknown)=>void;variables?:Project['variables'];preview?:()=>void;playing?:boolean}){
 const picker=useRef<HTMLInputElement>(null),[busy,setBusy]=useState(false),[failure,setFailure]=useState(''),[info,setInfo]=useState('');
 const source=textValue(item.src,variables),local=isLocalVideoSource(source),media=item.media||{loop:true,speed:1,start:0};
 useEffect(()=>{setFailure('');setInfo('');},[source]);
 return <div className="video-source-editor">
  <button disabled={busy||item.locked} onClick={()=>picker.current?.click()}>{busy?'Loading video…':local?'Replace video…':'Choose video…'}</button>
  <input hidden ref={picker} aria-label="Import video" type="file" accept={VIDEO_ACCEPT} onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;setBusy(true);setFailure('');try{await inspectVideoFile(file);const src=await upload(file);patch({src,media:{...media,start:0}});}catch(error){setFailure((error as Error).message);onError(error);}finally{setBusy(false);}}}/>
  {local&&<video key={source} className="video-source-preview" aria-label="Video source preview" src={source} controls muted playsInline preload="metadata" onLoadedMetadata={e=>{const v=e.currentTarget;setInfo(`${v.videoWidth} × ${v.videoHeight}${Number.isFinite(v.duration)?' · '+v.duration.toFixed(2)+'s':''}`);}} onLoadedData={()=>setFailure('')} onError={()=>setFailure('Video unavailable or unsupported. Replace it with an H.264 MP4 or VP8/VP9 WebM.')}/>}
  {info&&<p className="helper" role="status">{info}</p>}{failure&&<p className="video-import-error" role="alert">{failure}</p>}
  {!local&&<p className="helper">Choose a local MP4 or WebM to fill this layer.</p>}
  {local&&preview&&<button onClick={preview} aria-label={playing?'Pause video preview':'Preview video on canvas'}>{playing?'Pause canvas preview':'Preview on canvas'}</button>}
  <details><summary>Source / data binding</summary><label>Local asset or variable<input aria-label="Video source" value={item.src} placeholder="/api/assets/… or {{videoVariable}}" onChange={e=>patch({src:e.target.value})}/></label></details>
  <label>Fit inside layer<Choice label="Video fit" value={item.visual?.imageFit||'cover'} options={[{value:'contain',label:'Fit · keep whole video'},{value:'cover',label:'Fill · crop edges'},{value:'stretch',label:'Stretch'}]} onChange={imageFit=>patch({visual:{...item.visual,imageFit:imageFit as 'contain'}})}/></label>
  <label><input type="checkbox" checked={media.loop} onChange={e=>patch({media:{...media,loop:e.target.checked}})}/>Loop video</label>
  <div className="property-grid"><label>Start offset (s)<Num label="Video start offset" value={media.start} min={0} max={86400} step={.1} onChange={start=>patch({media:{...media,start}})}/></label><label>Speed<Num label="Video speed" value={media.speed} min={.1} max={10} step={.1} onChange={speed=>patch({media:{...media,speed}})}/></label></div>
  <p className="helper">MP4 / WebM · up to 50 MB. Preview is muted and stays off air. Use TAKE to send the graphic to output.</p>
 </div>;
}
