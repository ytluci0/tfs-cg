import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {createLocalService} from '../desktop/local-service.mjs';
import {defaultProject,action,control} from '../lib/studio-model.ts';
import {randomUUID} from 'node:crypto';
const password='isolated access test password',changed='new isolated access password';
async function fixture(t){
 const directory=mkdtempSync(join(tmpdir(),'bcg-access-'));let now=1800000000000;
 let service=createLocalService({directory,now:()=>now});const owner=await service.auth.setup({username:'owner',password});
 t.after(()=>{service.close();assert.ok(directory.startsWith(join(tmpdir(),'bcg-access-')));rmSync(directory,{recursive:true,force:true});});
 return{directory,owner,get service(){return service;},get time(){return now;},set time(n){now=n;},reopen(){service=createLocalService({directory,now:()=>now});},async create(name,extras={}){return service.auth.createUser(owner.token,{username:name,password,role:'VIEWER',workspaceIds:[],...extras});},async login(u){const first=await service.auth.login({username:u.username,password});return service.auth.changePassword(first.token,{currentPassword:password,password:changed});}};
}
test('account start, live session deadline and remembered login are enforced by authority time',async t=>{
 const x=await fixture(t),end=x.time+120000,u=await x.create('scheduled',{accessStartsAt:x.time+1000,accessExpiresAt:end});
 assert.equal(u.accessStatus,'scheduled');await assert.rejects(x.service.auth.login({username:u.username,password}),/not started/);
 x.time+=1000;await x.login(u);const live=await x.service.auth.login({username:u.username,password:changed,remember:true});
 assert.equal(live.session.expiresAt,end);assert.equal(live.session.idleExpiresAt,end);assert.equal(live.session.serverTime,x.time);
 x.time=end-1;assert.equal(x.service.auth.me(live.token).user.accessStatus,'active');x.service.auth.touch(live.token);
 x.time=end;assert.throws(()=>x.service.auth.me(live.token),/access period has expired/);assert.throws(()=>x.service.auth.resume(live.rememberToken),{status:401});
 await assert.rejects(x.service.auth.login({username:u.username,password:changed}),/access period has expired/);
 assert.equal(x.service.auth.users(x.owner.token).find(a=>a.id===u.id).accessStatus,'expired');
 assert.equal(x.service.auth.audit(x.owner.token,{action:'ACCESS_EXPIRED'}).length,1);
});
test('renewal allows new login and never revives old sessions; legacy edits preserve expiration',async t=>{
 const x=await fixture(t),u=await x.create('renewed',{accessExpiresAt:x.time+10000}),live=await x.login(u);
 const {accessExpiresAt,accessStartsAt,...oldClient}=u;x.service.auth.updateUser(x.owner.token,{...oldClient,displayName:'Legacy edit'});
 assert.equal(x.service.auth.users(x.owner.token).find(a=>a.id===u.id).accessExpiresAt,accessExpiresAt);
 assert.throws(()=>x.service.auth.me(live.token),{status:401});x.time+=10000;
 x.service.auth.updateUser(x.owner.token,{...u,accessExpiresAt:x.time+86400000});
 assert.equal((await x.service.auth.login({username:u.username,password:changed})).session.user.accessStatus,'active');
 assert.throws(()=>x.service.auth.me(live.token),{status:401});
});
test('one permanent owner remains and timed administrators cannot extend or reset longer access',async t=>{
 const x=await fixture(t);assert.throws(()=>x.service.auth.updateUser(x.owner.token,{...x.owner.session.user,accessExpiresAt:x.time+10000}),/unlimited/);
 const u=await x.create('timed_admin',{role:'ADMIN',accessExpiresAt:x.time+10000}),admin=await x.login(u);
 await assert.rejects(x.service.auth.createUser(admin.token,{username:'escape',role:'ADMIN',password,workspaceIds:[]}),{status:403});
 assert.throws(()=>x.service.auth.updateUser(admin.token,{...u,accessExpiresAt:null}),{status:403});
 await assert.rejects(x.service.auth.resetPassword(admin.token,{id:x.owner.session.user.id,password}),{status:403});
 const allowed=await x.service.auth.createUser(admin.token,{username:'bounded',role:'VIEWER',password,workspaceIds:[],accessExpiresAt:u.accessExpiresAt});assert.equal(allowed.accessExpiresAt,u.accessExpiresAt);
 assert.throws(()=>x.service.auth.updateUser(x.owner.token,{...u,accessStartsAt:x.time+10000,accessExpiresAt:x.time+1000}),/after/);
});
test('schema six upgrade preserves accounts and creates a restorable pre-migration snapshot',async t=>{
 const x=await fixture(t);await x.create('existing');x.service.close();
 const db=new DatabaseSync(join(x.directory,'broadcastcg.sqlite'));db.exec('ALTER TABLE auth_users DROP COLUMN access_starts_at; ALTER TABLE auth_users DROP COLUMN access_expires_at; PRAGMA user_version=6;');db.close();
 // Reopen separately because fixture owns the service lifetime.
 const upgraded=createLocalService({directory:x.directory});assert.equal(upgraded.diagnostics().schemaVersion,9);upgraded.close();
 const snapshots=readdirSync(join(x.directory,'backups')).filter(n=>n.startsWith('before-access-periods-'));assert.equal(snapshots.length,1);
 const previous=new DatabaseSync(join(x.directory,'backups',snapshots[0]),{readOnly:true});assert.equal(previous.prepare('PRAGMA user_version').get().user_version,6);assert.equal(previous.prepare('SELECT count(*) n FROM auth_users').get().n,2);previous.close();
 // Avoid a duplicate close in teardown by returning an open authority.
 x.reopen();
});
test('expiration during a running sequence prevents later effects and releases control',async t=>{
 const x=await fixture(t),p=defaultProject();p.panels=[{id:'panel',name:'Expiry test',type:'custom',columns:1,controls:[control('Sequence',[action('increment','homeScore','1'),action('delay','','2000'),action('increment','homeScore','10')],{id:'sequence'})]}];
 const api=async(path,body,token=x.owner.token)=>{const r=await x.service.handle(new Request('broadcastcg://app'+path,body?{method:'POST',body:JSON.stringify(body)}:{}),{token});return{status:r.status,value:await r.json()};};
 assert.equal((await api('/api/projects',{project:p,revision:0})).status,200);
 const u=await x.create('operator',{role:'OPERATOR',workspaceIds:[p.id],accessExpiresAt:x.time+1000}),live=await x.login(u),id=randomUUID();
 assert.equal((await api('/api/commands',{id,projectId:p.id,revision:1,kind:'control',panelId:'panel',controlId:'sequence'},live.token)).status,202);
 let job;for(let i=0;i<50;i++){job=(await api('/api/commands/'+id)).value;if(job.status==='waiting')break;await new Promise(r=>setTimeout(r,10));}assert.equal(job.status,'waiting');
 x.time+=1000;for(let i=0;i<60;i++){job=(await api('/api/commands/'+id)).value;if(job.status==='failed')break;await new Promise(r=>setTimeout(r,10));}
 assert.equal(job.status,'failed');assert.match(job.error,/expired/);assert.equal((await api('/api/projects/'+p.id)).value.project.variables.homeScore,1);assert.doesNotThrow(()=>x.service.controlIdle(p.id));
});
