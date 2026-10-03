// Serializes explicit operator presses. A failure/cancel drops queued work, never retries it.
export function createCommandQueue(limit=64){
 let active=false;
 type Entry={task:()=>Promise<unknown>;resolve:(value:unknown)=>void;reject:(reason:unknown)=>void};
 const waiting:Entry[]=[];
 function cancel(reason:unknown=Error('Pending controls cancelled.')){for(const entry of waiting.splice(0))entry.reject(reason);}
 async function drain(){
  if(active)return;active=true;
  try{while(waiting.length){const entry=waiting.shift()!;try{entry.resolve(await entry.task());}catch(error){entry.reject(error);cancel(error);}}}
  finally{active=false;}
 }
 return {cancel,enqueue<T>(task:()=>Promise<T>):Promise<T>{
  if(waiting.length>=limit)return Promise.reject(Error('Too many pending presses. Wait for the current actions to finish.'));
  return new Promise<T>((resolve,reject)=>{waiting.push({task,resolve:value=>resolve(value as T),reject});void drain();});
 }};
}
