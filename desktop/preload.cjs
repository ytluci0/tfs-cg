const {contextBridge,ipcRenderer}=require('electron');
const call=(name,...args)=>ipcRenderer.invoke('broadcastcg:'+name,...args);
contextBridge.exposeInMainWorld('broadcastCG',Object.freeze({
  auth:async(action,data)=>{const result=await call('auth',action,data);if(!result.ok){const error=new Error(result.error);error.status=result.status;throw error;}return result.value;},
  preparePsd:()=>call('preparePsd'),
  commitPsd:options=>call('commitPsd',options),
  cancelPsd:()=>call('cancelPsd'),
  info:()=>call('info'),
  status:()=>call('status'),
  settings:()=>call('settings'),
  saveSettings:value=>call('saveSettings',value),
  openOutput:displayId=>call('openOutput',displayId),
  importProject:()=>call('importProject'),
  exportProject:project=>call('exportProject',project),
  exportDiagnostics:()=>call('exportDiagnostics'),
  acknowledgeProgram:revision=>ipcRenderer.send('broadcastcg:rendered',revision),
  onProgram:listener=>{const handler=(_event,program)=>listener(program);ipcRenderer.on('broadcastcg:program',handler);return()=>ipcRenderer.removeListener('broadcastcg:program',handler);},
}));
