import {validateProject,type Control,type Project,type PanelComponent} from './studio-model.ts';
const sharedFields=['color','appearance','stateStyles','fontSize','homeColor','awayColor','imageFit'] as const;
function presentation(c:Control){return Object.fromEntries(sharedFields.map(k=>[k,structuredClone(c[k])])) as Pick<Control,typeof sharedFields[number]>;}
export function remapStyle<T>(value:T,rename:(key:string)=>string):T{
 if(typeof value==='string')return value.replace(/\{\{\s*([\w.-]+)\s*\}\}/g,(_match,key)=>'{{'+rename(key)+'}}') as T;
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,remapStyle(v,rename)])) as T;
 return value;
}
export function publishComponentStyles(project:Project,componentId:string,selected:string[]):Project{
 const component=project.panelComponents?.find(c=>c.id===componentId);if(!component)throw Error('Component no longer exists.');
 const sources=project.panels.flatMap(p=>p.controls).filter(c=>selected.includes(c.id)&&c.componentLink?.componentId===componentId);
 if(!sources.length)throw Error('Select a linked instance of this component first.');
 if(new Set(sources.map(c=>c.componentLink!.controlId)).size!==sources.length)throw Error('Select controls from one instance at a time.');
 const styles=new Map(sources.map(c=>{const prefix=c.componentLink?.prefix||'';return[c.componentLink!.controlId,remapStyle(presentation(c),key=>prefix&&key.startsWith(prefix)?key.slice(prefix.length):key)];}));
 const next:PanelComponent={...component,controls:component.controls.map(c=>styles.has(c.id)?{...c,...styles.get(c.id)}:c)};
 return validateProject({...project,panelComponents:project.panelComponents?.map(c=>c.id===componentId?next:c),panels:project.panels.map(p=>({...p,controls:p.controls.map(c=>c.componentLink?.componentId===componentId&&styles.has(c.componentLink.controlId)?{...c,...remapStyle(styles.get(c.componentLink.controlId),key=>(c.componentLink?.prefix||'')+key)}:c)}))});
}
export function detachComponent(project:Project,instanceId:string):Project{return {...project,panels:project.panels.map(p=>({...p,controls:p.controls.map(c=>c.componentLink?.instanceId===instanceId?{...c,componentLink:undefined}:c)}))};}
