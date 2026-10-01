import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {convertAe} from './ae-import.mjs';
import {atTime} from '../lib/studio-model.ts';
if(!process.argv[2])throw Error('Supply the directory produced by prepare-ae-host-tests.mjs.');
const directory=resolve(process.argv[2]),load=file=>JSON.parse(readFileSync(join(directory,file),'utf8').replace(/^\uFEFF/,'')),report=load('host-report.json'),checks=[];
assert.equal(report.application,'Adobe After Effects');assert.equal(report.complete,true,report.error);assert.ok(report.version&&!/simulated|harness|test/i.test(report.version));assert.equal(report.cases.length,3);
for(const c of report.cases){
 assert.match(c.file,/^AE-QA-[A-Za-z-]+\.bcae$/);const draft=convertAe(readFileSync(join(directory,c.file)),c.file);
 assert.equal(draft.scene.layers.length,c.expectedLayers.length,c.name+' layer count');
 for(const expected of c.expectedLayers){const l=draft.scene.layers.find(l=>l.name===expected.name);assert.ok(l,'Missing '+expected.name);for(const s of expected.samples){const actual=atTime(l,s.time);for(const [key,a,b] of [['position X',actual.x+actual.anchorX,s.position[0]],['position Y',actual.y+actual.anchorY,s.position[1]],['scale X',actual.scaleX,s.scale[0]],['scale Y',actual.scaleY,s.scale[1]],['rotation',actual.rotation,s.rotation],['opacity',actual.opacity,s.opacity]])assert.ok(Math.abs(a-b)<1e-5,expected.name+' '+key+' at '+s.time+': '+a+' vs '+b);}}
 for(const name of c.expectedSkipped)assert.ok(draft.warnings.some(w=>w.layer===name&&w.message.startsWith('Skipped:')),name+' omission must be reported');
 checks.push(c.name+': exported AE transform samples and diagnostics match imported scene');
 const references=readdirSync(directory).filter(name=>name.startsWith(c.name+'_')&&name.endsWith('.png'));
 checks.push(c.name+': '+references.length+' Adobe reference files present; visual comparison remains separate');
}
const result={ok:true,adobeVersion:report.version,time:new Date().toISOString(),checks,visualFidelity:'NOT VERIFIED by this numeric checker. Review Adobe frames against the native renderer.'};writeFileSync(join(directory,'numeric-verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
