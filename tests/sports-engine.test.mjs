import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {defaultProject,action,control,validateProject} from '../lib/studio-model.ts';
import {applySportOperation,mappedRoster} from '../lib/sports-logic.ts';
import {createLocalService} from '../desktop/local-service.mjs';
import {createSportsClocks,migrateSports} from '../desktop/sports-clocks.mjs';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const apply=(p,op)=>applySportOperation(p,op,randomUUID(),'2026-10-01T12:00:00Z');
const match=kind=>apply(defaultProject(),{op:'configure',kind,bestOf:3,mapPool:['A','B','C','D','E']});
async function setup(t,options={}){
 const directory=mkdtempSync(join(tmpdir(),'broadcastcg-sports-'));let service=createLocalService({directory,...options});const password='sports engine verification password',admin=await service.auth.setup({username:'admin',password});const project=defaultProject();
 const api=async(path,body,token=admin.token)=>{const r=await service.handle(new Request('broadcastcg://app'+path,body?{method:'POST',body:JSON.stringify(body),headers:{'Content-Type':'application/json'}}:{}),{token});return{status:r.status,value:await r.json()};};
 await api('/api/projects',{project,revision:0});
 const saved=async()=>(await api('/api/projects/'+project.id)).value;
 const done=async id=>{for(let i=0;i<100;i++){const r=await api('/api/commands/'+id);if(!['running','waiting','cancelling'].includes(r.value.status))return r.value;await pause(10);}throw Error('Timed out');};
 const command=async(fields,token)=>{const body={id:randomUUID(),projectId:project.id,revision:(await saved()).revision,...fields};const r=await api('/api/commands',body,token);return{...r,body,job:r.status===202?await done(body.id):null};};
 t.after(()=>{service.close();assert.ok(directory.startsWith(join(tmpdir(),'broadcastcg-sports-')));rmSync(directory,{recursive:true,force:true});});
 return{api,saved,command,done,project,directory,admin,get service(){return service;},async restart(){service.close();service=createLocalService({directory,...options});admin.token=(await service.auth.login({username:'admin',password})).token;},async user(role){const u=await service.auth.createUser(admin.token,{username:role.toLowerCase(),role,password,workspaceIds:[project.id]});const login=await service.auth.login({username:u.username,password});return service.auth.changePassword(login.token,{currentPassword:password,password:password+' changed'});}};
}

test('clock uses monotonic elapsed time, preserves fractional time on pause and clamps countdown',async t=>{
 let ms=0,wall=10000;const x=await setup(t,{monotonic:()=>ms,now:()=>wall});
 assert.equal((await x.command({kind:'clock',variable:'matchClock',clock:{op:'start'}})).job.status,'succeeded');ms=1750;wall+=60000;assert.equal((await x.saved()).project.variables.matchClock,'00:01');
 await x.command({kind:'clock',variable:'matchClock',clock:{op:'pause'}});ms=10000;await x.command({kind:'clock',variable:'matchClock',clock:{op:'start'}});ms+=250;assert.equal((await x.saved()).project.variables.matchClock,'00:02');
 await x.command({kind:'clock',variable:'matchClock',clock:{op:'reset',seconds:2,direction:'down'}});await x.command({kind:'clock',variable:'matchClock',clock:{op:'start',direction:'down'}});ms+=9000;
 const state=(await x.api('/api/clocks?projectId='+x.project.id)).value.matchClock;assert.equal(state.value,'00:00');assert.equal(state.running,false);
});
test('stale editor saves cannot rewind a managed clock, and macros read current time',async t=>{
 let ms=0;const x=await setup(t,{monotonic:()=>ms});await x.command({kind:'clock',variable:'matchClock',clock:{op:'start'}});const old=await x.saved();ms=12000;
 assert.equal((await x.api('/api/projects',{project:old.project,revision:old.revision})).status,200);assert.equal((await x.saved()).project.variables.matchClock,'00:12');
 const p=await x.saved();p.project.macros=[{id:'snapshot',name:'Read time',actions:[action('set','eventLabel','{{matchClock}}')]}];await x.api('/api/projects',{project:p.project,revision:p.revision});const job=await x.command({kind:'macro',macroId:'snapshot'});assert.equal(job.job.status,'succeeded');assert.equal((await x.saved()).project.variables.eventLabel,'00:12');
});
test('clock continues on output without repeating TAKE or requiring an editor connection',async t=>{
 let ms=0,takes=0;const x=await setup(t,{monotonic:()=>ms,confirmProgram:async()=>{takes++;}});await x.command({kind:'clock',variable:'matchClock',clock:{op:'start'}});const p=(await x.saved()).project;
 await x.api('/api/program',{projectId:p.id,scene:p.scenes[2],variables:p.variables,mode:'show'});const before=(await x.api('/api/program')).value;ms=5000;const after=(await x.api('/api/program')).value;assert.equal(after.variables.matchClock,'00:05');assert.equal(after.revision,before.revision);assert.equal(takes,1);x.service.auth.logout(x.admin.token);ms=7000;
 const output=await x.service.handle(new Request('broadcastcg://app/api/program'),x.service.outputContext);assert.equal((await output.json()).variables.matchClock,'00:07');
});
test('application restart pauses clocks and duplicate start IDs never restart them',async t=>{
 let ms=0;const x=await setup(t,{monotonic:()=>ms});const start=await x.command({kind:'clock',variable:'matchClock',clock:{op:'start'}});ms=5600;await x.restart();ms+=60000;const clock=(await x.api('/api/clocks?projectId='+x.project.id)).value.matchClock;assert.equal(clock.running,false);assert.equal(clock.value,'00:05');assert.equal((await x.api('/api/commands',start.body)).value.duplicate,true);assert.equal((await x.api('/api/clocks?projectId='+x.project.id)).value.matchClock.running,false);
});
test('unclean restart marks an active clock interrupted at its durable checkpoint',()=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA user_version=3');migrateSports(db,'unused',false);db.prepare('INSERT INTO sports_clocks VALUES(?,?,?)').run('p','clock',JSON.stringify({projectId:'p',variable:'clock',ms:7300,running:true,direction:'up',formatted:true}));const clocks=createSportsClocks({db});const state=clocks.snapshot('p').clock;assert.equal(state.interrupted,true);assert.equal(state.running,false);assert.equal(state.value,'00:07');clocks.close();db.close();
});
test('sports commands enforce permissions and do not expose unrelated variables',async t=>{
 const x=await setup(t);await x.command({kind:'sport',operation:{op:'configure',kind:'football'}});const viewer=await x.user('VIEWER'),operator=await x.user('OPERATOR');
 assert.equal((await x.command({kind:'clock',variable:'matchClock',clock:{op:'start'}},viewer.token)).status,403);
 assert.equal((await x.command({kind:'sport',operation:{op:'configure',kind:'basketball'}},operator.token)).status,403);
 const p=await x.saved();p.project.variables.privateCounter=12;await x.api('/api/projects',{project:p.project,revision:p.revision});assert.equal((await x.command({kind:'counter',variable:'privateCounter',delta:1},operator.token)).status,403);
 assert.equal((await x.command({kind:'sport',operation:{op:'score',team:'home',delta:1}},operator.token)).job.status,'succeeded');
});
test('atomic score commands reject stale concurrent operations and deduplicate accepted IDs',async t=>{
 const x=await setup(t);await x.command({kind:'sport',operation:{op:'configure',kind:'basketball'}});const before=await x.saved(),body={id:randomUUID(),projectId:x.project.id,revision:before.revision,kind:'sport',operation:{op:'score',team:'home',delta:3}};
 const [a,b]=await Promise.all([x.api('/api/commands',body),x.api('/api/commands',{...body,id:randomUUID()})]);assert.equal(a.status,202);assert.equal(b.status,409);await x.done(body.id);assert.equal((await x.api('/api/commands',body)).value.duplicate,true);assert.equal((await x.saved()).project.variables.homeScore,3);
 await x.command({kind:'sport',operation:{op:'score',team:'away',delta:-1}});assert.equal((await x.saved()).project.variables.awayScore,0);
});
test('counter commands use saved limits and reject time variables',async t=>{
 const x=await setup(t),p=await x.saved();p.project.panels[0].controls.push(control('Bounded',[],{id:'bounded',kind:'counter',variable:'homeScore',minimum:0,maximum:5}));await x.api('/api/projects',{project:p.project,revision:p.revision});const c=await x.command({kind:'counter',variable:'homeScore',delta:100,controlId:'bounded',panelId:p.project.panels[0].id});assert.equal(c.job.status,'succeeded');assert.equal((await x.saved()).project.variables.homeScore,5);
 await x.command({kind:'clock',variable:'homeScore',clock:{op:'start'}});assert.equal((await x.command({kind:'counter',variable:'homeScore',delta:1})).job.status,'failed');
});
test('match Break and Final pause every clock without changing scores',async t=>{
 const x=await setup(t);await x.command({kind:'sport',operation:{op:'configure',kind:'basketball'}});for(const variable of ['matchClock','shotClock'])await x.command({kind:'clock',variable,clock:{op:'start',direction:'down'}});await x.command({kind:'sport',operation:{op:'phase',value:'Break'}});assert.ok(Object.values((await x.api('/api/clocks?projectId='+x.project.id)).value).every(c=>!c.running));assert.equal((await x.saved()).project.variables.homeScore,0);
});
test('volleyball requires win by two, uses a 15-point fifth set and supports corrections',()=>{
 let p=match('volleyball');for(let i=0;i<4;i++){p.variables.homeScore=i%2?24:26;p.variables.awayScore=i%2?26:24;p=apply(p,{op:'finish-game'});}assert.equal(p.variables.homeSeries,2);assert.equal(p.variables.awaySeries,2);
 p.variables.homeScore=15;p.variables.awayScore=14;assert.throws(()=>apply(p,{op:'finish-game'}),/two-point/);p.variables.homeScore=16;p=apply(p,{op:'finish-game'});assert.equal(p.variables.matchPhase,'Final');assert.equal(p.variables.homeSeries,3);assert.throws(()=>apply(p,{op:'score',team:'home',delta:1}),/Reopen/);
 p=apply(p,{op:'undo-game'});assert.equal(p.variables.homeSeries,2);assert.equal(p.variables.homeScore,16);assert.equal(p.sports.results.length,4);assert.equal(p.variables.matchPhase,'Break');assert.doesNotThrow(()=>validateProject(p));
});
test('esports prevents duplicate/banned maps, swaps sides, records BO3 winner and reopens results',()=>{
 let p=match('esports');p=apply(p,{op:'draft',team:'away',map:'A',choice:'ban'});assert.throws(()=>apply(p,{op:'draft',team:'home',map:'A',choice:'pick'}));assert.throws(()=>apply(p,{op:'map',map:'A'}));p=apply(p,{op:'draft',team:'home',map:'B',choice:'pick'});p=apply(p,{op:'swap-sides'});assert.equal(p.variables.homeSide,'Defense');
 p.variables.homeScore=13;p.variables.awayScore=7;p=apply(p,{op:'finish-game'});assert.equal(p.variables.homeSeries,1);assert.equal(p.variables.homeScore,0);p=apply(p,{op:'map',map:'C'});p.variables.homeScore=13;p.variables.awayScore=10;p=apply(p,{op:'finish-game'});assert.equal(p.variables.matchPhase,'Final');assert.equal(p.variables.homeSeries,2);p=apply(p,{op:'undo-game'});assert.equal(p.variables.currentMap,'C');assert.equal(p.variables.homeScore,13);assert.equal(p.variables.matchPhase,'Break');
});
test('roster mappings validate IDs, slots, numeric statistics and photo protocols before replacing a team',()=>{
 const mapping={id:'person.id',name:'person.name',number:'jersey',photo:'photo',stats:'stats'},rows=[{person:{id:'42',name:'Mira'},jersey:42,photo:'https://example.com/mira.png',stats:{kills:12,assists:5}}];const players=mappedRoster(rows,'home',mapping,'esports');assert.equal(players[0].id,'home-42');assert.equal(players[0].bench,true);assert.equal(players[0].stats.kills,12);
 assert.throws(()=>mappedRoster([...rows,...rows],'home',mapping,'esports'),/unique/);assert.throws(()=>mappedRoster([{...rows[0],photo:'file:///secret'}],'home',mapping,'esports'));assert.throws(()=>mappedRoster([{...rows[0],stats:{kills:'12'}}],'home',mapping,'esports'));
 const old=match('esports'),next=apply(old,{op:'roster',team:'home',rows,mapping});assert.equal(next.players.filter(p=>p.team==='home').length,1);assert.equal(next.players.filter(p=>p.team==='away').length,old.players.filter(p=>p.team==='away').length);
});
test('player stats fill graphics variables and substitutions enforce team and active status',()=>{
 let p=match('football');p=apply(p,{op:'stat',playerId:'home-9',stat:'goals',delta:1});assert.equal(p.variables.playerGoals,1);assert.equal(p.variables.playerNumber,9);assert.equal(p.variables.homeScore,0);assert.throws(()=>apply(p,{op:'substitute',out:'home-9',incoming:'away-12'}));p=apply(p,{op:'substitute',out:'home-9',incoming:'home-12'});assert.equal(p.players.find(x=>x.id==='home-12').slot,9);assert.equal(p.players.find(x=>x.id==='home-9').bench,true);assert.throws(()=>apply(p,{op:'substitute',out:'home-9',incoming:'home-12'}));
});
test('API roster fetch is atomic and uses mapped typed data',async t=>{
 const x=await setup(t);await x.command({kind:'sport',operation:{op:'configure',kind:'esports',bestOf:3,mapPool:['A','B','C']}});let p=await x.saved();p.project.sources=[{id:'roster',name:'Roster',url:'https://example.com/roster',interval:0}];await x.api('/api/projects',{project:p.project,revision:p.revision});let rows=[{id:'p1',name:'Nova',number:1,stats:{kills:4}}];t.mock.method(globalThis,'fetch',async()=>Response.json({players:rows}));const fields={kind:'sport',operation:{op:'fetch-roster',team:'home',sourceId:'roster',rowsPath:'players',mapping:{id:'id',name:'name',number:'number',stats:'stats'}}};assert.equal((await x.command(fields)).job.status,'succeeded');const before=(await x.saved()).project.players;rows=[...rows,{id:'bad',number:2}];assert.equal((await x.command(fields)).job.status,'failed');assert.deepEqual((await x.saved()).project.players,before);
});
test('schema-three upgrade creates a readable backup retaining projects and accounts',async t=>{
 const x=await setup(t),db=new DatabaseSync(join(x.directory,'broadcastcg.sqlite'));db.exec('DROP TABLE sports_clocks; PRAGMA user_version=3');db.close();await x.restart();assert.equal(x.service.diagnostics().schemaVersion,7);const files=readdirSync(join(x.directory,'backups'));assert.equal(files.length,1);const before=new DatabaseSync(join(x.directory,'backups',files[0]),{readOnly:true});assert.equal(before.prepare('PRAGMA user_version').get().user_version,3);assert.equal(before.prepare('SELECT count(*) AS n FROM projects').get().n,1);assert.equal(before.prepare('SELECT count(*) AS n FROM auth_users').get().n,1);before.close();
});
