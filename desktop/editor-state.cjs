const {createHash}=require('node:crypto');
function clean(section,value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid editor state.');
 const id=v=>typeof v==='string'&&v.length>0&&v.length<=100;
 if(section==='workspace'){
  if(!id(value.projectId)||!id(value.sceneId)||!['design','animate','data','panels','sports','air'].includes(value.view)||!Number.isFinite(value.time)||value.time<0||value.time>600)throw Error('Invalid workspace position.');
  return{projectId:value.projectId,sceneId:value.sceneId,view:value.view,time:value.time};
 }
 if(section==='panel'){
  if(!id(value.panelId)||!['build','operate'].includes(value.mode)||!(['fit','workspace'].includes(value.zoom)||Number.isFinite(value.zoom)&&value.zoom>=.1&&value.zoom<=4)||!Array.isArray(value.selection)||value.selection.length>500||!value.selection.every(id))throw Error('Invalid panel position.');
  return{panelId:value.panelId,mode:value.mode,zoom:value.zoom,selection:[...new Set(value.selection)],...(value.viewportVersion===2?{viewportVersion:2}:{})};
 }
 if(section==='design'){
  const number=(v,min,max)=>Number.isFinite(v)&&v>=min&&v<=max;
  if(!number(value.left,150,650)||!number(value.right,150,650)||!value.panels)throw Error('Invalid design dock size.');
  const panels={};for(const key of ['scenes','layers','properties']){const p=value.panels[key];if(!p||!['left','right','float'].includes(p.dock)||typeof p.hidden!=='boolean'||!number(p.x,0,20000)||!number(p.y,0,20000)||!number(p.width,180,650)||!number(p.height,70,20000))throw Error('Invalid design panel position.');panels[key]={dock:p.dock,hidden:p.hidden,x:p.x,y:p.y,width:p.width,height:p.height};}
  return {left:value.left,right:value.right,panels};
 }
 throw Error('Unsupported editor section.');
}
exports.createEditorState=({settings,identity})=>({
 access(section,projectId,value){
  const scope=identity();if(!['workspace','panel','design'].includes(section)||projectId!==undefined&&(typeof projectId!=='string'||projectId.length>100||!projectId))throw Error('Invalid editor state key.');
  const prefix='editorState:'+createHash('sha256').update(scope).digest('hex')+':'+section+':',key=prefix+(projectId||'last');
  if(value===undefined){const old=settings.get(key);if(!old)return null;try{return clean(section,old);}catch{return null;}}
  const next=clean(section,value);if(section==='workspace'&&projectId!==next.projectId)throw Error('Workspace position does not match its project.');
  settings.set(key,next);if(section==='workspace')settings.set(prefix+'last',next);return next;
 }
});
