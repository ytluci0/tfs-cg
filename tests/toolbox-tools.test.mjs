import {test} from 'node:test';
import assert from 'node:assert/strict';
import {brushLayer,fillLayer,marqueePolygon,mergeSelection,polygonsOverlap,shapeFromDrag} from '../lib/toolbox-tools.ts';
import {layer,defaultProject,validateProject} from '../lib/studio-model.ts';
const valid=l=>{const p=defaultProject();p.scenes[0].layers=[l];return validateProject(p);};
test('marquee hit tests intersection, enclosure and ellipse corners',()=>{
 const region=marqueePolygon({x:0,y:0},{x:100,y:100});
 assert.ok(polygonsOverlap(region,marqueePolygon({x:90,y:20},{x:120,y:50})));
 assert.equal(polygonsOverlap(region,marqueePolygon({x:90,y:20},{x:120,y:50}),true),false);
 assert.ok(polygonsOverlap(region,marqueePolygon({x:20,y:20},{x:40,y:40}),true));
 assert.equal(polygonsOverlap(marqueePolygon({x:0,y:0},{x:100,y:100},true),marqueePolygon({x:0,y:0},{x:5,y:5})),false);
 assert.ok(polygonsOverlap([{x:-10,y:50},{x:50,y:-10},{x:110,y:50},{x:50,y:110}],region));
});
test('add and subtract layer selections preserve ordering and uniqueness',()=>{
 assert.deepEqual(mergeSelection(['a'],['b','a'],'add'),['a','b']);
 assert.deepEqual(mergeSelection(['a','b'],['a'],'subtract'),['b']);
 assert.deepEqual(mergeSelection(['a'],['b'],'replace'),['b']);
});
test('new shapes are editable native layers and survive validation',()=>{
 for(const kind of ['rounded-rect','triangle','star','regular-polygon']){const l=shapeFromDrag(kind,{x:300,y:300},{x:100,y:100},true,'#ff2233',6,.4);valid(l);assert.equal(l.color,'#ff2233');assert.ok(l.width>0&&l.height>0);if(kind==='star')assert.equal(l.visual.points.length,12);if(kind==='triangle')assert.equal(l.visual.points.length,3);}
});
test('long brush strokes stay bounded, editable and retain endpoints',()=>{
 const points=Array.from({length:2000},(_,i)=>({x:i/2,y:100+Math.sin(i/10)*30})),l=brushLayer(points,'#123456',20,.6,.5);valid(l);assert.equal(l.visual.closed,false);assert.equal(l.visual.fill,'none');assert.equal(l.visual.strokeWidth,20);assert.equal(l.opacity,.6);assert.ok(l.visual.points.length<=100);assert.equal(l.visual.points[0].x,0);assert.equal(l.visual.points.at(-1).x,1);
 const dot=brushLayer([{x:50,y:60}],'#123456',12,1);valid(dot);assert.equal(dot.type,'ellipse');assert.equal(dot.x,44);
});
test('fill tools preserve masks, effects, animation and bindings',()=>{
 const original=layer('rect',{color:'{{color}}',keys:{x:[{time:0,value:20,easing:'linear'}]},visual:{blur:3,clipLayer:'clip'},effects:[]});
 const result=fillLayer(original,'#ff0000',{end:'#0000ff',angle:90,kind:'linear'});assert.equal(original.color,'{{color}}');assert.deepEqual(result.keys,original.keys);assert.equal(result.visual.blur,3);assert.equal(result.visual.clipLayer,'clip');assert.equal(result.visual.gradientStops.length,2);
 assert.throws(()=>fillLayer({...original,locked:true},'#000000'),/Unlock/);
 assert.throws(()=>fillLayer(layer('image'),'#000000'),/shapes and text/);
 assert.equal(fillLayer(layer('line'),'#ff0000').visual.stroke,'#ff0000');
});
