import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {decode} from 'fast-png';
import {convertPsd} from './psd-import.mjs';
import {psdScene} from '../lib/psd-model.ts';
if(!process.argv[2])throw Error('Supply the directory produced by prepare-psd-host-tests.mjs.');
const directory=resolve(process.argv[2]),report=JSON.parse(readFileSync(join(directory,'host-report.json'),'utf8').replace(/^\uFEFF/,''));
assert.equal(report.application,'Adobe Photoshop');assert.equal(report.complete,true,report.error);assert.ok(report.version&&!/mock|simulated/i.test(report.version));
assert.deepEqual(report.cases.map(c=>c.name),['PSD-QA-Clouds','PSD-QA-Solarize']);
function rgba(bytes){const p=decode(bytes);assert.equal(p.depth,8);assert.ok(p.channels===3||p.channels===4);const data=new Uint8Array(p.width*p.height*4);for(let i=0;i<p.width*p.height;i++){for(let c=0;c<3;c++)data[i*4+c]=p.data[i*p.channels+c];data[i*4+3]=p.channels===4?p.data[i*4+3]:255;}return{width:p.width,height:p.height,data};}
function samePixels(actual,expected,label){assert.equal(actual.width,expected.width,label+' width');assert.equal(actual.height,expected.height,label+' height');let mismatches=0,maxError=0;for(let i=0;i<actual.data.length;i++){const error=Math.abs(actual.data[i]-expected.data[i]);if(error)mismatches++;maxError=Math.max(maxError,error);}assert.equal(mismatches,0,label+': mismatched channels '+mismatches+', max error '+maxError);return{mismatchedChannels:mismatches,maxChannelError:maxError};}
const checks=[];
for(const c of report.cases){
 assert.equal(c.passed,true,c.error);assert.equal(c.file,c.name+'.psd');assert.equal(c.reference,c.name+'.png');assert.equal(c.before,c.name+'-before.png');
 const reference=rgba(readFileSync(join(directory,c.reference))),before=rgba(readFileSync(join(directory,c.before)));
 assert.equal(reference.width,640);assert.equal(reference.height,360);let changed=0;for(let i=0;i<reference.data.length;i+=4)if([0,1,2,3].some(k=>reference.data[i+k]!==before.data[i+k]))changed++;
 assert.ok(changed>1000,c.filter+' must visibly change the artwork');
 const draft=convertPsd(readFileSync(join(directory,c.file)),c.file),image=src=>rgba(draft.assets.find(a=>'/api/assets/'+a.id===src).bytes);
 const composite=psdScene(draft,{mode:'composite',fonts:{},fontStatus:'checked',missingFonts:[]});assert.equal(composite.layers.length,1);
 const compositePixels=samePixels(image(composite.layers[0].src),reference,c.name+' saved composite');
 const pixels=psdScene(draft,{mode:'pixels',fonts:{},fontStatus:'checked',missingFonts:[]});assert.equal(pixels.layers.length,1);const l=pixels.layers[0];assert.equal(l.type,'image');assert.equal(l.x,0);assert.equal(l.y,0);assert.equal(l.opacity,1);
 const layerPixels=samePixels(image(l.src),reference,c.name+' saved layer');
 checks.push({filter:c.filter,changedPixels:changed,compositePixels,layerPixels,warnings:draft.warnings});
}
const result={ok:true,application:report.application,version:report.version,time:new Date().toISOString(),checks,scope:'Actual Photoshop filter output survives PSD conversion as raster pixels. No editable filter parameters or third-party plugin qualification. Native UI/output qualification is separate.'};
writeFileSync(join(directory,'pixel-verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
