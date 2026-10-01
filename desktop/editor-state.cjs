const {createHash}=require('node:crypto');
function clean(section,value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid editor state.');
 const id=v=>typeof v==='string'&&v.length>0&&v.length<=100;
 if(section==='workspace'){
  if(!id(value.projectId)||!id(value.sceneId)||!['design','animate','data','panels','sports','air'].includes(value.view)||!Number.isFinite(value.time)||value.time<0||value.time>600)throw Error('Invalid workspace position.');
  return{projectId:value.projectId,sceneId:value.sceneId,view:value.view,time:value.time};
 }
 if(section==='panel'){
  if(!id(value.panelId)||!['build','operate'].includes(value.mode)||!(value.zoom==='fit'||Number.isFinite(value.zoom)&&value.zoom>=.1&&value.zoom<=4)||!Array.isArray(value.selection)||value.selection.length>500||!value.selection.every(id))throw Error('Invalid panel position.');
  return{panelId:value.panelId,mode:value.mode,zoom:value.zoom,selection:[...new Set(value.selection)]};
 }
 throw Error('Unsupported editor section.');
}
exports.createEditorState=({settings,identity})=>({
 access(section,projectId,value){
  const scope=identity();if(!['workspace','panel'].includes(section)||projectId!==undefined&&(typeof projectId!=='string'||projectId.length>100||!projectId))throw Error('Invalid editor state key.');
  const prefix='editorState:'+createHash('sha256').update(scope).digest('hex')+':'+section+':',key=prefix+(projectId||'last');
  if(value===undefined){const old=settings.get(key);if(!old)return null;try{return clean(section,old);}catch{return null;}}
  const next=clean(section,value);if(section==='workspace'&&projectId!==next.projectId)throw Error('Workspace position does not match its project.');
  settings.set(key,next);if(section==='workspace')settings.set(prefix+'last',next);return next;
 }
});
