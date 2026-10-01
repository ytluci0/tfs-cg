import test from 'node:test';
import assert from 'node:assert/strict';
import {layer,atTime,sceneSchema} from '../lib/studio-model.ts';
import {setTimelineValue,disableTimelineTrack,moveTimelineKeys,pasteTimelineKeys,resolveTimelineKeys,deleteTimelineKeys,easeTimelineKeys} from '../lib/timeline-tools.ts';
const key=(time,value=100,ease='linear')=>({time,value,ease});
const ref=(layerId,property,time)=>({layerId,property,time});
const scene=()=>({id:'timeline',name:'Timeline',width:1920,height:1080,duration:5,layers:[layer('rect',{id:'one',x:10,y:20,keys:{x:[key(0,10),key(2,210)],y:[key(1,20),key(3,220)]}}),layer('rect',{id:'two',keys:{opacity:[key(1,0),key(4,1)]}})]});
test('timeline value editing changes fixed values until animation is enabled, then records the playhead',()=>{
 let l=layer('rect',{x:10});l=setTimelineValue(l,'x',1,20);assert.equal(l.x,20);assert.equal(l.keys.x,undefined);
 l=setTimelineValue(l,'x',1,20,true);l=setTimelineValue(l,'x',2,80);assert.deepEqual(l.keys.x,[key(1,20),key(2,80)]);assert.equal(atTime(l,1.5).x,50);
 l=setTimelineValue(l,'x',2,90);assert.equal(l.keys.x.length,2);assert.equal(l.keys.x[1].value,90);
});
test('disabling a property animation retains its evaluated playhead value and other tracks',()=>{
 const s=scene(),l=disableTimelineTrack(s.layers[0],'x',1);assert.equal(l.x,110);assert.equal(l.keys.x,undefined);assert.deepEqual(l.keys.y,s.layers[0].keys.y);
});
test('moving keys across layers/properties preserves relative offsets and clamps as one selection',()=>{
 const s=scene(),refs=[ref('one','x',0),ref('one','y',1),ref('two','opacity',4)];
 const result=moveTimelineKeys(s,refs,10);assert.deepEqual(result.selection.map(k=>k.time),[1,2,5]);assert.equal(result.scene.layers[0].keys.x[0].value,10);assert.equal(s.layers[0].keys.x[0].time,0);sceneSchema.parse(result.scene);
 assert.deepEqual(moveTimelineKeys(s,refs,-20).selection.map(k=>k.time),[0,1,4]);
});
test('alt-copy preserves original keys and destination collisions replace one key deterministically',()=>{
 const s=scene(),copied=moveTimelineKeys(s,[ref('one','x',0)],1,true);assert.deepEqual(copied.scene.layers[0].keys.x.map(k=>k.time),[0,1,2]);
 const collision=moveTimelineKeys(s,[ref('one','x',0)],2);assert.deepEqual(collision.scene.layers[0].keys.x,[key(2,10)]);
});
test('single-layer keyframes paste onto another layer and preserve property and easing',()=>{
 const s=scene();s.layers[0].keys.x[0]={...key(0,10,'bezier'),curve:[.2,.8,.2,1]};const copied=resolveTimelineKeys(s,[ref('one','x',0),ref('one','y',1)]),result=pasteTimelineKeys(s,copied,2,'two');
 assert.deepEqual(result.scene.layers[1].keys.x,[{...key(2,10,'bezier'),curve:[.2,.8,.2,1]}]);assert.equal(result.scene.layers[1].keys.y[0].time,3);assert.notEqual(result.scene.layers[1].keys.x[0].curve,copied[0].key.curve);
});
test('invalid paste is atomic and locked layers cannot be edited, moved or overwritten',()=>{
 const s=scene(),before=structuredClone(s),copied=resolveTimelineKeys(s,[ref('one','x',0),ref('two','opacity',4)]);assert.throws(()=>pasteTimelineKeys(s,copied,2),/duration/);assert.deepEqual(s,before);
 s.layers[1].locked=true;assert.throws(()=>pasteTimelineKeys(s,copied,0),/Unlock/);assert.throws(()=>moveTimelineKeys(s,[ref('two','opacity',1)],1),/Unlock/);assert.throws(()=>setTimelineValue(s.layers[1],'x',0,20),/Unlock/);
 assert.deepEqual(deleteTimelineKeys(s,[ref('two','opacity',1)]).layers[1],s.layers[1]);
});
test('selected interpolation affects only chosen keys, including the renderer hold behavior',()=>{
 const s=scene(),result=easeTimelineKeys(s,[ref('one','x',0)],'step');assert.equal(atTime(result.layers[0],1).x,10);assert.equal(result.layers[0].keys.x[1].ease,'linear');
 const curved=easeTimelineKeys(s,[ref('one','x',0)],'bezier',[.4,0,.8,1]);assert.deepEqual(curved.layers[0].keys.x[0].curve,[.4,0,.8,1]);
});
test('property values are bounded and a full key track permits replacement but rejects additions',()=>{
 let l=layer('rect');assert.equal(setTimelineValue(l,'opacity',0,10).opacity,1);assert.equal(setTimelineValue(l,'width',0,-1).width,.001);assert.throws(()=>setTimelineValue(l,'x',0,NaN),/finite/);
 l.keys.x=Array.from({length:1000},(_,i)=>key(i/200));assert.throws(()=>setTimelineValue(l,'x',5,20,true),/1000/);assert.equal(setTimelineValue(l,'x',0,30,true).keys.x.length,1000);
});
