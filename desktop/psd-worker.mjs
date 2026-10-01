import {parentPort,workerData} from 'node:worker_threads';
import {convertPsd} from './psd-import.mjs';
import {readPsdFile} from './psd-file.mjs';
async function run(){try{
 const bytes=await readPsdFile(workerData.file);
 parentPort.postMessage({ok:true,result:convertPsd(bytes,workerData.name)});
}catch(error){parentPort.postMessage({ok:false,error:error.message||'PSD could not be read.'});}}
run();
