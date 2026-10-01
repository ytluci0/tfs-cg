import {action,moveLayer,propertyValue,uid,variableActionValue,type Control,type Layer,type Scene,type Keyframe,type Project,type Property} from './studio-model.ts';
import {conditionMatches} from './action-logic.ts';
export type ControlEvent='click'|'press'|'release'|'hold';
export function controlCondition(when:Control['enabledWhen'],variables:Project['variables']):boolean {
 if(!when)return true;try{return conditionMatches({...action('set'),when},variables);}catch{return false;}
}
export function controlAvailable(c:Control,variables:Project['variables']):boolean{return !c.hidden&&controlCondition(c.visibleWhen,variables)&&controlCondition(c.enabledWhen,variables);}
export function controlActions(c:Control,event:ControlEvent='click'){return event==='click'?c.actions:c.events?.[event]||[];}
export function selectorOptions(c:Control,p:Project){
 if(c.kind==='roster')return p.players.filter(v=>!c.rosterTeam||c.rosterTeam==='all'||v.team===c.rosterTeam).map(v=>({value:v.id,label:'#'+v.number+' · '+v.name,photo:v.photo,fields:{name:v.name,number:v.number,photo:v.photo,position:v.position,team:v.team}}));
 if(c.optionSource)return p.optionLists?.[c.id]||[];
 return [...new Set(c.options.split(/[\n,]/).map(v=>v.trim()).filter(Boolean))].map(v=>({value:v,label:v,photo:'',fields:{} as Record<string,string|number|boolean>}));
}
export function selectOption(p:Project,c:Control,value:string):Project{
 const row=selectorOptions(c,p).find(r=>r.value===value);if(!row)throw Error('This choice is no longer available. Refresh the list.');
 const variables={...p.variables,[c.variable]:variableActionValue(p.variables,c.variable,value,'set')};
 for(const [field,target] of Object.entries(c.selectionBindings||{})){
  const fields=row.fields as Record<string,string|number|boolean>|undefined;
  const v=field==='value'?row.value:field==='label'?row.label:field==='photo'?row.photo:fields?.[field];
  if(v===undefined)throw Error('The selected row has no '+field+' field.');variables[target]=variableActionValue(p.variables,target,String(v),'set');
 }
 return {...p,variables};
}
export function cueTime(scene:Scene,elapsed:number,cueId?:string):number|null{
 const cue=scene.cues?.find(c=>c.id===cueId);if(!cue)return Math.min(Math.max(0,elapsed),scene.duration);
 const delta=Math.max(0,elapsed),length=cue.end-cue.start;if(cue.loop)return cue.start+delta%length;
 if(delta>=length&&cue.finish==='hide')return null;return Math.min(cue.end,cue.start+delta);
}
export function arrangeLayers(scene:Scene,ids:string[],operation:string):Scene{
 const layers=scene.layers.filter(l=>ids.includes(l.id)&&!l.locked);if(layers.length<2)return scene;
 const x=Math.min(...layers.map(l=>l.x)),y=Math.min(...layers.map(l=>l.y)),right=Math.max(...layers.map(l=>l.x+l.width)),bottom=Math.max(...layers.map(l=>l.y+l.height)),changed=new Map<string,Layer>();
 if(operation==='space-x'||operation==='space-y'){
  if(layers.length<3)return scene;const axis=operation==='space-x'?'x':'y',dim=axis==='x'?'width':'height',sorted=[...layers].sort((a,b)=>a[axis]-b[axis]);
  const gap=(sorted.at(-1)![axis]+sorted.at(-1)![dim]-sorted[0][axis]-layers.reduce((s,l)=>s+l[dim],0))/(layers.length-1);
  if(gap<0)throw Error('Move the outer layers farther apart before distributing.');let cursor=sorted[0][axis];
  for(const l of sorted){changed.set(l.id,moveLayer(l,axis==='x'?cursor:l.x,axis==='y'?cursor:l.y));cursor+=l[dim]+gap;}
 }else for(const l of layers)changed.set(l.id,moveLayer(l,operation==='left'?x:operation==='center'?(x+right-l.width)/2:operation==='right'?right-l.width:l.x,operation==='top'?y:operation==='middle'?(y+bottom-l.height)/2:operation==='bottom'?bottom-l.height:l.y));
 return {...scene,layers:scene.layers.map(l=>changed.get(l.id)||l)};
}
export function shiftKeys(keys:Keyframe[],indices:number[],delta:number,duration:number,copy=false):Keyframe[]{
 const picked=keys.filter((_,i)=>indices.includes(i));if(!picked.length)return keys;
 delta=Math.max(-Math.min(...picked.map(k=>k.time)),Math.min(duration-Math.max(...picked.map(k=>k.time)),delta));
 const shifted=picked.map(k=>({...k,time:Math.round((k.time+delta)*1000000)/1000000}));
 const rest=keys.filter((k,i)=>(copy||!indices.includes(i))&&!shifted.some(n=>Math.abs(n.time-k.time)<.000001));
 if(rest.length+shifted.length>1000)throw Error('A property supports up to 1000 keys.');return [...rest,...shifted].sort((a,b)=>a.time-b.time);
}
export function motionPreset(layer:Layer,preset:string,duration:number):Layer{
 const end=Math.min(duration,1),keys={...layer.keys};
 const track=(p:Property,start:number,finish:number)=>{keys[p]=[{time:0,value:start,ease:'bezier',curve:[.2,.8,.2,1]},{time:end,value:finish,ease:'linear'}];};
 if(preset==='fade'||preset==='slide'){track('opacity',0,layer.opacity);if(preset==='slide')track('x',layer.x-200,layer.x);}
 if(preset==='pop'){track('scaleX',.5,propertyValue(layer,'scaleX'));track('scaleY',.5,propertyValue(layer,'scaleY'));track('opacity',0,layer.opacity);}
 if(preset==='out')keys.opacity=[{time:Math.max(0,duration-1),value:layer.opacity,ease:'smooth'},{time:duration,value:0,ease:'linear'}];
 return {...layer,keys};
}
export function defaultCues(duration:number){return [{id:uid(),name:'Intro',start:0,end:duration/3,loop:false,finish:'hold' as const},{id:uid(),name:'Hold',start:duration/3,end:duration*2/3,loop:true,finish:'hold' as const},{id:uid(),name:'Outro',start:duration*2/3,end:duration,loop:false,finish:'hide' as const}];}
