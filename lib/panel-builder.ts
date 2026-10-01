import {remapStyle} from './linked-components.ts';
import {controlActions} from './creative-tools.ts';
import {checkCondition,planActions} from './action-logic.ts';
import {uid,panelComponentSchema,validateProject,type Control,type Panel,type PanelComponent,type Project} from './studio-model.ts';
import {arrangePanel,controlBounds,panelSize,type ControlBounds} from './panel-layout.ts';
export const isControlLocked=(panel:Panel,c:Control)=>!!c.locked||!!panel.groups?.find(g=>g.id===c.groupId)?.locked;
export function expandSelection(panel:Panel,ids:string[],individual=false):string[]{
 const selected=new Set(ids),groups=new Set(panel.controls.filter(c=>selected.has(c.id)).map(c=>c.groupId).filter(Boolean));
 return panel.controls.filter(c=>selected.has(c.id)||!individual&&c.groupId&&groups.has(c.groupId)).map(c=>c.id);
}
export function selectionBounds(panel:Panel,ids:string[]):ControlBounds|null{
 const bounds=panel.controls.flatMap((c,i)=>ids.includes(c.id)?[controlBounds(panel,c,i)]:[]);if(!bounds.length)return null;
 const x=Math.min(...bounds.map(b=>b.x)),y=Math.min(...bounds.map(b=>b.y));return{x,y,width:Math.max(...bounds.map(b=>b.x+b.width))-x,height:Math.max(...bounds.map(b=>b.y+b.height))-y};
}
const editable=(panel:Panel,ids:string[])=>panel.controls.some(c=>ids.includes(c.id))&&!panel.controls.some(c=>ids.includes(c.id)&&isControlLocked(panel,c));
function positions(panel:Panel,map:Map<string,ControlBounds>):Panel{return{...panel,layoutVersion:2,controls:panel.controls.map(c=>map.has(c.id)?{...c,placement:map.get(c.id)!}:c)};}
export function moveSelection(panel:Panel,ids:string[],dx:number,dy:number,snap=0):Panel{
 const box=selectionBounds(panel,ids);if(!box||!editable(panel,ids))return panel;
 const size=panelSize(panel),round=(n:number)=>snap?Math.round(n/snap)*snap:n;
 dx=Math.max(-box.x,Math.min(size.width-box.x-box.width,round(box.x+dx)-box.x));dy=Math.max(-box.y,Math.min(size.height-box.y-box.height,round(box.y+dy)-box.y));
 if(!dx&&!dy)return panel;
 return positions(panel,new Map(panel.controls.flatMap((c,i)=>{const b=controlBounds(panel,c,i);return ids.includes(c.id)?[[c.id,{...b,x:Math.round(b.x+dx),y:Math.round(b.y+dy)}]]:[];})));
}
export function resizeSelection(panel:Panel,ids:string[],width:number,height:number,proportional=false):Panel{
 const box=selectionBounds(panel,ids);if(!box||!editable(panel,ids))return panel;
 const chosen=panel.controls.flatMap((c,i)=>ids.includes(c.id)?[{id:c.id,b:controlBounds(panel,c,i)}]:[]),size=panelSize(panel);
 const minX=Math.max(...chosen.map(c=>24/c.b.width)),minY=Math.max(...chosen.map(c=>24/c.b.height)),maxX=(size.width-box.x)/box.width,maxY=(size.height-box.y)/box.height;
 let sx=Math.max(minX,Math.min(maxX,width/box.width)),sy=Math.max(minY,Math.min(maxY,height/box.height));
 if(proportional)sx=sy=Math.max(minX,minY,Math.min(maxX,maxY,sx,sy));
 return positions(panel,new Map(chosen.map(({id,b})=>{const x=Math.round(box.x+(b.x-box.x)*sx),y=Math.round(box.y+(b.y-box.y)*sy);return[id,{x,y,width:Math.round(box.x+(b.x-box.x+b.width)*sx)-x,height:Math.round(box.y+(b.y-box.y+b.height)*sy)-y}];})));
}
export type Align='left'|'center'|'right'|'top'|'middle'|'bottom';
export function alignSelection(panel:Panel,ids:string[],alignment:Align):Panel{
 const box=selectionBounds(panel,ids);if(ids.length<2||!box||!editable(panel,ids))return panel;
 return positions(panel,new Map(panel.controls.flatMap((c,i)=>{if(!ids.includes(c.id))return[];const b=controlBounds(panel,c,i);return[[c.id,{...b,x:alignment==='left'?box.x:alignment==='center'?Math.round(box.x+(box.width-b.width)/2):alignment==='right'?box.x+box.width-b.width:b.x,y:alignment==='top'?box.y:alignment==='middle'?Math.round(box.y+(box.height-b.height)/2):alignment==='bottom'?box.y+box.height-b.height:b.y}]];})));
}
export function distributeSelection(panel:Panel,ids:string[],axis:'x'|'y'):Panel{
 if(ids.length<3||!editable(panel,ids))return panel;const dimension=axis==='x'?'width':'height';
 const items=panel.controls.flatMap((c,i)=>ids.includes(c.id)?[{id:c.id,b:controlBounds(panel,c,i)}]:[]).sort((a,b)=>a.b[axis]-b.b[axis]);
 const first=items[0].b,last=items.at(-1)!.b,gap=(last[axis]+last[dimension]-first[axis]-items.reduce((s,c)=>s+c.b[dimension],0))/(items.length-1);
 if(gap<0)throw Error('There is not enough space between the outer controls. Move them farther apart first.');
 let cursor=first[axis];return positions(panel,new Map(items.map(({id,b})=>{const next={...b,[axis]:Math.round(cursor)};cursor+=b[dimension]+gap;return[id,next];})));
}
export function cleanGroups(panel:Panel):Panel{return{...panel,layoutVersion:2,groups:panel.groups?.filter(g=>panel.controls.some(c=>c.groupId===g.id))};}
export function groupSelection(panel:Panel,ids:string[],name='Control group'):Panel{
 if(ids.length<2||!editable(panel,ids))return panel;const id=uid();return cleanGroups({...panel,groups:[...(panel.groups||[]),{id,name:name.trim().slice(0,100)||'Control group'}],controls:panel.controls.map(c=>ids.includes(c.id)?{...c,groupId:id}:c)});
}
export function ungroupSelection(panel:Panel,ids:string[]):Panel{if(!editable(panel,expandSelection(panel,ids)))return panel;const groups=new Set(panel.controls.filter(c=>ids.includes(c.id)).map(c=>c.groupId));return cleanGroups({...panel,controls:panel.controls.map(c=>c.groupId&&groups.has(c.groupId)?{...c,groupId:undefined}:c)});}
export function deleteSelection(panel:Panel,ids:string[]):Panel{if(!editable(panel,ids))return panel;return cleanGroups({...panel,controls:panel.controls.filter(c=>!ids.includes(c.id)).map(c=>c.player?.fieldId&&ids.includes(c.player.fieldId)?{...c,player:{...c.player,fieldId:undefined}}:c)});}
export function orderSelection(panel:Panel,ids:string[],direction:'front'|'back'):Panel{
 if(!editable(panel,ids))return panel;const picked=panel.controls.filter(c=>ids.includes(c.id)),rest=panel.controls.filter(c=>!ids.includes(c.id));return{...panel,layoutVersion:2,controls:direction==='front'?[...rest,...picked]:[...picked,...rest]};
}
function vacantOrigin(panel:Panel,width:number,height:number){
 const size=panelSize(panel),occupied=panel.controls.map((c,i)=>controlBounds(panel,c,i));
 if(width>size.width||height>10000)throw Error('This component is larger than the canvas. Increase the canvas width first.');
 const xs=[0,...occupied.map(b=>Math.ceil((b.x+b.width+16)/16)*16)].filter(x=>x+width<=size.width).sort((a,b)=>a-b),ys=[0,...occupied.map(b=>Math.ceil((b.y+b.height+16)/16)*16)].sort((a,b)=>a-b);
 for(const y of ys)for(const x of xs)if(y+height<=10000&&!occupied.some(b=>x<b.x+b.width+8&&x+width+8>b.x&&y<b.y+b.height+8&&y+height+8>b.y))return{x,y};
 throw Error('No space remains on this canvas. Move or remove controls before adding this component.');
}
export function duplicateSelection(panel:Panel,ids:string[]):{panel:Panel;ids:string[]}{
 if(!panel.freeLayout)panel=arrangePanel(panel);
 const chosen=panel.controls.filter(c=>ids.includes(c.id)),box=selectionBounds(panel,ids);if(!box||!chosen.length)return{panel,ids:[]};if(panel.controls.length+chosen.length>500)throw Error('A panel supports up to 500 controls.');
 const base=arrangePanel(panel),origin=vacantOrigin(base,box.width,box.height),groups=new Map<string,string>();
 for(const c of chosen)if(c.groupId&&!groups.has(c.groupId))groups.set(c.groupId,uid());
 if((base.groups?.length||0)+groups.size>250)throw Error('A panel supports up to 250 groups.');
 const instances=new Map<string,string>();for(const c of chosen)if(c.componentLink&&!instances.has(c.componentLink.instanceId))instances.set(c.componentLink.instanceId,uid());
 const newIds=new Map(chosen.map(c=>[c.id,uid()]));
 const copies=chosen.map(c=>{const b=controlBounds(panel,c,panel.controls.indexOf(c));return{...structuredClone(c),id:newIds.get(c.id)!,player:c.player?{...c.player,fieldId:c.player.fieldId?newIds.get(c.player.fieldId):undefined}:undefined,componentLink:c.componentLink?{...c.componentLink,instanceId:instances.get(c.componentLink.instanceId)!}:undefined,shortcut:'',locked:false,groupId:c.groupId?groups.get(c.groupId):undefined,actions:c.actions.map(a=>({...a,id:uid()})),placement:{...b,x:origin.x+b.x-box.x,y:origin.y+b.y-box.y}};});
 return{panel:{...base,layoutVersion:2,canvasHeight:Math.max(panelSize(base).height,origin.y+box.height),groups:[...(base.groups||[]),...[...groups].map(([old,id])=>({id,name:(base.groups?.find(g=>g.id===old)?.name||'Group').slice(0,90)+' copy'}))],controls:[...base.controls,...copies]},ids:copies.map(c=>c.id)};
}
export function referencedVariables(controls:Control[]):Set<string>{
 const names=new Set<string>();for(const c of controls){if(c.variable)names.add(c.variable);Object.values(c.selectionBindings||{}).forEach(v=>names.add(v));for(const condition of [c.enabledWhen,c.visibleWhen,c.liveWhen])for(const rule of condition?.rules||[])names.add(rule.variable);Object.values(c.dataFields||{}).forEach(v=>names.add(v));for(const a of [...c.actions,...Object.values(c.events||{}).flat()]){for(const r of a.when?.rules||[])names.add(r.variable);if(['set','increment','counter','clock'].includes(a.type)&&a.target)names.add(a.target);if(a.condition.trim())names.add(a.condition.split('=')[0].trim());}for(const m of JSON.stringify(c).matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)){if(c.kind!=='player'||!m[1].startsWith('player.'))names.add(m[1]);}}return names;
}
const footballDefaults={homeTeam:'HOME',awayTeam:'AWAY',homeScore:0,awayScore:0,matchClock:'00:00',homeFormation:'4-3-3',awayFormation:'4-3-3',homeColor:'#3478ee',awayColor:'#df3b48'};
function explicitFields(c:Control):Control['dataFields']{
 if(!['scoreboard','pitch','bench','player'].includes(c.kind))return c.dataFields;
 const fields=Object.keys(footballDefaults).filter(k=>c.kind==='player'&&(k===c.player?.team+'Color'||k===c.player?.team+'Formation')||c.kind==='scoreboard'||c.kind==='pitch'&&(k.endsWith('Formation')||k.endsWith('Color'))||c.kind==='bench'&&(k.endsWith('Team')||k.endsWith('Color')));
 return Object.fromEntries(fields.filter(k=>!k.endsWith('Color')||c.dataFields?.[k as keyof typeof footballDefaults]||!c[k as 'homeColor'|'awayColor']).map(k=>[k,c.dataFields?.[k as keyof typeof footballDefaults]||k]));
}
export function makeComponent(project:Project,panel:Panel,ids:string[],name:string):PanelComponent{
 if(!panel.freeLayout)panel=arrangePanel(panel);
 const chosen=panel.controls.filter(c=>ids.includes(c.id)).map(c=>({...c,dataFields:explicitFields(c)})),box=selectionBounds(panel,ids);if(!chosen.length||!box)throw Error('Select controls to save.');if(chosen.length>100)throw Error('A reusable component supports up to 100 controls.');
 if(!name.trim())throw Error('Enter a component name.');const variables:Project['variables']={};for(const k of referencedVariables(chosen))if(Object.hasOwn(project.variables,k))variables[k]=project.variables[k];else if(Object.hasOwn(footballDefaults,k))variables[k]=footballDefaults[k as keyof typeof footballDefaults];
 return{id:uid(),version:1,name:name.trim().slice(0,100),width:box.width,height:box.height,variables,controls:chosen.map(c=>{const b=controlBounds(panel,c,panel.controls.findIndex(x=>x.id===c.id));return{...structuredClone(c),player:c.player?{...c.player,fieldId:chosen.some(v=>v.id===c.player?.fieldId)?c.player.fieldId:undefined}:undefined,componentLink:undefined,groupId:undefined,locked:false,hidden:false,shortcut:'',placement:{...b,x:b.x-box.x,y:b.y-box.y}};})};
}
export function insertComponent(project:Project,panelId:string,component:PanelComponent,prefix='',linked=false):{project:Project;ids:string[]}{
 component=panelComponentSchema.parse(component);
 if(prefix&&!/^[a-zA-Z][a-zA-Z0-9_.-]{0,49}$/.test(prefix))throw Error('Use a prefix starting with a letter, up to 50 letters, numbers, dots, underscores or hyphens.');
 const original=project.panels.find(p=>p.id===panelId);if(!original)throw Error('Panel no longer exists.');if(original.controls.length+component.controls.length>500)throw Error('A panel supports up to 500 controls.');if((original.groups?.length||0)>=250)throw Error('A panel supports up to 250 groups.');
 const panel=arrangePanel(original),origin=vacantOrigin(panel,component.width,component.height),groupId=uid(),rename=(key:string)=>prefix?prefix+key:key,variables={...project.variables};
 const remap=(s:string)=>s.replace(/\{\{\s*([\w.-]+)\s*\}\}/g,(_m,key)=>'{{'+rename(key)+'}}');
 for(const [key,value] of Object.entries(component.variables)){const next=rename(key);if(next.length>100)throw Error('A prefixed variable name exceeds 100 characters.');if(Object.hasOwn(variables,next)){if(typeof variables[next]!==typeof value)throw Error('Variable '+next+' has a different type. Choose a new prefix.');}else variables[next]=value;}
 const mapCondition=(when:Control['enabledWhen'])=>when?{...when,rules:when.rules.map(r=>({...r,variable:rename(r.variable)}))}:undefined;const mapActions=(actions:Control['actions'])=>actions.map(a=>({...a,id:uid(),when:mapCondition(a.when),target:['set','increment','counter','clock'].includes(a.type)?rename(a.target):a.target,value:remap(a.value),condition:a.condition.trim()?a.condition.replace(/^\s*([^=]+?)(\s*=|$)/,(_m,key,end)=>rename(key.trim())+end):''}));
 const newIds=new Map(component.controls.map(c=>[c.id,uid()]));
 const controls=component.controls.map(c=>({...structuredClone(c),id:newIds.get(c.id)!,player:c.player?{...c.player,fieldId:c.player.fieldId?newIds.get(c.player.fieldId):undefined}:undefined,groupId,locked:false,hidden:false,shortcut:'',componentLink:linked?{componentId:component.id,controlId:c.id,instanceId:groupId,prefix}:undefined,enabledWhen:mapCondition(c.enabledWhen),visibleWhen:mapCondition(c.visibleWhen),liveWhen:mapCondition(c.liveWhen),events:c.events?Object.fromEntries(Object.entries(c.events).map(([event,actions])=>[event,mapActions(actions)])):undefined,selectionBindings:c.selectionBindings?Object.fromEntries(Object.entries(c.selectionBindings).map(([field,key])=>[field,rename(key)])):undefined,color:remap(c.color),artwork:remapStyle(c.artwork,key=>c.kind==='player'&&key.startsWith('player.')?key:rename(key)),appearance:remapStyle(c.appearance,rename),stateStyles:remapStyle(c.stateStyles,rename),variable:c.variable?rename(c.variable):'',label:remap(c.label),imageSrc:c.imageSrc?remap(c.imageSrc):undefined,dataFields:c.dataFields?Object.fromEntries(Object.entries(c.dataFields).map(([k,v])=>[k,rename(v)])):undefined,actions:c.actions.map(a=>({...a,id:uid(),when:a.when?{...a.when,rules:a.when.rules.map(r=>({...r,variable:rename(r.variable)}))}:undefined,target:['set','increment','counter','clock'].includes(a.type)?rename(a.target):a.target,value:remap(a.value),condition:a.condition.trim()?a.condition.replace(/^\s*([^=]+?)(\s*=|$)/,(_m,key,end)=>rename(key.trim())+end):''})),placement:{...c.placement!,x:origin.x+c.placement!.x,y:origin.y+c.placement!.y}}));
 const next:Panel={...panel,layoutVersion:2,canvasHeight:Math.max(panelSize(panel).height,origin.y+component.height),groups:[...(panel.groups||[]),{id:groupId,name:component.name}],controls:[...panel.controls,...controls]};
 return{project:validateProject({...project,variables,panels:project.panels.map(p=>p.id===panelId?next:p)}),ids:controls.map(c=>c.id)};
}
export type PanelIssue={controlId:string;severity:'error'|'warning';message:string};
export function panelIssues(project:Project,panel:Panel):PanelIssue[]{
 const issues:PanelIssue[]=[],shortcuts=new Map<string,Control[]>();
 for(const c of panel.controls){if(c.hidden)continue;const add=(message:string,severity:PanelIssue['severity']='error')=>issues.push({controlId:c.id,message,severity});
  if(!['button','pitch','bench','scoreboard','label','image','artwork','player'].includes(c.kind)){if(!c.variable||!Object.hasOwn(project.variables,c.variable))add('Choose an existing variable.');else{const value=project.variables[c.variable];if(['number','counter','slider','progress'].includes(c.kind)&&typeof value!=='number')add('This control requires a numeric variable.');if(c.kind==='toggle'&&typeof value!=='boolean')add('Toggle requires a Boolean variable.');if(['text','select','formation','color','segmented','roster','widget'].includes(c.kind)&&typeof value!=='string')add('This control requires a text variable.');if(c.kind==='timer'&&typeof value==='boolean')add('Clock requires a text or numeric variable.');}}
  for(const [field,key] of Object.entries(c.dataFields||{})){if(!key||!Object.hasOwn(project.variables,key))add('Missing data connection for '+field+'.');else if(field.endsWith('Score')&&typeof project.variables[key]!=='number')add(field+' requires a numeric variable.');}
  try{for(const event of ['click','press','release','hold'] as const)planActions(project,controlActions(c,event));for(const when of [c.enabledWhen,c.visibleWhen,c.liveWhen])if(when)checkCondition(when,project.variables);for(const target of Object.values(c.selectionBindings||{}))if(!Object.hasOwn(project.variables,target))throw Error('Selection variable is missing: '+target);if(c.optionSource&&!project.sources.some(s=>s.id===c.optionSource?.sourceId))throw Error('Choice API source is missing.');}catch(e){add((e as Error).message);}
  if(c.shortcut){const key=c.shortcut.toLowerCase();shortcuts.set(key,[...(shortcuts.get(key)||[]),c]);}
  if(c.kind==='player'){if(!c.player)add('Choose a player source.');else if(c.player.fieldId&&!panel.controls.some(v=>v.id===c.player!.fieldId&&v.kind==='artwork'))add('Choose an existing artwork control for the formation field.');}
  if(c.kind==='button'&&!c.actions.length&&!Object.values(c.events||{}).some(a=>a.length))add('This button has no actions.','warning');
  if(panel.touchMode&&panel.freeLayout){const b=controlBounds(panel,c,panel.controls.indexOf(c)),height=['counter','timer','color','slider','segmented'].includes(c.kind)?160:['button','label','image','pitch','bench','scoreboard'].includes(c.kind)?64:120;if(b.height<height||b.width<160)add('Increase this control to at least 160 × '+height+' px for touch operation.','warning');}
 }
 for(const [shortcut,controls] of shortcuts)if(controls.length>1)controls.forEach(c=>issues.push({controlId:c.id,severity:'error',message:'Shortcut '+shortcut.toUpperCase()+' is assigned more than once.'}));
 return issues;
}
