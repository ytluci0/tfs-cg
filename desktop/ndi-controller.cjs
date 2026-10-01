const {BrowserWindow}=require('electron');
const {spawn}=require('node:child_process');
const {createInterface}=require('node:readline');
const {performance}=require('node:perf_hooks');
const {detectNdi}=require('./ndi-config.cjs');

function createNdiController({bridge,helper,spawnWorker=spawn}){
 let worker=null,window=null,starting=false,ready=false,error=null,source='',runtime='',health=null,lastHealth=0,sequence=0,inflight=null,latest=null,replaced=0,publishing=false,lastAck=null;
 const confirmations=new Map();
 function rejectAll(message){for(const p of confirmations.values()){clearTimeout(p.timer);p.reject(Error(message));}confirmations.clear();}
 function fail(message){error=message;ready=false;rejectAll(message);}
 function flush(){if(!worker||!ready||inflight||!latest)return;const item=latest;latest=null;inflight=item.id;const header=Buffer.alloc(12);header.writeBigInt64LE(BigInt(item.id));header.writeUInt32LE(item.bytes.length,8);worker.stdin.write(header);worker.stdin.write(item.bytes,e=>{if(e)fail('NDI frame transport failed. Restart output.');});}
 function offer(image,confirmed=false){const size=image.getSize(),cfg=bridge.info().config;if(size.width!==cfg.width||size.height!==cfg.height)throw Error('NDI renderer size does not match the output format.');const bytes=image.toBitmap();if(bytes.length!==cfg.width*cfg.height*4)throw Error('NDI bitmap size mismatch.');const id=++sequence;if(latest){if(confirmations.has(latest.id))throw Error('An NDI command is already queued.');replaced++;}latest={id,bytes};let promise;
  if(confirmed)promise=new Promise((resolve,reject)=>{const timer=setTimeout(()=>{confirmations.delete(id);fail('NDI submission timed out. Inspect the receiver before retrying.');reject(Error(error));},5000);confirmations.set(id,{resolve,reject,timer});});flush();return promise;
 }
 const info=()=>({running:!!worker,starting,publishing,ready:!!worker&&ready&&performance.now()-lastHealth<3500&&bridge.info().status.ready,error,source,runtime,health,replaced,lastAck});
 return{
  info,
  async start(config){if(worker||starting)throw Error('Stop NDI output before restarting.');const found=detectNdi();if(!found.available)throw Error('Install the NDI 6 runtime on this PC first.');starting=true;error=null;health=null;replaced=0;lastAck=null;
   try{
    await bridge.start(config);
    worker=spawnWorker(helper,[found.path,config.source,String(config.width),String(config.height),String(config.fps)],{windowsHide:true,stdio:['pipe','pipe','ignore']});const target=worker;
    worker.stdin.on('error',()=>{if(target===worker)fail('NDI sender pipe disconnected.');});
    const initialized=new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('NDI initialization timed out.')),8000);const lines=createInterface({input:target.stdout});
     lines.on('line',line=>{if(target!==worker)return;let m;try{m=JSON.parse(line);}catch{return;}if(m.type==='ready'){ready=true;source=m.source;runtime=m.runtime;lastHealth=performance.now();clearTimeout(timeout);resolve();}if(m.type==='health'){health=m;lastHealth=performance.now();}if(m.type==='sent'){if(inflight!==m.id)return;inflight=null;const p=confirmations.get(m.id);if(p){confirmations.delete(m.id);clearTimeout(p.timer);p.resolve();}flush();}if(m.type==='error'){clearTimeout(timeout);fail(m.error);reject(Error(m.error));}});
     const gone=()=>{clearTimeout(timeout);if(target===worker){fail('NDI sender stopped. Restart output manually; no TAKE was replayed.');reject(Error(error));}};target.on('error',gone);target.on('exit',gone);
    });await initialized;
    window=new BrowserWindow({show:false,frame:false,width:config.width,height:config.height,useContentSize:true,transparent:true,webPreferences:{offscreen:true,partition:'broadcastcg-ndi',sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,zoomFactor:1}});
    window.setMenu(null);window.setContentSize(config.width,config.height);window.webContents.setFrameRate(config.fps);
    window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',e=>e.preventDefault());
    window.webContents.on('render-process-gone',()=>fail('NDI renderer stopped. Restart output manually.'));
    window.webContents.on('paint',(_e,_dirty,image)=>{if(!ready||publishing)return;try{offer(image);}catch(e){fail(e.message);}});
    await window.loadURL(bridge.info().url);
    const end=performance.now()+8000;while(!info().ready){if(!ready||performance.now()>end)throw Error(error||'NDI renderer did not become ready.');await new Promise(r=>setTimeout(r,50));}
    return info();
   }catch(e){const message=e.message;await this.stop();error=message;throw e;}finally{starting=false;}
  },
  async publish(program){if(!info().ready)throw Error(error||'NDI output is not ready.');if(publishing)throw Error('An NDI output command is still pending.');publishing=true;const start=performance.now();try{await bridge.publish(program);if(!window||!ready)throw Error('NDI renderer disconnected.');const image=await window.webContents.capturePage();await offer(image,true);lastAck={revision:program.revision,ms:Math.round(performance.now()-start)};}finally{publishing=false;}},
  async stop(){ready=false;rejectAll('NDI stopped. Command result is unconfirmed.');window?.destroy();window=null;latest=null;inflight=null;const target=worker;worker=null;if(target){await new Promise(resolve=>{if(target.exitCode!==null)return resolve();const timer=setTimeout(()=>{target.kill();resolve();},2000);target.once('exit',()=>{clearTimeout(timer);resolve();});target.stdin.end();});}await bridge.stop();},
  dispose(){ready=false;window?.destroy();window=null;worker?.stdin.end();worker?.kill();worker=null;rejectAll('Application closed.');},
 };
}
module.exports={createNdiController};
