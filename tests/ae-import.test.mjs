import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createRequire} from 'node:module';
import {convertAe,inspectAePng,simplifyAeTrack} from '../desktop/ae-import.mjs';
import {aeScene} from '../lib/ae-model.ts';
import {atTime,defaultProject,layer,layerActive,layerTransform,sceneSchema} from '../lib/studio-model.ts';
import {createLocalService} from '../desktop/local-service.mjs';
import {aeFixture,aePng} from './fixtures/ae.mjs';
const {createAeSessions}=createRequire(import.meta.url)('../desktop/ae-session.cjs');
const convert=p=>convertAe(JSON.stringify(p));
const options=(projectId='project',revision=1)=>({id:'test-review',projectId,revision,fonts:{ArialMT:'Arial'},fontStatus:'checked',missingFonts:[],acceptWarnings:true});

test('AE sampling retains nonlinear motion and maps anchor, timing and text baselines',()=>{
 const p=aeFixture(),d=convert(p),plate=d.scene.layers[0];assert.equal(d.scene.frameRate,10);assert.equal(d.scene.importReport.workAreaStart,5);
 for(const sample of p.layers[0].samples){const value=atTime(plate,sample.time);assert.ok(Math.abs(value.x+value.anchorX-sample.position[0])<1e-7);assert.equal(value.opacity,1);}
 assert.ok(plate.keys.x.length>10);assert.equal(d.scene.layers[2].textBaseline,30);assert.equal(d.scene.layers[2].y,250);assert.equal(d.scene.layers[1].src,'/api/assets/'+d.assets[0].id);
 assert.equal(layerActive(d.scene.layers[1],.2,2),false);assert.equal(layerActive(d.scene.layers[1],.3,2),true);assert.equal(layerActive(d.scene.layers[1],1.5,2),false);assert.equal(layerActive(plate,2,2),true);
});
test('AE pivot transform keeps signed scale and rotation without moving the anchor',()=>{
 const p=aeFixture();p.layers[0].samples=[{time:0,position:[300,200],anchor:[50,20],scale:[-200,50],rotation:90,opacity:80}];const l=convert(p).scene.layers[0];assert.equal(layerTransform(l),'translate(250 180) translate(50 20) rotate(90) scale(-2 0.5) translate(-50 -20)');
 assert.equal(layerTransform(layer('rect',{x:10,y:20,width:100,height:40,rotation:90})),'translate(10 20) translate(50 20) rotate(90) scale(1 1) translate(-50 -20)');
});
test('hold jumps and exact linear simplification preserve timing',()=>{
 const frames=[{time:0,value:0,ease:'step'},{time:.5,value:0,ease:'step'},{time:1,value:100,ease:'step'},{time:2,value:100,ease:'step'}];const keys=simplifyAeTrack(frames);assert.equal(keys.length,3);const l=layer('rect',{keys:{x:keys}});assert.equal(atTime(l,.999).x,0);assert.equal(atTime(l,1).x,100);
 assert.equal(simplifyAeTrack(Array.from({length:100},(_,i)=>({time:i/100,value:i,ease:'linear'}))).length,2);
 assert.throws(()=>simplifyAeTrack(Array.from({length:1001},(_,i)=>({time:i/100,value:i%2,ease:'linear'}))),/1,000/);
});
test('AE rejects raw AEPs, unrecognized code fields, non-square pixels and invalid sample timelines',()=>{
 assert.throws(()=>convertAe('RIFX binary AEP'),/Direct .aep/);for(const mutate of [p=>p.code='eval()',p=>p.composition.pixelAspect=2,p=>p.layers[0].samples[0].time=1,p=>p.layers[0].samples[2].time=.1,p=>p.layers[0].samples[0].position[0]=1e9,p=>p.layers[0].outPoint=3,p=>p.layers[1].imageId='missing',p=>p.layers[1].id='plate']){const p=aeFixture();mutate(p);assert.throws(()=>convert(p));}
});
test('PNG decoder bounds, checksums and manifests reject corrupt or oversized inputs',()=>{
 const valid=aePng();assert.equal(inspectAePng(valid).width,40);const corrupt=Buffer.from(valid);corrupt[29]^=1;assert.throws(()=>inspectAePng(corrupt),/checksum/);assert.throws(()=>inspectAePng(valid.subarray(0,40)));
 const p=aeFixture();p.assets[0].bytes='@@@=';assert.throws(()=>convert(p),/encoding/);p.assets[0].bytes=aePng(41,30).toString('base64');assert.throws(()=>convert(p),/dimensions/);
 const unused=aeFixture();unused.assets.push({...unused.assets[0],id:'unused'});assert.throws(()=>convert(unused),/unused/);
});
test('AE reference images are dimension and time checked and retained in the scene',()=>{
 const p=aeFixture();p.assets.push({id:'reference',name:'reference.png',mime:'image/png',bytes:aePng(640,360).toString('base64')});p.references=[{time:1,imageId:'reference'}];const d=convert(p);assert.equal(d.scene.importReport.references[0].time,1);assert.equal(d.scene.importReport.referenceSrc,'/api/assets/'+d.assets[1].id);p.references[0].time=3;assert.throws(()=>convert(p),/Reference/);
});
test('AE font substitutions and unchecked fonts remain in the portable report',()=>{
 const d=convert(aeFixture()),s=aeScene(d,{fonts:{ArialMT:'Verdana'},fontStatus:'unavailable',missingFonts:['ArialMT']});assert.equal(s.layers[2].fontFamily,'Verdana');assert.ok(s.importReport.warnings.some(w=>w.message.includes('Missing font')));assert.equal(sceneSchema.parse(s).importReport.format,'ae');
});
async function setup(t){const directory=mkdtempSync(join(tmpdir(),'broadcastcg-ae-')),service=createLocalService({directory}),{token}=await service.auth.setup({username:'admin',password:'test-only-long-passphrase'}),project=defaultProject();const api=async(path,body)=>{const r=await service.handle(new Request('broadcastcg://app'+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{}),{token});return{status:r.status,value:await r.json()};};await api('/api/projects',{project,revision:0});t.after(()=>{service.close();assert.ok(directory.startsWith(join(tmpdir(),'broadcastcg-ae-')));rmSync(directory,{recursive:true,force:true});});return{directory,service,token,project,api};}
test('AE commits atomically, exports embedded references and does not change Program',async t=>{
 const x=await setup(t),p=aeFixture();p.assets.push({id:'reference',name:'reference.png',mime:'image/png',bytes:aePng(640,360).toString('base64')});p.references=[{time:1,imageId:'reference'}];const d=convert(p),result=x.service.importAe(d,options(x.project.id),x.token);assert.equal(result.revision,2);assert.equal((await x.api('/api/program')).value,null);assert.equal(result.project.scenes.at(-1).importReport.format,'ae');
 const restored=x.service.importProject(x.service.inspectImport(x.service.exportProject(result.project,x.token),x.token),x.token);assert.notEqual(restored.scenes.at(-1).importReport.references[0].src,result.project.scenes.at(-1).importReport.references[0].src);assert.deepEqual(restored.scenes.at(-1).layers[0].keys,result.project.scenes.at(-1).layers[0].keys);
 assert.throws(()=>x.service.importAe(d,options(x.project.id),x.token),/changed/);const db=new DatabaseSync(join(x.directory,'broadcastcg.sqlite')),before=db.prepare('SELECT count(*) AS n FROM assets').get().n;const huge={...result.project,scenes:Array.from({length:100},(_,i)=>({...result.project.scenes[0],id:'s'+i}))};await x.api('/api/projects',{project:huge,revision:2});assert.throws(()=>x.service.importAe(d,options(x.project.id,3),x.token));assert.equal(db.prepare('SELECT count(*) AS n FROM assets').get().n,before);db.close();
});
test('AE service checks warning acknowledgement, missing assets and revoked access',async t=>{
 const x=await setup(t),d=convert(aeFixture());assert.throws(()=>x.service.importAe(d,{...options(x.project.id),acceptWarnings:false},x.token));assert.throws(()=>x.service.importAe({...d,assets:[]},options(x.project.id),x.token),/incomplete/);x.service.auth.logout(x.token);assert.throws(()=>x.service.importAe(d,options(x.project.id),x.token),/session|Sign in/i);
});
test('AE Viewer access cannot import through native service',async t=>{
 const x=await setup(t),password='viewer-test-long-passphrase';await x.service.auth.createUser(x.token,{username:'viewer',displayName:'Viewer',password,role:'VIEWER',enabled:true,allWorkspaces:false,workspaceIds:[x.project.id]});const login=await x.service.auth.login({username:'viewer',password}),changed=await x.service.auth.changePassword(login.token,{currentPassword:password,password:password+'new'});assert.throws(()=>x.service.importAe(convert(aeFixture()),options(x.project.id),changed.token),/permission/i);
});
test('AE worker cancellation, expiry and single-use token-bound review',async t=>{
 const directory=mkdtempSync(join(tmpdir(),'broadcastcg-ae-')),file=join(directory,'worker.cjs');writeFileSync(file,"require('node:worker_threads').parentPort.postMessage({ok:true,result:{assets:[]}})");let commits=0,now=0;const sessions=createAeSessions({workerPath:file,authorize:()=>{},commit:()=>++commits,now:()=>now});t.after(()=>{sessions.clear();assert.ok(directory.startsWith(join(tmpdir(),'broadcastcg-ae-')));rmSync(directory,{recursive:true,force:true});});
 const d=await sessions.prepare('test.bcae','one');assert.throws(()=>sessions.finish({id:d.id},'two'),/expired/);assert.equal(sessions.finish({id:d.id},'one'),1);assert.throws(()=>sessions.finish({id:d.id},'one'),/expired/);const expired=await sessions.prepare('test.bcae','one');now=1200001;assert.throws(()=>sessions.finish({id:expired.id},'one'),/expired/);
 writeFileSync(file,'setInterval(()=>{},1000)');const pending=sessions.prepare('test.bcae','one');sessions.clear();await assert.rejects(pending,/cancelled/);const timed=createAeSessions({workerPath:file,authorize:()=>{},commit:()=>commits++,timeoutMs:40});await assert.rejects(timed.prepare('test.bcae','one'),/exceeded/);assert.equal(commits,1);
});
test('schema 5 upgrade snapshots old data before enabling AE metadata',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'broadcastcg-ae-'));let service=createLocalService({directory});try{service.close();service=null;const db=new DatabaseSync(join(directory,'broadcastcg.sqlite'));db.exec('PRAGMA user_version=5');db.close();service=createLocalService({directory});assert.equal(service.diagnostics().schemaVersion,6);const files=readdirSync(join(directory,'backups'));assert.equal(files.length,1);assert.ok(files[0].startsWith('before-ae-'));const before=new DatabaseSync(join(directory,'backups',files[0]),{readOnly:true});assert.equal(before.prepare('PRAGMA user_version').get().user_version,5);before.close();}finally{service?.close();assert.ok(directory.startsWith(join(tmpdir(),'broadcastcg-ae-')));rmSync(directory,{recursive:true,force:true});}
});
