import assert from 'node:assert/strict';
import {app,safeStorage} from 'electron';
import {writeFileSync,readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {defaultProject} from '../lib/studio-model.ts';
export async function ndiSmoke({js,api,capture,checks}){
 const control=(a,d)=>js(`window.broadcastCG.broadcastOutput(${JSON.stringify(a)},${JSON.stringify(d)})`);
 const available=(await control('status')).ndi.available;if(!available)throw Error('NDI qualification requires the installed runtime.');
 const project=defaultProject();project.name='Direct NDI qualification';assert.equal((await api('/api/projects',{project,revision:0})).status,200);
 const command={projectId:project.id,scene:project.scenes[0],variables:project.variables,mode:'show'};
 const profile=app.getPath('userData');assert.ok(profile.replaceAll('\\','/').includes('/desktop/.cache/smoke-profile-'),'Only corrupt a disposable QA output key');
 const data=join(profile,'data'),keyFile=join(data,'browser-output-key.bin'),unreadable=Buffer.from('Unreadable output key QA fixture');writeFileSync(keyFile,unreadable);
 try{
  await assert.rejects(()=>control('ndiStart',{width:3840,height:2160,fps:50,port:17819,background:'transparent',source:'QA'}),/720p and 1080p/);
  const info=await control('ndiStart',{width:1280,height:720,fps:50,port:17819,background:'transparent',source:'BroadcastCG Desktop QA'});assert.equal(info.mode,'ndi');assert.equal(info.url,null);assert.equal(info.ndi.ready,true);
  assert.equal(info.keyRecovered,true);assert.match(safeStorage.decryptString(readFileSync(keyFile)),/^[a-f0-9]{64}$/);const preserved=readdirSync(data).filter(n=>n.startsWith('browser-output-key.bin.unreadable-'));assert.equal(preserved.length,1);assert.deepEqual(readFileSync(join(data,preserved[0])),unreadable);checks.push('NDI startup recovers an unreadable output-only key with Windows encryption and preserves the original ciphertext');
  await assert.rejects(()=>control('start',info.config),/Stop the current output/);await assert.rejects(()=>control('copyUrl'),/private/);
  const take=await api('/api/program',command);assert.equal(take.status,200,JSON.stringify(take));assert.equal(take.value.acknowledged,true);assert.equal((await control('status')).ndi.lastAck.revision,take.value.revision);
  await js("[...document.querySelectorAll('button')].find(b=>b.textContent==='Broadcast output').click()");await new Promise(r=>setTimeout(r,1200));await capture('phase11-ndi-output.png');await js("document.querySelector('[aria-label=\"Close broadcast output\"]').click()");
  assert.equal((await api('/api/program',{...command,mode:'hide',scene:null})).status,200);
  await control('stop');assert.equal((await api('/api/program',command)).status,503);checks.push('Direct NDI native IPC validates format, keeps renderer private, submits exact TAKE/HIDE and rejects stopped output without desktop fallback');
 }finally{await control('desktop');}
}
