const {Worker}=require('node:worker_threads');
const {basename}=require('node:path');
const {randomUUID}=require('node:crypto');
function createAeSessions({workerPath,authorize,commit,timeoutMs=60000,now=Date.now}){
 let pending=null,draft=null,generation=0;
 function clear(){generation++;draft=null;if(pending){const p=pending;pending=null;p.stop(Error('AE import cancelled.'));}}
 function parse(file,reference=false){if(pending)throw Error('An AE file is already being inspected.');return new Promise((resolve,reject)=>{
  const worker=new Worker(workerPath,{workerData:{file,name:basename(file),reference},resourceLimits:{maxOldGenerationSizeMb:384,stackSizeMb:8}});let done=false;
  const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);if(pending?.worker===worker)pending=null;worker.terminate();error?reject(error):resolve(value);};
  const timer=setTimeout(()=>finish(Error('AE inspection exceeded 60 seconds. Export a smaller work area.')),timeoutMs);pending={worker,stop:finish};
  worker.once('message',m=>finish(m.ok?null:Error(m.error),m.result));worker.once('error',()=>finish(Error('AE parser stopped. Reduce the package size and try again.')));worker.once('exit',()=>finish(Error('AE parser exited before completing.')));
 });}
 function check(id,token){authorize(token);if(!draft||draft.id!==id||draft.token!==token||draft.expires<now())throw Error('The AE review expired. Import the file again.');return draft;}
 function publicDraft(){const v=draft.value;return{id:draft.id,...v,assets:undefined,images:Object.fromEntries(v.assets.map(a=>['/api/assets/'+a.id,'data:image/png;base64,'+Buffer.from(a.bytes).toString('base64')]))};}
 return{clear,
  async prepare(file,token){authorize(token);if(pending)throw Error('An AE file is already being inspected.');clear();const sequence=generation,value=await parse(file);authorize(token);if(sequence!==generation)throw Error('AE import cancelled.');draft={id:randomUUID(),token,expires:now()+1200000,value};return publicDraft();},
  async reference({id,time},file,token){const original=check(id,token);if(!Number.isFinite(time)||time<0||time>original.value.scene.duration)throw Error('Choose a time inside the animation.');if(original.value.scene.importReport.references.length>=20)throw Error('A conversion supports up to 20 reference frames.');const image=await parse(file,true);check(id,token);if(draft!==original)throw Error('The AE review changed.');const {scene,assets}=draft.value;if(image.width!==scene.width||image.height!==scene.height)throw Error('Reference PNG must match the composition dimensions.');if(assets.reduce((n,a)=>n+a.bytes.length,0)+image.bytes.length>55000000)throw Error('AE images exceed 55 MB.');if(assets.reduce((n,a)=>{const b=Buffer.from(a.bytes);return n+b.readUInt32BE(16)*b.readUInt32BE(20)*4;},0)+image.decodedBytes>256000000)throw Error('AE decoded images exceed 256 MB.');const assetId=randomUUID(),src='/api/assets/'+assetId;assets.push({id:assetId,name:basename(file).slice(0,200),bytes:image.bytes});scene.importReport.references.push({time,src});scene.importReport.references.sort((a,b)=>a.time-b.time);scene.importReport.referenceSrc=scene.importReport.references[0].src;scene.importReport.warnings=scene.importReport.warnings.filter(w=>!w.message.startsWith('No AE reference renders'));draft.value.warnings=scene.importReport.warnings;return publicDraft();},
  finish(options,token){if(pending)throw Error('Wait for reference inspection before importing.');const value=check(options?.id,token).value,result=commit(value,options,token);clear();return result;},
 };
}
module.exports={createAeSessions};
