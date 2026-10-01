import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {createLocalService} from '../desktop/local-service.mjs';
import {defaultProject} from '../lib/studio-model.ts';
const password='temporary QA passphrase only',changed='changed QA passphrase only';
async function setup(t,options={}){
 const directory=mkdtempSync(join(tmpdir(),'broadcastcg-auth-'));
 let db;const service=createLocalService({directory,...options});t.after(()=>{db?.close();service.close();if(!directory.startsWith(join(tmpdir(),'broadcastcg-auth-')))throw Error('Unexpected test path');rmSync(directory,{recursive:true,force:true});});
 const admin=await service.auth.setup({username:'administrator',password});
 db=new DatabaseSync(join(directory,'broadcastcg.sqlite'));
 async function api(token,path,body,method=body?'POST':'GET'){const res=await service.handle(new Request('broadcastcg://app'+path,{method,...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})}),{token});return{status:res.status,value:await res.json()};}
 async function user(role,workspaceIds=[],extras={}){const u=await service.auth.createUser(admin.token,{username:role.toLowerCase(),role,password,workspaceIds,...extras});const first=await service.auth.login({username:u.username,password});const result=await service.auth.changePassword(first.token,{currentPassword:password,password:changed});return{...result,user:u};}
 return{service,admin,db,directory,api,user};
}
test('first setup is unique; passwords are salted hashes; renderer session views contain no tokens',async t=>{
 const x=await setup(t);assert.equal(x.service.auth.bootstrap().setupRequired,false);
 await assert.rejects(x.service.auth.setup({username:'second_admin',password}),{status:409});
 assert.equal((await x.api(null,'/api/projects')).status,401);
 const u=await x.user('VIEWER');const rows=x.db.prepare('SELECT password_hash FROM auth_users').all();
 assert.ok(rows.every(r=>r.password_hash.startsWith('scrypt$131072$8$1$')&&!r.password_hash.includes(password)));assert.notEqual(rows[0].password_hash,rows[1].password_hash);
 assert.equal(x.service.auth.me(u.token).token,undefined);assert.ok(!JSON.stringify(x.service.auth.sessions(x.admin.token)).includes(u.token));
});
test('Viewer reads only assigned workspace and cannot write or publish',async t=>{
 const x=await setup(t),a=defaultProject(),b=defaultProject();b.name='Private';await x.api(x.admin.token,'/api/projects',{project:a,revision:0});await x.api(x.admin.token,'/api/projects',{project:b,revision:0});
 const viewer=await x.user('VIEWER',[a.id]);assert.deepEqual((await x.api(viewer.token,'/api/projects')).value.map(p=>p.id),[a.id]);
 assert.equal((await x.api(viewer.token,'/api/projects/'+b.id)).status,403);
 assert.equal((await x.api(viewer.token,'/api/projects',{project:a,revision:1})).status,403);
 assert.equal((await x.api(viewer.token,'/api/program',{projectId:a.id,scene:a.scenes[0],variables:a.variables})).status,403);
 assert.throws(()=>x.service.exportProject(a,viewer.token),{status:403});assert.throws(()=>x.service.authorize(viewer.token,'system.configure'),{status:403});
});
test('Operator can change exposed score and TAKE but cannot edit geometry, panels or unexposed variables',async t=>{
 const x=await setup(t),p=defaultProject();p.variables.privateField='secret';await x.api(x.admin.token,'/api/projects',{project:p,revision:0});const op=await x.user('OPERATOR',[p.id]);
 p.variables.homeScore=3;assert.equal((await x.api(op.token,'/api/projects',{project:p,revision:1})).status,200);
 assert.equal((await x.api(op.token,'/api/program',{projectId:p.id,scene:p.scenes[0],variables:p.variables,mode:'show'})).status,200);
 const geometry=structuredClone(p);geometry.scenes[0].layers[0].x+=20;assert.equal((await x.api(op.token,'/api/projects',{project:geometry,revision:2})).status,403);
 const panel=structuredClone(p);panel.panels[0].name='Changed';assert.equal((await x.api(op.token,'/api/projects',{project:panel,revision:2})).status,403);
 const hidden=structuredClone(p);hidden.variables.privateField='Changed';assert.equal((await x.api(op.token,'/api/projects',{project:hidden,revision:2})).status,403);
 const wrongType=structuredClone(p);wrongType.variables.homeScore='3';assert.equal((await x.api(op.token,'/api/projects',{project:wrongType,revision:2})).status,403);
 x.service.auth.logout(op.token);assert.equal((await x.service.handle(new Request('broadcastcg://app/api/program'),x.service.outputContext)).status,200);
 assert.equal((await x.api(x.admin.token,'/api/program')).value.mode,'show');
 const log=x.service.auth.audit(x.admin.token,{action:'VARIABLE_CHANGED'});assert.equal(log[0].username,'operator');assert.equal(log[0].previous_value,'0');assert.equal(log[0].next_value,'3');
});
test('Designer can build but cannot TAKE; custom permission denial is authoritative',async t=>{
 const x=await setup(t),p=defaultProject(),designer=await x.user('DESIGNER',[],{allWorkspaces:true,deniedPermissions:['templates.export']});
 assert.equal((await x.api(designer.token,'/api/projects',{project:p,revision:0})).status,200);
 assert.equal((await x.api(designer.token,'/api/program',{projectId:p.id,scene:p.scenes[0],variables:p.variables})).status,403);
 assert.throws(()=>x.service.exportProject(p,designer.token),{status:403});
});
test('temporary passwords block workspace access; password reset and role changes revoke sessions and remembered tokens',async t=>{
 const x=await setup(t),u=await x.service.auth.createUser(x.admin.token,{username:'operator',role:'OPERATOR',workspaceIds:[],password});
 const first=await x.service.auth.login({username:u.username,password,remember:true});assert.equal(first.session.user.mustChangePassword,true);assert.equal(first.rememberToken,null);
 assert.equal((await x.api(first.token,'/api/projects')).status,403);
 const next=await x.service.auth.changePassword(first.token,{currentPassword:password,password:changed});assert.equal((await x.api(first.token,'/api/projects')).status,401);
 const remembered=await x.service.auth.login({username:u.username,password:changed,remember:true});
 x.service.auth.updateUser(x.admin.token,{...u,enabled:false});assert.equal((await x.api(next.token,'/api/projects')).status,401);assert.throws(()=>x.service.auth.resume(remembered.rememberToken),{status:401});
 await assert.rejects(x.service.auth.login({username:u.username,password:changed}),{status:401});
 x.service.auth.updateUser(x.admin.token,{...u,enabled:true});await x.service.auth.resetPassword(x.admin.token,{id:u.id,password});const reset=await x.service.auth.login({username:u.username,password});assert.equal(reset.session.user.mustChangePassword,true);
});
test('login rate limits repeated failures with generic account errors',async t=>{
 let now=1700000000000;const x=await setup(t,{now:()=>now});
 for(let n=0;n<5;n++)await assert.rejects(x.service.auth.login({username:'administrator',password:'incorrect password'}),{status:401});
 await assert.rejects(x.service.auth.login({username:'administrator',password}),{status:429});now+=5*60000+1;
 assert.equal((await x.service.auth.login({username:'administrator',password})).session.user.role,'ADMIN');
});
test('idle expiry is not extended by polling; activity is bounded by absolute expiry; expired logout revokes remember',async t=>{
 let now=1700000000000;const x=await setup(t,{now:()=>now});const login=await x.service.auth.login({username:'administrator',password,remember:true});
 const original=x.service.auth.me(login.token).idleExpiresAt;now+=29*60000;assert.equal(x.service.auth.me(login.token).idleExpiresAt,original);x.service.auth.touch(login.token);assert.ok(x.service.auth.me(login.token).idleExpiresAt>original);
 now+=31*60000;assert.throws(()=>x.service.auth.me(login.token),{status:401});x.service.auth.logout(login.token);assert.throws(()=>x.service.auth.resume(login.rememberToken),{status:401});
 const next=await x.service.auth.login({username:'administrator',password});for(let n=0;n<24;n++){now+=29*60000;x.service.auth.touch(next.token);}now=next.session.expiresAt;assert.throws(()=>x.service.auth.me(next.token),{status:401});
});
test('remembered tokens rotate; explicit session revocation removes remembered access',async t=>{
 const x=await setup(t),remembered=await x.service.auth.login({username:'administrator',password,remember:true});x.service.auth.endSession(remembered.token);
 const next=x.service.auth.resume(remembered.rememberToken);assert.notEqual(next.rememberToken,remembered.rememberToken);assert.throws(()=>x.service.auth.resume(remembered.rememberToken),{status:401});
 x.service.auth.revokeSession(x.admin.token,next.session.sessionId);assert.throws(()=>x.service.auth.me(next.token),{status:401});assert.throws(()=>x.service.auth.resume(next.rememberToken),{status:401});
});
test('last administrator cannot be disabled or demoted',async t=>{
 const x=await setup(t),u=x.admin.session.user;assert.throws(()=>x.service.auth.updateUser(x.admin.token,{...u,enabled:false}),/own active account/);assert.throws(()=>x.service.auth.updateUser(x.admin.token,{...u,role:'VIEWER'}),/at least one/);
});
test('assets and recovery are isolated by workspace and account; output context cannot be forged',async t=>{
 const x=await setup(t),p=defaultProject(),bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG7sAAAAASUVORK5CYII=','base64');
 const res=await x.service.handle(new Request('broadcastcg://app/api/assets',{method:'POST',body:bytes}),{token:x.admin.token}),asset=await res.json();p.scenes[0].layers[0].src=asset.url;await x.api(x.admin.token,'/api/projects',{project:p,revision:0});
 const viewer=await x.user('VIEWER',[]),op=await x.user('OPERATOR',[p.id]);const image=token=>x.service.handle(new Request('broadcastcg://app'+asset.url),{token});assert.equal((await image(viewer.token)).status,403);assert.equal((await image(op.token)).status,200);
 p.variables.homeScore=1;assert.equal((await x.api(op.token,'/api/desktop/recovery',{project:p,revision:1})).status,200);assert.equal((await x.api(x.admin.token,'/api/desktop/recovery')).value,null);
 assert.equal((await x.service.handle(new Request('broadcastcg://app/api/program'),{output:true})).status,401);
 assert.equal((await x.service.handle(new Request('broadcastcg://app/api/projects'),x.service.outputContext)).status,403);
 assert.equal((await x.service.handle(new Request('broadcastcg://app'+asset.url),x.service.outputContext)).status,403);
});
test('source endpoints cannot redirect existing credentials to a new host',async t=>{
 const x=await setup(t,{encrypt:s=>Buffer.from('protected:'+s),decrypt:b=>b.toString().slice(10)}),p=defaultProject();p.sources=[{id:'feed',name:'Feed',url:'https://example.com/feed',interval:0}];await x.api(x.admin.token,'/api/projects',{project:p,revision:0});
 assert.equal((await x.api(x.admin.token,'/api/sources',{projectId:p.id,sourceId:'feed',headers:{Authorization:'test-secret'}})).status,200);
 const op=await x.user('OPERATOR',[p.id]);assert.equal((await x.api(op.token,'/api/sources/fetch',{projectId:p.id,source:{...p.sources[0],url:'https://other.example/feed'}})).status,403);
 const designer=await x.user('DESIGNER',[p.id]);p.sources[0].url='https://other.example/feed';assert.equal((await x.api(designer.token,'/api/projects',{project:p,revision:1})).status,200);assert.equal(x.db.prepare('SELECT count(*) AS n FROM project_secrets').get().n,0);
 assert.ok(!JSON.stringify(x.service.auth.audit(x.admin.token)).includes('test-secret'));
});
test('version-one migration backs up existing projects and adopts recovery for first administrator',async t=>{
 const directory=mkdtempSync(join(tmpdir(),'broadcastcg-auth-')),db=new DatabaseSync(join(directory,'broadcastcg.sqlite')),p=defaultProject();
 db.exec(`CREATE TABLE projects(id TEXT PRIMARY KEY,name TEXT NOT NULL,document TEXT NOT NULL,revision INTEGER NOT NULL,updated_at INTEGER NOT NULL);CREATE TABLE assets(id TEXT PRIMARY KEY,name TEXT NOT NULL,mime TEXT NOT NULL,bytes BLOB NOT NULL);CREATE TABLE secrets(id TEXT PRIMARY KEY,ciphertext BLOB NOT NULL);CREATE TABLE settings(key TEXT PRIMARY KEY,document TEXT NOT NULL);CREATE TABLE recovery(id INTEGER PRIMARY KEY,document TEXT NOT NULL,revision INTEGER NOT NULL,updated_at INTEGER NOT NULL);CREATE TABLE events(id INTEGER PRIMARY KEY AUTOINCREMENT,time INTEGER NOT NULL,action TEXT NOT NULL,target TEXT NOT NULL,status TEXT NOT NULL,detail TEXT NOT NULL);PRAGMA user_version=1;`);
 db.prepare('INSERT INTO projects VALUES(?,?,?,?,?)').run(p.id,p.name,JSON.stringify(p),4,Date.now());p.name='Old unsaved work';db.prepare('INSERT INTO recovery VALUES(1,?,?,?)').run(JSON.stringify(p),4,Date.now());db.close();
 const service=createLocalService({directory});t.after(()=>{service.close();if(!directory.startsWith(join(tmpdir(),'broadcastcg-auth-')))throw Error('Unexpected test path');rmSync(directory,{recursive:true,force:true});});const admin=await service.auth.setup({username:'administrator',password});
 assert.equal(readdirSync(join(directory,'backups')).length,1);assert.equal(service.diagnostics().schemaVersion,6);
 const response=await service.handle(new Request('broadcastcg://app/api/desktop/recovery'),{token:admin.token});assert.equal((await response.json()).project.name,'Old unsaved work');
});
