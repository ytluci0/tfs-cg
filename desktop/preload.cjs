const {contextBridge,ipcRenderer}=require('electron');
const call=(name,...args)=>ipcRenderer.invoke('broadcastcg:'+name,...args);
contextBridge.exposeInMainWorld('broadcastCG',Object.freeze({
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
