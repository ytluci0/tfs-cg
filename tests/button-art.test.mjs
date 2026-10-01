import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultProject,validateProject,textValue} from '../lib/studio-model.ts';
import {buttonArtSchema} from '../lib/button-art-schema.ts';
import {artPart,artPreset,buttonArtwork,patchArtPart,resolvedArtPart} from '../lib/button-art.ts';
import {createPanelPart,footballPartsPanel,partChoices,positionPlayerControls,detachMovedPlayers,playerVariables,resolvePlayer} from '../lib/panel-parts.ts';
import {duplicateSelection,deleteSelection,makeComponent,insertComponent,moveSelection,panelIssues} from '../lib/panel-builder.ts';
import {publishComponentStyles} from '../lib/linked-components.ts';
import {checkProjectChanges} from '../desktop/project-policy.mjs';
import {createProjectPackage,unpackProjectPackage} from '../desktop/project-package.mjs';
function fixture(){const p=defaultProject(),kit=footballPartsPanel(p);p.panels=[kit.panel];p.variables=kit.variables;return validateProject(p);}
test('state edits inherit base properties, isolate overrides and preserve locked layers',()=>{
 let art=buttonArtwork('Score {{homeScore}}'),id=art.parts[1].id;art=patchArtPart(art,id,'hover',{fill:'#00ff00'});art=patchArtPart(art,id,'normal',{x:28,text:'NEW'});
 assert.equal(resolvedArtPart(art.parts[1],'hover').x,28);assert.equal(resolvedArtPart(art.parts[1],'hover').fill,'#00ff00');assert.equal(resolvedArtPart(art.parts[1],'pressed').fill,'#eaf2ff');assert.equal(art.parts[1].text,'NEW');art.parts[1].locked=true;assert.deepEqual(patchArtPart(art,id,'pressed',{x:2}),art);
 assert.throws(()=>patchArtPart(art,art.parts[0].id,'normal',{opacity:2}));assert.throws(()=>buttonArtSchema.parse({...art,parts:[art.parts[0],art.parts[0]]}));assert.throws(()=>buttonArtSchema.parse({...art,parts:Array.from({length:51},()=>artPart('rect'))}));
});
test('all part presets validate and football kit is independent controls with preserved data',()=>{
 const p=fixture();p.variables.homeScore=7;const kit=footballPartsPanel(p);assert.equal(kit.variables.homeScore,7);assert.ok(kit.panel.controls.length>35);assert.equal(kit.panel.controls.filter(c=>c.kind==='player'&&c.player.source==='slot').length,22);assert.ok(!kit.panel.controls.some(c=>['pitch','scoreboard','bench'].includes(c.kind)));assert.deepEqual(panelIssues({...p,variables:kit.variables},kit.panel).filter(i=>i.severity==='error'),[]);
 for(const [kind] of partChoices)validateProject({...p,panels:[{...p.panels[0],controls:[createPanelPart(kind)]}]});for(const kind of ['blank','rounded','circle','hexagon','shirt','image'])buttonArtSchema.parse(artPreset(kind));
 const plus=kit.panel.controls.find(c=>c.label==='Home score +');assert.equal(plus.actions[0].type,'counter');assert.deepEqual(JSON.parse(plus.actions[0].value),{delta:1});
});
test('formation-linked player parts reposition, mirror teams and resolve substitutions without mutation',()=>{
 const p=fixture(),panel=p.panels[0],home=panel.controls.find(c=>c.kind==='player'&&c.player.team==='home'&&c.player.slot===9),away=panel.controls.find(c=>c.kind==='player'&&c.player.team==='away'&&c.player.slot===9);
 const before=structuredClone(panel);p.variables.homeFormation='3-5-2';const moved=positionPlayerControls(panel,p);assert.notDeepEqual(moved.controls.find(c=>c.id===home.id).placement,home.placement);assert.deepEqual(panel,before);assert.ok(home.placement.x<away.placement.x);
 p.players.find(v=>v.id==='home-9').bench=true;p.players.find(v=>v.id==='home-12').bench=false;p.players.find(v=>v.id==='home-12').slot=9;assert.equal(resolvePlayer(home,p).number,12);assert.equal(textValue('{{player.number}}',playerVariables(home,p)),'12');assert.equal(p.variables['player.number'],undefined);
});
test('moving a player detaches only its field link; moving field and players together preserves links',()=>{
 const p=fixture(),panel=p.panels[0],player=panel.controls.find(c=>c.kind==='player'&&c.player.fieldId),id=player.id,fieldId=player.player.fieldId;
 const moved=detachMovedPlayers(panel,moveSelection(panel,[id],12,5));assert.equal(moved.controls.find(c=>c.id===id).player.fieldId,undefined);
 const group=detachMovedPlayers(panel,moveSelection(panel,[id,fieldId],0,10));assert.equal(group.controls.find(c=>c.id===id).player.fieldId,fieldId);
 const removed=deleteSelection(panel,[fieldId]);assert.ok(removed.controls.filter(c=>c.kind==='player').every(c=>!c.player.fieldId));
});
test('duplicates and reusable components remap field IDs, visual arrays, states and data bindings',()=>{
 const p=fixture(),panel=p.panels[0],player=panel.controls.find(c=>c.kind==='player'&&c.player.fieldId),field=panel.controls.find(c=>c.id===player.player.fieldId);const ids=[field.id,player.id];
 const duplicate=duplicateSelection(panel,ids),copied=duplicate.panel.controls.find(c=>c.id===duplicate.ids[1]);assert.equal(copied.player.fieldId,duplicate.ids[0]);assert.notEqual(copied.player.fieldId,field.id);
 const component=makeComponent(p,panel,ids,'Player area');assert.ok(!Object.hasOwn(component.variables,'player.number'));p.panelComponents=[component];const inserted=insertComponent(p,panel.id,component,'test.',true),copy=inserted.project.panels[0].controls.find(c=>c.id===inserted.ids[1]);assert.equal(copy.player.fieldId,inserted.ids[0]);assert.equal(copy.dataFields.homeFormation,'test.homeFormation');assert.equal(copy.artwork.parts[1].text,'{{player.number}}');assert.ok(Array.isArray(copy.artwork.parts[0].points));
 copy.artwork.parts[0].states.live.fill='{{test.homeColor}}';const published=publishComponentStyles(inserted.project,component.id,[copy.id]);const definition=published.panelComponents[0].controls[1];assert.equal(definition.artwork.parts[0].states.live.fill,'{{homeColor}}');assert.equal(definition.artwork.parts[1].text,'{{player.number}}');
 const only=makeComponent(p,panel,[player.id],'Standalone');assert.equal(only.controls[0].player.fieldId,undefined);
});
test('artwork survives project packages and operator permissions protect design while allowing selection',()=>{
 const p=fixture(),art=p.panels[0].controls[0].artwork;art.parts.push(artPart('image',{image:'/api/assets/test-image'}));const assets=[{id:'test-image',name:'logo.png',mime:'image/png',bytes:Buffer.from('example').toString('base64')}];assert.deepEqual(validateProject(unpackProjectPackage(createProjectPackage(p,assets)).project),p);
 const actor={user:{permissions:['panels.operate']}},requirePermission=(_a,key)=>{if(!actor.user.permissions.includes(key))throw Error(key);};let next=structuredClone(p);next.variables.playerNumber=12;next.variables.playerName='Substitution';assert.doesNotThrow(()=>checkProjectChanges(actor,p,next,requirePermission));next=structuredClone(p);next.panels[0].controls[0].artwork.parts[0].fill='#ff0000';assert.throws(()=>checkProjectChanges(actor,p,next,requirePermission),/panels.edit/);
});
