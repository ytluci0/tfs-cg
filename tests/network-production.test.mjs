import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import {createNetworkServer} from '../desktop/network-server.mjs';
import {createRemoteAuthority,serverProfile} from '../desktop/network-client.mjs';
import {createControlLeases} from '../desktop/control-leases.mjs';
import {sealBackup,openBackup,secretCodec} from '../desktop/server-crypto.mjs';
import {restoreServer,loadServer} from '../desktop/server-host.mjs';
import {defaultProject} from '../lib/studio-model.ts';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let n=0;n<150;n++){if(await fn())return;await pause(20);}throw Error('Timed out waiting for network state.');}
test('workspace ownership expires, respects operator permissions and never restores leases',()=>{
 let time=100;const settingsMap=new Map(),settings={get:(k,f)=>settingsMap.get(k)||f,set:(k,v)=>settingsMap.set(k,v)};
 const actor=(id,permissions)=>({sessionId:id,user:{username:id,permissions},workstation:id+' PC'}),actors={admin:actor('admin',['system.configure','panels.operate']),op:actor('op',['panels.operate']),other:actor('other',['panels.operate']),view:actor('view',[])};
 const leases=createControlLeases({settings,authorize:t=>actors[t],assertIdle:()=>{},now:()=>time,ttl:100});
 leases.operate('admin','project','require');assert.throws(()=>leases.assert(actors.op,'project'),/Request control/);
 leases.operate('op','project','request');assert.throws(()=>leases.assert(actors.other,'project'),/controlled/);assert.equal(leases.operate('other','project','request').requests.length,1);assert.throws(()=>leases.operate('other','project','takeover'),/Only an engineer/);assert.throws(()=>leases.operate('view','project','request'),/cannot control/);
 time+=60;leases.renew(actors.op);time+=60;leases.assert(actors.op,'project');time+=101;assert.throws(()=>leases.assert(actors.op,'project'),/Request control/);assert.equal(leases.view(actors.op,'project').owner,null);
 leases.operate('admin','project','request');leases.clear();assert.equal(leases.view(actors.admin,'project').required,true);assert.equal(leases.view(actors.admin,'project').owner,null);
});
test('server profiles reject credentials, non-HTTPS addresses and incomplete certificate pins',()=>{
 const p={name:'LAN',url:'https://localhost:9443',fingerprint:'aa'.repeat(32)};assert.equal(serverProfile(p).url,p.url);
 for(const url of ['http://localhost','https://user:password@localhost','https://localhost/path'])assert.throws(()=>serverProfile({...p,url}));assert.throws(()=>serverProfile({...p,fingerprint:'aa'}));
});
test('authenticated encryption rejects changed credentials and damaged backups',async()=>{
 const key=randomBytes(32),codec=secretCodec(key),encrypted=codec.encrypt('local feed password');assert.equal(codec.decrypt(encrypted),'local feed password');encrypted[13]^=1;assert.throws(()=>codec.decrypt(encrypted));
 const db=Buffer.concat([Buffer.from('SQLite format 3\0'),randomBytes(100)]),bytes=await sealBackup(db,key,'long backup test passphrase');assert.deepEqual((await openBackup(bytes,'long backup test passphrase')).database,db);await assert.rejects(()=>openBackup(bytes,'incorrect backup passphrase'));bytes[60]^=1;await assert.rejects(()=>openBackup(bytes,'long backup test passphrase'));
});
test('HTTPS clients share authoritative state, pin before credentials, enforce locks, acknowledge output and recover without replay',async t=>{
 const directory=mkdtempSync(join(tmpdir(),'broadcastcg-network-')),pfx=join(directory,'cert.pfx'),passphrase=randomBytes(24).toString('hex');
 const fingerprint=execFileSync(resolve('desktop/assets/BroadcastCGHost.exe'),['certificate',pfx,passphrase],{windowsHide:true,encoding:'utf8'}).trim();
 const key=randomBytes(32),bootstrapSecret=randomBytes(32).toString('hex'),options={directory:join(directory,'primary'),tls:{pfx:readFileSync(pfx),passphrase},secretKey:key,bootstrapSecret,port:0,heartbeatMs:100,ackTimeout:200};
 let server=await createNetworkServer(options);const clients=[];t.after(async()=>{for(const c of clients)c.close();await server.close();assert.ok(resolve(directory).startsWith(resolve(tmpdir(),'broadcastcg-network-')));rmSync(directory,{recursive:true,force:true});});
 const profile={name:'Test production',url:'https://127.0.0.1:'+server.address.port,fingerprint},make=(extra={})=>{const c=createRemoteAuthority({profile,settings:{},workstation:'Test PC',...extra});clients.push(c);return c;};
 let requests=0;server.server.on('request',()=>requests++);const bad=make({profile:{...profile,fingerprint:'ab'.repeat(32)}});await assert.rejects(()=>bad.auth.login({username:'admin',password:'never sent'}),/certificate/);assert.equal(requests,0);bad.close();
 const unauthorized=make();assert.equal((await unauthorized.auth.bootstrap()).setupBlocked,true);await assert.rejects(()=>unauthorized.auth.setup({username:'admin',password:'long test admin password'}),e=>e.status===403);unauthorized.close();
 const drafts=new Map(),recoveryStore={read:id=>drafts.get(id)||null,write:(id,v)=>drafts.set(id,v),clear:id=>drafts.delete(id)};
 let updates=[],shown=[],ack=true;const admin=make({bootstrapSecret,recoveryStore,onState:s=>updates.push(s),onProgram:p=>{shown.push(p);if(ack)admin.acknowledge(p.revision);}});const login=await admin.auth.setup({username:'admin',password:'long test admin password'});await until(()=>admin.connected());
 const api=async(c,path,body)=>{const r=await c.handle(new Request('broadcastcg://app'+path,body?{method:'POST',body:JSON.stringify(body)}:{}),{token:login.token});return{status:r.status,value:await r.json()};};
 const project=defaultProject();assert.equal((await api(admin,'/api/projects',{project,revision:0})).status,200);
 const second=make({workstation:'Second PC'});await second.auth.login({username:'admin',password:'long test admin password'});await until(()=>second.connected());await until(()=>updates.some(s=>s.projects?.some(p=>p.id===project.id)));
 await admin.locks(project.id,'require');await admin.locks(project.id,'request');assert.equal((await api(second,'/api/projects',{project,revision:1})).status,423);assert.equal((await second.locks(project.id,'request')).mine,false);await admin.locks(project.id,'release');await second.locks(project.id,'request');assert.equal((await api(admin,'/api/projects',{project,revision:1})).status,423);await second.locks(project.id,'release');await admin.locks(project.id,'optional');
 const done=async id=>{let job;await until(async()=>{job=(await api(admin,'/api/commands/'+id)).value;return !['running','waiting','cancelling'].includes(job.status);});return job;};
 const counter=id=>({id,projectId:project.id,revision:1,kind:'counter',variable:'homeScore',delta:1});
 const first=counter(randomUUID());assert.equal((await api(admin,'/api/commands',first)).status,202);assert.equal((await done(first.id)).status,'succeeded');assert.equal((await api(second,'/api/commands',counter(randomUUID()))).status,202);await until(async()=>(await api(admin,'/api/projects/'+project.id)).value.project.variables.homeScore===2);
 assert.equal((await api(admin,'/api/commands',first)).value.duplicate,true);assert.equal((await api(admin,'/api/projects',{project,revision:1})).status,409);
 admin.attachOutput();await until(()=>admin.status().engineAttached);second.attachOutput();await pause(100);assert.equal(second.status().engineAttached,false);
 const current=(await api(admin,'/api/projects/'+project.id)).value,take={id:randomUUID(),projectId:project.id,revision:current.revision,kind:'output',output:{scene:current.project.scenes[0],variables:current.project.variables,mode:'show'}};
 assert.equal((await api(admin,'/api/commands',take)).status,202);assert.equal((await done(take.id)).status,'succeeded');assert.equal(shown.length,1);assert.equal((await api(admin,'/api/commands',take)).value.duplicate,true);assert.equal(shown.length,1);
 ack=false;const uncertain={...take,id:randomUUID()};await api(admin,'/api/commands',uncertain);assert.equal((await done(uncertain.id)).status,'unconfirmed');await api(admin,'/api/commands',uncertain);assert.equal(shown.length,2);
 const backup=await admin.backup('encrypted recovery passphrase');const restored=await openBackup(backup,'encrypted recovery passphrase');assert.deepEqual(restored.key,key);
 const held=shown.at(-1),oldEpoch=server.status().epoch,port=server.address.port;await server.close();await until(()=>!admin.connected());assert.equal((await api(admin,'/api/commands',counter(randomUUID()))).status,503);assert.equal((await (await admin.handle(new Request('broadcastcg://app/api/program'),admin.outputContext)).json()).revision,held.revision);
 assert.equal((await api(admin,'/api/desktop/recovery',{project:{...project,name:'Offline draft'},revision:1})).status,200);assert.equal((await api(admin,'/api/desktop/recovery')).value.project.name,'Offline draft');assert.equal((await api(admin,'/api/desktop/recovery')).value.conflict,true);
 assert.equal((await admin.handle(new Request('broadcastcg://app/api/projects'),admin.outputContext)).status,403);assert.equal((await admin.handle(new Request('broadcastcg://app/api/program',{method:'POST',body:'{}'}),admin.outputContext)).status,403);
 server=await createNetworkServer({...options,port});await until(()=>admin.connected());assert.notEqual(server.status().epoch,oldEpoch);assert.equal(server.status().output,'offline');assert.equal(shown.length,2);assert.equal((await api(admin,'/api/commands',take)).value.duplicate,true);assert.equal((await api(admin,'/api/projects/'+project.id)).value.project.variables.homeScore,2);
 const target=join(directory,'backup');mkdirSync(target);writeFileSync(join(target,'server.json'),JSON.stringify({version:1,fingerprint,secretKey:randomBytes(32).toString('base64')}));await restoreServer(target,backup,'encrypted recovery passphrase');await assert.rejects(()=>restoreServer(target,backup,'encrypted recovery passphrase'),/empty database/);
 const recovered=await createNetworkServer({...options,directory:join(target,'data'),secretKey:Buffer.from(loadServer(target).secretKey,'base64')});try{assert.throws(()=>recovered.service.authorize(login.token),e=>e.status===401);const recoveredLogin=await recovered.service.auth.login({username:'admin',password:'long test admin password'});assert.equal(recovered.service.networkSnapshot(recoveredLogin.token).projects.length,1);assert.equal(recovered.status().output,'offline');}finally{await recovered.close();}
});
test('server expiry disconnects an active client, rejects remembered access and accepts administrator renewal',async t=>{
 const directory=mkdtempSync(join(tmpdir(),'broadcastcg-network-access-')),pfx=join(directory,'cert.pfx'),passphrase=randomBytes(24).toString('hex');
 const fingerprint=execFileSync(resolve('desktop/assets/BroadcastCGHost.exe'),['certificate',pfx,passphrase],{windowsHide:true,encoding:'utf8'}).trim();let time=Date.now();
 const bootstrapSecret=randomBytes(32).toString('hex'),server=await createNetworkServer({directory:join(directory,'data'),tls:{pfx:readFileSync(pfx),passphrase},secretKey:randomBytes(32),bootstrapSecret,port:0,heartbeatMs:500,now:()=>time});
 const profile={name:'Expiry test',url:'https://127.0.0.1:'+server.address.port,fingerprint},admin=createRemoteAuthority({profile,settings:{},bootstrapSecret}),states=[],user=createRemoteAuthority({profile,settings:{},onState:s=>states.push(s)});
 t.after(async()=>{admin.close();user.close();await server.close();assert.ok(directory.startsWith(join(tmpdir(),'broadcastcg-network-access-')));rmSync(directory,{recursive:true,force:true});});
 const password='network access test passphrase';await admin.auth.setup({username:'owner',password});await until(()=>admin.connected());
 const u=await admin.auth.createUser(null,{username:'recipient',role:'VIEWER',workspaceIds:[],password,accessExpiresAt:time+1000});await user.auth.login({username:u.username,password});await user.auth.changePassword(null,{currentPassword:password,password:password+' changed'});const session=await user.auth.login({username:u.username,password:password+' changed',remember:true});await until(()=>user.connected());
 time+=1000;await until(()=>states.some(s=>s.sessionEnded));assert.equal(user.connected(),false);await assert.rejects(user.auth.me(),e=>e.status===401);await assert.rejects(user.auth.resume(session.rememberToken),e=>e.status===401);
 await admin.auth.updateUser(null,{...u,accessExpiresAt:time+86400000});await user.auth.login({username:u.username,password:password+' changed'});await until(()=>user.connected());
 const backup=await admin.recovery.create(null,{password,label:'Timed accounts'});assert.equal((await admin.recovery.verify(null,{id:backup.id,password})).accounts,2);assert.equal((await admin.recovery.list()).length,1);assert.equal((await admin.recovery.export(null,backup.id)).subarray(0,9).toString(),'BCGSBACK1');
 await assert.rejects(user.recovery.list(),e=>e.status===403);
});
