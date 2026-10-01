import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createLocalService,ServiceError} from '../desktop/local-service.mjs';
import {defaultProject} from '../lib/studio-model.ts';
import windows from '../desktop/window-state.cjs';

function setup(t,options={}){
 const directory=mkdtempSync(join(tmpdir(),'broadcastcg-test-'));
 let service=createLocalService({directory,...options});
 t.after(()=>{service.close();assert.ok(directory.startsWith(join(tmpdir(),'broadcastcg-test-')));rmSync(directory,{recursive:true,force:true});});
 return {get service(){return service;},reopen(){service.close();service=createLocalService({directory,...options});},async api(path,body,method=body?'POST':'GET'){const response=await service.handle(new Request('broadcastcg://app'+path,{method,headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})}));return{status:response.status,value:await response.json()};}};
}
test('local saves survive restart and stale revisions never overwrite saved edits',async t=>{
 const x=setup(t),p=defaultProject();let r=await x.api('/api/projects',{project:p,revision:0});assert.equal(r.value.revision,1);
 p.name='Saved update';r=await x.api('/api/projects',{project:p,revision:1});assert.equal(r.value.revision,2);
 p.name='Stale update';assert.equal((await x.api('/api/projects',{project:p,revision:1})).status,409);
 x.reopen();r=await x.api('/api/projects/'+p.id);assert.equal(r.value.project.name,'Saved update');assert.equal(r.value.revision,2);
});
test('output commands require availability and acknowledgement; restart never replays program',async t=>{
 let online=false,ack=true,calls=0;
 const x=setup(t,{beforePublish(){if(!online)throw new ServiceError('Output offline',503);},async confirmProgram(){calls++;if(!ack)throw new ServiceError('Unconfirmed',504);}}),p=defaultProject();
 const command={scene:p.scenes[0],variables:p.variables,mode:'show'};
 assert.equal((await x.api('/api/program',command)).status,503);assert.equal(calls,0);assert.equal((await x.api('/api/program')).value,null);
 online=true;ack=false;assert.equal((await x.api('/api/program',command)).status,504);
 ack=true;assert.equal((await x.api('/api/program',command)).status,200);
 x.reopen();assert.equal((await x.api('/api/program')).value,null);assert.equal(calls,2);
});
test('simultaneous TAKE is rejected while the first command awaits output acknowledgement',async t=>{
 let complete,started;const entered=new Promise(r=>started=r);
 const x=setup(t,{confirmProgram(){started();return new Promise(r=>complete=r);}}),p=defaultProject(),command={scene:p.scenes[0],variables:{},mode:'show'};
 const first=x.api('/api/program',command);await entered;
 assert.equal((await x.api('/api/program',command)).status,409);complete();assert.equal((await first).status,200);
});
test('recovery retains draft revision and detects conflicting saved work',async t=>{
 const x=setup(t),p=defaultProject();await x.api('/api/projects',{project:p,revision:0});
 p.name='Recovered draft';await x.api('/api/desktop/recovery',{project:p,revision:1});
 x.reopen();let r=(await x.api('/api/desktop/recovery')).value;assert.equal(r.project.name,p.name);assert.equal(r.conflict,false);
 const other={...p,name:'Another saved edit'};await x.api('/api/projects',{project:other,revision:1});r=(await x.api('/api/desktop/recovery')).value;assert.equal(r.conflict,true);
});
test('portable project embeds local images and remaps identifiers on import',async t=>{
 const x=setup(t),p=defaultProject(),bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG7sAAAAASUVORK5CYII=','base64');
 const response=await x.service.handle(new Request('broadcastcg://app/api/assets',{method:'POST',body:bytes})),asset=await response.json();
 p.scenes[0].layers[0]={...p.scenes[0].layers[0],type:'image',src:asset.url};
 const text=x.service.exportProject(p),inspected=x.service.inspectImport(text);assert.equal(inspected.assets.length,1);assert.equal(inspected.missing.length,0);
 const restored=x.service.importProject(inspected);assert.notEqual(restored.id,p.id);assert.notEqual(restored.scenes[0].layers[0].src,asset.url);
 const image=await x.service.handle(new Request('broadcastcg://app'+restored.scenes[0].layers[0].src));assert.deepEqual(Buffer.from(await image.arrayBuffer()),bytes);
});
test('incomplete and malformed imports do not replace existing media',t=>{
 const x=setup(t),p=defaultProject();p.scenes[0].layers[0].src='/api/assets/not-present';
 assert.throws(()=>x.service.exportProject(p),/missing/);
 const missing=x.service.inspectImport(JSON.stringify(p));assert.throws(()=>x.service.importProject(missing),/missing/);
 assert.throws(()=>x.service.inspectImport(JSON.stringify({format:'broadcastcg-project',version:99,project:p})),/version/);
});
test('source credentials require encrypted storage and invalid headers are rejected',async t=>{
 const x=setup(t);assert.equal((await x.api('/api/sources',{sourceId:'feed',headers:{Authorization:'secret'}})).status,503);
 assert.equal((await x.api('/api/sources',{sourceId:'feed',headers:{Host:'host'}})).status,400);
});
test('window bounds recover onto a connected monitor without losing negative-coordinate displays',()=>{
 const displays=[{id:1,workArea:{x:0,y:0,width:1920,height:1080}},{id:2,workArea:{x:-1920,y:0,width:1920,height:1080}}];
 assert.deepEqual(windows.restoreBounds({x:-1800,y:40,width:1400,height:900,displayId:2},displays),{x:-1800,y:40,width:1400,height:900});
 const restored=windows.restoreBounds({x:6000,y:4000,width:2000,height:1400,displayId:3},displays);assert.deepEqual(restored,{x:0,y:0,width:1920,height:1080});
});
