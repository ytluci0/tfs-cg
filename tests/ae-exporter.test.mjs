import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {convertAe} from '../desktop/ae-import.mjs';
import {atTime} from '../lib/studio-model.ts';
import {aePng} from './fixtures/ae.mjs';

const script=readFileSync(new URL('../desktop/assets/BroadcastCG-AE-Export.jsx',import.meta.url),'utf8').replace(/^#target.*\r?\n/,'');
// This is a scripting-contract harness, not an Adobe runtime. Never label it as
// an AE-hosted render test. It exercises the exact distributed exporter script.
function exportFixture({unsupported=false,separated=false,expression=false,text=false,footage=false,cancel=false}={}){
 const capture={alerts:[],written:null};
 function CompItem(){}function SolidSource(){}function FootageItem(){}
 const png=aePng(),pngFile={name:'Logo.png',fsName:'Logo.png',exists:true,length:png.length,open:()=>true,read:()=>png.toString('latin1'),close:()=>{}};
 const output={name:'Motion.bcae',fsName:'Motion.bcae',open:()=>true,write:s=>{capture.written=s;return true;},close:()=>{}};
 const stat=v=>({numKeys:0,expressionEnabled:false,valueAtTime:()=>v});
 const pos={numKeys:2,expressionEnabled:expression,expressionError:'',valueAtTime:t=>[20+100*Math.pow(t-5,2),100],nearestKeyIndex:t=>t<5.5?1:2,keyTime:k=>4+k,keyOutInterpolationType:()=>0};
 if(separated){pos.dimensionsSeparated=true;pos.getSeparationFollower=n=>n===0?{...pos,valueAtTime:t=>pos.valueAtTime(t)[0]}:stat(100);}
 const transform={property:n=>({'ADBE Position':pos,'ADBE Anchor Point':stat([20,10]),'ADBE Scale':stat([150,75]),'ADBE Rotate Z':stat(30),'ADBE Opacity':stat(90)})[n]};
 const td={text:'A "quoted" title \\ test',pointText:true,applyFill:true,applyStroke:false,font:'ArialMT',fontStyle:'Regular',fontSize:30,fillColor:[1,1,1],justification:0};
 const textGroup={property:n=>n==='ADBE Text Document'?stat(td):null};
 const solid=Object.assign(new SolidSource(),{color:[1,.2,0]});
 const makeLayer=(id,threeD=false)=>({name:'Layer '+id,width:footage?40:200,height:footage?30:60,enabled:true,solo:false,guideLayer:false,nullLayer:false,inPoint:5,outPoint:6,threeDLayer:threeD,blendingMode:0,autoOrient:0,property:n=>n==='ADBE Transform Group'?transform:text&&n==='ADBE Text Properties'?textGroup:null,sourceRectAtTime:()=>({left:0,top:-25,width:180,height:35}),source:footage?Object.assign(new FootageItem(),{mainSource:{isStill:true},file:pngFile,pixelAspect:1,useProxy:false}):{mainSource:solid}});
 const comp=Object.assign(new CompItem(),{name:'Harness "composition"',width:640,height:360,pixelAspect:1,workAreaStart:5,workAreaDuration:1,duration:8,frameRate:10,numLayers:unsupported?2:1,layer:n=>makeLayer(n,unsupported&&n===1)});
 const app={project:{activeItem:comp},version:'test-harness'};
 runInNewContext(script,{app,CompItem,SolidSource,FootageItem,File:{saveDialog:()=>cancel?null:output},BlendingMode:{NORMAL:0},AutoOrientType:{NO_AUTO_ORIENT:0},KeyframeInterpolationType:{HOLD:1},ParagraphJustification:{LEFT_JUSTIFY:0,CENTER_JUSTIFY:1,RIGHT_JUSTIFY:2},alert:s=>capture.alerts.push(s)},{timeout:3000});
 return capture;
}
test('distributed AE exporter produces a valid local package from the active work area',()=>{
 const r=exportFixture(),p=JSON.parse(r.written),d=convertAe(r.written);assert.equal(p.composition.workAreaStart,5);assert.equal(p.layers[0].samples.length,11);assert.equal(d.scene.name,'Harness "composition"');assert.equal(d.scene.duration,1);assert.equal(atTime(d.scene.layers[0],.5).x,25);assert.equal(d.scene.layers[0].scaleX,1.5);assert.equal(d.scene.layers[0].rotation,30);assert.ok(r.alerts[0].includes('Exported 1 layers'));
});
test('exporter reports skipped 3D and sampled expressions while preserving separated position',()=>{
 const r=exportFixture({unsupported:true,separated:true,expression:true}),p=JSON.parse(r.written);assert.equal(p.layers.length,1);assert.ok(p.warnings.some(w=>w.message.startsWith('Skipped:')));assert.ok(p.warnings.some(w=>w.message.includes('expression results')));assert.equal(atTime(convertAe(r.written).scene.layers[0],.5).x,25);
});
test('exporter escapes text and embeds local PNG bytes without file links',()=>{
 const text=exportFixture({text:true});assert.equal(convertAe(text.written).scene.layers[0].text,'A "quoted" title \\ test');
 const image=exportFixture({footage:true}),p=JSON.parse(image.written),d=convertAe(image.written);assert.deepEqual(Buffer.from(p.assets[0].bytes,'base64'),aePng());assert.equal(d.assets.length,1);assert.equal(d.scene.layers[0].type,'image');
});
test('cancelling AE export writes no file',()=>{const r=exportFixture({cancel:true});assert.equal(r.written,null);assert.deepEqual(r.alerts,[]);});
