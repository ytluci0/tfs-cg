import {atTime,layer,moveLayer,textValue,uid,type Layer,type Project,type Scene} from './studio-model.ts';

export function vectorPath(l:Layer):string{
 const pts=l.visual?.points||[{x:0,y:1},{x:.5,y:0},{x:1,y:1}];
 const segment=(a:typeof pts[number],b:typeof a)=>a.outX!==undefined||b.inX!==undefined?`C ${(a.outX??a.x)*l.width} ${(a.outY??a.y)*l.height} ${(b.inX??b.x)*l.width} ${(b.inY??b.y)*l.height} ${b.x*l.width} ${b.y*l.height}`:`L ${b.x*l.width} ${b.y*l.height}`;
 return `M ${pts[0].x*l.width} ${pts[0].y*l.height} `+pts.slice(1).map((p,i)=>segment(pts[i],p)).join(' ')+(l.visual?.closed!==false?' '+segment(pts[pts.length-1],pts[0])+' Z':'');
}
export function groupTransform(g:NonNullable<Scene['groups']>[number]){const t=g.transform;return t?`translate(${t.x} ${t.y}) translate(${t.originX} ${t.originY}) rotate(${t.rotation}) scale(${t.scaleX} ${t.scaleY}) translate(${-t.originX} ${-t.originY})`:undefined;}
export function repeatRows(g:NonNullable<Scene['groups']>[number]){
 const r=g.repeat;if(!r)return[];let rows=[...r.rows];if(r.sortBy)rows.sort((a,b)=>{const x=a[r.sortBy!],y=b[r.sortBy!];return (typeof x==='number'&&typeof y==='number'?x-y:String(x??'')<String(y??'')?-1:String(x??'')>String(y??'')?1:0)*(r.descending?-1:1);});return rows.slice(0,r.limit);
}
export function expandRows(scene:Scene,variables:Project['variables']):Scene{
 const groups=scene.groups||[];if(!groups.some(g=>g.repeat))return scene;
 const layers:Layer[]=[],expanded:NonNullable<Scene['groups']>=groups.filter(g=>!g.repeat);
 for(const l of scene.layers)if(!groups.find(g=>g.id===l.groupId)?.repeat)layers.push(l);
 for(const g of groups){if(!g.repeat)continue;const r=g.repeat;
  repeatRows(g).forEach((row,i)=>{const suffix='~'+g.id+'~'+i,groupId=g.id+'~'+i;
   const column=r.direction==='horizontal'?i:r.direction==='grid'?i%r.columns:r.direction==='bracket'?Math.floor(Math.log2(i+1)):0;
   const line=r.direction==='horizontal'?0:r.direction==='grid'?Math.floor(i/r.columns):r.direction==='bracket'?(i-(2**column-1))*2**column+(2**column-1)/2:i;
   const t=g.transform||{x:0,y:0,rotation:0,scaleX:1,scaleY:1,originX:0,originY:0};
   expanded.push({...g,id:groupId,repeat:undefined,transform:{...t,x:t.x+column*r.gapX,y:t.y+line*r.gapY}});
   const values:Project['variables']={...variables,...Object.fromEntries(Object.entries(row).map(([k,v])=>['row.'+k,v])),'row.rank':i+1};
   for(const base of scene.layers.filter(l=>l.groupId===g.id)){
    let l=JSON.parse(JSON.stringify(base).replace(/\{\{\s*(row\.[^{}]+?)\s*\}\}/g,(_,key)=>JSON.stringify(String(values[key]??'')).slice(1,-1))) as Layer;
    l={...l,id:base.id+suffix,groupId,layout:l.layout?{...l.layout,target:l.layout.target?l.layout.target+suffix:undefined}:undefined,visual:l.visual?{...l.visual,clipLayer:l.visual.clipLayer?l.visual.clipLayer+suffix:undefined}:undefined};layers.push(l);
   }
  });
 }
 return {...scene,groups:expanded,layers};
}
export function resolveLayout(scene:Scene,time:number,variables:Project['variables'],measure:(l:Layer,text:string)=>number):Scene{
 const byId=new Map(scene.layers.map(l=>[l.id,l])),resolved=new Map<string,Layer>(),visiting=new Set<string>();
 function resolve(base:Layer):Layer{if(resolved.has(base.id))return resolved.get(base.id)!;if(visiting.has(base.id))return atTime(base,time);visiting.add(base.id);
  const l=atTime(base,time),v=l.layout;
  if(v?.mode==='text'){const content=textValue(l.text,variables),pad=v.padding??0,min=v.minWidth??1,max=Math.max(min,v.maxWidth??scene.width);l.width=Math.min(max,Math.max(min,measure(l,content)+pad*2));}
  const target=v?.target?byId.get(v.target):undefined;if(v&&target&&target.groupId===base.groupId){const other=resolve(target),gap=v.gap??0,pad=v.padding??12;
   if(v.mode==='fit'){l.x=other.x-pad;l.y=other.y-pad;l.width=other.width+pad*2;l.height=other.height+pad*2;}
   if(v.mode==='after'){l.x=other.x+other.width+gap;l.y=other.y;}
   if(v.mode==='below'){l.y=other.y+other.height+gap;l.x=other.x;}
  }
  visiting.delete(base.id);resolved.set(base.id,l);return l;
 }
 return {...scene,layers:scene.layers.map(resolve)};
}
export function makeGraphicComponent(project:Project,sceneId:string,ids:string[],name:string):Project{
 const scene=project.scenes.find(s=>s.id===sceneId);if(!scene)throw Error('Choose a scene.');const selected=scene.layers.filter(l=>ids.includes(l.id));
 if(!selected.length||selected.length>100)throw Error('Select 1–100 layers.');if(selected.some(l=>l.groupId))throw Error('Ungroup selected layers before saving a graphic component.');
 const x=Math.min(...selected.map(l=>l.x)),y=Math.min(...selected.map(l=>l.y)),set=new Set(ids);
 const layers=selected.map(l=>({...moveLayer(structuredClone(l),l.x-x,l.y-y),graphicLink:undefined,layout:l.layout?.target&&!set.has(l.layout.target)?undefined:l.layout,visual:l.visual?.clipLayer&&!set.has(l.visual.clipLayer)?{...l.visual,clipLayer:undefined}:l.visual}));
 return {...project,graphicComponents:[...(project.graphicComponents||[]),{id:uid(),name:name.trim()||'Graphic component',layers}]};
}
function substitute(value:unknown,prefix:string):unknown{if(typeof value==='string')return value.replace(/\{\{\s*([^{}]+?)\s*\}\}/g,(_,k)=>'{{'+prefix+k+'}}');if(Array.isArray(value))return value.map(v=>substitute(v,prefix));if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,substitute(v,prefix)]));return value;}
export function insertGraphicComponent(p:Project,sceneId:string,id:string,prefix=''):Project{
 if(prefix&&!/^[A-Za-z][\w.-]*$/.test(prefix))throw Error('Use letters, numbers, underscore, dot or dash for the prefix.');
 const component=p.graphicComponents?.find(c=>c.id===id),scene=p.scenes.find(s=>s.id===sceneId);if(!component||!scene)throw Error('Graphic component is missing.');if(scene.layers.length+component.layers.length>250)throw Error('Scene supports 250 layers.');
 const map=new Map(component.layers.map(l=>[l.id,uid()])),instanceId=uid(),variables={...p.variables};
 const layers=component.layers.map(base=>{for(const [,key] of JSON.stringify(base).matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g))if(Object.hasOwn(p.variables,key)&&!Object.hasOwn(variables,prefix+key))variables[prefix+key]=p.variables[key];
  const l=substitute(base,prefix) as Layer;return {...moveLayer(l,l.x+100,l.y+100),id:map.get(base.id)!,groupId:undefined,layout:l.layout?{...l.layout,target:map.get(l.layout.target||'')}:undefined,visual:l.visual?{...l.visual,clipLayer:map.get(l.visual.clipLayer||'')}:undefined,graphicLink:{componentId:id,layerId:base.id,instanceId,prefix,offsetX:100,offsetY:100}};
 });return {...p,variables,scenes:p.scenes.map(s=>s.id===sceneId?{...s,layers:[...s.layers,...layers]}:s)};
}
export function publishGraphicComponent(p:Project,sceneId:string,instanceId:string):Project{
 const scene=p.scenes.find(s=>s.id===sceneId),members=scene?.layers.filter(l=>l.graphicLink?.instanceId===instanceId)||[],link=members[0]?.graphicLink,component=p.graphicComponents?.find(c=>c.id===link?.componentId);
 if(!component||!link||component.layers.length!==members.length||component.layers.some(l=>!members.some(m=>m.graphicLink?.layerId===l.id)))throw Error('Publish requires a complete linked instance.');
 const original=new Map(members.map(l=>[l.id,l.graphicLink!.layerId]));
 const canonical=members.map(l=>{let next={...moveLayer(l,l.x-link.offsetX,l.y-link.offsetY),id:l.graphicLink!.layerId,groupId:undefined,graphicLink:undefined,layout:l.layout?{...l.layout,target:original.get(l.layout.target||'')}:undefined,visual:l.visual?{...l.visual,clipLayer:original.get(l.visual.clipLayer||'')}:undefined};
  if(link.prefix)next=JSON.parse(JSON.stringify(next).replace(/\{\{\s*([^{}]+?)\s*\}\}/g,(_,k)=>'{{'+(k.startsWith(link.prefix)?k.slice(link.prefix.length):k)+'}}'));return next;
 });
 return {...p,graphicComponents:p.graphicComponents?.map(c=>c.id===component.id?{...c,layers:canonical}:c),scenes:p.scenes.map(s=>({...s,layers:s.layers.map(l=>{const ref=l.graphicLink;if(ref?.componentId!==component.id)return l;const base=canonical.find(b=>b.id===ref.layerId);if(!base)return l;const ids=new Map(s.layers.filter(x=>x.graphicLink?.instanceId===ref.instanceId).map(x=>[x.graphicLink!.layerId,x.id]));const next=substitute(base,ref.prefix) as Layer;return {...moveLayer(next,next.x+ref.offsetX,next.y+ref.offsetY),id:l.id,groupId:l.groupId,graphicLink:ref,layout:next.layout?{...next.layout,target:ids.get(next.layout.target||'')}:undefined,visual:next.visual?{...next.visual,clipLayer:ids.get(next.visual.clipLayer||'')}:undefined};})}))};
}
export function dataGraphicPreset(scene:Scene,kind:string):Scene{
 if(scene.layers.length+4>250)throw Error('Scene supports 250 layers.');const groupId=uid(),rows=Array.from({length:kind==='bracket'?7:5},(_,i)=>({name:kind==='lineup'?'Player '+(i+1):'Team '+(i+1),score:10-i,photo:''}));
 const config={sourceId:'',rowsPath:'rows',fields:{name:'name',score:'score',photo:'photo'},rows,direction:kind==='bracket'?'bracket' as const:kind==='lineup'?'grid' as const:'vertical' as const,gapX:kind==='bracket'?530:380,gapY:kind==='bracket'?116:94,columns:4,limit:kind==='bracket'?7:20};
 const width=kind==='lineup'?340:kind==='bracket'?480:1000;
 return {...scene,groups:[...(scene.groups||[]),{id:groupId,name:kind+' rows',opacity:1,visible:true,repeat:config}],layers:[...scene.layers,layer('rect',{name:'Row background',groupId,x:120,y:150,width,height:76,radius:8,color:'#14283d'}),layer('text',{name:'Row rank / name',groupId,x:145,y:168,width:width-135,height:46,fontSize:30,text:'{{row.rank}}. {{row.name}}',visual:{autoFit:true}}),layer('text',{name:'Row score',groupId,x:width+15,y:168,width:85,height:46,fontSize:30,text:'{{row.score}}',align:'right',color:'#ff9b48'})]};
}
