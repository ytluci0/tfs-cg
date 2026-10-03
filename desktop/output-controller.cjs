const {spawn}=require('node:child_process');
const {join}=require('node:path');
const {randomUUID}=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {loadOutputKey}=require('./output-key.cjs');

function createOutputController({directory,appDirectory,executable,readProgram,readAsset,settings,protect,unprotect}){
 let child=null,url=null,config=null,revision=null,lastVariables='',busy=false,starting=false,keyRecovered=false,status={connected:false,ready:false},lastStatus=0;
 const pending=new Map();
 function rejectAll(message){for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error(message));}pending.clear();}
 function request(action,data,timeout=8000){return new Promise((resolve,reject)=>{if(!child?.connected)return reject(Error('Browser output host is offline.'));const id=randomUUID(),timer=setTimeout(()=>{pending.delete(id);reject(Error('Output host response timed out. Inspect output before retrying.'));},timeout);pending.set(id,{resolve,reject,timer});child.send({id,action,data},e=>{if(e){clearTimeout(timer);pending.delete(id);reject(e);}});});}
 const info=()=>({running:!!child,starting,keyRecovered,config:config||settings.get('broadcastOutput',null),url,status:{...status,ready:!!child&&status.ready&&performance.now()-lastStatus<4000},busy});
 async function media(program){const ids=[...new Set(JSON.stringify(program).match(/\/api\/assets\/[a-zA-Z0-9-]+/g)||[])];return Promise.all(ids.map(async path=>{const response=await readAsset(path);if(!response.ok)throw Error('Output image unavailable: '+path.split('/').pop());return{id:path.split('/').pop(),type:response.headers.get('content-type').split(';')[0],bytes:Buffer.from(await response.arrayBuffer())};}));}
 const timer=setInterval(async()=>{if(!child||!revision||busy)return;busy=true;try{const p=await readProgram();if(p?.revision===revision){const v=JSON.stringify(p.variables);if(lastVariables!==v&&child?.connected){lastVariables=v;child.send({action:'update',data:p});}}}catch{}finally{busy=false;}},250);timer.unref();
 return{
  info,
  async start(value){
   if(child||starting)throw Error('Stop browser output before changing settings.');starting=true;
   try{
    const key=loadOutputKey({directory,protect,unprotect}),secret=key.secret;keyRecovered=keyRecovered||key.recovered;
    child=spawn(executable,[join(appDirectory,'app/output-host.cjs')],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},windowsHide:true,stdio:['ignore','ignore','ignore','ipc'],serialization:'advanced'});
    const target=child;
    child.on('message',m=>{if(child!==target)return;if(m.type==='status'){status=m.status;lastStatus=performance.now();}else if(pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error)):p.resolve(m.value);}});
    const lost=()=>{if(child!==target)return;child=null;url=null;revision=null;status={connected:false,ready:false,error:'Output process stopped. Restart it manually; no commands were replayed.'};rejectAll('Output process disconnected. Command result is unconfirmed.');};
    child.on('error',lost);child.on('exit',lost);
    const result=await request('start',{root:join(appDirectory,'app/browser-output'),config:value,secret});url=result.url;status=result.status;lastStatus=performance.now();config=value;settings.set('broadcastOutput',value);return info();
   }catch(e){await this.stop();throw e;}finally{starting=false;}
  },
  async publish(program){if(!info().status.ready)throw Error('Browser receiver is offline. Load the output URL in OBS first.');const assets=await media(program);revision=program.revision;lastVariables=JSON.stringify(program.variables);return request('publish',{program,assets});},
  async stop(){const target=child;if(!target)return;child=null;url=null;revision=null;rejectAll('Browser output stopped. Command result is unconfirmed.');status={connected:false,ready:false};await new Promise(resolve=>{const timeout=setTimeout(()=>{target.kill();resolve();},2000);target.once('exit',()=>{clearTimeout(timeout);resolve();});if(target.connected)target.send({action:'stop'},()=>{});else{clearTimeout(timeout);resolve();}});},
  dispose(){clearInterval(timer);if(child?.connected)child.disconnect();rejectAll('Application closed.');},
 };
}
module.exports={createOutputController};
