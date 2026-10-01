import {parentPort,workerData} from 'node:worker_threads';
import {open} from 'node:fs/promises';
import {AE_LIMITS,convertAe,inspectAePng} from './ae-import.mjs';
async function run(){try{
 const file=await open(workerData.file,'r');let bytes;
 try{const stat=await file.stat(),limit=workerData.reference?AE_LIMITS.assetBytes:AE_LIMITS.fileBytes;if(!stat.isFile()||stat.size>limit)throw Error('File exceeds the import size limit.');bytes=Buffer.alloc(stat.size);let offset=0;while(offset<bytes.length){const r=await file.read(bytes,offset,bytes.length-offset,offset);if(!r.bytesRead)throw Error('File changed while reading. Try again.');offset+=r.bytesRead;}}finally{await file.close();}
 parentPort.postMessage({ok:true,result:workerData.reference?inspectAePng(bytes):convertAe(bytes,workerData.name)});
}catch(e){parentPort.postMessage({ok:false,error:e.message||'AE package could not be read.'});}}
run();
