import {parentPort,workerData} from 'node:worker_threads';
import {open} from 'node:fs/promises';
import {convertPsd,PSD_LIMITS} from './psd-import.mjs';
async function run(){try{
 const file=await open(workerData.file,'r');let bytes;
 try{const stat=await file.stat();if(!stat.isFile()||stat.size>PSD_LIMITS.fileBytes)throw Error('Choose a PSD file no larger than 100 MB.');bytes=Buffer.alloc(stat.size);let offset=0;while(offset<bytes.length){const r=await file.read(bytes,offset,bytes.length-offset,offset);if(!r.bytesRead)throw Error('The PSD changed while it was being read. Try again.');offset+=r.bytesRead;}}finally{await file.close();}
 parentPort.postMessage({ok:true,result:convertPsd(bytes,workerData.name)});
}catch(error){parentPort.postMessage({ok:false,error:error.message||'PSD could not be read.'});}}
run();
