import test from 'node:test';
import assert from 'node:assert/strict';
import {layer,sceneSchema} from '../lib/studio-model.ts';
import {defaultLayerMask,layerMaskSchema} from '../lib/design-schema.ts';
import {zoomCanvasAt,drawnLayer,polygonLayer,duplicateDesignLayers,deleteDesignLayers,groupDesignLayers,reorderDesignLayer} from '../lib/design-tools.ts';
import {createEditorState} from '../desktop/editor-state.cjs';
const scene=()=>({id:'design',name:'Design',width:1920,height:1080,duration:5,layers:[layer('rect',{id:'a',x:10,y:20,keys:{x:[{time:0,value:10,ease:'linear'},{time:2,value:100,ease:'linear'}]}}),layer('image',{id:'b',visual:{clipLayer:'a',layerMask:defaultLayerMask()},layout:{target:'a',gap:10,mode:'after'}})]});
test('cursor zoom preserves the exact world position with pan and clamps extremes',()=>{
 const start={scale:.4,pan:{x:20,y:-15}},p={x:210,y:82};for(const scale of [.001,.8,100]){const next=zoomCanvasAt(start,p,scale);assert.ok(next.scale>=.02&&next.scale<=16);assert.ok(Math.abs((p.x-next.pan.x)/next.scale-(p.x-start.pan.x)/start.scale)<1e-8);assert.ok(Math.abs((p.y-next.pan.y)/next.scale-(p.y-start.pan.y)/start.scale)<1e-8);}
});
test('reverse-direction shape gestures, constrained squares and line anchors preserve intended geometry',()=>{
 const box=drawnLayer('rect',{x:400,y:300},{x:100,y:200},true);assert.deepEqual([box.x,box.y,box.width,box.height],[100,0,300,300]);
 const line=drawnLayer('line',{x:100,y:200},{x:100,y:500});assert.equal(line.rotation,90);assert.equal(line.width,300);assert.deepEqual([line.anchorX,line.anchorY,line.x,line.y],[0,3,100,197]);
 const p=polygonLayer([{x:10,y:20},{x:110,y:20},{x:60,y:120}]);assert.deepEqual(p.visual.points,[{x:0,y:0},{x:1,y:0},{x:.5,y:1}]);assert.throws(()=>polygonLayer([{x:0,y:0}]),/three/);
});
test('duplication preserves independent masks, animation offsets and internal layout/clip references',()=>{
 const s=scene(),r=duplicateDesignLayers(s,['a','b']),copies=r.scene.layers.filter(l=>r.selection.includes(l.id));assert.equal(copies[0].keys.x[1].value,120);assert.equal(copies[1].visual.clipLayer,copies[0].id);assert.equal(copies[1].layout.target,copies[0].id);copies[1].visual.layerMask.density=.2;assert.equal(s.layers[1].visual.layerMask.density,1);
});
test('deleting layers removes dangling bindings and respects locks; ordering stays inside groups',()=>{
 const s=scene();s.layers.push(layer('rect',{id:'locked',locked:true}));const r=deleteDesignLayers(s,['a','locked']);assert.equal(r.layers.length,2);assert.equal(r.layers[0].visual.clipLayer,undefined);assert.equal(r.layers[0].layout,undefined);assert.equal(reorderDesignLayer(s,'a','b').layers[1].id,'a');assert.throws(()=>reorderDesignLayer(s,'locked','a'),/Unlock/);s.layers[1].groupId='g';assert.throws(()=>reorderDesignLayer(s,'a','b'),/same group/);
});
test('grouping linked layers is atomic and preserves parent transforms; partial links are rejected',()=>{
 const s=scene();assert.throws(()=>groupDesignLayers(s,['a']),/linked/);delete s.layers[1].layout;const r=groupDesignLayers(s,['a','b']);sceneSchema.parse(r);assert.equal(r.layers[0].groupId,r.layers[1].groupId);assert.equal(s.groups,undefined);s.layers[0].locked=true;assert.throws(()=>groupDesignLayers(s,['a','b']),/Unlock/);
});
test('mask data survives schema validation; malformed or unbounded strokes are rejected',()=>{
 const s=scene();delete s.layers[1].layout;s.layers[1].visual.layerMask.strokes=[{mode:'hide',size:.2,points:[{x:.1,y:.2},{x:.6,y:.7}]}];assert.deepEqual(sceneSchema.parse(s).layers[1].visual.layerMask,s.layers[1].visual.layerMask);
 assert.equal(layerMaskSchema.safeParse({...defaultLayerMask(),density:2}).success,false);assert.equal(layerMaskSchema.safeParse({...defaultLayerMask(),strokes:[{mode:'hide',size:.2,points:Array.from({length:301},()=>({x:0,y:0}))}]}).success,false);
});
test('panel positions are scoped to the account and project and reject invalid state',()=>{
 const values=new Map();let identity='local:alice';const memory=createEditorState({identity:()=>identity,settings:{get:k=>values.get(k),set:(k,v)=>values.set(k,v)}}),panel={dock:'float',hidden:false,x:50,y:60,width:250,height:320};const layout={left:230,right:290,panels:{scenes:panel,layers:panel,properties:panel},command:'TAKE'};
 const result=memory.access('design','p',layout);assert.equal(result.command,undefined);assert.deepEqual(memory.access('design','p'),result);assert.equal(memory.access('design','other'),null);identity='local:bob';assert.equal(memory.access('design','p'),null);assert.throws(()=>memory.access('design','p',{...layout,left:Infinity}),/Invalid/);assert.throws(()=>memory.access('design','p',{...layout,panels:{...layout.panels,layers:{...panel,width:10000}}}),/Invalid/);
});
