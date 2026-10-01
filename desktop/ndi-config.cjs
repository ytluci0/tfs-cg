const {existsSync}=require('node:fs');
const {join}=require('node:path');
function detectNdi(){
 const folders=[process.env.NDI_RUNTIME_DIR_V6,process.env.NDI_RUNTIME_DIR_V5,join(process.env.ProgramW6432||'C:\\Program Files','NDI','NDI 6 Tools','Runtime'),join(process.env.ProgramW6432||'C:\\Program Files','NDI','NDI 5 Runtime','v5')].filter(Boolean);
 const path=folders.map(p=>join(p,'Processing.NDI.Lib.x64.dll')).find(existsSync);
 return {available:!!path,path:path||null};
}
function ndiConfig(value){const source=typeof value.source==='string'?value.source.trim():'';if(!/^[\w .()-]{1,80}$/.test(source))throw Error('Use 1–80 letters, numbers, spaces, periods, parentheses or hyphens for the NDI source name.');if(value.width>1920)throw Error('Direct NDI currently supports 720p and 1080p.');return{...value,source};}
module.exports={detectNdi,ndiConfig};
