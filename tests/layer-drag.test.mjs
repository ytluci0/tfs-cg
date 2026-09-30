import test from 'node:test';
import assert from 'node:assert/strict';
import {atTime,defaultProject,layer,layerSchema,moveLayer,timelineKeyframes,validateProject} from '../lib/studio-model.ts';

test('dragging a partially animated layer preserves its animation and remains saveable',()=>{
 const project=defaultProject(),original=project.scenes[0].layers.find(l=>l.id==='presenter-name');
 const moved=moveLayer(original,original.x+120,original.y+70);
 assert.equal(Object.hasOwn(moved.keys,'y'),false);
 assert.equal(atTime(moved,5).x,atTime(original,5).x+120);
 assert.equal(atTime(moved,5).y,original.y+70);
 assert.equal(atTime(moved,.1).x,atTime(original,.1).x+120);
 assert.deepEqual(moved.keys.opacity,original.keys.opacity);
 assert.doesNotThrow(()=>timelineKeyframes(moved).map(frame=>frame.time));
 project.scenes[0].layers=project.scenes[0].layers.map(l=>l.id===moved.id?moved:l);
 assert.doesNotThrow(()=>validateProject(project));
 assert.doesNotThrow(()=>validateProject(JSON.parse(JSON.stringify(project))));
});

test('repeated dragging of a new static shape never creates animation tracks',()=>{
 const original=layer('rect'),moved=moveLayer(moveLayer(original,300,400),450,500);
 assert.deepEqual(moved.keys,{});
 assert.deepEqual(timelineKeyframes(moved),[]);
 assert.equal(layerSchema.parse(moved).x,450);
 assert.equal(original.x,180);
});

test('timeline and subsequent moves tolerate the absent tracks produced by the old drag handler',()=>{
 const original=defaultProject().scenes[0].layers[0];
 const oldState={...original,keys:{...original.keys,y:undefined}};
 assert.equal(timelineKeyframes(oldState).length,4);
 assert.doesNotThrow(()=>layerSchema.parse(moveLayer(oldState,200,800)));
});
