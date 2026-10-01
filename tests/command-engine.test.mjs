import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {createLocalService} from '../desktop/local-service.mjs';
import {defaultProject,action,control,validateProject} from '../lib/studio-model.ts';
import {planActions,conditionMatches} from '../lib/action-logic.ts';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function setup(t,actions=[action('increment','homeScore','1')],options={}){
 const directory=mkdtempSync(join(tmpdir(),'broadcastcg-commands-'));let service=createLocalService({directory,...options});const password='local command test passphrase',admin=await service.auth.setup({username:'administrator',password});
 const p=defaultProject();p.panels=[{id:'panel',name:'Test',type:'custom',columns:1,controls:[control('Test sequence',actions,{id:'button'})]}];
 const api=async(path,body,token=admin.token)=>{const response=await service.handle(new Request('broadcastcg://app'+path,{...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})}),{token});return{status:response.status,value:await response.json()};};
 await api('/api/projects',{project:p,revision:0});t.after(()=>{service.close();const root=join(tmpdir(),'broadcastcg-commands-');assert.ok(directory.startsWith(root));rmSync(directory,{recursive:true,force:true});});
 const request=(extras={})=>({id:randomUUID(),projectId:p.id,revision:1,kind:'control',panelId:'panel',controlId:'button',...extras});
 const done=async(id,token=admin.token)=>{for(let i=0;i<160;i++){const r=await api('/api/commands/'+id,undefined,token);if(!['running','waiting','cancelling'].includes(r.value.status))return r.value;await pause(20);}throw Error('Command timeout');};
 return{api,p,request,done,directory,admin,get service(){return service;},async restart(){service.close();service=createLocalService({directory,...options});const login=await service.auth.login({username:'administrator',password});admin.token=login.token;},async user(role){const u=await service.auth.createUser(admin.token,{username:role.toLowerCase(),password,role,workspaceIds:[p.id]});const first=await service.auth.login({username:u.username,password});return service.auth.changePassword(first.token,{currentPassword:password,password:password+' changed'});}};
}
test('typed conditions preserve primitive types, AND/OR, ordering and legacy compatibility',()=>{
 const a=action('set','homeScore','1'),variables={score:2,enabled:false,name:'2'};
 a.when={mode:'all',rules:[{variable:'score',operator:'gte',value:2},{variable:'enabled',operator:'eq',value:false}]};assert.equal(conditionMatches(a,variables),true);a.when.rules[1].value=true;assert.equal(conditionMatches(a,variables),false);a.when.mode='any';assert.equal(conditionMatches(a,variables),true);
 a.when.rules=[{variable:'score',operator:'eq',value:'2'}];assert.throws(()=>conditionMatches(a,variables),/match the type/);delete a.when;a.condition='score=2';assert.equal(conditionMatches(a,variables),true);a.condition='enabled';assert.equal(conditionMatches(a,variables),false);
});
test('macro planning rejects cycles, unknown references and oversized expansion before execution',()=>{
 const p=defaultProject();p.macros=[{id:'cycle',name:'Cycle',actions:[action('macro','cycle')]}];assert.throws(()=>planActions(p,[action('macro','cycle')]),/cycle/);p.macros[0].actions=Array.from({length:100},()=>action('delay','','0'));assert.throws(()=>planActions(p,[action('macro','cycle'),action('macro','cycle')]),/200/);assert.throws(()=>planActions(p,[action('set','missing','x')]),/missing variable/);
 const typed={...action('increment','homeScore','1'),when:{mode:'all',rules:[{variable:'homeScore',operator:'lt',value:4}]}};p.macros=[{id:'typed',name:'Typed',actions:[typed]}];assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))).macros[0].actions[0].when,typed.when);
});
test('duplicate accepted command IDs never repeat an increment, including after restart',async t=>{
 const x=await setup(t),body=x.request();assert.equal((await x.api('/api/commands',body)).status,202);assert.equal((await x.done(body.id)).status,'succeeded');assert.equal((await x.api('/api/commands',body)).value.duplicate,true);assert.equal((await x.api('/api/projects/'+x.p.id)).value.project.variables.homeScore,1);
 await x.restart();assert.equal((await x.api('/api/commands',body)).value.command.status,'succeeded');assert.equal((await x.api('/api/projects/'+x.p.id)).value.project.variables.homeScore,1);assert.equal((await x.api('/api/commands',{...body,controlId:'different'})).status,409);
});
test('stale revisions and unauthorized users are rejected before any command effects',async t=>{
 const x=await setup(t),viewer=await x.user('VIEWER');assert.equal((await x.api('/api/commands',x.request({revision:0}))).status,409);assert.equal((await x.api('/api/commands',x.request(),viewer.token)).status,403);assert.equal((await x.api('/api/projects/'+x.p.id)).value.project.variables.homeScore,0);
});
test('output permission preflight rejects a whole sequence before its first data change',async t=>{
 const x=await setup(t,[action('increment','homeScore','1'),action('preview','score'),action('take')]),designer=await x.user('DESIGNER');assert.equal((await x.api('/api/commands',x.request(),designer.token)).status,403);assert.equal((await x.api('/api/projects/'+x.p.id)).value.project.variables.homeScore,0);
});
test('cancellation stops pending steps and keeps completed effects; active ownership blocks writes',async t=>{
 const x=await setup(t,[action('increment','homeScore','1'),action('delay','','1000'),action('increment','homeScore','10')]),body=x.request();await x.api('/api/commands',body);await pause(30);
 const state=(await x.api('/api/commands?projectId='+x.p.id)).value;assert.equal(state.active.status,'waiting');assert.equal(state.ownership.commandId,body.id);
 assert.equal((await x.api('/api/projects',{project:x.p,revision:1})).status,409);assert.equal((await x.api('/api/commands',x.request())).status,409);
 await x.api('/api/commands/'+body.id+'/cancel',{});const end=await x.done(body.id);assert.equal(end.status,'cancelled');assert.deepEqual(end.steps.map(s=>s.status),['succeeded','cancelled','pending']);assert.equal((await x.api('/api/projects/'+x.p.id)).value.project.variables.homeScore,1);
});
test('one operator cannot cancel another session or take its reserved output',async t=>{
 const x=await setup(t,[action('delay','','1000'),action('preview','score'),action('take')]),operator=await x.user('OPERATOR'),body=x.request();await x.api('/api/commands',body);assert.equal((await x.api('/api/commands/'+body.id+'/cancel',{},operator.token)).status,403);
 assert.equal((await x.api('/api/program',{projectId:x.p.id,scene:x.p.scenes[0],variables:x.p.variables,mode:'show'},operator.token)).status,409);
 await x.api('/api/commands/'+body.id+'/cancel',{});await x.done(body.id);
});
test('failure after a completed step records the partial outcome without rolling back or retrying',async t=>{
 const x=await setup(t,[action('increment','homeScore','1'),action('delay','','not-a-number'),action('increment','homeScore','10')]),body=x.request();await x.api('/api/commands',body);const job=await x.done(body.id);assert.equal(job.status,'failed');assert.equal(job.completedSteps,1);assert.deepEqual(job.steps.map(s=>s.status),['succeeded','failed','pending']);assert.equal((await x.api('/api/projects/'+x.p.id)).value.project.variables.homeScore,1);assert.equal((await x.api('/api/commands',body)).value.command.status,'failed');
});
test('output acknowledgement failure is unconfirmed and duplicate submission cannot replay TAKE',async t=>{
 let takes=0;const x=await setup(t,[action('preview','score'),action('take'),action('increment','homeScore','1')],{confirmProgram:async()=>{takes++;throw Error('No acknowledgement');}}),body=x.request();await x.api('/api/commands',body);const job=await x.done(body.id);assert.equal(job.status,'unconfirmed');assert.equal(job.steps[1].status,'unconfirmed');assert.equal((await x.api('/api/program')).value.acknowledged,false);await x.api('/api/commands',body);assert.equal(takes,1);assert.equal((await x.api('/api/projects/'+x.p.id)).value.project.variables.homeScore,0);
});
test('nested macro conditions are evaluated on entry and skipped blocks do not execute',async t=>{
 const x=await setup(t);const p=x.p;p.macros=[{id:'score-macro',name:'Score twice',actions:[action('increment','homeScore','1'),action('increment','homeScore','1')]}];const parent={...action('macro','score-macro'),when:{mode:'all',rules:[{variable:'homeScore',operator:'eq',value:0}]}};p.panels[0].controls[0].actions=[parent,parent];await x.api('/api/projects',{project:p,revision:1});const body=x.request({revision:2});await x.api('/api/commands',body);const job=await x.done(body.id);assert.equal(job.status,'succeeded');assert.deepEqual(job.steps.map(s=>s.status),['succeeded','succeeded','succeeded','skipped','skipped','skipped']);assert.equal((await x.api('/api/projects/'+p.id)).value.project.variables.homeScore,2);
});
test('revocation during a wait prevents remaining steps and releases workspace ownership',async t=>{
 const x=await setup(t,[action('delay','','1000'),action('increment','homeScore','1')]),op=await x.user('OPERATOR'),body=x.request();await x.api('/api/commands',body,op.token);x.service.auth.logout(op.token);const job=await x.done(body.id);assert.equal(job.status,'failed');assert.equal((await x.api('/api/projects/'+x.p.id)).value.project.variables.homeScore,0);assert.equal((await x.api('/api/commands?projectId='+x.p.id)).value.active,null);
});
test('restart interrupts pending work; its stored outcome can be queried without resuming it',async t=>{
 const x=await setup(t,[action('increment','homeScore','1'),action('delay','','1000'),action('increment','homeScore','10')]),body=x.request();await x.api('/api/commands',body);await pause(20);await x.restart();const job=(await x.api('/api/commands/'+body.id)).value;assert.equal(job.status,'interrupted');assert.equal(job.steps[1].status,'unconfirmed');assert.equal((await x.api('/api/commands',body)).value.duplicate,true);assert.equal((await x.api('/api/projects/'+x.p.id)).value.project.variables.homeScore,1);
});
test('schema-two migration makes a consistent backup and preserves accounts/projects',async t=>{
 const x=await setup(t);const file=join(x.directory,'broadcastcg.sqlite');const db=new DatabaseSync(file);db.exec('DROP TABLE commands; DROP TABLE sports_clocks; PRAGMA user_version=2;');db.close();await x.restart();assert.equal(x.service.diagnostics().schemaVersion,4);const backups=readdirSync(join(x.directory,'backups'));assert.equal(backups.length,1);const backup=new DatabaseSync(join(x.directory,'backups',backups[0]),{readOnly:true});assert.equal(backup.prepare('PRAGMA user_version').get().user_version,2);assert.equal(backup.prepare('SELECT count(*) AS n FROM projects').get().n,1);backup.close();assert.equal((await x.api('/api/projects/'+x.p.id)).value.project.id,x.p.id);
});

 test('cancellation during an unacknowledged TAKE preserves the unconfirmed result',async t=>{
 let rejectAck;const x=await setup(t,[action('preview','score'),action('take')],{confirmProgram:()=>new Promise((_resolve,reject)=>{rejectAck=reject;})}),body=x.request();await x.api('/api/commands',body);while(!rejectAck)await pause(5);await x.api('/api/commands/'+body.id+'/cancel',{});rejectAck(Error('Acknowledgement unavailable'));const job=await x.done(body.id);assert.equal(job.status,'unconfirmed');assert.equal(job.steps[1].status,'unconfirmed');
 });
 test('a legacy output command awaiting acknowledgement prevents a new output macro from starting',async t=>{
 let confirm;const x=await setup(t,[action('increment','homeScore','1'),action('preview','score'),action('take')],{confirmProgram:()=>new Promise(resolve=>{confirm=resolve;})});const publishing=x.api('/api/program',{projectId:x.p.id,scene:x.p.scenes[0],variables:x.p.variables,mode:'show'});while(!confirm)await pause(5);assert.equal((await x.api('/api/commands',x.request())).status,409);confirm();await publishing;assert.equal((await x.api('/api/projects/'+x.p.id)).value.project.variables.homeScore,0);
 });
 test('API action applies typed bindings atomically and malformed bindings leave prior data unchanged',async t=>{
 const x=await setup(t);x.p.sources=[{id:'feed',name:'Test data',url:'https://example.com/feed',interval:0}];x.p.bindings=[{id:'score-data',sourceId:'feed',path:'score',sceneId:'',layerId:'',property:'text',destination:'variable',targetVariable:'homeScore'}];x.p.panels[0].controls[0].actions=[action('fetch','feed')];await x.api('/api/projects',{project:x.p,revision:1});let value=7;t.mock.method(globalThis,'fetch',async()=>Response.json({score:value}));let body=x.request({revision:2});await x.api('/api/commands',body);assert.equal((await x.done(body.id)).status,'succeeded');let saved=(await x.api('/api/projects/'+x.p.id)).value;assert.equal(saved.project.variables.homeScore,7);
 value='not numeric';body=x.request({revision:saved.revision});await x.api('/api/commands',body);assert.equal((await x.done(body.id)).status,'failed');assert.equal((await x.api('/api/projects/'+x.p.id)).value.project.variables.homeScore,7);
 });
 test('cancelling an API wait aborts its request and prevents a late data write',async t=>{
 const x=await setup(t);x.p.sources=[{id:'feed',name:'Test data',url:'https://example.com/feed',interval:0}];x.p.panels[0].controls[0].actions=[action('fetch','feed'),action('increment','homeScore','1')];await x.api('/api/projects',{project:x.p,revision:1});let started=false,aborted=false;t.mock.method(globalThis,'fetch',async(_url,options)=>new Promise((_resolve,reject)=>{started=true;options.signal.addEventListener('abort',()=>{aborted=true;reject(Error('aborted'));},{once:true});}));const body=x.request({revision:2});await x.api('/api/commands',body);while(!started)await pause(5);await x.api('/api/commands/'+body.id+'/cancel',{});assert.equal((await x.done(body.id)).status,'cancelled');assert.equal(aborted,true);assert.equal((await x.api('/api/projects/'+x.p.id)).value.project.variables.homeScore,0);
 });
