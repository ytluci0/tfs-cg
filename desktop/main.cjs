const {app,BrowserWindow,Menu,protocol,session,screen,ipcMain,dialog,safeStorage,powerSaveBlocker}=require('electron');
const {join,resolve,relative,isAbsolute,extname}=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const {createPsdSessions}=require('./psd-session.cjs');
const {createAeSessions}=require('./ae-session.cjs');
const {restoreBounds}=require('./window-state.cjs');
const {createEditorState}=require('./editor-state.cjs');
const {resolveWorkstationData}=require('./workstation-data.cjs');
const {createOutputController}=require('./output-controller.cjs');
const {createNdiController}=require('./ndi-controller.cjs');
const {detectNdi,ndiConfig}=require('./ndi-config.cjs');
const {outputConfig}=require('./app/output-config.cjs');
const {connectObs}=require('./app/obs-client.cjs');
const {createLocalService,ServiceError}=require('./app/service.cjs');
const {createRemoteAuthority,serverProfile,provisionServer,loadServer,restoreServer,managedPolicy,readManagedPolicy,commitRestore,completeRestore,recoverInterruptedRestore,inspectBackup}=require('./app/network-runtime.cjs');
const {randomUUID,createHash}=require('node:crypto');
const {spawn,execFileSync}=require('node:child_process');

app.setName('BroadcastCG');
app.setAppUserModelId('local.broadcastcg.studio');
const qa=!app.isPackaged&&process.argv.includes('--smoke-test');
if(qa)app.setPath('userData',join(__dirname,'.cache','smoke-profile-'+Date.now()));
// Explicit custom/QA profiles remain isolated. Normal launches share stable
// storage outside MSIX's per-launcher AppData virtualization.
const standardProfile=resolve(app.getPath('userData')).toLowerCase()===resolve(join(app.getPath('appData'),'BroadcastCG')).toLowerCase();
let dataDirectory=join(app.getPath('userData'),'data');
protocol.registerSchemesAsPrivileged([{scheme:'broadcastcg',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
let studio,output,service,quitting=false,logPath,outputReady=false,lastOutputAck=null,outputUnconfirmed=false,powerBlock;
let currentToken=null,psdSessions,aeSessions,localService,remote=null,managed=null,maintenance=false;
let broadcastOutput,ndiOutput,outputMode='desktop',obs=null,obsBusy=false,outputChanging=false;
const activeOutput=()=>outputMode==='ndi'?ndiOutput:broadcastOutput;
const profiles=()=>managed?.profiles||localService.settings.get('serverProfiles',[]);
let rememberFile=join(dataDirectory,'remembered-login.bin');
const hostDirectory=join(app.getPath('userData'),'production-server');
function clearRemember(){fs.rmSync(rememberFile,{force:true});}
function acceptSession(result){
  currentToken=result.token;
  try{if(result.rememberToken){const temporary=rememberFile+'.partial';fs.writeFileSync(temporary,safeStorage.encryptString(result.rememberToken));fs.renameSync(temporary,rememberFile);}else clearRemember();}
  catch(error){service.auth.logout(currentToken);currentToken=null;throw new ServiceError('Could not protect remembered login on this workstation. Sign in with Remember me turned off.',503);}
  return result.session;
}
function authorize(permission){return service.authorize(currentToken,permission);}
function sameSession(authority,token,permission){if(service!==authority||currentToken!==token)throw Error('Account or connection changed. Start the operation again.');return authority.authorize(token,permission);}
function permittedOutput(displayId){authorize(displayId===undefined?'outputs.view':'outputs.configure');openOutput(displayId);}
function menuOutput(displayId){try{permittedOutput(displayId);}catch(e){dialog.showMessageBox(studio,{type:'info',message:e.message});}}
const pending=new Map();
function log(action,status='info'){
  if(!logPath)return;
  try{if(fs.existsSync(logPath)&&fs.statSync(logPath).size>2000000)fs.renameSync(logPath,logPath+'.previous');fs.appendFileSync(logPath,JSON.stringify({time:new Date().toISOString(),action,status})+'\n');}catch{}
}
function trusted(frame){try{const url=new URL(frame.url);return url.protocol==='broadcastcg:'&&url.hostname==='app';}catch{return false;}}
function trustedStudio(event){return event.sender===studio?.webContents&&trusted(event.senderFrame);}
const csp="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self'; media-src 'self' blob:; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
async function handleRequest(request,outputRead=false){
  const url=new URL(request.url);
  if(url.hostname!=='app'||url.username||url.password)return new Response('Forbidden',{status:403});
  const origin=request.headers.get('origin');
  if(origin&&origin!=='broadcastcg://app')return new Response('Forbidden',{status:403});
  if(maintenance&&url.pathname.startsWith('/api/'))return Response.json({error:'Recovery maintenance is in progress.'},{status:503});
  if(url.pathname.startsWith('/api/'))return service.handle(request,outputRead?service.outputContext:{token:currentToken});
  if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
  let pathname;try{pathname=decodeURIComponent(url.pathname);}catch{return new Response('Bad path',{status:400});}
  if(pathname==='/'||pathname==='/output')pathname='/index.html';
  const root=join(__dirname,'app','renderer'),target=resolve(root,'.'+pathname),rel=relative(root,target);
  if(!rel||rel.startsWith('..')||isAbsolute(rel))return new Response('Forbidden',{status:403});
  try{const bytes=await fs.promises.readFile(target);return new Response(request.method==='HEAD'?null:bytes,{headers:{'Content-Type':mime[extname(target)]||'application/octet-stream','Content-Security-Policy':csp,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'}});}catch{return new Response('Not found',{status:404});}
}
function beforePublish(){if(outputChanging)throw new ServiceError('Output configuration is changing.',503);if(outputMode==='ndi'){if(!ndiOutput?.info().ready)throw new ServiceError('NDI output is offline. Start it before TAKE.',503);return;}if(outputMode==='browser'){if(!broadcastOutput?.info().status.ready)throw new ServiceError('Browser output is offline. Start it and load its URL in OBS before TAKE.',503);return;}if(!output||output.isDestroyed()||!outputReady)throw new ServiceError('Desktop output is offline. Open the output window before TAKE.',503);}
function confirmProgram(program){
  outputUnconfirmed=true;
  if(outputMode==='browser'||outputMode==='ndi'){if(outputReady)output.webContents.send('broadcastcg:program',program);return activeOutput().publish(program).then(()=>{outputUnconfirmed=false;lastOutputAck=program.revision;}).catch(e=>{throw new ServiceError(e.message,504);});}
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{pending.delete(program.revision);log('OUTPUT_ACK_TIMEOUT','failed');reject(new ServiceError('Output acknowledgement timed out. Output state is unconfirmed; inspect the output before issuing another command.',504));},3000);
    pending.set(program.revision,{resolve:()=>{clearTimeout(timer);outputUnconfirmed=false;lastOutputAck=program.revision;resolve();},reject});
    output.webContents.send('broadcastcg:program',program);
  });
}
function bindWindow(win,key){
  const persist=()=>{if(win.isDestroyed()||win.isMinimized())return;const bounds=win.getNormalBounds(),display=screen.getDisplayMatching(bounds);service.settings.set(key,{...bounds,displayId:display.id,maximized:win.isMaximized(),fullscreen:win.isFullScreen()});};
  win.on('close',persist);
  win.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith('broadcastcg://app/'))event.preventDefault();});
  win.webContents.on('will-attach-webview',event=>event.preventDefault());
  win.webContents.setWindowOpenHandler(({url})=>{if(win===studio&&url==='broadcastcg://app/output')menuOutput();return{action:'deny'};});
  win.webContents.on('render-process-gone',(_event,details)=>{log('RENDERER_EXIT:'+details.reason,'failed');if(win===output){outputReady=false;outputUnconfirmed=true;}else if(!quitting)dialog.showMessageBox({type:'error',title:'BroadcastCG renderer stopped',message:'The editor stopped unexpectedly. Close and reopen BroadcastCG to recover the latest saved work. No output commands will be replayed.'});});
  win.webContents.on('console-message',(_event,...args)=>{const details=args[0];const level=typeof details==='object'?details.level:details;if(level==='error'||level===3)log('RENDERER_ERROR','failed');});
  win.webContents.on('unresponsive',()=>{log('RENDERER_UNRESPONSIVE','failed');if(win===output)outputReady=false;});
  win.webContents.on('responsive',()=>{if(win===output)outputReady=true;});
}
function createWindow(kind,displayId){
  const key=kind+'Window',saved=service.settings.get(key),displays=screen.getAllDisplays();
  const bounds=restoreBounds(saved,displays);
  if(displayId!==undefined){const d=displays.find(d=>d.id===displayId);if(d)Object.assign(bounds,d.workArea);}
  const win=new BrowserWindow({...bounds,show:false,minWidth:kind==='studio'?1000:320,minHeight:kind==='studio'?640:180,title:kind==='studio'?'BroadcastCG — Local workstation':'BroadcastCG — Desktop output',backgroundColor:'#10151d',icon:join(__dirname,'assets','icon.ico'),autoHideMenuBar:kind==='output',webPreferences:{partition:kind==='output'?'broadcastcg-output':undefined,preload:join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,backgroundThrottling:kind!=='output',spellcheck:false,devTools:!app.isPackaged}});
  bindWindow(win,key);
  win.once('ready-to-show',()=>{if(saved?.maximized)win.maximize();if(saved?.fullscreen)win.setFullScreen(true);win.show();});
  win.loadURL('broadcastcg://app/'+(kind==='output'?'output':''));
  return win;
}
function openOutput(displayId){
  if(output&&!output.isDestroyed()){if(Number.isInteger(displayId)){const d=screen.getAllDisplays().find(d=>d.id===displayId);if(d){output.setFullScreen(false);output.setBounds(d.workArea);}}output.show();output.focus();return;}
  outputReady=false;output=createWindow('output',displayId);
  output.webContents.once('did-finish-load',()=>{outputReady=true;log('OUTPUT_OPEN');});
  output.on('closed',()=>{if(outputMode==='desktop')remote?.releaseOutput();output=null;outputReady=false;if(outputMode==='desktop')outputUnconfirmed=true;log('OUTPUT_CLOSED');});
}
function status(){return{...(remote?remote.status():{local:true,database:service?.health()?'available':'offline',output:(outputMode==='ndi'?ndiOutput?.info().ready:outputMode==='browser'?broadcastOutput?.info().status.ready:outputReady)?'connected':'offline',outputUnconfirmed,lastOutputAck,authentication:'local-accounts',network:'local-only'}),outputMode,browserOutput:broadcastOutput?{...broadcastOutput.info(),url:undefined}:null};}
async function receivedRemoteProgram(program){if(outputReady)output.webContents.send('broadcastcg:program',program);if(outputMode==='browser'||outputMode==='ndi'){try{await activeOutput().publish(program);remote?.acknowledge(program.revision);}catch{outputUnconfirmed=true;log('BROWSER_OUTPUT_UNCONFIRMED','failed');}}}
function activateProfile(id){
 if(managed&&!managed.profiles.some(p=>p.id===id))throw Error('This installation requires an assigned production server.');
 remote?.close();remote=null;currentToken=null;service=localService;
 if(id){const profile=profiles().find(p=>p.id===id);if(!profile)throw Error('Saved server not found.');let bootstrapSecret='';try{const c=loadServer(hostDirectory);if(c.fingerprint===profile.fingerprint&&['127.0.0.1','localhost'].includes(new URL(profile.url).hostname))bootstrapSecret=c.bootstrapSecret;}catch{}
  const draftFile=user=>join(dataDirectory,'remote-draft-'+createHash('sha256').update(profile.id+':'+user).digest('hex')+'.bin');
  const recoveryStore={read(user){const file=draftFile(user);return fs.existsSync(file)?JSON.parse(safeStorage.decryptString(fs.readFileSync(file))):null;},write(user,value){if(!safeStorage.isEncryptionAvailable())throw Error('Windows draft protection is unavailable.');const file=draftFile(user);fs.writeFileSync(file+'.partial',safeStorage.encryptString(JSON.stringify(value)));fs.renameSync(file+'.partial',file);},clear(user){fs.rmSync(draftFile(user),{force:true});}};
  remote=createRemoteAuthority({profile,settings:localService.settings,workstation:settings().workstation,bootstrapSecret,recoveryStore,onState:state=>studio?.webContents.send('broadcastcg:network',state),onProgram:receivedRemoteProgram,onLost:message=>{outputUnconfirmed=true;studio?.webContents.send('broadcastcg:network',{error:message,status:status()});}});service=remote;
 }
 rememberFile=join(dataDirectory,id?'remembered-server-'+id+'.bin':'remembered-login.bin');localService.settings.set('activeServer',id||null);
}
function connectionInfo(){let host=null;try{if(managed)throw Error('Managed client');const c=loadServer(hostDirectory);host={name:c.name,host:c.host,port:c.port,fingerprint:c.fingerprint,directory:hostDirectory,running:fs.existsSync(join(hostDirectory,'server.lock')),mode:'User background process (starts at Windows sign-in when enabled)'};}catch{}return{managed:!!managed,profiles:profiles(),activeId:localService.settings.get('activeServer'),backupId:localService.settings.get('backupServer'),status:status(),host};}
async function startHost(){
 const c=loadServer(hostDirectory),probe=createRemoteAuthority({profile:{name:c.name,url:'https://127.0.0.1:'+c.port,fingerprint:c.fingerprint},settings:localService.settings});try{await probe.test();return;}catch{}finally{probe.close();}
 const log=fs.openSync(join(hostDirectory,'server.log'),'a');const child=spawn(process.execPath,[join(__dirname,'app/server-entry.cjs'),hostDirectory],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},windowsHide:true,detached:true,stdio:['ignore',log,log]});child.unref();fs.closeSync(log);
 for(let i=0;i<40;i++){await new Promise(r=>setTimeout(r,250));const test=createRemoteAuthority({profile:{name:c.name,url:'https://127.0.0.1:'+c.port,fingerprint:c.fingerprint},settings:localService.settings});try{await test.test();return;}catch{}finally{test.close();}}
 throw Error('Server did not start. Check the server.log in its data folder.');
}
function settings(){return{workstation:os.hostname(),role:'Graphics operator',location:'',uiScale:1,startup:false,...service.settings.get('preferences',{}),displays:screen.getAllDisplays().map(d=>({id:d.id,label:d.label||'Display '+d.id,width:d.size.width,height:d.size.height,scaleFactor:d.scaleFactor}))};}
function ipc(name,fn){ipcMain.handle('broadcastcg:'+name,async(event,...args)=>{if(!trustedStudio(event))throw Error('Operation not allowed.');if(maintenance&&name!=='status'&&name!=='info')throw Error('Recovery maintenance is in progress.');return fn(...args);});}
function createWorkstation(){return createLocalService({directory:dataDirectory,encrypt:value=>{if(!safeStorage.isEncryptionAvailable())throw new ServiceError('Windows credential protection is unavailable.',503);return safeStorage.encryptString(value);},decrypt:bytes=>safeStorage.decryptString(bytes),beforePublish,confirmProgram,event:log,workstation:()=>service?.settings.get('preferences',{})?.workstation||os.hostname()});}
function registerIpc(){
 ipc('broadcastOutput',async(action,data={})=>{
  authorize(['status','ndiWebsite'].includes(action)?'outputs.view':'outputs.configure');
  const result=()=>({mode:outputMode,...broadcastOutput.info(),url:outputMode==='ndi'?null:broadcastOutput.info().url,ndi:{...ndiOutput.info(),available:detectNdi().available},obsConnected:!!obs?.connected()});
  if(action==='status'){const r=result();try{authorize('outputs.configure');}catch{r.url=null;}if(outputMode==='ndi')r.url=null;return r;}
  if(['start','ndiStart','stop','desktop'].includes(action)){
   if(outputChanging)throw Error('Output configuration is changing.');if(pending.size||ndiOutput.info().publishing)throw Error('Wait for the current output command.');
   if((action==='start'||action==='ndiStart')&&remote?.status().engineAttached)throw Error('Release this workstation output attachment before changing engines.');
   if((action==='start'||action==='ndiStart')&&(broadcastOutput.info().running||ndiOutput.info().running))throw Error('Stop the current output before changing engines.');
   const authority=service,token=currentToken;outputChanging=true;
   try{
    if(action==='start'||action==='ndiStart'){
     const value=outputConfig(data);if(action==='ndiStart'){await ndiOutput.start(ndiConfig({...value,source:data.source}));outputMode='ndi';}else{await broadcastOutput.start(value);outputMode='browser';}
     try{sameSession(authority,token,'outputs.configure');}catch(e){await ndiOutput.stop();throw e;}
    }else{remote?.releaseOutput();await ndiOutput.stop();if(action==='desktop')outputMode='desktop';}
    outputUnconfirmed=true;log('OUTPUT_'+action.toUpperCase());return result();
   }finally{outputChanging=false;}
  }
  if(action==='ndiWebsite'){await require('electron').shell.openExternal('https://ndi.video/');return true;}
  if(action==='copyUrl'){if(outputMode==='ndi')throw Error('The NDI renderer is private. Select the named NDI source in your receiver.');const url=broadcastOutput.info().url;if(!url)throw Error('Start browser output first.');require('electron').clipboard.writeText(url);return true;}
  if(action==='obsConnect'){if(obsBusy)throw Error('OBS connection is busy.');obsBusy=true;try{obs?.close();obs=null;const authority=service,token=currentToken,client=await connectObs(data);try{sameSession(authority,token,'outputs.configure');obs=client;return await obs.inspect();}catch(e){client.close();obs=null;throw e;}}finally{obsBusy=false;}}
  if(action==='obsStatus'){if(!obs)throw Error('Connect to OBS first.');return obs.inspect();}
  if(action==='obsDisconnect'){obs?.close();obs=null;return true;}
  if(action==='obsAddSource'){if(!obs?.connected())throw Error('Connect to OBS first.');const {url,config}=broadcastOutput.info();if(!url||outputMode!=='browser')throw Error('Start browser output first.');const authority=service,token=currentToken;return obs.addSource({...data,url,config},()=>sameSession(authority,token,'outputs.configure'));}
  throw Error('Unsupported broadcast output operation.');
 });
 const editorState=createEditorState({settings:{get:(...v)=>localService.settings.get(...v),set:(...v)=>localService.settings.set(...v)},identity:()=>{const a=authorize('projects.view');return(localService.settings.get('activeServer')||'local')+':'+a.user.id;}});
 ipc('editorState',(section,projectId,value)=>editorState.access(section,projectId,value));
 ipc('recovery',async(action,data={})=>{
  const actor=authorize('system.configure');authorize('users.manage');
  if(actor.user.accessExpiresAt!==null)throw Error('Recovery administration requires an unlimited administrator account.');
  if(action==='list')return{backups:await service.recovery.list(currentToken),local:!remote,automaticUpdates:false,version:app.getVersion()};
  if(action==='create')return service.recovery.create(currentToken,data);
  if(action==='verify')return service.recovery.verify(currentToken,data);
  if(action==='export'){const authority=service,token=currentToken,bytes=await authority.recovery.export(token,data.id),result=await dialog.showSaveDialog(studio,{title:'Save encrypted recovery backup',defaultPath:'BroadcastCG-'+data.id+'.bcbackup',filters:[{name:'Encrypted BroadcastCG backup',extensions:['bcbackup']}]});if(result.canceled||!result.filePath)return false;sameSession(authority,token,'system.configure');sameSession(authority,token,'users.manage');fs.writeFileSync(result.filePath+'.partial',bytes);fs.renameSync(result.filePath+'.partial',result.filePath);return true;}
  if(action==='inspectFile'||action==='restoreFile'){
   if(action==='restoreFile'&&(remote||managed))throw Error('Restore a production server on its host while it is stopped.');
   if(action==='restoreFile'){if(broadcastOutput.info().running)throw Error('Stop browser output before restoring.');if(output&&!output.isDestroyed())throw Error('Close the output window before restoring.');localService.assertRecoveryIdle(currentToken);}
   const token=currentToken,authority=service,result=await dialog.showOpenDialog(studio,{title:action==='restoreFile'?'Restore a local recovery backup':'Verify an encrypted backup',properties:['openFile'],filters:[{name:'Encrypted BroadcastCG backup',extensions:['bcbackup','bcserver']}]});if(result.canceled||!result.filePaths[0])return null;
   const file=result.filePaths[0];if(fs.statSync(file).size>200000086)throw Error('Backup exceeds 200 MB.');const bytes=fs.readFileSync(file),report=await inspectBackup(join(dataDirectory,'recovery-work'),bytes,data.password);authority.authorize(token,'users.manage');
   if(action==='inspectFile')return report;
   const answer=await dialog.showMessageBox(studio,{type:'warning',title:'Restore local workstation',message:'Replace the current local accounts and workspaces with this verified backup?',detail:report.projects+' workspaces, '+report.accounts+' accounts, '+report.images+' images. A rollback database will be retained. All sessions will be revoked. No TAKE, sequence or output will be replayed. Sign in using an account from the backup after restoration.',buttons:['Cancel','Restore verified backup'],defaultId:0,cancelId:0});if(answer.response!==1)return null;
   if(service!==authority||currentToken!==token)throw Error('Connection changed. Start the restore again.');if(broadcastOutput.info().running)throw Error('Stop browser output before restoring.');if(output&&!output.isDestroyed())throw Error('Close output before restoring.');localService.assertRecoveryIdle(token);maintenance=true;
   const defaults={preferences:{},serverProfiles:[],activeServer:null,backupServer:null,hostStartup:false,studioWindow:null,outputWindow:null},preferences=Object.fromEntries(Object.entries(defaults).map(([k,fallback])=>[k,localService.settings.get(k,fallback)??fallback]));let closed=false;
   try{const prepared=await localService.recovery.prepareRestore(token,bytes,data.password);localService.assertRecoveryIdle(token);psdSessions.clear();aeSessions.clear();localService.close();closed=true;commitRestore(dataDirectory,prepared);service=localService=createWorkstation();closed=false;for(const [key,value] of Object.entries(preferences))localService.settings.set(key,value);completeRestore(dataDirectory);currentToken=null;clearRemember();log('RECOVERY_RESTORED','success');studio.webContents.reload();return{...report,restored:true};}
   catch(error){if(closed||fs.existsSync(join(dataDirectory,'restore-journal.json'))){if(!closed){try{localService.close();}catch{}}recoverInterruptedRestore(dataDirectory);service=localService=createWorkstation();currentToken=null;clearRemember();studio.webContents.reload();}throw error;}finally{maintenance=false;}
  }
  throw Error('Unsupported recovery operation.');
 });
 ipc('network',async(action,data={})=>{
  if(action==='info')return connectionInfo();
  if(managed&&!['switch','attachOutput','releaseOutput','locks'].includes(action))throw Error('This installation is managed. Contact your administrator to change its servers.');
  if(action==='exportManaged'){authorize('users.manage');authorize('system.configure');const policy=managedPolicy({format:'broadcastcg-managed-client',version:1,profiles:[data]});if(['localhost','127.0.0.1','[::1]'].includes(new URL(policy.profiles[0].url).hostname))throw Error('Use the server LAN address or VPN hostname that recipient PCs can reach.');const result=await dialog.showOpenDialog(studio,{title:'Choose a folder for the recipient setup kit',properties:['openDirectory','createDirectory']});if(result.canceled||!result.filePaths[0])return false;authorize('users.manage');const folder=join(result.filePaths[0],'BroadcastCG-client-'+Date.now());fs.mkdirSync(folder);fs.writeFileSync(join(folder,'production.bcclient'),JSON.stringify(policy,null,2));fs.copyFileSync(join(__dirname,'assets/Install-ManagedClient.ps1'),join(folder,'Install-ManagedClient.ps1'));fs.writeFileSync(join(folder,'README.txt'),'Install BroadcastCG 0.9 or later on the recipient PC. Keep the PC connected to your self-hosted server (LAN or private VPN). In an administrator Windows PowerShell session in this folder, run:\r\n.\\Install-ManagedClient.ps1 -Configuration .\\production.bcclient\r\nRestart BroadcastCG, then sign in with the account you created on the server. Change the temporary password at first sign-in.\r\nThe policy removes local mode and server editing. It contains no passwords. Windows administrators can remove this policy or replace the software; this is account access control, not tamper-proof DRM. To remove managed mode, an administrator may rename ProgramData\\BroadcastCG\\managed-client.json while the app is closed.\r\n');return folder;}
  if(action==='test'){const client=createRemoteAuthority({profile:serverProfile(data),settings:localService.settings});try{return await client.test();}finally{client.close();}}
  if(action==='save'){const value=serverProfile(data),profiles=localService.settings.get('serverProfiles',[]);if(profiles.length>=16&&!profiles.some(p=>p.id===value.id))throw Error('Keep up to 16 server profiles.');if(value.id===localService.settings.get('activeServer'))throw Error('Switch to local mode before changing the active server.');value.id=value.id||randomUUID();localService.settings.set('serverProfiles',[...profiles.filter(p=>p.id!==value.id),value]);return connectionInfo();}
  if(action==='backupProfile'){if(data.id&&!localService.settings.get('serverProfiles',[]).some(p=>p.id===data.id))throw Error('Choose a saved server.');localService.settings.set('backupServer',data.id||null);return connectionInfo();}
  if(action==='switch'){if(broadcastOutput.info().running)throw Error('Stop browser output before switching authority.');if(outputReady)throw Error('Close the output window before switching authority.');if(managed&&!profiles().some(p=>p.id===data.id))throw Error('Choose an assigned production server.');if(data.id&&!profiles().some(p=>p.id===data.id))throw Error('Choose a saved server.');if(currentToken){try{await service.auth.endSession(currentToken);}catch{}}psdSessions.clear();aeSessions.clear();obs?.close();obs=null;activateProfile(data.id);studio.webContents.reload();return true;}
  if(action==='attachOutput'){authorize('outputs.configure');if(!remote)throw Error('Connect to a production server first.');beforePublish();remote.attachOutput();return true;}
  if(action==='releaseOutput'){authorize('outputs.configure');remote?.releaseOutput();return true;}
  if(action==='locks'){if(!remote)throw Error('Ownership is available in server mode.');return remote.locks(data.projectId,data.operation);}
  if(action==='provision'||action==='startHost'||action==='stopHost'||action==='hostStartup'||action==='configureHost'||action==='restoreHost'){
   if(!localService.auth.bootstrap().setupRequired)localService.authorize(remote?null:currentToken,'system.configure');
   if(action==='provision'){const c=await provisionServer(hostDirectory,join(__dirname,'assets/BroadcastCGHost.exe'),data);const profiles=localService.settings.get('serverProfiles',[]);if(!profiles.some(p=>p.fingerprint===c.fingerprint))localService.settings.set('serverProfiles',[...profiles,{id:randomUUID(),name:c.name,url:'https://127.0.0.1:'+c.port,fingerprint:c.fingerprint}]);}
   if(action==='configureHost'){if(fs.existsSync(join(hostDirectory,'server.lock')))throw Error('Stop the host before changing its listen address.');if(!['127.0.0.1','0.0.0.0'].includes(data.host))throw Error('Choose a supported listen address.');const c=loadServer(hostDirectory),file=join(hostDirectory,'server.json');fs.writeFileSync(file+'.partial',JSON.stringify({...c,host:data.host},null,2));fs.renameSync(file+'.partial',file);}
   if(action==='hostStartup'){if(typeof data.enabled!=='boolean')throw Error('Invalid startup preference.');localService.settings.set('hostStartup',data.enabled);if(app.isPackaged)app.setLoginItemSettings({openAtLogin:data.enabled||settings().startup});}
   if(action==='startHost')await startHost();
   if(action==='stopHost'){fs.writeFileSync(join(hostDirectory,'stop.request'),'');for(let i=0;i<40&&fs.existsSync(join(hostDirectory,'server.lock'));i++)await new Promise(r=>setTimeout(r,250));if(fs.existsSync(join(hostDirectory,'server.lock')))throw Error('Server is still stopping. Inspect its log.');}
   if(action==='restoreHost'){const result=await dialog.showOpenDialog(studio,{title:'Restore stopped production server',properties:['openFile'],filters:[{name:'Encrypted server backup',extensions:['bcserver','bcbackup']}]});if(!result.canceled&&result.filePaths[0]){const file=result.filePaths[0];if(fs.statSync(file).size>200000086)throw Error('Backup exceeds 200 MB.');const bytes=fs.readFileSync(file),report=await inspectBackup(join(dataDirectory,'recovery-work'),bytes,data.password);const answer=await dialog.showMessageBox(studio,{type:'warning',title:'Replace stopped host data?',message:'Restore '+report.projects+' workspaces and '+report.accounts+' accounts?',detail:'The existing host database is retained for rollback. Sessions are revoked and no commands resume. The server certificate remains unchanged.',buttons:['Cancel','Restore host'],defaultId:0,cancelId:0});if(answer.response===1){if(!localService.auth.bootstrap().setupRequired)localService.authorize(currentToken,'users.manage');await restoreServer(hostDirectory,bytes,data.password,{replace:true});}}}
   return connectionInfo();
  }
  if(action==='backup'){authorize('system.configure');if(!remote)throw Error('Connect to the production server first.');const authority=service,token=currentToken,bytes=await remote.backup(data.password),result=await dialog.showSaveDialog(studio,{title:'Encrypted production backup',defaultPath:'BroadcastCG-server.bcserver',filters:[{name:'Encrypted server backup',extensions:['bcserver']}]});if(result.canceled||!result.filePath)return false;sameSession(authority,token,'system.configure');fs.writeFileSync(result.filePath+'.partial',bytes);fs.renameSync(result.filePath+'.partial',result.filePath);return true;}
  throw Error('Unsupported connection operation.');
 });
  ipc('auth',async(action,data={})=>{try{
    if(['logout','login','setup','changePassword'].includes(action)){psdSessions?.clear();aeSessions?.clear();obs?.close();obs=null;}
    let value;
    if(action==='bootstrap')value=await service.auth.bootstrap();
    else if(action==='setup'||action==='login'){
      if(data.remember&&!safeStorage.isEncryptionAvailable())throw new ServiceError('Windows credential protection is unavailable. Turn off Remember me to sign in.',503);
      if(currentToken)await service.auth.logout(currentToken);
      currentToken=null;clearRemember();value=acceptSession(await service.auth[action](data));
    }else if(action==='logout'){await service.auth.logout(currentToken);currentToken=null;clearRemember();value=true;}
    else if(action==='changePassword')value=acceptSession(await service.auth.changePassword(currentToken,data));
    else if(['me','touch','catalog','users','createUser','updateUser','resetPassword','sessions','audit','revokeSession'].includes(action))value=await service.auth[action](currentToken,data);
    else throw new ServiceError('Unknown account operation.',400);
    return {ok:true,value};
  }catch(error){return{ok:false,status:error.status||500,error:error.status?error.message:'The account operation failed.'};}});
  ipc('info',()=>{authorize();return{name:'BroadcastCG',version:app.getVersion(),dataDirectory,phase:'Broadcast output integration',...status()};});
  ipc('status',()=>{authorize();return status();});ipc('settings',()=>{authorize();return settings();});
  ipc('saveSettings',value=>{
    authorize('system.configure');
    if(!value||!['workstation','role','location'].every(k=>typeof value[k]==='string'&&value[k].length<=100)||!Number.isFinite(value.uiScale)||value.uiScale<.75||value.uiScale>1.5||typeof value.startup!=='boolean')throw Error('Invalid workstation settings.');
    const next={workstation:value.workstation,role:value.role,location:value.location,uiScale:value.uiScale,startup:value.startup};
    if(app.isPackaged)app.setLoginItemSettings({openAtLogin:next.startup||localService.settings.get('hostStartup',false)});
    service.settings.set('preferences',next);studio.webContents.setZoomFactor(next.uiScale);return settings();
  });
  ipc('openOutput',displayId=>{if(displayId!==undefined&&!Number.isInteger(displayId))throw Error('Choose an available display.');permittedOutput(displayId);return true;});
  ipc('exportProject',async project=>{
    const token=currentToken,authority=service,text=await service.exportProject(project,token,'package'),result=await dialog.showSaveDialog(studio,{title:'Export complete local project',defaultPath:(project.name||'Project').replace(/[<>:"/\\|?*]/g,'_')+'.broadcastpkg',filters:[{name:'BroadcastCG portable project package',extensions:['broadcastpkg']}]});
    if(result.canceled||!result.filePath)return false;
    sameSession(authority,token,'templates.export');await authority.exportProject(project,token,'package');
    const temporary=result.filePath+'.partial';await fs.promises.writeFile(temporary,text,{flag:'w'});await fs.promises.rename(temporary,result.filePath);log('PROJECT_EXPORT');return true;
  });
  ipc('importProject',async()=>{
    const token=currentToken,authority=service;service.authorize(token,'templates.import');service.authorize(token,'projects.create');
    const result=await dialog.showOpenDialog(studio,{title:'Import local project',properties:['openFile'],filters:[{name:'BroadcastCG / Frame project',extensions:['broadcastpkg','broadcastproject','json']}]});
    if(result.canceled||!result.filePaths[0])return null;
    const file=result.filePaths[0];if((await fs.promises.stat(file)).size>100000000)throw Error('Project package exceeds 100 MB.');
    sameSession(authority,token,'templates.import');const inspected=await authority.inspectImport(await fs.promises.readFile(file,'utf8'),token);
    if(inspected.missing.length)throw Error('Import blocked: '+inspected.missing.length+' referenced image(s) are missing. Export a complete package from the original workstation.');
    const dependencies=inspected.dependencies,answer=await dialog.showMessageBox(studio,{type:'info',title:'Review project package',message:inspected.project.name,detail:'Graphics, animations, variables, panels, sports configuration and embedded images will be imported as a new saved workspace.\n\nFonts required on this PC: '+(dependencies?.fonts?.join(', ')||'None')+'\nExternal data / image URLs: '+inspected.external.length+'\nFont files, video and feed credentials are not embedded. Configure dependencies before going on air. Existing projects and output are unchanged.',buttons:['Cancel','Import project'],defaultId:0,cancelId:0});if(answer.response!==1)return null;
    sameSession(authority,token,'templates.import');return authority.importProject(inspected,token,{save:true});
  });
  ipc('preparePsd',async()=>{
    const token=currentToken;authorize('templates.import');authorize('graphics.create');
    const result=await dialog.showOpenDialog(studio,{title:'Import Photoshop PSD',properties:['openFile'],filters:[{name:'Photoshop document',extensions:['psd']}]});
    if(result.canceled||!result.filePaths[0])return null;
    return psdSessions.prepare(result.filePaths[0],token);
  });
  ipc('commitPsd',options=>psdSessions.finish(options,currentToken));
  ipc('cancelPsd',()=>{psdSessions.clear();return true;});
  ipc('prepareAe',async()=>{
    const token=currentToken;authorize('templates.import');authorize('graphics.create');
    const result=await dialog.showOpenDialog(studio,{title:'Import After Effects conversion',properties:['openFile'],filters:[{name:'BroadcastCG AE package',extensions:['bcae']}]});
    if(result.canceled||!result.filePaths[0])return null;
    return aeSessions.prepare(result.filePaths[0],token);
  });
  ipc('commitAe',options=>aeSessions.finish(options,currentToken));
  ipc('cancelAe',()=>{aeSessions.clear();return true;});
  ipc('aeReference',async options=>{
    const token=currentToken;authorize('templates.import');authorize('graphics.create');
    const result=await dialog.showOpenDialog(studio,{title:'Attach AE reference at '+Number(options?.time).toFixed(3)+' s',properties:['openFile'],filters:[{name:'Composition reference render',extensions:['png']}]});
    if(result.canceled||!result.filePaths[0])return null;
    return aeSessions.reference(options,result.filePaths[0],token);
  });
  ipc('saveAeExporter',async()=>{
    const token=currentToken;authorize('templates.import');authorize('graphics.create');
    const result=await dialog.showSaveDialog(studio,{title:'Save the After Effects exporter',defaultPath:'BroadcastCG-AE-Export.jsx',filters:[{name:'After Effects script',extensions:['jsx']}]});
    if(result.canceled||!result.filePath)return false;
    service.authorize(token,'templates.import');service.authorize(token,'graphics.create');
    if(extname(result.filePath).toLowerCase()!=='.jsx')throw Error('Save the exporter with a .jsx extension.');
    await fs.promises.copyFile(join(__dirname,'assets','BroadcastCG-AE-Export.jsx'),result.filePath);return true;
  });
  ipc('exportDiagnostics',async()=>{
    const token=currentToken;service.authorize(token,'diagnostics.view');
    const report={application:'BroadcastCG',version:app.getVersion(),time:new Date().toISOString(),runtime:{electron:process.versions.electron,node:process.versions.node,chrome:process.versions.chrome},status:status(),storage:await service.diagnostics()};
    const result=await dialog.showSaveDialog(studio,{title:'Export diagnostics',defaultPath:'BroadcastCG-diagnostics.json',filters:[{name:'Diagnostic report',extensions:['json']}]});
    if(result.canceled||!result.filePath)return false;
    service.authorize(token,'diagnostics.view');
    await fs.promises.writeFile(result.filePath,JSON.stringify(report,null,2));return true;
  });
  ipcMain.on('broadcastcg:rendered',(event,revision)=>{if(outputMode!=='desktop'||event.sender!==output?.webContents||!trusted(event.senderFrame)||typeof revision!=='string')return;if(remote){remote.acknowledge(revision);return;}const waiter=pending.get(revision);if(waiter){pending.delete(revision);waiter.resolve();}});
}
function menu(){Menu.setApplicationMenu(Menu.buildFromTemplate([
  {label:'BroadcastCG',submenu:[{label:'About BroadcastCG',click:()=>dialog.showMessageBox(studio,{type:'info',message:'BroadcastCG '+app.getVersion(),detail:'Local graphics workstation with desktop and transparent OBS Browser Source output, accounts and self-hosted LAN production. Direct SDI/NDI hardware output is not included.'})},{type:'separator'},{role:'quit'}]},
  {label:'Edit',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},
  {label:'View',submenu:[{role:'togglefullscreen',accelerator:'F11'},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'}]},
  {label:'Output',submenu:[{label:'Open desktop output',click:()=>menuOutput()},...screen.getAllDisplays().map(d=>({label:'Move output to '+(d.label||'Display '+d.id),click:()=>menuOutput(d.id)}))]},
]));}

if(!app.requestSingleInstanceLock()){app.quit();}else{
  app.on('second-instance',()=>{if(studio){if(studio.isMinimized())studio.restore();studio.show();studio.focus();}});
  app.whenReady().then(async()=>{
    if(!qa&&standardProfile){dataDirectory=resolveWorkstationData({home:app.getPath('home'),legacyDirectory:dataDirectory,packagesDirectory:join(process.env.LOCALAPPDATA||join(app.getPath('home'),'AppData','Local'),'Packages'),recoverDirectory:recoverInterruptedRestore});rememberFile=join(dataDirectory,'remembered-login.bin');}
    fs.mkdirSync(dataDirectory,{recursive:true});logPath=join(dataDirectory,'diagnostics.log');
    const commonData=execFileSync(join(__dirname,'assets/BroadcastCGHost.exe'),['common-data'],{windowsHide:true,encoding:'utf8'}).trim();if(!isAbsolute(commonData))throw Error('Windows common data folder is unavailable.');managed=readManagedPolicy(join(commonData,'BroadcastCG','managed-client.json'));

    recoverInterruptedRestore(dataDirectory);service=createWorkstation();
    localService=service;if(!managed&&localService.settings.get('hostStartup',false)){try{await startHost();}catch{log('PRODUCTION_HOST_START_FAILED','failed');}}activateProfile(managed?(managed.profiles.find(p=>p.id===localService.settings.get('activeServer'))||managed.profiles[0]).id:localService.settings.get('activeServer'));
    broadcastOutput=createOutputController({directory:dataDirectory,appDirectory:__dirname,executable:process.execPath,settings:{get:(...a)=>localService.settings.get(...a),set:(...a)=>localService.settings.set(...a)},protect:value=>{if(!safeStorage.isEncryptionAvailable())throw Error('Windows credential protection is unavailable.');return safeStorage.encryptString(value);},unprotect:bytes=>safeStorage.decryptString(bytes),readProgram:async()=>{const r=await service.handle(new Request('broadcastcg://app/api/program'),service.outputContext);if(!r.ok)throw Error('Program unavailable');return r.json();},readAsset:path=>service.handle(new Request('broadcastcg://app'+path),service.outputContext)});
    ndiOutput=createNdiController({bridge:broadcastOutput,helper:app.isPackaged?join(process.resourcesPath,'output-tools','BroadcastCGNdi.exe'):join(__dirname,'assets','BroadcastCGNdi.exe')});
    psdSessions=createPsdSessions({workerPath:join(__dirname,'app','psd-worker.cjs'),authorize:token=>{service.authorize(token,'templates.import');service.authorize(token,'graphics.create');},commit:(draft,options,token)=>service.importPsd(draft,options,token)});
    aeSessions=createAeSessions({workerPath:join(__dirname,'app','ae-worker.cjs'),authorize:token=>{service.authorize(token,'templates.import');service.authorize(token,'graphics.create');},commit:(draft,options,token)=>service.importAe(draft,options,token)});
    if(fs.existsSync(rememberFile)){try{acceptSession(await service.auth.resume(safeStorage.decryptString(fs.readFileSync(rememberFile))));}catch(error){if(error.status!==503)clearRemember();log('REMEMBERED_LOGIN_UNAVAILABLE');}}
    protocol.handle('broadcastcg',request=>handleRequest(request));
    const outputSession=session.fromPartition('broadcastcg-output');
    outputSession.protocol.handle('broadcastcg',request=>handleRequest(request,true));
    outputSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));outputSession.setPermissionCheckHandler(()=>false);
    outputSession.webRequest.onBeforeRequest({urls:['*://*/*','file://*/*']},(details,callback)=>callback({cancel:!(details.resourceType==='image'&&details.url.startsWith('https://'))}));
    const localFonts=(wc,permission,url)=>{if(!['local-fonts','midi'].includes(permission)||wc!==studio?.webContents||!trusted({url}))return false;try{authorize(permission==='midi'?'panels.operate':'graphics.create');return true;}catch{return false;}};
    session.defaultSession.setPermissionRequestHandler((wc,permission,callback,details)=>callback(localFonts(wc,permission,details.requestingUrl)));
    session.defaultSession.setPermissionCheckHandler((wc,permission,origin)=>localFonts(wc,permission,origin));
    session.defaultSession.on('will-download',(event,item,contents)=>{
      if(contents!==studio?.webContents){event.preventDefault();return;}
      try{authorize('templates.export');}catch{event.preventDefault();return;}
      item.setSaveDialogOptions({title:'Save graphic export',defaultPath:item.getFilename(),filters:[{name:'PNG image',extensions:['png']}]});
    });
    // The renderer can only load local code and explicitly configured HTTPS images.
    session.defaultSession.webRequest.onBeforeRequest({urls:['*://*/*','file://*/*']},(details,callback)=>{const allowed=details.resourceType==='image'&&details.url.startsWith('https://');callback({cancel:!allowed});});
    registerIpc();menu();studio=createWindow('studio');
    studio.webContents.once('did-finish-load',()=>studio.webContents.setZoomFactor(settings().uiScale));
    studio.webContents.on('before-input-event',(_event,input)=>{studio.webContents.setIgnoreMenuShortcuts((input.control||input.meta)&&!input.alt&&['z','y','c','x','v','a','s','0','1','+','=','-'].includes(input.key.toLowerCase()));});
    studio.on('close',event=>{
      if(!quitting&&(outputReady||broadcastOutput.info().running)&&!qa){const response=dialog.showMessageBoxSync(studio,{type:'warning',title:'Close BroadcastCG?',message:'Closing BroadcastCG will disconnect its output. An external receiver may hold its last graphic.',buttons:['Keep running','Close application'],defaultId:0,cancelId:0});if(response===0){event.preventDefault();return;}}
    });
    studio.webContents.on('will-prevent-unload',event=>{const answer=dialog.showMessageBoxSync(studio,{type:'warning',message:'There are unsaved editor changes.',detail:'Keep the application open to save or export your work.',buttons:['Keep editing','Close anyway'],defaultId:0,cancelId:0});if(answer===1)event.preventDefault();});
    studio.on('closed',()=>{studio=null;quitting=true;if(output&&!output.isDestroyed())output.close();app.quit();});
    powerBlock=powerSaveBlocker.start('prevent-app-suspension');
    if(qa)require('./app/smoke.cjs').run({app,studio,dialog,openOutput,getOutput:()=>output,service,directory:join(__dirname,'.cache'),log}).catch(error=>{fs.writeFileSync(join(__dirname,'.cache','smoke-result.json'),JSON.stringify({ok:false,error:String(error),stack:error.stack},null,2));app.exit(1);});
  }).catch(error=>{log('STARTUP_FAILED','failed');dialog.showErrorBox('BroadcastCG could not start',error.message);app.exit(1);});
}
app.on('before-quit',()=>{quitting=true;});
app.on('will-quit',()=>{if(powerBlock!==undefined)powerSaveBlocker.stop(powerBlock);try{ndiOutput?.dispose();broadcastOutput?.dispose();obs?.close();psdSessions?.clear();aeSessions?.clear();if(!remote)localService?.auth.endSession(currentToken);remote?.close();localService?.close();}catch{};});
app.on('window-all-closed',()=>app.quit());
