import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultProject,control,validateProject,applyDataBindings} from '../lib/studio-model.ts';
import {formationNames,generateFormation,formationPoints,formationOptions} from '../lib/formations.ts';
import {counterValue,clockSeconds,clockText,clockAt,optionsList} from '../lib/broadcast-tools.ts';
import {toolRecipes,panelPacks} from '../lib/tool-library.ts';

test('all formation presets produce eleven usable slots; arbitrary valid shapes work',()=>{
 for(const name of [...formationNames,'4-1-2-1-2']){const points=generateFormation(name);assert.equal(points.length,11);assert.equal(points[0].role,'GK');assert.ok(points.every(p=>p.x>=2&&p.x<=48&&p.y>=4&&p.y<=96));assert.equal(new Set(points.map(p=>p.x+':'+p.y)).size,11);}
 for(const invalid of ['4-3-4','10','4-0-6','not a formation'])assert.throws(()=>generateFormation(invalid));
});
test('custom positions, tool settings and saved presets survive project serialization',()=>{
 const project=defaultProject(),points=generateFormation('4-2-3-1');points[6]={x:29,y:63,role:'DM'};
 project.formations=[{id:'custom',name:'Pressing shape',points}];
 project.toolPresets=[control('Points',[],{kind:'counter',variable:'homeScore',minimum:0,maximum:100,step:1,quickSteps:[1,2,3],resetValue:0})];
 project.panels[0].controls.push(...project.toolPresets);
 const restored=validateProject(JSON.parse(JSON.stringify(project)));
 assert.deepEqual(formationPoints(restored,'Pressing shape'),points);
 assert.ok(formationOptions(restored).includes('Pressing shape'));
 assert.deepEqual(restored.toolPresets[0].quickSteps,[1,2,3]);
});
test('counter increments respect floor, ceiling, decimals, and variable type',()=>{
 const c=control('Score',[],{kind:'counter',variable:'score',minimum:0,maximum:10});
 assert.equal(counterValue(c,{score:0},-1),0);assert.equal(counterValue(c,{score:9},3),10);assert.equal(counterValue(c,{score:0.2},0.1),0.3);
 assert.throws(()=>counterValue(c,{score:'4'},1));assert.throws(()=>counterValue(c,{},1));
});
test('countdown uses elapsed wall time, stops at zero, and round-trips time formatting',()=>{
 assert.equal(clockSeconds('12:34'),754);assert.equal(clockSeconds('01:02:03'),3723);assert.equal(clockText(754),'12:34');
 assert.deepEqual(clockAt(24,1000,6000,'down'),{seconds:19,finished:false});
 assert.deepEqual(clockAt(24,1000,30000,'down'),{seconds:0,finished:true});
 assert.deepEqual(clockAt(10,1000,6000,'up'),{seconds:15,finished:false});
});
test('all library recipes validate and packs reference real tools',()=>{
 assert.equal(toolRecipes.length,33);const ids=new Set(toolRecipes.map(t=>t.id));assert.equal(ids.size,toolRecipes.length);
 const p=defaultProject();p.panels[0].controls=toolRecipes.map(t=>control(t.label,[],t.control));assert.doesNotThrow(()=>validateProject(p));
 for(const pack of panelPacks)assert.ok(pack.recipes.every(id=>ids.has(id)));
 assert.deepEqual(optionsList('One, Two\nThree,Two'),['One','Two','Three']);
});
test('API bindings feed numeric tool variables without overwriting invalid values or unrelated layers',()=>{
 const p=defaultProject();
 p.bindings=[{id:'score',sourceId:'match',path:'score',sceneId:'',layerId:'',property:'text',destination:'variable',targetVariable:'homeScore'},{id:'name',sourceId:'match',path:'team',sceneId:'',layerId:'',property:'text',destination:'variable',targetVariable:'homeTeam'},{id:'text',sourceId:'match',path:'team',sceneId:'presenter',layerId:'presenter-name',property:'text'}];
 const good=applyDataBindings(p,'match',{score:'7',team:'Tigers'});
 assert.equal(good.missing,0);assert.equal(good.project.variables.homeScore,7);assert.equal(good.project.variables.homeTeam,'Tigers');assert.equal(good.project.scenes[0].layers.find(l=>l.id==='presenter-name').text,'Tigers');assert.equal(p.variables.homeScore,0);
 const bad=applyDataBindings(good.project,'match',{score:'N/A',team:{nested:'value'}});assert.equal(bad.missing,3);assert.equal(bad.project.variables.homeScore,7);assert.equal(bad.project.variables.homeTeam,'Tigers');
 assert.doesNotThrow(()=>validateProject(good.project));
});
