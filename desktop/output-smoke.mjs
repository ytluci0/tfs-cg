import assert from 'node:assert/strict';
import {BrowserWindow} from 'electron';
import {defaultProject} from '../lib/studio-model.ts';

export async function outputSmoke({js,api,capture,checks,sleep,until}){
 const control=(a,d)=>js(`window.broadcastCG.broadcastOutput(${JSON.stringify(a)},${JSON.stringify(d)})`);
 const project=defaultProject();project.name='Browser output qualification';assert.equal((await api('/api/projects',{project,revision:0})).status,200);
 const command={projectId:project.id,scene:project.scenes[0],variables:project.variables,mode:'show'};
 let receiver;
 try{
  const info=await control('start',{width:1280,height:720,fps:50,port:17819,background:'transparent'});
  assert.ok(info.url.startsWith('http://127.0.0.1:17819/live/'));assert.equal(info.mode,'browser');assert.equal((await api('/api/program',command)).status,503);
  receiver=new BrowserWindow({show:false,frame:false,width:1280,height:720,useContentSize:true,transparent:true,webPreferences:{partition:'phase10-output-qa',sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  const errors=[];receiver.webContents.on('console-message',(_e,d)=>{if(d.level==='error')errors.push(d.message);});
  receiver.setMenu(null);receiver.setContentSize(1280,720);await receiver.loadURL(info.url);assert.deepEqual(await receiver.webContents.executeJavaScript('({width:innerWidth,height:innerHeight})'),{width:1280,height:720});await until(async()=>(await control('status')).status.ready);
  assert.equal(await receiver.webContents.executeJavaScript('typeof window.require'),'undefined');
  const take=await api('/api/program',command);assert.equal(take.status,200,JSON.stringify(take));assert.equal(take.value.acknowledged,true);
  assert.equal(await receiver.webContents.executeJavaScript('document.querySelector("main").dataset.revision'),take.value.revision);
  assert.equal(await receiver.webContents.executeJavaScript('getComputedStyle(document.documentElement).backgroundColor'),'rgba(0, 0, 0, 0)');
  await sleep(1100);const status=await control('status');assert.ok(status.status.ackMs>=0);assert.ok(status.status.telemetry.callbacks>0);assert.equal(errors.length,0,JSON.stringify(errors));
  await js("[...document.querySelectorAll('button')].find(b=>b.textContent==='Broadcast output').click()");await until(()=>js("!!document.querySelector('[aria-label=\"Broadcast output\"]')"));await capture('phase10-broadcast-output.png');
  await js("document.querySelector('[aria-label=\"Close broadcast output\"]').click()");
  checks.push('Browser output uses a separate host, transparent receiver, image readiness and exact-revision acknowledgement; desktop monitor cannot bypass it');
  const hide=await api('/api/program',{projectId:project.id,scene:null,variables:{},mode:'hide'});assert.equal(hide.status,200);await sleep(650);assert.equal(await receiver.webContents.executeJavaScript('document.querySelectorAll("svg").length'),0);
  receiver.destroy();receiver=null;await until(async()=>!(await control('status')).status.ready);assert.equal((await api('/api/program',command)).status,503);
  checks.push('Browser HIDE removes the graphic; receiver disconnect rejects further TAKE without fallback or replay');
  await control('stop');const stopped=await control('status');assert.equal(stopped.running,false);await control('desktop');
 }finally{receiver?.destroy();await control('desktop');}
}
