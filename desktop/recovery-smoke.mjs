import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
export async function recoverySmoke({js,api,auth,dialog,reload,capture,checks,sleep,until,getOutput,credentials,directory,project}){
 getOutput()?.destroy();
 await js("document.querySelector('[aria-label=\"Close accounts\"]')?.click()");
 const timed=await auth('createUser',{username:'qa_expiring',displayName:'Timed QA User',password:credentials.password,role:'OPERATOR',workspaceIds:[project.id],accessExpiresAt:Date.now()+60000});
 await js("[...document.querySelectorAll('button')].find(b=>b.textContent==='Accounts & access').click()");await until(()=>js("document.querySelector('.account-table')?.innerText.includes('qa_expiring')"));
 await js("[...document.querySelectorAll('.account-table tbody tr')].find(r=>r.innerText.includes('qa_expiring')).querySelector('button').click()");
 await until(()=>js("document.querySelectorAll('input[type=datetime-local]').length===2"));
 await js("[...document.querySelectorAll('button')].find(b=>b.textContent==='30 days from now').click()");
 assert.ok(await js("[...document.querySelectorAll('input[type=datetime-local]')].at(-1).value.length>10"));await capture('phase9-access-periods.png');
 await js("[...document.querySelectorAll('button')].find(b=>b.textContent==='Save user').click()");await until(()=>js("document.body.innerText.includes('Access saved.')"));
 const users=await auth('users');assert.ok(users.find(u=>u.id===timed.id).accessExpiresAt>Date.now()+29*86400000);
 await js("document.querySelector('[aria-label=\"Close accounts\"]').click()");checks.push('native access dates, 30-day preset and account update');
 const saved=(await api('/api/projects/'+project.id)).value;
 const packFile=join(directory,'phase9-project.broadcastpkg'),backupFile=join(directory,'phase9-backup.bcbackup'),saveDialog=dialog.showSaveDialog,openDialog=dialog.showOpenDialog,box=dialog.showMessageBox;
 try{
  dialog.showOpenDialog=async()=>({canceled:false,filePaths:[directory]});
  const kit=await js(`window.broadcastCG.network('exportManaged',${JSON.stringify({name:'Recipient test configuration',url:'https://192.0.2.50:9443',fingerprint:'ab'.repeat(32)})})`);
  assert.ok(existsSync(join(kit,'Install-ManagedClient.ps1')));const policy=JSON.parse(readFileSync(join(kit,'production.bcclient'),'utf8'));assert.equal(policy.profiles[0].url,'https://192.0.2.50:9443');assert.equal(policy.profiles[0].password,undefined);assert.equal((await js('window.broadcastCG.network("info")')).managed,false);checks.push('recipient setup kit exports a pinned public configuration without changing owner mode');
  dialog.showSaveDialog=async()=>({canceled:false,filePath:packFile});assert.equal(await js(`window.broadcastCG.exportProject(${JSON.stringify(saved.project)})`),true);assert.equal(JSON.parse(readFileSync(packFile,'utf8')).format,'broadcastcg-package');
  dialog.showOpenDialog=async()=>({canceled:false,filePaths:[packFile]});dialog.showMessageBox=async()=>({response:1});
  const imported=await js('window.broadcastCG.importProject()');assert.equal(imported.revision,1);assert.equal((await api('/api/projects/'+imported.project.id)).value.project.name,imported.project.name);checks.push('native .broadcastpkg export, reviewed import and atomic workspace save');
  const recovery=(action,data)=>js(`window.broadcastCG.recovery(${JSON.stringify(action)},${JSON.stringify(data)})`);
  await js("[...document.querySelectorAll('button')].find(b=>b.textContent==='Backups & recovery').click()");await until(()=>js("document.querySelector('[aria-label=\"Backups and recovery\"]')!==null"));
  await js(`(()=>{const input=document.querySelector('[aria-label="Backups and recovery"] input[type=password]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(credentials.password)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await js("[...document.querySelectorAll('button')].find(b=>b.textContent==='Create backup').click()");await until(()=>js("document.querySelectorAll('.recovery-list article').length===1"));
  await js("[...document.querySelectorAll('button')].find(b=>b.textContent==='Verify').click()");await until(()=>js("document.querySelector('.recovery-report')!==null"));await capture('phase9-backups.png');
  const catalog=await recovery('list');assert.equal(catalog.backups.length,1);dialog.showSaveDialog=async()=>({canceled:false,filePath:backupFile});await recovery('export',{id:catalog.backups[0].id});checks.push('native encrypted backup creation, verification and export');
  await js("document.querySelector('[aria-label=\"Close recovery\"]').click()");
  await js(`window.broadcastCG.editorState('workspace',${JSON.stringify(project.id)},${JSON.stringify({projectId:project.id,sceneId:saved.project.scenes[0].id,view:'animate',time:1.25})})`);await reload();await until(()=>js("document.querySelector('.studio')?.dataset.view==='animate'"));
  assert.equal(await js('window.broadcastCG.editorState("workspace").then(s=>s.projectId)'),project.id);checks.push('last workspace and animation view recover without replaying output');
  // Restore only this isolated smoke profile; production AppData is never used.
  const fresh=(await api('/api/projects/'+project.id)).value;fresh.project.name='Change after backup';await api('/api/projects',fresh);
  dialog.showOpenDialog=async()=>({canceled:false,filePaths:[backupFile]});
  await recovery('restoreFile',{password:credentials.password}).catch(e=>{if(!/destroyed|navigation|context/i.test(e.message))throw e;});
  await until(()=>js("document.querySelector('.account-card')!==null").catch(()=>false));await auth('login',credentials);await reload();
  assert.equal((await api('/api/projects/'+project.id)).value.project.name,saved.project.name);assert.equal((await api('/api/program')).value,null);checks.push('native verified restore retains rollback, revokes sessions and starts off air');
 }finally{dialog.showSaveDialog=saveDialog;dialog.showOpenDialog=openDialog;dialog.showMessageBox=box;}
}
