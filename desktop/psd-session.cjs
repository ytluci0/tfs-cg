const {Worker}=require('node:worker_threads');
const {basename}=require('node:path');
const {randomUUID}=require('node:crypto');

// One bounded parser at a time. Parsed pixels never enter the database until commit.
function createPsdSessions({workerPath,authorize,commit,timeoutMs=60000}){
 let pending=null,draft=null;
 function clear(){draft=null;if(pending){const p=pending;pending=null;p.worker.terminate();p.reject(Error('PSD import cancelled.'));}}
 return{
  clear,
  async prepare(file,token){
   authorize(token);if(pending)throw Error('A PSD is already being inspected.');draft=null;
   const value=await new Promise((resolve,reject)=>{
    const worker=new Worker(workerPath,{workerData:{file,name:basename(file)},resourceLimits:{maxOldGenerationSizeMb:384,stackSizeMb:8}});
    const timer=setTimeout(()=>{worker.terminate();finish(Error('PSD inspection exceeded 60 seconds. Reduce document size and try again.'));},timeoutMs);
    const finish=(error,result)=>{clearTimeout(timer);if(pending?.worker===worker)pending=null;worker.terminate();error?reject(error):resolve(result);};
    pending={worker,reject:e=>finish(e)};
    worker.once('message',m=>finish(m.ok?null:Error(m.error),m.result));worker.once('error',()=>finish(Error('PSD parser stopped. Reduce document size and try again.')));
    worker.once('exit',code=>{if(pending?.worker===worker)finish(Error('PSD parser exited before completing.'));});
   });
   authorize(token);draft={id:randomUUID(),token,expires:Date.now()+20*60*1000,value};
   return{id:draft.id,...value,assets:undefined,images:Object.fromEntries(value.assets.map(a=>['/api/assets/'+a.id,'data:image/png;base64,'+Buffer.from(a.bytes).toString('base64')]))};
  },
  finish(options,token){
   authorize(token);if(!draft||draft.id!==options?.id||draft.token!==token||draft.expires<Date.now())throw Error('The PSD review expired. Import the file again.');
   const result=commit(draft.value,options,token);draft=null;return result;
  },
 };
}
module.exports={createPsdSessions};
