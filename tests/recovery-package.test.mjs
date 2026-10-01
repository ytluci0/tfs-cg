import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,existsSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {createLocalService} from '../desktop/local-service.mjs';
import {secretCodec} from '../desktop/server-crypto.mjs';
import {prepareRestore,commitRestore,completeRestore,recoverInterruptedRestore} from '../desktop/recovery-store.mjs';
import {managedPolicy,readManagedPolicy} from '../desktop/managed-client.mjs';
import {createEditorState} from '../desktop/editor-state.cjs';
import {defaultProject} from '../lib/studio-model.ts';
const password='isolated recovery QA password';
async function fixture(t){
 const root=mkdtempSync(join(tmpdir(),'bcg-recovery-')),directory=join(root,'source'),key=randomBytes(32),codec=secretCodec(key),service=createLocalService({directory,...codec});let closed=false;
 const admin=await service.auth.setup({username:'owner',password}),project=defaultProject();project.name='Recovery fixture';
 async function api(path,body,token=admin.token){const r=await service.handle(new Request('broadcastcg://app'+path,{method:body?'POST':'GET',...(body?{body:JSON.stringify(body)}:{})}),{token});assert.equal(r.status,200,await r.clone().text());return r.json();}
 await api('/api/projects',{project,revision:0});
 t.after(()=>{if(!closed)service.close();assert.ok(root.startsWith(join(tmpdir(),'bcg-recovery-')));rmSync(root,{recursive:true,force:true});});
 return{root,directory,service,admin,project,codec,api,close(){service.close();closed=true;}};
}
test('portable packages preserve animation, controls, sports and media; damage is rejected before any writes',async t=>{
 const x=await fixture(t),png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG7sAAAAASUVORK5CYII=','base64');
 const res=await x.service.handle(new Request('broadcastcg://app/api/assets',{method:'POST',body:png}),{token:x.admin.token}),asset=await res.json();x.project.scenes[0].layers[0].src=asset.url;
 const text=x.service.exportProject(x.project,x.admin.token,'package'),pkg=JSON.parse(text);assert.equal(pkg.format,'broadcastcg-package');assert.ok(pkg.manifest.dependencies.fonts.includes('Arial'));
 const imported=x.service.importProject(x.service.inspectImport(text,x.admin.token),x.admin.token,{save:true});assert.equal(imported.revision,1);assert.notEqual(imported.project.id,x.project.id);assert.notEqual(imported.project.scenes[0].layers[0].src,asset.url);
 assert.deepEqual(imported.project.panels,x.project.panels);assert.deepEqual(imported.project.scenes[0].layers[1].keys,x.project.scenes[0].layers[1].keys);assert.deepEqual(imported.project.players,x.project.players);
 const reopened=await x.api('/api/projects/'+imported.project.id);assert.deepEqual(reopened.project,imported.project);
 pkg.project.name='Tampered';assert.throws(()=>x.service.inspectImport(JSON.stringify(pkg),x.admin.token),/integrity/);
 const damaged=JSON.parse(text);damaged.assets[0].bytes=Buffer.from('changed').toString('base64');assert.throws(()=>x.service.inspectImport(JSON.stringify(damaged),x.admin.token),/integrity/);
 const missing=JSON.parse(text);missing.assets=[];missing.manifest.assets=[];assert.throws(()=>x.service.inspectImport(JSON.stringify(missing),x.admin.token),/every referenced/);
 assert.equal(x.service.diagnostics().projects,2);
 const legacy=x.service.exportProject(x.project,x.admin.token);assert.equal(x.service.inspectImport(legacy,x.admin.token).missing.length,0);
});
test('encrypted backups verify and restore across machine codecs; sessions are revoked and output is empty',async t=>{
 const x=await fixture(t);x.project.sources=[{id:'feed',name:'Feed',url:'https://example.com/feed',interval:0}];await x.api('/api/projects',{project:x.project,revision:1});await x.api('/api/sources',{projectId:x.project.id,sourceId:'feed',headers:{Authorization:'private-test-credential'}});
 const backup=await x.service.recovery.create(x.admin.token,{password,label:'Before update'}),bytes=x.service.recovery.export(x.admin.token,backup.id);
 assert.equal(x.service.recovery.list(x.admin.token)[0].label,'Before update');assert.ok(!bytes.includes(Buffer.from('private-test-credential')));
 const report=await x.service.recovery.verify(x.admin.token,{id:backup.id,password});assert.equal(report.projects,1);assert.equal(report.accounts,1);
 await assert.rejects(x.service.recovery.verify(x.admin.token,{id:backup.id,password:'incorrect backup password'}),/incorrect|damaged/);
 const corrupt=Buffer.from(bytes);corrupt[corrupt.length-1]^=1;await assert.rejects(x.service.recovery.inspect(x.admin.token,corrupt,password),/damaged/);
 const destination=join(x.root,'destination'),targetCodec=secretCodec(randomBytes(32)),prepared=await prepareRestore(destination,bytes,password,targetCodec.encrypt);commitRestore(destination,prepared);
 const restored=createLocalService({directory:destination,...targetCodec});try{
  completeRestore(destination);assert.throws(()=>restored.auth.me(x.admin.token),{status:401});const login=await restored.auth.login({username:'owner',password});
  const program=await restored.handle(new Request('broadcastcg://app/api/program'),{token:login.token});assert.equal(await program.json(),null);
  const db=new DatabaseSync(join(destination,'broadcastcg.sqlite'),{readOnly:true});try{assert.equal(JSON.parse(targetCodec.decrypt(Buffer.from(db.prepare('SELECT ciphertext FROM project_secrets').get().ciphertext))).Authorization,'private-test-credential');}finally{db.close();}
 }finally{restored.close();}
});
test('restore interruption at each promotion boundary recovers the original database',async t=>{
 const x=await fixture(t),backup=await x.service.recovery.create(x.admin.token,{password}),bytes=x.service.recovery.export(x.admin.token,backup.id);
 for(const failure of ['journal','old-moved','new-promoted']){
  const dir=join(x.root,failure),codec=secretCodec(randomBytes(32)),prior=createLocalService({directory:dir,...codec});await prior.auth.setup({username:'original',password});prior.settings.set('marker','original');prior.close();
  const prepared=await prepareRestore(dir,bytes,password,codec.encrypt);assert.throws(()=>commitRestore(dir,prepared,{afterStep:step=>{if(step===failure)throw Error('simulated interruption');}}),/simulated/);
  assert.equal(recoverInterruptedRestore(dir).recovered,true);const recovered=createLocalService({directory:dir,...codec});try{assert.equal(recovered.settings.get('marker'),'original');assert.equal((await recovered.auth.login({username:'original',password})).session.user.username,'original');assert.equal(recovered.diagnostics().projects,0);}finally{recovered.close();}
  assert.equal(existsSync(join(dir,'restore-journal.json')),false);
 }
});
test('successful replacement retains rollback data and invalid passwords leave the live database intact',async t=>{
 const x=await fixture(t),backup=await x.service.recovery.create(x.admin.token,{password}),bytes=x.service.recovery.export(x.admin.token,backup.id);
 await assert.rejects(prepareRestore(x.directory,bytes,'wrong recovery password',x.codec.encrypt),/incorrect/);assert.equal(x.service.diagnostics().projects,1);
 const prepared=await prepareRestore(x.directory,bytes,password,x.codec.encrypt);x.close();const result=commitRestore(x.directory,prepared);assert.ok(existsSync(result.rollback));completeRestore(x.directory);
 const db=new DatabaseSync(result.rollback,{readOnly:true});assert.equal(db.prepare('SELECT count(*) n FROM projects').get().n,1);db.close();assert.equal(recoverInterruptedRestore(x.directory),null);
 assert.throws(()=>x.service.recovery.export('invalid-token','../../outside'),/Sign in|database/);
});
test('managed configuration is pinned, deterministic and fails closed when malformed',t=>{
 const dir=mkdtempSync(join(tmpdir(),'bcg-policy-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const file=join(dir,'managed-client.json');assert.equal(readManagedPolicy(file),null);
 const policy={format:'broadcastcg-managed-client',version:1,profiles:[{name:'Production',url:'https://studio:9443',fingerprint:'ab'.repeat(32)}]};writeFileSync(file,JSON.stringify(policy));assert.deepEqual(readManagedPolicy(file),managedPolicy(policy));
 writeFileSync(file,'broken');assert.throws(()=>readManagedPolicy(file));assert.throws(()=>managedPolicy({...policy,profiles:[{...policy.profiles[0],url:'http://studio'}]}),/HTTPS/);
 assert.throws(()=>managedPolicy({...policy,profiles:[policy.profiles[0],policy.profiles[0]]}),/unique/);
});
test('editor recovery is scoped to user and server and cannot persist playback or commands',()=>{
 let identity='serverA:alice';const values=new Map(),memory=createEditorState({settings:{get:k=>values.get(k),set:(k,v)=>values.set(k,v)},identity:()=>identity});
 const v={projectId:'project',sceneId:'scene',view:'animate',time:1.5,playing:true,command:'TAKE'};memory.access('workspace','project',v);assert.equal(memory.access('workspace').time,1.5);assert.equal(memory.access('workspace').playing,undefined);assert.equal(memory.access('workspace').command,undefined);
 identity='serverB:alice';assert.equal(memory.access('workspace'),null);identity='serverA:bob';assert.equal(memory.access('workspace'),null);identity='serverA:alice';assert.equal(memory.access('workspace').sceneId,'scene');assert.throws(()=>memory.access('program','project',{mode:'show'}),/Invalid/);
});
