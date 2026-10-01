import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRemoteAuthority} from './network-client.mjs';
import {defaultProject} from '../lib/studio-model.ts';
export async function networkSmoke({js,api,reload,capture,checks,sleep,until,getOutput,credentials}){
 const network=(action,data)=>js(`window.broadcastCG.network(${JSON.stringify(action)},${JSON.stringify(data)})`),auth=(action,data)=>js(`window.broadcastCG.auth(${JSON.stringify(action)},${JSON.stringify(data)})`);
 let client;
 try{
  getOutput()?.destroy();
  await network('provision',{name:'QA Production',host:'127.0.0.1',port:19443});await network('startHost');
  const info=await network('info'),profile=info.profiles.find(p=>p.name==='QA Production');assert.ok(profile);assert.equal((await network('test',profile)).database,'available');
  await network('switch',{id:profile.id});await until(()=>js("document.body.innerText.includes('Set up your workstation')").catch(()=>false));await auth('setup',credentials);await reload();await until(()=>js("window.broadcastCG.status().then(s=>s.network==='connected')"));
  const p=defaultProject();p.name='LAN native qualification';assert.equal((await api('/api/projects',{project:p,revision:0})).status,200);await reload();
  await js("[...document.querySelectorAll('button')].find(b=>b.textContent==='Connections').click()");await until(()=>js("document.querySelector('[aria-label=\"Connections and production server\"]')!==null"));await capture('phase8-connections.png');await js("document.querySelector('[aria-label=\"Close connections\"]').click()");
  await js('window.broadcastCG.openOutput()');await until(()=>getOutput()&&!getOutput().webContents.isLoading());await network('attachOutput');await until(()=>js('window.broadcastCG.status().then(s=>s.engineAttached)'));
  const take=await api('/api/program',{projectId:p.id,scene:p.scenes[0],variables:p.variables,mode:'show'});assert.equal(take.status,200,JSON.stringify(take));assert.equal(take.value.acknowledged,true);assert.equal(await getOutput().webContents.executeJavaScript('document.querySelectorAll("svg[data-testid=graphic]").length'),1);
  assert.equal(await getOutput().webContents.executeJavaScript('fetch("/api/projects").then(r=>r.status)'),403);assert.equal(await getOutput().webContents.executeJavaScript('fetch("/api/program",{method:"POST",body:"{}"}).then(r=>r.status)'),403);
  let latest;client=createRemoteAuthority({profile,settings:{},workstation:'Second QA PC',onState:s=>{if(s.projects)latest=s;}});await client.auth.login(credentials);await until(()=>client.connected());
  const external=async(path,body)=>{const r=await client.handle(new Request('broadcastcg://app'+path,body?{method:'POST',body:JSON.stringify(body)}:{}),{});return{status:r.status,value:await r.json()};};
  let saved=(await external('/api/projects/'+p.id)).value;saved.project.name='Synchronized from second PC';assert.equal((await external('/api/projects',saved)).status,200);await until(()=>js("document.querySelector('[aria-label=\"Project name\"]').value==='Synchronized from second PC'"));
  await js(`(()=>{const input=document.querySelector('[aria-label="Project name"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Unsaved local draft');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  saved=(await external('/api/projects/'+p.id)).value;saved.project.name='Conflicting remote change';assert.equal((await external('/api/projects',saved)).status,200);await until(()=>js("document.body.innerText.includes('your unsaved draft is preserved')"));assert.equal(await js("document.querySelector('[aria-label=\"Project name\"]').value"),'Unsaved local draft');
  await capture('phase8-draft-conflict.png');
  await client.locks(p.id,'request');await until(()=>js("document.querySelector('.network-lockbar').innerText.includes('Second QA PC')"));assert.equal((await api('/api/projects',{project:p,revision:1})).status,423);await client.locks(p.id,'release');
  checks.push('native saved profiles, certificate probe, separate server account and two-client live synchronization','remote output acknowledgement and read-only output capability','dirty editor preserved during remote changes; workspace ownership enforced');
  // Preserve and discard this isolated QA draft before leaving; never touch the user's profile.
  await js('window.broadcastCG.auth("logout")');getOutput()?.destroy();await network('switch',{id:null});await until(()=>js('window.broadcastCG.auth("bootstrap").then(()=>true)').catch(()=>false));await auth('login',credentials);await network('stopHost');
 }finally{client?.close();}
}
