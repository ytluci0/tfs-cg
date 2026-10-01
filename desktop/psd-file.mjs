import {open} from 'node:fs/promises';
import {freemem} from 'node:os';
import {inspectPsdHeader} from './psd-import.mjs';

const chunkBytes=8*1024*1024;
// Leave room for a decoded bitmap, PNG encoding, the editor and the OS. The
// parser decodes one layer at a time; its separate total pixel budget still applies.
export const PSD_MEMORY_HEADROOM=1_500_000_000;
export async function readPsdFile(path,{availableMemory=()=>Math.min(freemem(),process.availableMemory?.()??Infinity)}={}){
 const file=await open(path,'r');
 try{
  const before=await file.stat();
  if(!before.isFile())throw Error('Choose a Photoshop PSD file.');
  const header=Buffer.alloc(26),{bytesRead}=await file.read(header,0,26,0);
  inspectPsdHeader(header.subarray(0,bytesRead),before.size);
  const required=before.size+PSD_MEMORY_HEADROOM,available=availableMemory();
  if(available<required)throw Error(`Not enough free memory to import this PSD safely. About ${(required/1e9).toFixed(1)} GB is needed; ${(available/1e9).toFixed(1)} GB is available. Close other applications and try again.`);
  const bytes=Buffer.alloc(before.size);let offset=0;
  while(offset<bytes.length){
   const read=await file.read(bytes,offset,Math.min(chunkBytes,bytes.length-offset),offset);
   if(!read.bytesRead)throw Error('The PSD changed while it was being read. Save it and try again.');
   offset+=read.bytesRead;
  }
  const after=await file.stat();
  if(after.size!==before.size||after.mtimeMs!==before.mtimeMs||after.ctimeMs!==before.ctimeMs)throw Error('The PSD changed while it was being read. Save it and try again.');
  return bytes;
 }finally{await file.close();}
}
