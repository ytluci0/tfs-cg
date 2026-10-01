import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultProject,control,action,validateProject} from '../lib/studio-model.ts';
import {alignSelection,deleteSelection,distributeSelection,duplicateSelection,expandSelection,groupSelection,insertComponent,isControlLocked,makeComponent,moveSelection,orderSelection,panelIssues,resizeSelection,selectionBounds,ungroupSelection} from '../lib/panel-builder.ts';
import {checkProjectChanges} from '../desktop/project-policy.mjs';
function fixture(){const p=defaultProject();p.panels=[{id:'custom',name:'Test panel',type:'custom',columns:3,freeLayout:true,canvasWidth:960,canvasHeight:540,controls:[
 control('Home score',[action('increment','homeScore','1')],{id:'a',kind:'counter',variable:'homeScore',shortcut:'a',placement:{x:80,y:80,width:160,height:128}}),
 control('Away score',[],{id:'b',kind:'counter',variable:'awayScore',placement:{x:320,y:120,width:160,height:128}}),
 control('Formation',[],{id:'c',kind:'formation',variable:'awayFormation',placement:{x:700,y:280,width:200,height:100}})
 ]}];return p;}
const bounds=c=>c.placement;
test('selection movement snaps its origin and clamps the whole group without compressing offsets',()=>{
 const p=fixture().panels[0],moved=moveSelection(p,['a','b'],43,-900,16);
 assert.deepEqual(bounds(moved.controls[0]),{x:128,y:0,width:160,height:128});
 assert.deepEqual(bounds(moved.controls[1]),{x:368,y:40,width:160,height:128});
 const far=moveSelection(p,['a','b'],999,999);assert.deepEqual(selectionBounds(far,['a','b']),{x:560,y:372,width:400,height:168});assert.equal(bounds(far.controls[1]).x-bounds(far.controls[0]).x,240);
 assert.deepEqual(bounds(p.controls[0]),{x:80,y:80,width:160,height:128});
});
test('selection scaling respects every control minimum, canvas edges and proportional resizing',()=>{
 const p=fixture().panels[0],tiny=resizeSelection(p,['a','b'],1,1);
 assert.deepEqual(bounds(tiny.controls[0]),{x:80,y:80,width:24,height:24});assert.equal(bounds(tiny.controls[1]).x,116);
 const big=resizeSelection(p,['a','b'],9999,9999);for(const c of big.controls.slice(0,2)){const b=bounds(c);assert.ok(b.x+b.width<=960&&b.y+b.height<=540);}
 const doubled=resizeSelection(p,['a','b'],800,400,true);assert.equal(bounds(doubled.controls[0]).width,320);assert.equal(bounds(doubled.controls[0]).height,256);assert.equal(bounds(doubled.controls[1]).x,560);
});
test('group membership, locks, deletion and ungrouping remain consistent',()=>{
 const p=groupSelection(fixture().panels[0],['a','b'],'Scores');assert.deepEqual(expandSelection(p,['a']),['a','b']);assert.deepEqual(expandSelection(p,['a'],true),['a']);
 const locked={...p,groups:p.groups.map(g=>({...g,locked:true}))};assert.ok(isControlLocked(locked,locked.controls[0]));assert.equal(moveSelection(locked,['a'],5,5),locked);assert.equal(deleteSelection(locked,['a','b']),locked);assert.equal(ungroupSelection(locked,['a']),locked);
 const split=ungroupSelection(p,['a']);assert.equal(split.groups.length,0);assert.equal(split.controls[1].groupId,undefined);
 const removed=deleteSelection(p,['a','b']);assert.equal(removed.groups.length,0);assert.deepEqual(removed.controls.map(c=>c.id),['c']);
});
test('alignment, distribution and stacking operate on only the selected controls',()=>{
 const p=fixture().panels[0],aligned=alignSelection(p,['a','b'],'bottom');assert.equal(bounds(aligned.controls[0]).y,120);assert.deepEqual(aligned.controls[2],p.controls[2]);
 const distributed=distributeSelection(p,['a','b','c'],'x');assert.equal(bounds(distributed.controls[1]).x,390);assert.equal(bounds(distributed.controls[2]).x,700);
 assert.deepEqual(orderSelection(p,['a'],'front').controls.map(c=>c.id),['b','c','a']);
 const overlap={...p,controls:p.controls.map(c=>({...c,placement:{...c.placement,x:0}}))};assert.throws(()=>distributeSelection(overlap,['a','b','c'],'x'),/not enough space/);
});
test('duplication creates new control, action and group IDs in a vacant region and clears shortcuts',()=>{
 const p=groupSelection(fixture().panels[0],['a','b']),r=duplicateSelection(p,['a','b']);assert.equal(r.ids.length,2);
 const copies=r.panel.controls.slice(-2);assert.notEqual(copies[0].groupId,p.controls[0].groupId);assert.notEqual(copies[0].actions[0].id,p.controls[0].actions[0].id);assert.equal(copies[0].shortcut,'');
 for(const c of copies)for(const old of p.controls){const a=bounds(c),b=bounds(old);assert.ok(a.x+a.width<=b.x||a.x>=b.x+b.width||a.y+a.height<=b.y||a.y>=b.y+b.height);}
 assert.equal(bounds(copies[1]).x-bounds(copies[0]).x,240);
});
test('component copies remap variable actions, conditions and templates and preserve existing live values',()=>{
 const p=fixture();p.variables.photo='/api/assets/photo';p.panels[0].controls[0].label='Home {{homeScore}}';p.panels[0].controls[0].imageSrc='{{photo}}';p.panels[0].controls[0].actions[0].condition='awayScore=2';
 const component=makeComponent(p,p.panels[0],['a','b'],'Score module');assert.equal(component.controls[0].placement.x,0);assert.equal(component.controls[0].shortcut,'');
 p.variables.homeScore=9;let r=insertComponent(p,'custom',component);assert.equal(r.project.variables.homeScore,9);
 r=insertComponent(p,'custom',component,'game2_');const c=r.project.panels[0].controls.at(-2);assert.equal(c.variable,'game2_homeScore');assert.equal(c.label,'Home {{game2_homeScore}}');assert.equal(c.imageSrc,'{{game2_photo}}');assert.equal(c.actions[0].condition,'game2_awayScore=2');assert.equal(c.actions[0].target,'game2_homeScore');assert.equal(r.project.variables.game2_homeScore,0);assert.equal(r.project.variables.homeScore,9);
 p.variables.game2_homeScore='wrong type';assert.throws(()=>insertComponent(p,'custom',component,'game2_'),/different type/);assert.throws(()=>insertComponent(p,'custom',component,'123_'),/prefix starting/);
});
test('football component captures implicit scoreboard fields while retaining fixed team colors',()=>{
 const p=fixture(),score=control('Match',[],{id:'score',kind:'scoreboard',homeColor:'#123456',placement:{x:0,y:0,width:600,height:200}});p.panels[0].controls=[score];const component=makeComponent(p,p.panels[0],['score'],'Football');
 assert.equal(component.variables.homeScore,0);assert.equal(component.variables.awayColor,'#df3b48');assert.equal(component.controls[0].dataFields.homeColor,undefined);
 const r=insertComponent(p,'custom',component,'match2_'),copy=r.project.panels[0].controls.at(-1);assert.equal(copy.dataFields.homeScore,'match2_homeScore');assert.equal(copy.homeColor,'#123456');assert.equal(copy.dataFields.awayFormation,'match2_awayFormation');
});
test('new panel metadata and components round-trip while legacy documents still load',()=>{
 const p=fixture();p.panels[0]=groupSelection(p.panels[0],['a','b']);Object.assign(p.panels[0],{snapGrid:16,touchMode:true});p.panels[0].controls[0].hidden=true;p.panelComponents=[makeComponent(p,p.panels[0],['a','b'],'Scores')];
 const loaded=validateProject(JSON.parse(JSON.stringify(p)));assert.equal(loaded.panels[0].layoutVersion,2);assert.equal(loaded.panels[0].groups.length,1);assert.equal(loaded.panels[0].controls[0].hidden,true);assert.equal(loaded.panelComponents[0].controls.length,2);assert.equal(validateProject(defaultProject()).panels[0].layoutVersion,undefined);
});
test('invalid component placements and missing groups are rejected before insertion or persistence',()=>{
 const p=fixture(),c=makeComponent(p,p.panels[0],['a'],'Scores');delete c.controls[0].placement;assert.throws(()=>insertComponent(p,'custom',c),/placement inside/);
 p.panelComponents=[c];assert.throws(()=>validateProject(p),/placement inside/);delete p.panelComponents;p.panels[0].controls[0].groupId='missing';assert.throws(()=>validateProject(p),/missing panel group/);
});
test('panel validation reports missing connections, numeric types, shortcut collisions and touch sizing',()=>{
 const p=fixture(),panel=p.panels[0];panel.touchMode=true;panel.controls[1].shortcut='A';p.variables.homeScore='0';panel.controls[2].variable='missing';panel.controls[1].actions=[action('preview','missing')];
 const issues=panelIssues(p,panel);assert.ok(issues.some(i=>i.message.includes('numeric')));assert.ok(issues.some(i=>i.message.includes('existing variable')));assert.ok(issues.some(i=>i.message.includes('missing graphic')));assert.equal(issues.filter(i=>i.message.includes('assigned more')).length,2);assert.ok(issues.some(i=>i.severity==='warning'&&i.message.includes('touch')));
 panel.controls[1].hidden=true;assert.ok(!panelIssues(p,panel).some(i=>i.controlId==='b'||i.message.includes('assigned more')));
});
test('component library changes require panel editing permission even without a layout change',()=>{
 const p=fixture(),next={...p,panelComponents:[makeComponent(p,p.panels[0],['a'],'Scores')]},denied=[];
 const check=(_actor,permission)=>{denied.push(permission);throw Error('Denied '+permission);};
 assert.throws(()=>checkProjectChanges({user:{permissions:['panels.operate']}},p,next,check),/panels.edit/);assert.deepEqual(denied,['panels.edit']);
});
