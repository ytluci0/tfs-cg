const {app,BrowserWindow,Menu,protocol,session,screen,ipcMain,dialog,safeStorage,powerSaveBlocker}=require('electron');
const {join,resolve,relative,isAbsolute,extname}=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const {createPsdSessions}=require('./psd-session.cjs');
const {createAeSessions}=require('./ae-session.cjs');
const {restoreBounds}=require('./window-state.cjs');
const {createLocalService,ServiceError}=require('./app/service.cjs');

app.setName('BroadcastCG');
app.setAppUserModelId('local.broadcastcg.studio');
const qa=!app.isPackaged&&process.argv.includes('--smoke-test');
if(qa)app.setPath('userData',join(__dirname,'.cache','smoke-profile-'+Date.now()));
const dataDirectory=join(app.getPath('userData'),'data');
protocol.registerSchemesAsPrivileged([{scheme:'broadcastcg',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
let studio,output,service,quitting=false,logPath,outputReady=false,lastOutputAck=null,outputUnconfirmed=false,powerBlock;
let currentToken=null,psdSessions,aeSessions;
const rememberFile=join(dataDirectory,'remembered-login.bin');
function clearRemember(){fs.rmSync(rememberFile,{force:true});}
function acceptSession(result){
  currentToken=result.token;
  try{if(result.rememberToken){const temporary=rememberFile+'.partial';fs.writeFileSync(temporary,safeStorage.encryptString(result.rememberToken));fs.renameSync(temporary,rememberFile);}else clearRemember();}
  catch(error){service.auth.logout(currentToken);currentToken=null;throw new ServiceError('Could not protect remembered login on this workstation. Sign in with Remember me turned off.',503);}
  return result.session;
}
function authorize(permission){return service.authorize(currentToken,permission);}
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
  if(url.pathname.startsWith('/api/'))return service.handle(request,outputRead?service.outputContext:{token:currentToken});
  if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
  let pathname;try{pathname=decodeURIComponent(url.pathname);}catch{return new Response('Bad path',{status:400});}
  if(pathname==='/'||pathname==='/output')pathname='/index.html';
  const root=join(__dirname,'app','renderer'),target=resolve(root,'.'+pathname),rel=relative(root,target);
  if(!rel||rel.startsWith('..')||isAbsolute(rel))return new Response('Forbidden',{status:403});
  try{const bytes=await fs.promises.readFile(target);return new Response(request.method==='HEAD'?null:bytes,{headers:{'Content-Type':mime[extname(target)]||'application/octet-stream','Content-Security-Policy':csp,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'}});}catch{return new Response('Not found',{status:404});}
}
function beforePublish(){if(!output||output.isDestroyed()||!outputReady)throw new ServiceError('Desktop output is offline. Open the output window before TAKE.',503);}
function confirmProgram(program){
  outputUnconfirmed=true;
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
  output.on('closed',()=>{output=null;outputReady=false;outputUnconfirmed=true;log('OUTPUT_CLOSED');});
}
function status(){return{local:true,database:service?.health()?'available':'offline',output:outputReady?'connected':'offline',outputUnconfirmed,lastOutputAck,authentication:'local-accounts',network:'local-only'};}
function settings(){return{workstation:os.hostname(),role:'Graphics operator',location:'',uiScale:1,startup:false,...service.settings.get('preferences',{}),displays:screen.getAllDisplays().map(d=>({id:d.id,label:d.label||'Display '+d.id,width:d.size.width,height:d.size.height,scaleFactor:d.scaleFactor}))};}
function ipc(name,fn){ipcMain.handle('broadcastcg:'+name,async(event,...args)=>{if(!trustedStudio(event))throw Error('Operation not allowed.');return fn(...args);});}
function registerIpc(){
  ipc('auth',async(action,data={})=>{try{
    if(['logout','login','setup','changePassword'].includes(action)){psdSessions?.clear();aeSessions?.clear();}
    let value;
    if(action==='bootstrap')value=service.auth.bootstrap();
    else if(action==='setup'||action==='login'){
      if(data.remember&&!safeStorage.isEncryptionAvailable())throw new ServiceError('Windows credential protection is unavailable. Turn off Remember me to sign in.',503);
      if(currentToken)service.auth.logout(currentToken);
      currentToken=null;clearRemember();value=acceptSession(await service.auth[action](data));
    }else if(action==='logout'){service.auth.logout(currentToken);currentToken=null;clearRemember();value=true;}
    else if(action==='changePassword')value=acceptSession(await service.auth.changePassword(currentToken,data));
    else if(['me','touch','catalog','users','createUser','updateUser','resetPassword','sessions','audit','revokeSession'].includes(action))value=await service.auth[action](currentToken,data);
    else throw new ServiceError('Unknown account operation.',400);
    return {ok:true,value};
  }catch(error){return{ok:false,status:error.status||500,error:error instanceof ServiceError?error.message:'The local account operation failed.'};}});
  ipc('info',()=>{authorize();return{name:'BroadcastCG',version:app.getVersion(),dataDirectory,phase:'Local After Effects conversion',...status()};});
  ipc('status',()=>{authorize();return status();});ipc('settings',()=>{authorize();return settings();});
  ipc('saveSettings',value=>{
    authorize('system.configure');
    if(!value||!['workstation','role','location'].every(k=>typeof value[k]==='string'&&value[k].length<=100)||!Number.isFinite(value.uiScale)||value.uiScale<.75||value.uiScale>1.5||typeof value.startup!=='boolean')throw Error('Invalid workstation settings.');
    const next={workstation:value.workstation,role:value.role,location:value.location,uiScale:value.uiScale,startup:value.startup};
    if(app.isPackaged)app.setLoginItemSettings({openAtLogin:next.startup});
    service.settings.set('preferences',next);studio.webContents.setZoomFactor(next.uiScale);return settings();
  });
  ipc('openOutput',displayId=>{if(displayId!==undefined&&!Number.isInteger(displayId))throw Error('Choose an available display.');permittedOutput(displayId);return true;});
  ipc('exportProject',async project=>{
    const token=currentToken,text=service.exportProject(project,token),result=await dialog.showSaveDialog(studio,{title:'Export complete local project',defaultPath:(project.name||'Project').replace(/[<>:"/\\|?*]/g,'_')+'.broadcastproject',filters:[{name:'BroadcastCG project with images',extensions:['broadcastproject']}]});
    if(result.canceled||!result.filePath)return false;
    service.exportProject(project,token);
    const temporary=result.filePath+'.partial';await fs.promises.writeFile(temporary,text,{flag:'w'});await fs.promises.rename(temporary,result.filePath);log('PROJECT_EXPORT');return true;
  });
  ipc('importProject',async()=>{
    const token=currentToken;service.authorize(token,'templates.import');service.authorize(token,'projects.create');
    const result=await dialog.showOpenDialog(studio,{title:'Import local project',properties:['openFile'],filters:[{name:'BroadcastCG / Frame project',extensions:['broadcastproject','json']}]});
    if(result.canceled||!result.filePaths[0])return null;
    const file=result.filePaths[0];if((await fs.promises.stat(file)).size>100000000)throw Error('Project package exceeds 100 MB.');
    const inspected=service.inspectImport(await fs.promises.readFile(file,'utf8'),token);
    if(inspected.missing.length)throw Error('Import blocked: '+inspected.missing.length+' referenced image(s) are missing. Export a complete package from the original workstation.');
    if(inspected.external.length){const answer=await dialog.showMessageBox(studio,{type:'warning',title:'External dependencies',message:'This project contains '+inspected.external.length+' external data or image URL(s). They require a network connection.',detail:'Embedded images are included. External feed credentials must be configured locally. No fonts or video files are included in this package version.',buttons:['Cancel','Import project'],defaultId:0,cancelId:0});if(answer.response!==1)return null;}
    return service.importProject(inspected,token);
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
    const report={application:'BroadcastCG',version:app.getVersion(),time:new Date().toISOString(),runtime:{electron:process.versions.electron,node:process.versions.node,chrome:process.versions.chrome},status:status(),storage:service.diagnostics()};
    const result=await dialog.showSaveDialog(studio,{title:'Export diagnostics',defaultPath:'BroadcastCG-diagnostics.json',filters:[{name:'Diagnostic report',extensions:['json']}]});
    if(result.canceled||!result.filePath)return false;
    service.authorize(token,'diagnostics.view');
    await fs.promises.writeFile(result.filePath,JSON.stringify(report,null,2));return true;
  });
  ipcMain.on('broadcastcg:rendered',(event,revision)=>{if(event.sender!==output?.webContents||!trusted(event.senderFrame)||typeof revision!=='string')return;const waiter=pending.get(revision);if(waiter){pending.delete(revision);waiter.resolve();}});
}
function menu(){Menu.setApplicationMenu(Menu.buildFromTemplate([
  {label:'BroadcastCG',submenu:[{label:'About BroadcastCG',click:()=>dialog.showMessageBox(studio,{type:'info',message:'BroadcastCG '+app.getVersion(),detail:'Local Windows graphics workstation with accounts, roles, workspace permissions and audit history. Shared network operators and SDI/NDI hardware output are not included.'})},{type:'separator'},{role:'quit'}]},
  {label:'Edit',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},
  {label:'View',submenu:[{role:'togglefullscreen',accelerator:'F11'},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'}]},
  {label:'Output',submenu:[{label:'Open desktop output',click:()=>menuOutput()},...screen.getAllDisplays().map(d=>({label:'Move output to '+(d.label||'Display '+d.id),click:()=>menuOutput(d.id)}))]},
]));}

if(!app.requestSingleInstanceLock()){app.quit();}else{
  app.on('second-instance',()=>{if(studio){if(studio.isMinimized())studio.restore();studio.show();studio.focus();}});
  app.whenReady().then(async()=>{
    fs.mkdirSync(dataDirectory,{recursive:true});logPath=join(dataDirectory,'diagnostics.log');
    service=createLocalService({directory:dataDirectory,encrypt:value=>{if(!safeStorage.isEncryptionAvailable())throw new ServiceError('Windows credential protection is unavailable.',503);return safeStorage.encryptString(value);},decrypt:bytes=>safeStorage.decryptString(bytes),beforePublish,confirmProgram,event:log,workstation:()=>service?.settings.get('preferences',{})?.workstation||os.hostname()});
    psdSessions=createPsdSessions({workerPath:join(__dirname,'app','psd-worker.cjs'),authorize:token=>{service.authorize(token,'templates.import');service.authorize(token,'graphics.create');},commit:(draft,options,token)=>service.importPsd(draft,options,token)});
    aeSessions=createAeSessions({workerPath:join(__dirname,'app','ae-worker.cjs'),authorize:token=>{service.authorize(token,'templates.import');service.authorize(token,'graphics.create');},commit:(draft,options,token)=>service.importAe(draft,options,token)});
    if(fs.existsSync(rememberFile)){try{acceptSession(service.auth.resume(safeStorage.decryptString(fs.readFileSync(rememberFile))));}catch{clearRemember();log('REMEMBERED_LOGIN_EXPIRED');}}
    protocol.handle('broadcastcg',request=>handleRequest(request));
    const outputSession=session.fromPartition('broadcastcg-output');
    outputSession.protocol.handle('broadcastcg',request=>handleRequest(request,true));
    outputSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));outputSession.setPermissionCheckHandler(()=>false);
    outputSession.webRequest.onBeforeRequest({urls:['*://*/*','file://*/*']},(details,callback)=>callback({cancel:!(details.resourceType==='image'&&details.url.startsWith('https://'))}));
    const localFonts=(wc,permission,url)=>{if(permission!=='local-fonts'||wc!==studio?.webContents||!trusted({url}))return false;try{authorize('graphics.create');return true;}catch{return false;}};
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
    studio.on('close',event=>{
      if(!quitting&&outputReady&&!qa){const response=dialog.showMessageBoxSync(studio,{type:'warning',title:'Close BroadcastCG?',message:'Closing BroadcastCG will close the local output.',buttons:['Keep running','Close application'],defaultId:0,cancelId:0});if(response===0){event.preventDefault();return;}}
    });
    studio.webContents.on('will-prevent-unload',event=>{const answer=dialog.showMessageBoxSync(studio,{type:'warning',message:'There are unsaved editor changes.',detail:'Keep the application open to save or export your work.',buttons:['Keep editing','Close anyway'],defaultId:0,cancelId:0});if(answer===1)event.preventDefault();});
    studio.on('closed',()=>{studio=null;quitting=true;if(output&&!output.isDestroyed())output.close();app.quit();});
    powerBlock=powerSaveBlocker.start('prevent-app-suspension');
    if(qa)require('./app/smoke.cjs').run({app,studio,dialog,openOutput,getOutput:()=>output,service,directory:join(__dirname,'.cache'),log}).catch(error=>{fs.writeFileSync(join(__dirname,'.cache','smoke-result.json'),JSON.stringify({ok:false,error:String(error),stack:error.stack},null,2));app.exit(1);});
  }).catch(error=>{log('STARTUP_FAILED','failed');dialog.showErrorBox('BroadcastCG could not start',error.message);app.exit(1);});
}
app.on('before-quit',()=>{quitting=true;});
app.on('will-quit',()=>{if(powerBlock!==undefined)powerSaveBlocker.stop(powerBlock);try{psdSessions?.clear();aeSessions?.clear();service?.auth.endSession(currentToken);service?.close();}catch{};});
app.on('window-all-closed',()=>app.quit());
