import {atTime,properties,propertyValue,type Keyframe,type Layer,type Property,type Scene} from './studio-model.ts';

export type TimelineKey={layerId:string;property:Property;time:number};
export type CopiedTimelineKey=TimelineKey&{key:Keyframe};
export const propertyLabels:Record<Property,string>={x:'Position X',y:'Position Y',width:'Width',height:'Height',rotation:'Rotation',opacity:'Opacity',anchorX:'Anchor X',anchorY:'Anchor Y',scaleX:'Scale X',scaleY:'Scale Y'};
export const sameKeyTime=(a:number,b:number)=>Math.abs(a-b)<.000001;
export const keyIdentity=(key:TimelineKey)=>JSON.stringify([key.layerId,key.property,Math.round(key.time*1e6)]);
export const roundKeyTime=(time:number)=>Math.round(time*1e6)/1e6;
export const percentProperty=(property:Property)=>['opacity','scaleX','scaleY'].includes(property);
export function propertyBounds(property:Property){return property==='opacity'?{min:0,max:1}:property==='width'||property==='height'?{min:.001,max:20000}:property.startsWith('scale')?{min:-10000,max:10000}:{};}
function boundedValue(property:Property,value:number){if(!Number.isFinite(value))throw Error('Enter a finite property value.');const {min=-Infinity,max=Infinity}=propertyBounds(property);return Math.max(min,Math.min(max,value));}
function putKey(keys:Keyframe[],key:Keyframe){const next=[...keys.filter(k=>!sameKeyTime(k.time,key.time)),key].sort((a,b)=>a.time-b.time);if(next.length>1000)throw Error('A property supports up to 1000 keys.');return next;}
export function setTimelineValue(layer:Layer,property:Property,time:number,value:number,forceKey=false,ease:Keyframe['ease']='linear'):Layer{
 if(layer.locked)throw Error('Unlock the layer before editing its animation.');
 const keys=layer.keys[property]||[];value=boundedValue(property,value);
 if(!forceKey&&!keys.length)return {...layer,[property]:value};
 const existing=keys.find(k=>sameKeyTime(k.time,time)),key={...existing,time:roundKeyTime(time),value,ease:existing?.ease||ease};
 return {...layer,keys:{...layer.keys,[property]:putKey(keys,key)}};
}
export function disableTimelineTrack(layer:Layer,property:Property,time:number):Layer{
 if(layer.locked)throw Error('Unlock the layer before editing its animation.');
 const keys={...layer.keys};delete keys[property];
 return {...layer,[property]:boundedValue(property,propertyValue(atTime(layer,time),property)),keys};
}
export function resolveTimelineKeys(scene:Scene,refs:TimelineKey[]):CopiedTimelineKey[]{
 const unique=new Map<string,CopiedTimelineKey>();
 for(const ref of refs){const layer=scene.layers.find(l=>l.id===ref.layerId),key=layer?.keys[ref.property]?.find(k=>sameKeyTime(k.time,ref.time));if(key)unique.set(keyIdentity(ref),{...ref,key});}
 return [...unique.values()];
}
export function clampTimelineDelta(scene:Scene,refs:TimelineKey[],delta:number){
 const keys=resolveTimelineKeys(scene,refs);if(!Number.isFinite(delta))throw Error('Enter a finite time offset.');
 return keys.length?Math.max(-Math.min(...keys.map(k=>k.time)),Math.min(scene.duration-Math.max(...keys.map(k=>k.time)),delta)):0;
}
export function deleteTimelineKeys(scene:Scene,refs:TimelineKey[]):Scene{
 const ids=new Set(refs.map(keyIdentity));return {...scene,layers:scene.layers.map(layer=>{
  if(layer.locked)return layer;const keys={...layer.keys};for(const property of properties)if(keys[property])keys[property]=keys[property]!.filter(k=>!ids.has(keyIdentity({layerId:layer.id,property,time:k.time})));return {...layer,keys};
 })};
}
export function pasteTimelineKeys(scene:Scene,copied:CopiedTimelineKey[],time:number,targetLayerId?:string):{scene:Scene;selection:TimelineKey[]}{
 if(!copied.length)return {scene,selection:[]};
 const origin=Math.min(...copied.map(k=>k.time)),selection:TimelineKey[]=[],updates=new Map<string,Layer>();
 for(const entry of copied){
  const id=targetLayerId||entry.layerId,layer=updates.get(id)||scene.layers.find(l=>l.id===id);if(!layer)throw Error('A copied layer no longer exists. Copy a single layer’s keys to paste onto another layer.');if(layer.locked)throw Error('Unlock the destination layer before pasting keys.');
  const destination=roundKeyTime(time+entry.time-origin);if(destination<0||destination>scene.duration)throw Error('These keys would exceed the scene duration. Move the playhead earlier or extend the scene.');
  const key={...entry.key,time:destination,...(entry.key.curve?{curve:[...entry.key.curve] as Keyframe['curve']}:{})};
  updates.set(id,{...layer,keys:{...layer.keys,[entry.property]:putKey(layer.keys[entry.property]||[],key)}});selection.push({layerId:id,property:entry.property,time:destination});
 }
 return {scene:{...scene,layers:scene.layers.map(l=>updates.get(l.id)||l)},selection};
}
export function moveTimelineKeys(scene:Scene,refs:TimelineKey[],delta:number,copy=false){
 const chosen=resolveTimelineKeys(scene,refs);if(chosen.some(k=>scene.layers.find(l=>l.id===k.layerId)?.locked))throw Error('Unlock selected layers before moving their keys.');
 if(!chosen.length)return {scene,selection:[]};delta=clampTimelineDelta(scene,refs,delta);
 return pasteTimelineKeys(copy?scene:deleteTimelineKeys(scene,refs),chosen,roundKeyTime(Math.min(...chosen.map(k=>k.time))+delta));
}
export function easeTimelineKeys(scene:Scene,refs:TimelineKey[],ease:Keyframe['ease'],curve?:Keyframe['curve']):Scene{
 const ids=new Set(refs.map(keyIdentity));return {...scene,layers:scene.layers.map(layer=>{
  if(layer.locked)return layer;const keys={...layer.keys};for(const property of properties)if(keys[property])keys[property]=keys[property]!.map(k=>ids.has(keyIdentity({layerId:layer.id,property,time:k.time}))?{...k,ease,curve:ease==='bezier'?curve||k.curve||[.25,.1,.25,1]:undefined}:k);return {...layer,keys};
 })};
}
