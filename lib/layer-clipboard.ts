import {uid,type Layer,type Scene} from './studio-model.ts';
import {linkedLayerIds,remapLayerLinks} from './layer-links.ts';
export type LayerClipboard={projectId:string;sceneId:string;layers:Layer[];groups:NonNullable<Scene['groups']>};
export function copyLayers(projectId:string,scene:Scene,selection:string[]):LayerClipboard{
 const layers=scene.layers.filter(l=>selection.includes(l.id));if(!layers.length)throw Error('Select layers to copy.');
 const required=new Set<string>();for(const l of layers){let id=l.groupId;while(id&&!required.has(id)){required.add(id);id=scene.groups?.find(g=>g.id===id)?.parentId;}}
 return structuredClone({projectId,sceneId:scene.id,layers,groups:(scene.groups||[]).filter(g=>required.has(g.id))});
}
export function pasteLayers(projectId:string,scene:Scene,clipboard:LayerClipboard){
 if(projectId!==clipboard.projectId)throw Error('Copy and paste layers within the same project to retain local assets and data bindings.');
 if(scene.layers.length+clipboard.layers.length>250)throw Error('A scene supports up to 250 layers.');
 const same=scene.id===clipboard.sceneId&&clipboard.groups.every(g=>scene.groups?.some(v=>v.id===g.id)),ids=new Map(clipboard.layers.map(l=>[l.id,uid()])),groupIds=new Map(clipboard.groups.map(g=>[g.id,same?g.id:uid()]));
 for(const l of clipboard.layers)for(const ref of linkedLayerIds(l))if(!ids.has(ref)&&(!same||!scene.layers.some(v=>v.id===ref)))throw Error('Copy the linked layer together with this layer: '+l.name);
 const groups=same?scene.groups:[...(scene.groups||[]),...clipboard.groups.map(g=>({...structuredClone(g),id:groupIds.get(g.id)!,parentId:groupIds.get(g.parentId||'')}))];
 if((groups?.length||0)>250)throw Error('A scene supports up to 250 groups.');
 const layers=clipboard.layers.map(l=>({...remapLayerLinks(structuredClone(l),ids),id:ids.get(l.id)!,name:(l.name+' copy').slice(0,200),locked:false,groupId:groupIds.get(l.groupId||''),graphicLink:undefined,layout:l.layout?{...l.layout,target:ids.get(l.layout.target||'')||l.layout.target}:undefined,visual:l.visual?{...structuredClone(l.visual),clipLayer:ids.get(l.visual.clipLayer||'')||l.visual.clipLayer}:undefined}));
 return {scene:{...scene,groups,layers:[...scene.layers,...layers]},selection:layers.map(l=>l.id)};
}
export function ungroupLayers(scene:Scene,selection:string[]):Scene{
 const ids=new Set(scene.layers.filter(l=>selection.includes(l.id)).map(l=>l.groupId).filter((id):id is string=>!!id));if(!ids.size)throw Error('Select a grouped layer.');
 const groups=(scene.groups||[]).filter(g=>ids.has(g.id));
 if(groups.some(g=>g.transform||g.repeat||g.opacity!==1||!g.visible))throw Error('This group has transforms, opacity or repeated data. Edit its group settings before ungrouping.');
 if(scene.layers.some(l=>ids.has(l.groupId||'')&&l.locked))throw Error('Unlock grouped layers before ungrouping.');
 const parent=(id:string|undefined):string|undefined=>ids.has(id||'')?parent(groups.find(g=>g.id===id)?.parentId):id;
 return {...scene,groups:scene.groups?.filter(g=>!ids.has(g.id)).map(g=>({...g,parentId:parent(g.parentId)})),layers:scene.layers.map(l=>({...l,groupId:parent(l.groupId)}))};
}
