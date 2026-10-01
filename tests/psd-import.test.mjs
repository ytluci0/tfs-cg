import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {decode} from 'fast-png';
import {convertPsd,inspectPsdHeader} from '../desktop/psd-import.mjs';
import {defaultProject,sceneSchema} from '../lib/studio-model.ts';
import {psdScene,sceneTree} from '../lib/psd-model.ts';
import {createLocalService} from '../desktop/local-service.mjs';
import {psdFixture,fixtureDocument,bitmap} from './fixtures/psd.mjs';
import {createPsdSessions} from '../desktop/psd-session.cjs';
const options=(projectId='',revision=1,mode='editable')=>({id:'review',projectId,revision,mode,fonts:{ArialMT:'Arial'},fontStatus:'checked',missingFonts:[]});
test('PSD preserves layer stacking, nested groups, hidden state, pixels and editable point text',()=>{
 const draft=convertPsd(psdFixture(),'Lower third.psd'),scene=sceneSchema.parse(psdScene(draft,options()));
 assert.equal(scene.name,'Lower third');assert.equal(scene.width,640);assert.equal(scene.layers.length,5);assert.equal(scene.groups.length,1);
 const text=scene.layers.find(l=>l.name==='Presenter');assert.equal(text.type,'text',JSON.stringify(draft.warnings));assert.equal(text.text,'PRESENTER');assert.equal(text.fontFamily,'Arial');assert.equal(text.x,72);assert.equal(text.y,278-24*.85);assert.equal(scene.layers.at(-1).visible,false);
 assert.deepEqual(sceneTree(scene).map(n=>n.kind),['layer','group']);assert.equal(sceneTree(scene)[1].children.length,4);
 const pixels=decode(draft.assets.find(a=>'/api/assets/'+a.id===draft.referenceSrc).bytes);assert.deepEqual([...pixels.data.slice((240*640+40)*4,(240*640+40)*4+4)],[255,106,0,255]);
 assert.equal(psdScene(draft,options('',1,'pixels')).layers.find(l=>l.name==='Presenter').type,'image');assert.equal(psdScene(draft,options('',1,'composite')).layers.length,1);
});
test('default Photoshop blending ranges and empty text-path metadata remain editable',()=>{const d=fixtureDocument(),l=d.children[1].children[2];l.blendingRanges={compositeGrayBlendSource:[0,0,255,255],compositeGraphBlendDestinationRange:[0,0,255,255],ranges:[{sourceRange:[0,0,255,255],destRange:[0,0,255,255]}]};l.text.textPath={data:{textRange:[-1,-1],pathData:{spacing:-1}}};const result=convertPsd(psdFixture(d));assert.equal(result.scene.layers.find(l=>l.name==='Presenter').type,'text');assert.ok(!result.warnings.some(w=>w.message.includes('advanced blending')));});

test('PSD rejects unsupported header formats before decoding',()=>{
 const b=psdFixture();assert.throws(()=>inspectPsdHeader(Buffer.from('not psd')),/valid/);
 for(const [offset,value,message] of [[4,2,/PSB/],[22,16,/8-bit/],[24,4,/RGB/]]){const c=Buffer.from(b);c.writeUInt16BE(value,offset);assert.throws(()=>convertPsd(c),message);}
 const c=Buffer.from(b);c.writeUInt32BE(100000,18);assert.throws(()=>convertPsd(c),/canvas/);assert.throws(()=>convertPsd(b.subarray(0,100)));
});
test('PSD reports unsupported masks, blends, rich text and smart objects without pretending they are editable',()=>{
 const d=fixtureDocument(),text=d.children[1].children[2];text.blendMode='multiply';text.mask={left:72,top:260,imageData:bitmap(150,18,[128,128,128,255]),defaultColor:255};
 const draft=convertPsd(psdFixture(d));assert.equal(draft.scene.layers.find(l=>l.name==='Presenter').type,'image');assert.ok(draft.warnings.some(w=>w.message.includes('multiply blending')));assert.ok(draft.warnings.some(w=>w.message.includes('layer mask')));
 const rich=fixtureDocument();rich.children[1].children[2].text.text='Two\nlines';assert.equal(convertPsd(psdFixture(rich)).scene.layers.find(l=>l.name==='Presenter').type,'image');
});
test('PSD bounds include layer pixels and group depth, independently of canvas bounds',()=>{
 const d=fixtureDocument();d.children=Array.from({length:251},(_,i)=>({name:'Empty '+i}));assert.throws(()=>convertPsd(psdFixture(d)),/250/);
 const root={name:'Root',children:[]};let current=root;for(let n=0;n<22;n++){const child={name:'Group '+n,children:[]};current.children.push(child);current=child;}d.children=[root];assert.throws(()=>convertPsd(psdFixture(d)),/nested/);
});
test('scene validation rejects group cycles and missing parents; report and groups survive parsing',()=>{
 const scene=convertPsd(psdFixture()).scene;scene.groups[0].parentId=scene.groups[0].id;assert.throws(()=>sceneSchema.parse(scene),/hierarchy/);delete scene.groups[0].parentId;scene.layers[0].groupId='absent';assert.throws(()=>sceneSchema.parse(scene),/hierarchy/);
});
async function setup(t){const directory=mkdtempSync(join(tmpdir(),'broadcastcg-psd-')),service=createLocalService({directory}),{token}=await service.auth.setup({username:'admin',password:'test-only-long-passphrase'}),project=defaultProject();
 const api=async(path,body)=>{const r=await service.handle(new Request('broadcastcg://app'+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{}),{token});return{status:r.status,value:await r.json()};};
 await api('/api/projects',{project,revision:0});t.after(()=>{service.close();assert.ok(directory.startsWith(join(tmpdir(),'broadcastcg-psd-')));rmSync(directory,{recursive:true,force:true});});return{directory,service,token,project,api};}
test('PSD commit is atomic, portable, revision checked and never publishes output',async t=>{
 const x=await setup(t),draft=convertPsd(psdFixture()),result=x.service.importPsd(draft,options(x.project.id),x.token);assert.equal(result.revision,2);assert.equal(result.project.scenes.length,4);assert.equal((await x.api('/api/program')).value,null);
 const exported=x.service.exportProject(result.project,x.token),restored=x.service.importProject(x.service.inspectImport(exported,x.token),x.token);assert.equal(restored.scenes.at(-1).importReport.format,'psd');assert.notEqual(restored.scenes.at(-1).importReport.referenceSrc,result.project.scenes.at(-1).importReport.referenceSrc);
 assert.throws(()=>x.service.importPsd(draft,options(x.project.id),x.token),/changed/);
 const db=new DatabaseSync(join(x.directory,'broadcastcg.sqlite'));const count=()=>db.prepare('SELECT count(*) AS n FROM assets').get().n,before=count();
 const huge={...result.project,scenes:Array.from({length:100},(_,i)=>({...result.project.scenes[0],id:'scene'+i}))};await x.api('/api/projects',{project:huge,revision:2});assert.throws(()=>x.service.importPsd(draft,options(x.project.id,3),x.token));assert.equal(count(),before);db.close();
});
test('PSD import rechecks account access and rejects incomplete asset manifests',async t=>{
 const x=await setup(t),draft=convertPsd(psdFixture());assert.throws(()=>x.service.importPsd({...draft,assets:[]},options(x.project.id),x.token),/incomplete/);
 x.service.auth.logout(x.token);assert.throws(()=>x.service.importPsd(draft,options(x.project.id),x.token),/Sign in|session/i);
});
test('a Viewer cannot import PSDs even with access to the workspace',async t=>{
 const x=await setup(t),password='viewer-test-long-passphrase';await x.service.auth.createUser(x.token,{username:'viewer',displayName:'Viewer',password,role:'VIEWER',enabled:true,allWorkspaces:false,workspaceIds:[x.project.id]});
 const login=await x.service.auth.login({username:'viewer',password}),changed=await x.service.auth.changePassword(login.token,{currentPassword:password,password:password+'new'});
 assert.throws(()=>x.service.importPsd(convertPsd(psdFixture()),options(x.project.id),changed.token),/permission/i);assert.equal((await x.api('/api/projects/'+x.project.id)).value.revision,1);
});
test('font substitutions and unverified fonts are recorded in the portable import report',()=>{
 const scene=psdScene(convertPsd(psdFixture()),{...options(),fonts:{ArialMT:'Verdana'},fontStatus:'unavailable',missingFonts:['ArialMT']});assert.equal(scene.layers.find(l=>l.type==='text').fontFamily,'Verdana');assert.ok(scene.importReport.warnings.some(w=>w.message.includes('Missing font')));assert.ok(scene.importReport.warnings.some(w=>w.message.includes('could not be checked')));
});
test('PSD worker cancellation and timeout release the worker and do not commit',async t=>{
 const directory=mkdtempSync(join(tmpdir(),'broadcastcg-psd-')),file=join(directory,'worker.cjs');writeFileSync(file,'setInterval(()=>{},1000)');let commits=0;
 const sessions=createPsdSessions({workerPath:file,authorize:()=>{},commit:()=>commits++,timeoutMs:40});t.after(()=>{sessions.clear();assert.ok(directory.startsWith(join(tmpdir(),'broadcastcg-psd-')));rmSync(directory,{recursive:true,force:true});});
 await assert.rejects(sessions.prepare('fixture.psd','session'),/exceeded/);const pending=sessions.prepare('fixture.psd','session');sessions.clear();await assert.rejects(pending,/cancelled/);assert.equal(commits,0);assert.throws(()=>sessions.finish({id:'expired'},'session'),/expired/);
});
test('prepared PSD reviews belong to one session and cannot commit twice',async t=>{
 const directory=mkdtempSync(join(tmpdir(),'broadcastcg-psd-')),file=join(directory,'worker.cjs');writeFileSync(file,"require('node:worker_threads').parentPort.postMessage({ok:true,result:{assets:[]}})");let commits=0;
 const sessions=createPsdSessions({workerPath:file,authorize:()=>{},commit:()=>++commits});t.after(()=>{sessions.clear();assert.ok(directory.startsWith(join(tmpdir(),'broadcastcg-psd-')));rmSync(directory,{recursive:true,force:true});});
 const draft=await sessions.prepare('fixture.psd','first-session');assert.throws(()=>sessions.finish({id:draft.id},'other-session'),/expired/);assert.equal(sessions.finish({id:draft.id},'first-session'),1);assert.throws(()=>sessions.finish({id:draft.id},'first-session'),/expired/);assert.equal(commits,1);
});

test('schema-four PSD upgrade backs up existing projects before blocking older releases',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'broadcastcg-psd-'));let service=createLocalService({directory});
 try{const {token}=await service.auth.setup({username:'admin',password:'test-only-long-passphrase'}),project=defaultProject();await service.handle(new Request('broadcastcg://app/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project,revision:0})}),{token});service.close();service=null;const db=new DatabaseSync(join(directory,'broadcastcg.sqlite'));db.exec('PRAGMA user_version=4');db.close();service=createLocalService({directory});assert.equal(service.diagnostics().schemaVersion,7);const files=readdirSync(join(directory,'backups'));assert.equal(files.length,1);assert.ok(files[0].startsWith('before-psd-'));const before=new DatabaseSync(join(directory,'backups',files[0]),{readOnly:true});assert.equal(before.prepare('PRAGMA user_version').get().user_version,4);assert.equal(before.prepare('SELECT count(*) AS n FROM projects').get().n,1);before.close();assert.equal(service.diagnostics().projects,1);
 }finally{service?.close();assert.ok(directory.startsWith(join(tmpdir(),'broadcastcg-psd-')));rmSync(directory,{recursive:true,force:true});}
});
