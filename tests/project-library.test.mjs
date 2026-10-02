import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createLocalService} from '../desktop/local-service.mjs';
import {defaultProject} from '../lib/studio-model.ts';
import {createLibraryProject} from '../lib/project-library.ts';
const password='library test passphrase only',png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG7sAAAAASUVORK5CYII=';
async function setup(t){
 const directory=mkdtempSync(join(tmpdir(),'broadcastcg-library-'));let service=createLocalService({directory}),token=(await service.auth.setup({username:'admin',password})).token;
 t.after(()=>{service.close();assert.ok(directory.startsWith(join(tmpdir(),'broadcastcg-library-')));rmSync(directory,{force:true,recursive:true});});
 const api=async(path,body,session=token)=>{const r=await service.handle(new Request('broadcastcg://app'+path,{method:body?'POST':'GET',...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})}),{token:session});return{status:r.status,value:await r.json()};};
 return{directory,api,get service(){return service;},get token(){return token;},async reopen(){service.close();service=createLocalService({directory});token=(await service.auth.login({username:'admin',password})).token;}};
}
test('existing projects appear as lightweight cards; folders, favorites and covers survive restart without rewriting documents',async t=>{
 const x=await setup(t),p=defaultProject();await x.api('/api/projects',{project:p,revision:0});
 let list=(await x.api('/api/library')).value;assert.equal(list.projects[0].scenes,3);assert.equal(list.projects[0].panels,2);assert.equal(list.projects[0].document,undefined);assert.equal(list.onAirProjectId,null);
 assert.equal((await x.api('/api/library/'+p.id+'/metadata',{version:0,folder:'Sports/2026',tags:['Football'],cover:{sceneId:'score',time:2,custom:false}})).status,200);
 await x.api('/api/library/'+p.id+'/favorite',{favorite:true});
 const preview=(await x.api('/api/library/'+p.id+'/preview')).value;assert.equal(preview.scene.id,'score');assert.equal(preview.time,2);
 assert.equal((await x.api('/api/library/'+p.id+'/thumbnail',{key:preview.key,dataUrl:png})).status,200);
 await x.reopen();list=(await x.api('/api/library')).value;assert.equal(list.projects[0].folder,'Sports/2026');assert.equal(list.projects[0].favorite,true);assert.equal(list.projects[0].thumbnailKey,list.projects[0].expectedKey);
 const saved=(await x.api('/api/projects/'+p.id)).value;assert.equal(saved.revision,1);assert.deepEqual(saved.project,p);
});
test('stale organization and thumbnails cannot overwrite newer work; custom covers survive graphic edits',async t=>{
 const x=await setup(t),p=defaultProject();await x.api('/api/projects',{project:p,revision:0});
 assert.equal((await x.api('/api/library/'+p.id+'/metadata',{version:0,folder:'Client A'})).status,200);
 assert.equal((await x.api('/api/library/'+p.id+'/metadata',{version:0,folder:'stale'})).status,409);
 assert.equal((await x.api('/api/library/'+p.id+'/thumbnail',{key:'1:0',dataUrl:png})).status,409);
 assert.equal((await x.api('/api/library/'+p.id+'/metadata',{version:1,cover:{sceneId:'score',time:2,custom:true},dataUrl:png})).status,200);
 p.variables.homeScore=4;await x.api('/api/projects',{project:p,revision:1});const card=(await x.api('/api/library')).value.projects[0];assert.equal(card.thumbnailKey,card.expectedKey);
 assert.equal((await x.api('/api/library/'+p.id+'/rename',{name:'stale',revision:1})).status,409);
 assert.equal((await x.api('/api/library/'+p.id+'/rename',{name:'Finals',revision:2})).status,200);
 assert.equal((await x.api('/api/projects/'+p.id)).value.project.variables.homeScore,4);
});
test('duplicate keeps assets and controls independent; archiving cannot interrupt a live project',async t=>{
 const x=await setup(t),p=defaultProject();const upload=await x.service.handle(new Request('broadcastcg://app/api/assets',{method:'POST',body:Buffer.from(png.split(',')[1],'base64')}),{token:x.token});const asset=await upload.json();p.scenes[0].layers[0].type='image';p.scenes[0].layers[0].src=asset.url;
 await x.api('/api/projects',{project:p,revision:0});await x.api('/api/program',{projectId:p.id,scene:p.scenes[0],variables:p.variables,mode:'show'});
 const live=(await x.api('/api/program')).value;
 assert.equal((await x.api('/api/library/'+p.id+'/metadata',{version:0,archived:true})).status,409);
 const copy=await x.api('/api/library/'+p.id+'/duplicate',{name:'Copy'});assert.equal(copy.status,200);assert.notEqual(copy.value.id,p.id);
 const duplicate=(await x.api('/api/projects/'+copy.value.id)).value.project;assert.deepEqual(duplicate.panels,p.panels);assert.equal(duplicate.scenes[0].layers[0].src,asset.url);
 duplicate.variables.homeScore=99;await x.api('/api/projects',{project:duplicate,revision:1});assert.equal((await x.api('/api/projects/'+p.id)).value.project.variables.homeScore,0);
 assert.equal((await x.api('/api/library/'+copy.value.id+'/metadata',{version:1,archived:true})).status,200);
 assert.equal((await x.api('/api/library/'+copy.value.id+'/metadata',{version:2,archived:false})).status,200);
 assert.deepEqual((await x.api('/api/program')).value,live);
 const db=new DatabaseSync(join(x.directory,'broadcastcg.sqlite'),{readOnly:true});try{assert.equal(db.prepare('SELECT count(*) n FROM assets').get().n,1);assert.equal(db.prepare('SELECT count(*) n FROM project_assets WHERE project_id=?').get(copy.value.id).n,1);assert.equal(db.prepare('SELECT count(*) n FROM project_secrets WHERE project_id=?').get(copy.value.id).n,0);}finally{db.close();}
});
test('library and preview access honor workspace grants; read-only users can favorite but cannot mutate shared cards',async t=>{
 const x=await setup(t),p=defaultProject(),privateProject=defaultProject();await x.api('/api/projects',{project:p,revision:0});await x.api('/api/projects',{project:privateProject,revision:0});
 const user=await x.service.auth.createUser(x.token,{username:'viewer',role:'VIEWER',workspaceIds:[p.id],password});const first=await x.service.auth.login({username:user.username,password});const viewer=await x.service.auth.changePassword(first.token,{currentPassword:password,password:password+' changed'});
 assert.deepEqual((await x.api('/api/library',null,viewer.token)).value.projects.map(p=>p.id),[p.id]);
 for(const action of ['preview','thumbnail'])assert.equal((await x.api('/api/library/'+privateProject.id+'/'+action,null,viewer.token)).status,403);
 for(const action of ['metadata','rename','duplicate','thumbnail'])assert.equal((await x.api('/api/library/'+p.id+'/'+action,{},viewer.token)).status,403);
 assert.equal((await x.api('/api/library/'+p.id+'/favorite',{favorite:true},viewer.token)).status,200);
 assert.equal((await x.api('/api/library')).value.projects.find(v=>v.id===p.id).favorite,false);
 assert.equal((await x.api('/api/library',null,null)).status,401);
});
test('new blank projects store chosen dimensions and 60 fps, without demo panels or variables',async t=>{
 const x=await setup(t),p=createLibraryProject({name:'New show',template:'blank',width:1280,height:720,frameRate:60});
 assert.equal((await x.api('/api/projects',{project:p,revision:0,libraryFolder:'Events/Finals'})).status,200);
 const card=(await x.api('/api/library')).value.projects[0];assert.equal(card.width,1280);assert.equal(card.height,720);assert.equal(card.frameRate,60);assert.equal(card.folder,'Events/Finals');assert.deepEqual(p.variables,{});assert.equal(p.scenes[0].layers.length,0);assert.equal(p.panels[0].controls.length,0);
 const invalid=createLibraryProject({name:'Invalid folder',template:'blank',width:1920,height:1080,frameRate:25});assert.equal((await x.api('/api/projects',{project:invalid,revision:0,libraryFolder:'../outside'})).status,400);assert.equal((await x.api('/api/library')).value.projects.length,1);
});
