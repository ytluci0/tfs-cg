import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {defaultProject,layer,action,control,validateProject,interpolate,applyDataBindings} from '../lib/studio-model.ts';
import {arrangeLayers,shiftKeys,cueTime,controlAvailable,selectOption} from '../lib/creative-tools.ts';
import {insertComponent,makeComponent,duplicateSelection} from '../lib/panel-builder.ts';
import {publishComponentStyles,detachComponent} from '../lib/linked-components.ts';
import {createLocalService} from '../desktop/local-service.mjs';

const condition=(variable,value)=>({mode:'all',rules:[{variable,operator:'eq',value}]});
test('creative schema retains all new fields and rejects invalid cue geometry and vector data',()=>{
 const p=defaultProject(),s=p.scenes[0];s.layers.push(layer('path',{visual:{fill:'linear',gradientColor:'#ffffff',blur:2,points:[{x:0,y:0},{x:1,y:1}]}}));s.cues=[{id:'in',name:'Intro',start:0,end:1,loop:false,finish:'hold'}];
 const parsed=validateProject(JSON.parse(JSON.stringify(p)));assert.equal(parsed.scenes[0].layers.at(-1).visual.blur,2);
 s.cues[0].end=99;assert.throws(()=>validateProject(p),/Cue/);s.cues[0].end=1;s.layers.at(-1).visual.points[0].x=-1;assert.throws(()=>validateProject(p));
});
test('Bezier easing solves horizontal time and supports overshoot without moving endpoint values',()=>{
 const keys=[{time:0,value:0,ease:'bezier',curve:[.42,0,.58,1]},{time:1,value:100,ease:'linear'}];assert.ok(Math.abs(interpolate(keys,.5,0)-50)<.0001);assert.ok(interpolate(keys,.1,0)<10);assert.equal(interpolate(keys,1,0),100);keys[0].curve=[.2,2,.8,2];assert.ok(interpolate(keys,.6,0)>100);
});
test('multi-key movement clamps the entire selection and copy preserves original keys',()=>{
 const keys=[0,1,2].map(time=>({time,value:time*10,ease:'linear'}));assert.deepEqual(shiftKeys(keys,[0,1],-2,5).map(k=>k.time),[0,1,2]);assert.deepEqual(shiftKeys(keys,[0,1],.5,5,true).map(k=>k.time),[0,.5,1,1.5,2]);assert.deepEqual(shiftKeys(keys,[1,2],10,3).map(k=>k.time),[0,2,3]);
});
test('layer alignment keeps animated positions relative and leaves locked objects unchanged',()=>{
 const s=defaultProject().scenes[0];s.layers=[layer('rect',{id:'a',x:20,y:0,width:100,keys:{x:[{time:0,value:0,ease:'linear'},{time:1,value:20,ease:'linear'}]}}),layer('rect',{id:'b',x:220,width:100}),layer('rect',{id:'c',x:500,locked:true})];
 const next=arrangeLayers(s,['a','b','c'],'right');assert.equal(next.layers[0].x,220);assert.deepEqual(next.layers[0].keys.x.map(k=>k.value),[200,220]);assert.equal(next.layers[2].x,500);
});
test('named cues loop, hold or become transparent independently of scene duration',()=>{
 const s=defaultProject().scenes[0];s.cues=[{id:'hold',name:'Hold',start:1,end:3,loop:true,finish:'hold'},{id:'out',name:'Out',start:3,end:5,loop:false,finish:'hide'}];assert.equal(cueTime(s,5,'hold'),2);assert.equal(cueTime(s,2,'out'),null);s.cues[1].finish='hold';assert.equal(cueTime(s,100,'out'),5);
});
test('API-fed choices validate unique IDs, map player fields atomically and report bad feeds',()=>{
 let p=defaultProject();p.variables.selected='';p.variables.playerPhoto='';const c=control('Players',[],{kind:'select',variable:'selected',optionSource:{sourceId:'feed',rowsPath:'players',valuePath:'id',labelPath:'name',photoPath:'photo',fields:{number:'number'}},selectionBindings:{label:'playerName',number:'playerNumber',photo:'playerPhoto'}});p.panels[0].controls=[c];
 const data={players:[{id:7,name:'Alex',number:9,photo:'https://example.com/a.png'}]};let result=applyDataBindings(p,'feed',data);assert.equal(result.missing,0);p=validateProject(result.project);const next=selectOption(p,c,'7');assert.equal(next.variables.playerNumber,9);assert.equal(next.variables.playerName,'Alex');assert.equal(next.variables.selected,'7');assert.equal(p.variables.selected,'');
 assert.throws(()=>selectOption(p,c,'missing'),/no longer available/);data.players.push(data.players[0]);result=applyDataBindings(p,'feed',data);assert.equal(result.missing,1);assert.deepEqual(result.project.optionLists,p.optionLists);
});
test('control conditions fail closed for missing variables and wrong primitive types',()=>{
 const c=control('Test',[],{enabledWhen:condition('armed',true)});assert.equal(controlAvailable(c,{armed:true}),true);assert.equal(controlAvailable(c,{armed:false}),false);assert.equal(controlAvailable(c,{}),false);assert.equal(controlAvailable(c,{armed:'true'}),false);
});
test('linked components publish styles across prefixes without changing actions, bindings or positions',()=>{
 let p=defaultProject();p.variables.enabled=true;p.panels[0].controls=[control('HOME {{homeScore}}',[action('increment','homeScore','1')],{id:'a',appearance:{background:'{{homeColor}}',label:'Score {{homeScore}}'},events:{hold:[action('increment','homeScore','1')]},enabledWhen:condition('enabled',true),placement:{x:0,y:0,width:200,height:100}})];p.variables.homeColor='#ffffff';
 const component=makeComponent(p,p.panels[0],['a'],'Score');p.panelComponents=[component];let result=insertComponent(p,p.panels[0].id,component,'one_',true);p=result.project;const first=result.ids[0];result=insertComponent(p,p.panels[0].id,component,'two_',true);p=result.project;const second=result.ids[0];
 const before=structuredClone(p.panels[0].controls.find(c=>c.id===second)),source=p.panels[0].controls.find(c=>c.id===first);assert.equal(source.events.hold[0].target,'one_homeScore');assert.equal(source.enabledWhen.rules[0].variable,'one_enabled');source.appearance={background:'#112233',label:'Score {{one_homeScore}}',radius:30};p=publishComponentStyles(p,component.id,[first]);const changed=p.panels[0].controls.find(c=>c.id===second);assert.equal(changed.appearance.background,'#112233');assert.equal(changed.appearance.label,'Score {{two_homeScore}}');assert.deepEqual(changed.actions,before.actions);assert.deepEqual(changed.placement,before.placement);
});
async function setup(t){
 const directory=mkdtempSync(join(tmpdir(),'broadcastcg-creative-')),published=[],service=createLocalService({directory,confirmProgram:async p=>{published.push(p);}}),admin=await service.auth.setup({username:'administrator',password:'creative local test passphrase'}),p=defaultProject();
 const api=async(path,body,token=admin.token)=>{const r=await service.handle(new Request('broadcastcg://app'+path,{...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})}),{token});return{status:r.status,value:await r.json()};};
 t.after(()=>{service.close();assert.ok(directory.startsWith(join(tmpdir(),'broadcastcg-creative-')));rmSync(directory,{recursive:true,force:true});});
 await api('/api/projects',{project:p,revision:0});
 const save=async()=>{const old=(await api('/api/projects/'+p.id)).value;assert.equal((await api('/api/projects',{project:p,revision:old.revision})).status,200);};
 const run=async(c,extra={},token)=>{const saved=(await api('/api/projects/'+p.id)).value,request={id:randomUUID(),projectId:p.id,revision:saved.revision,kind:'control',panelId:p.panels[0].id,controlId:c.id,...extra},r=await api('/api/commands',request,token);if(r.status!==202)return r;for(let i=0;i<300;i++){const result=await api('/api/commands/'+request.id);if(!['running','waiting'].includes(result.value.status))return result;await new Promise(r=>setTimeout(r,10));}throw Error('Timeout');};
 return {p,api,save,run,service,published,admin};
}
test('duplicating a linked instance gives it an independent detach identity',()=>{
 let p=defaultProject(),panel=p.panels[0];panel.controls=[control('Score',[],{id:'first',placement:{x:0,y:0,width:180,height:90}})];const component=makeComponent(p,panel,['first'],'Score');p.panelComponents=[component];const inserted=insertComponent(p,panel.id,component,'',true);p=inserted.project;panel=p.panels[0];const originalLink=panel.controls.find(c=>c.id===inserted.ids[0]).componentLink;
 const copy=duplicateSelection(panel,inserted.ids);p.panels[0]=copy.panel;const copiedLink=copy.panel.controls.find(c=>c.id===copy.ids[0]).componentLink;assert.notEqual(copiedLink.instanceId,originalLink.instanceId);p=detachComponent(p,copiedLink.instanceId);assert.ok(p.panels[0].controls.find(c=>c.id===inserted.ids[0]).componentLink);assert.equal(p.panels[0].controls.find(c=>c.id===copy.ids[0]).componentLink,undefined);
});
test('IF / ELSE snapshots its condition once even if the true branch changes that variable',async t=>{
 const x=await setup(t),a={...action('branch','yes'),elseTarget:'no',when:condition('homeScore',0)},c=control('Branch',[a]);x.p.macros=[{id:'yes',name:'Yes',actions:[action('increment','homeScore','1')]},{id:'no',name:'No',actions:[action('increment','awayScore','2')]}];x.p.panels[0].controls=[c];await x.save();let r=await x.run(c);assert.equal(r.value.status,'succeeded');let saved=(await x.api('/api/projects/'+x.p.id)).value.project;assert.equal(saved.variables.homeScore,1);assert.equal(saved.variables.awayScore,0);r=await x.run(c);assert.equal(r.value.status,'succeeded');saved=(await x.api('/api/projects/'+x.p.id)).value.project;assert.equal(saved.variables.homeScore,1);assert.equal(saved.variables.awayScore,2);
});
test('button events use saved actions and reject disabled controls or unknown event names',async t=>{
 const x=await setup(t),c=control('Events',[action('increment','homeScore','1')],{events:{hold:[action('increment','homeScore','3')],release:[action('increment','awayScore','1')]},enabledWhen:condition('homeScore',0)});x.p.panels[0].controls=[c];await x.save();assert.equal((await x.run(c,{event:'hold'})).value.status,'succeeded');assert.equal((await x.run(c,{event:'release'})).status,403);assert.equal((await x.api('/api/projects/'+x.p.id)).value.project.variables.homeScore,3);c.enabledWhen=undefined;await x.save();assert.equal((await x.run(c,{event:'invalid'})).status,400);
});
test('roster selection fills all configured fields before running the selected graphic actions',async t=>{
 const x=await setup(t);x.p.variables.selected='';x.p.variables.playerPhoto='';const c=control('Roster',[action('preview','player')],{kind:'roster',variable:'selected',selectionBindings:{name:'playerName',number:'playerNumber',photo:'playerPhoto'}});x.p.panels[0].controls=[c];await x.save();const r=await x.run(c,{selectionValue:'home-7'});assert.equal(r.value.status,'succeeded');assert.equal(r.value.staged.variables.playerNumber,7);assert.equal(r.value.staged.variables.playerName,'Home player 7');assert.equal((await x.run(c,{selectionValue:'bad-id'})).status,400);
});
test('cue commands publish canonical scenes, preserve selection on data updates and require TAKE permission',async t=>{
 const x=await setup(t),scene=x.p.scenes[0];scene.cues=[{id:'out',name:'Outro',start:2,end:4,loop:false,finish:'hide'}];const c=control('Outro',[action('cue',scene.id,'out')]);x.p.panels[0].controls=[c];await x.save();const r=await x.run(c);assert.equal(r.value.status,'succeeded');assert.equal(x.published.at(-1).cue,'out');assert.deepEqual(x.published.at(-1).scene,scene);const started=x.published.at(-1).startedAt;c.actions=[action('update')];await x.save();assert.equal((await x.run(c)).value.status,'succeeded');assert.equal(x.published.at(-1).cue,'out');assert.equal(x.published.at(-1).startedAt,started);
 const password='creative test designer password',user=await x.service.auth.createUser(x.admin.token,{username:'designer',password,role:'DESIGNER',workspaceIds:[x.p.id]}),login=await x.service.auth.login({username:user.username,password}),session=await x.service.auth.changePassword(login.token,{currentPassword:password,password:password+' changed'});c.actions=[action('cue',scene.id,'out')];await x.save();assert.equal((await x.run(c,{},session.token)).status,403);
});
test('an operator fetches API choices and selects mapped data without panel-edit permission',async t=>{
 const x=await setup(t);x.p.variables.selected='';x.p.sources=[{id:'feed',name:'Players',url:'https://example.com/players',interval:0}];const c=control('Players',[],{kind:'select',variable:'selected',optionSource:{sourceId:'feed',rowsPath:'rows',valuePath:'id',labelPath:'name',photoPath:'',fields:{number:'number'}},selectionBindings:{label:'playerName',number:'playerNumber'}}),fetcher=control('Fetch',[action('fetch','feed')]);x.p.panels[0].controls=[c,fetcher];await x.save();
 const password='creative operator test passphrase',u=await x.service.auth.createUser(x.admin.token,{username:'operator',password,role:'OPERATOR',workspaceIds:[x.p.id]}),first=await x.service.auth.login({username:u.username,password}),op=await x.service.auth.changePassword(first.token,{currentPassword:password,password:password+' changed'});
 t.mock.method(globalThis,'fetch',async()=>Response.json({rows:[{id:'api-9',name:'From API',number:9}]}));assert.equal((await x.run(fetcher,{},op.token)).value.status,'succeeded');assert.equal((await x.run(c,{selectionValue:'api-9'},op.token)).value.status,'succeeded');const saved=(await x.api('/api/projects/'+x.p.id)).value.project;assert.equal(saved.variables.playerName,'From API');assert.equal(saved.variables.playerNumber,9);
});
