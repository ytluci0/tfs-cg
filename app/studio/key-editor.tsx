'use client';
import {useEffect,useState} from 'react';
import {Diamond,Trash2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {atTime,properties,propertyValue,type Keyframe,type Layer,type Property} from '@/lib/studio-model';
import {Choice,Num} from './controls';
export default function KeyEditor({item,patch,time,setTime,duration}:{item:Layer;patch:(v:Partial<Layer>)=>void;time:number;setTime:(v:number)=>void;duration:number}){
 const [property,setProperty]=useState<Property>('x'),[ease,setEase]=useState<Keyframe['ease']>('linear'),[page,setPage]=useState(0),[value,setValue]=useState(0);
 const keys=item.keys[property]||[],pages=Math.max(1,Math.ceil(keys.length/20)),current=Math.min(page,pages-1);
 useEffect(()=>setValue(propertyValue(atTime(item,time),property)),[item,time,property]);
 useEffect(()=>setPage(0),[item.id,property]);
 function change(next:Keyframe[]){patch({keys:{...item.keys,[property]:next.sort((a,b)=>a.time-b.time)}});}
 function edit(index:number,partial:Partial<Keyframe>){change(keys.filter((k,i)=>i===index||partial.time===undefined||Math.abs(k.time-partial.time)>.000001).map(k=>k===keys[index]?{...k,...partial}:k));}
 return <div className="key-editor"><label>Property<Choice label="Animated property" value={property} options={properties} onChange={v=>setProperty(v as Property)}/></label><label>Value at playhead<Num label="Key value at playhead" value={value} onChange={setValue}/></label><label>New key interpolation<Choice label="New key interpolation" value={ease} options={['linear','smooth','step']} onChange={v=>setEase(v as Keyframe['ease'])}/></label><Button size="sm" disabled={keys.length>=1000&&!keys.some(k=>Math.abs(k.time-time)<.000001)} onClick={()=>{const next=keys.filter(k=>Math.abs(k.time-time)>.000001);next.push({time,value,ease});change(next);setPage(Math.floor(next.filter(k=>k.time<time).length/20));}}><Diamond/>Set key at {time.toFixed(3)}s</Button>
 <div className="ae-key-tools"><Button variant="ghost" size="sm" disabled={!current} onClick={()=>setPage(current-1)}>Previous</Button><span>{keys.length} keys · {current+1}/{pages}</span><Button variant="ghost" size="sm" disabled={current>=pages-1} onClick={()=>setPage(current+1)}>Next</Button></div>
 {keys.slice(current*20,current*20+20).map((f,offset)=>{const i=current*20+offset;return <div className="key-row" key={i}><Button variant="ghost" size="sm" aria-label={'Go to keyframe '+(i+1)} onClick={()=>setTime(f.time)}>◆</Button><Num label={'Keyframe time '+(i+1)} value={f.time} min={0} max={duration} step={.001} onChange={time=>edit(i,{time})}/><Num label={'Keyframe value '+(i+1)} value={f.value} onChange={value=>edit(i,{value})}/><Choice label={'Keyframe interpolation '+(i+1)} value={f.ease} options={['linear','smooth','step']} onChange={ease=>edit(i,{ease:ease as Keyframe['ease']})}/><Button variant="ghost" size="icon" aria-label="Remove keyframe" onClick={()=>change(keys.filter((_,j)=>i!==j))}><Trash2/></Button></div>;})}
 <p className="helper">Edit time, value and outgoing interpolation. A key moved onto another key replaces it. Sampled AE motion uses linear keys; holds use step.</p></div>;
}
