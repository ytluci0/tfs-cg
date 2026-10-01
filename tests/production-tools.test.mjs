import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {defaultProject,layer,action,control,validateProject,sceneSchema,applyDataBindings} from '../lib/studio-model.ts';
import {expandRows,resolveLayout,makeGraphicComponent,insertGraphicComponent,publishGraphicComponent,dataGraphicPreset,vectorPath} from '../lib/production-tools.ts';
import {hardwareTarget,midiInput,midiFeedback} from '../lib/hardware-controls.ts';
import {planActions} from '../lib/action-logic.ts';
import {createLocalService,ServiceError} from '../desktop/local-service.mjs';
import {checkProjectChanges} from '../desktop/project-policy.mjs';

test('responsive text, plate padding and following photos resolve dependencies in any layer order',()=>{
 const p=defaultProject(),s=p.scenes[0];s.layers=[layer('image',{id:'photo',x:0,y:0,layout:{mode:'after',target:'plate',gap:20}}),layer('rect',{id:'plate',layout:{mode:'fit',target:'name',padding:10}}),layer('text',{id:'name',x:100,y:200,height:50,text:'{{name}}',layout:{mode:'text',minWidth:10,maxWidth:500}})];
 const output=resolveLayout(s,0,{name:'ABCDE'},(_l,text)=>text.length*20);assert.equal(output.layers[2].width,100);assert.equal(output.layers[1].x,90);assert.equal(output.layers[1].width,120);assert.equal(output.layers[0].x,230);assert.equal(output.layers[0].y,190);
 assert.equal(resolveLayout(s,0,{name:'X'.repeat(90)},(_l,text)=>text.length*20).layers[2].width,500);assert.equal(s.layers[2].width,1000);
});
test('scene validation rejects layout cycles, bad clips, nested repeaters and excess expanded layers',()=>{
 const s=defaultProject().scenes[0];s.layers=[layer('rect',{id:'a',layout:{mode:'fit',target:'b'}}),layer('rect',{id:'b',layout:{mode:'fit',target:'a'}})];assert.equal(sceneSchema.safeParse(s).success,false);s.layers[1].layout=undefined;s.layers[1].visual={clipLayer:'nope'};assert.equal(sceneSchema.safeParse(s).success,false);
 const repeated=dataGraphicPreset({...s,layers:[],groups:[]},'standings');repeated.groups[0].repeat.rows=Array.from({length:100},(_,i)=>({name:String(i)}));repeated.groups[0].repeat.limit=100;repeated.layers=Array.from({length:11},(_,i)=>layer('text',{id:String(i),groupId:repeated.groups[0].id}));assert.equal(sceneSchema.safeParse(repeated).success,false);
 repeated.layers=repeated.layers.slice(0,3);assert.equal(sceneSchema.safeParse(repeated).success,true);repeated.groups.push({id:'nested',name:'Nested',parentId:repeated.groups[0].id,opacity:1,visible:true});assert.equal(sceneSchema.safeParse(repeated).success,false);
});
test('repeated graphic rows sort, limit and escape content without altering the template',()=>{
 const s=dataGraphicPreset({...defaultProject().scenes[0],layers:[]},'standings'),g=s.groups[0];g.repeat.rows=[{name:'A "quoted" \\ name',score:2},{name:'Winner',score:9}];g.repeat.sortBy='score';g.repeat.descending=true;g.repeat.limit=2;
 const expanded=expandRows(s,{});assert.equal(expanded.layers.length,6);assert.ok(expanded.layers.some(l=>l.text==='1. Winner'));assert.ok(expanded.layers.some(l=>l.text==='2. A "quoted" \\ name'));assert.equal(expanded.groups[1].transform.y,94);assert.equal(s.layers[1].text,'{{row.rank}}. {{row.name}}');assert.equal(new Set(expanded.layers.map(l=>l.id)).size,6);
});
test('API row refresh rejects malformed primitive fields and retains the prior rows',()=>{
 let p=defaultProject();p.scenes[0]=dataGraphicPreset({...p.scenes[0],layers:[]},'standings');const g=p.scenes[0].groups[0];g.repeat.sourceId='scores';g.repeat.fields={name:'team.name',score:'points'};
 let result=applyDataBindings(p,'scores',{rows:[{team:{name:'ABC'},points:17}]});assert.equal(result.missing,0);p=validateProject(result.project);assert.deepEqual(p.scenes[0].groups[0].repeat.rows,[{name:'ABC',score:17}]);result=applyDataBindings(p,'scores',{rows:[{team:{name:{}},points:18}]});assert.equal(result.missing,1);assert.deepEqual(result.project.scenes[0].groups[0].repeat.rows,g.repeat.rows=[{name:'ABC',score:17}]);
});
test('linked graphic publishing updates shape, text and animation across variable prefixes',()=>{
 let p=defaultProject();const id=p.scenes[0].id;p.scenes[0].layers=[layer('rect',{id:'plate',x:20,y:30}),layer('text',{id:'name',x:25,y:40,text:'{{homeTeam}}',layout:{mode:'after',target:'plate',gap:5},keys:{opacity:[{time:0,value:0,ease:'linear'},{time:1,value:1,ease:'linear'}]}})];p=makeGraphicComponent(p,id,['plate','name'],'Team');const c=p.graphicComponents[0];p=insertGraphicComponent(p,id,c.id,'one_');p=insertGraphicComponent(p,p.scenes[1].id,c.id,'two_');const source=p.scenes[0].layers.find(l=>l.graphicLink?.layerId==='plate');source.color='#112233';source.width=500;p=publishGraphicComponent(p,id,source.graphicLink.instanceId);p=validateProject(p);
 const target=p.scenes[1].layers.find(l=>l.graphicLink?.layerId==='plate'),text=p.scenes[1].layers.find(l=>l.graphicLink?.layerId==='name');assert.equal(target.width,500);assert.equal(target.color,'#112233');assert.equal(text.text,'{{two_homeTeam}}');assert.equal(text.layout.target,target.id);assert.equal(text.keys.opacity.length,2);assert.equal(p.variables.two_homeTeam,'HOME');assert.notEqual(source.graphicLink.instanceId,target.graphicLink.instanceId);
});
test('cubic vector paths support independent handles and preserve straight corners',()=>{
 const l=layer('path',{width:200,height:100,visual:{closed:false,points:[{x:0,y:0,outX:.2,outY:1},{x:1,y:1,inX:.8,inY:0}]}});assert.equal(vectorPath(l),'M 0 0 C 40 100 160 0 200 100');l.visual.points=[{x:0,y:0},{x:1,y:1}];assert.equal(vectorPath(l),'M 0 0 L 200 100');
});
test('hardware matches channel/device, rejects ambiguous bindings and honors conditions',()=>{
 const c=control('Score',[action('increment','homeScore','1')],{hardware:{kind:'midi',code:60,channel:1,device:'Deck',feedback:true},liveWhen:{mode:'all',rules:[{variable:'armed',operator:'truthy'}]}}),input={kind:'midi',code:60,channel:1,device:'Deck'};assert.equal(hardwareTarget([c],input,{armed:true}),c);assert.equal(hardwareTarget([c],{...input,channel:0},{}),undefined);assert.throws(()=>hardwareTarget([c,{...c,id:'other'}],input,{}),/ambiguous/);assert.deepEqual(midiInput([0x91,60,127]),{kind:'midi',code:60,channel:1});assert.equal(midiInput([0x91,60,0]),null);assert.equal(midiInput([0x81,60,100]),null);assert.deepEqual(midiFeedback(c,{armed:true}),[0x91,60,127]);c.hidden=true;assert.equal(hardwareTarget([c],input,{armed:true}),undefined);assert.equal(midiFeedback(c,{armed:true})[2],0);
});
test('operator row refresh does not grant permission to change row layout or linked definitions',()=>{
 const before=defaultProject();before.scenes[0]=dataGraphicPreset({...before.scenes[0],layers:[]},'standings');const actor={user:{permissions:['panels.operate','data.fetch']}},requirePermission=(a,p)=>{if(!a.user.permissions.includes(p))throw Error('Denied '+p);};let next=structuredClone(before);next.scenes[0].groups[0].repeat.rows=[{name:'New',score:5}];assert.doesNotThrow(()=>checkProjectChanges(actor,before,next,requirePermission));next.scenes[0].groups[0].repeat.gapY=10;assert.throws(()=>checkProjectChanges(actor,before,next,requirePermission),/graphics.edit/);next=structuredClone(before);next.graphicComponents=[];assert.throws(()=>checkProjectChanges(actor,before,next,requirePermission),/graphics.edit/);
});
async function setup(t,confirmProgram=async()=>{}){const directory=mkdtempSync(join(tmpdir(),'broadcastcg-production-')),service=createLocalService({directory,confirmProgram}),admin=await service.auth.setup({username:'production_admin',password:'production test passphrase'}),p=defaultProject();t.after(()=>{service.close();assert.ok(directory.startsWith(join(tmpdir(),'broadcastcg-production-')));rmSync(directory,{recursive:true,force:true});});
 const api=async(path,body,token=admin.token,headers={})=>{const r=await service.handle(new Request('broadcastcg://app'+path,body instanceof Uint8Array?{method:'POST',headers,body}:body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{headers}),{token});return {status:r.status,value:r.headers.get('content-type')?.includes('json')?await r.json():Buffer.from(await r.arrayBuffer()),headers:r.headers};};
 const save=async()=>{const old=await api('/api/projects/'+p.id);const r=await api('/api/projects',{project:p,revision:old.value?.revision||0});assert.equal(r.status,200,JSON.stringify(r.value));};
 const run=async(c,extra={})=>{const old=(await api('/api/projects/'+p.id)).value,r=await api('/api/commands',{id:randomUUID(),projectId:p.id,revision:old.revision,kind:'control',panelId:p.panels[0].id,controlId:c.id,...extra});assert.equal(r.status,202,JSON.stringify(r));for(let i=0;i<200;i++){const job=await api('/api/commands/'+r.value.command.id);if(!['running','waiting'].includes(job.value.status))return job.value;await new Promise(r=>setTimeout(r,5));}throw Error('Command timed out');};return {p,api,save,run};}
test('confirmed action failure runs its preflighted fallback then stops before the success path',async t=>{
 const x=await setup(t),a={...action('set','homeScore','not a number'),onError:'fallback'},c=control('Try',[a,action('increment','awayScore','100')]);x.p.macros=[{id:'fallback',name:'Fallback',actions:[action('increment','awayScore','1')]}];x.p.panels[0].controls=[c];await x.save();const job=await x.run(c);assert.equal(job.status,'failed');assert.match(job.error,/fallback completed/);assert.equal((await x.api('/api/projects/'+x.p.id)).value.project.variables.awayScore,1);assert.equal(job.steps.at(-1).status,'skipped');
});
test('successful action skips the fallback and follows its success path; recursive fallback rejected',async t=>{
 const x=await setup(t),a={...action('set','homeScore','5'),onError:'fallback'},c=control('Try',[a,action('increment','awayScore','2')]);x.p.macros=[{id:'fallback',name:'Fallback',actions:[action('increment','awayScore','100')]}];x.p.panels[0].controls=[c];await x.save();assert.equal((await x.run(c)).status,'succeeded');assert.equal((await x.api('/api/projects/'+x.p.id)).value.project.variables.awayScore,2);x.p.macros[0].actions[0].onError='fallback';assert.throws(()=>planActions(x.p,[a]),/cycle/);
});
test('an unconfirmed TAKE never runs a fallback that might cause a second on-air effect',async t=>{
 const x=await setup(t,async()=>{const e=new ServiceError('No ACK',503);e.unconfirmed=true;throw e;}),c=control('Try',[action('preview',x.p.scenes[0].id),{...action('take'),onError:'fallback'}]);x.p.macros=[{id:'fallback',name:'Fallback',actions:[action('increment','awayScore','1')]}];x.p.panels[0].controls=[c];await x.save();const result=await x.run(c);assert.equal(result.status,'unconfirmed');assert.equal((await x.api('/api/projects/'+x.p.id)).value.project.variables.awayScore,0);
});
test('custom widget row selection fills fields atomically before the stored action sequence',async t=>{
 const x=await setup(t);x.p.variables.selected='';const c=control('Card drop',[action('preview','player')],{kind:'widget',rosterTeam:'home',variable:'selected',selectionBindings:{name:'playerName',number:'playerNumber'},widget:{mode:'dropzone',columns:1,title:'{{row.name}}',subtitle:'{{row.number}}',photo:'{{row.photo}}'}});x.p.panels[0].controls=[c];await x.save();const job=await x.run(c,{selectionValue:'home-5'});assert.equal(job.staged.variables.playerName,'Home player 5');assert.equal(job.staged.variables.playerNumber,5);
});
test('local video assets support byte ranges and reject invalid range requests',async t=>{
 const x=await setup(t),bytes=Buffer.concat([Buffer.from([0,0,0,24]),Buffer.from('ftypisom'),Buffer.alloc(52)]),uploaded=await x.api('/api/assets',bytes);assert.equal(uploaded.status,200);assert.equal(uploaded.value.mime,'video/mp4');x.p.scenes[0].layers.push(layer('video',{src:uploaded.value.url,media:{loop:true,start:0,speed:1}}));await x.save();const part=await x.api(uploaded.value.url,undefined,undefined,{Range:'bytes=4-11'});assert.equal(part.status,206);assert.equal(part.value.toString(),'ftypisom');assert.equal(part.headers.get('content-range'),'bytes 4-11/64');assert.equal((await x.api(uploaded.value.url,undefined,undefined,{Range:'bytes=999-'})).status,416);
});
