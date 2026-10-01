import {app} from 'electron';
import {createOutputController} from './output-controller.cjs';
import {createNdiController} from './ndi-controller.cjs';
import {detectNdi} from './ndi-config.cjs';
import {defaultProject,layer} from '../lib/studio-model.ts';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';

async function main(){
const root=process.argv[2],seconds=Number(process.argv[3]||30),width=Number(process.argv[4]||1280),height=width*9/16,desktop=join(root,'desktop'),cache=join(desktop,'.cache'),directory=join(cache,'ndi-qa-'+Date.now());mkdirSync(directory,{recursive:true});app.setPath('userData',directory);app.on('window-all-closed',()=>{});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
await app.whenReady();
let nativeWorker,program=null,receiver,report={ok:false,checks:[],width,height,seconds,time:new Date().toISOString()},probeLines=[];
const bridge=createOutputController({directory,appDirectory:desktop,executable:process.execPath,readProgram:async()=>program,readAsset:async()=>new Response('',{status:404}),settings:{get:()=>null,set:()=>{}},protect:x=>Buffer.from(x),unprotect:x=>x.toString()});
const ndi=createNdiController({bridge,helper:join(desktop,'assets','BroadcastCGNdi.exe'),spawnWorker:(...args)=>{nativeWorker=spawn(...args);return nativeWorker;}});
const scene=defaultProject().scenes[0];scene.layers=[layer('rect',{x:760,y:340,width:400,height:400,color:'#e02040',opacity:.5})];scene.duration=Math.max(20,seconds+10);
for(let i=0;i<32;i++)scene.layers.push(layer('rect',{x:100+i*12,y:30+i*8,width:80,height:6,color:i%2?'#00d4c8':'#f6bd3e',keys:{x:Array.from({length:Math.ceil(scene.duration/2)+1},(_,n)=>({time:Math.min(scene.duration,n*2),value:n%2?1300-i*12:100+i*12,ease:'linear'}))}}));
function value(mode='show'){return{revision:randomUUID(),projectId:'ndi-qualification',scene,variables:{},mode,startedAt:Date.now()};}
async function take(mode){program=value(mode);await ndi.publish(program);return program;}
function receive(duration){probeLines=[];receiver=spawn(join(cache,'NdiProbe.exe'),[detectNdi().path,ndi.info().source,String(duration)],{windowsHide:true,stdio:['ignore','pipe','pipe']});createInterface({input:receiver.stdout}).on('line',line=>{try{probeLines.push(JSON.parse(line));}catch{}});return new Promise((resolve,reject)=>{receiver.once('error',reject);receiver.once('exit',code=>code===0?resolve(probeLines):reject(Error('NDI probe failed: '+JSON.stringify(probeLines))));});}
async function waitFor(predicate,timeout=12000){const end=Date.now()+timeout;while(Date.now()<end){if(predicate())return;await delay(50);}throw Error('Qualification condition timed out: '+JSON.stringify(probeLines.slice(-2)));}
try{
 execFileSync('C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe',['/nologo','/optimize+','/platform:x64','/target:exe','/main:NdiProbe','/out:'+join(cache,'NdiProbe.exe'),'/reference:System.Web.Extensions.dll',join(desktop,'ndi-native.cs'),join(desktop,'ndi-probe.cs')],{windowsHide:true});
 await ndi.start({source:'BroadcastCG QA '+Date.now(),width,height,fps:50,port:17824,background:'transparent'});assert.ok(ndi.info().ready);report.source=ndi.info().source;report.runtime=ndi.info().runtime;
 let received=receive(seconds);await waitFor(()=>probeLines.some(x=>x.type==='frame'));assert.equal(probeLines.find(x=>x.type==='frame').corner[3],0);
 await take();await waitFor(()=>probeLines.some(x=>x.type==='frame'&&x.center[3]>100));let colored=probeLines.find(x=>x.type==='frame'&&x.center[3]>100);
 assert.equal(colored.width,width);assert.equal(colored.height,height);assert.equal(colored.fpsN,50);assert.equal(colored.fpsD,1);assert.ok(Math.abs(colored.center[3]-128)<=3,JSON.stringify(colored));for(const [i,v] of [64,32,224,128].entries())assert.ok(Math.abs(colored.center[i]-v)<8,JSON.stringify(colored));assert.equal(colored.corner[3],0);report.alphaFrame=colored;report.checks.push('Independent NDI receiver gets correct dimensions, rate, transparency and straight-alpha color');
 const mark=probeLines.length;await take('hide');await waitFor(()=>probeLines.slice(mark).some(x=>x.type==='frame'&&x.center[3]===0));report.checks.push('HIDE reaches the independent NDI receiver as transparent video');
 await take();await received;report.firstProbe=probeLines.at(-1);report.distinctSamples=new Set(probeLines.filter(x=>x.type==='frame').map(x=>x.sampleHash)).size;assert.ok(report.distinctSamples>5);assert.equal(report.firstProbe.dropped,0);report.checks.push('Animated scene produces changing decoded samples with zero receiver queue drops');
 const reconnected=receive(10);await waitFor(()=>probeLines.some(x=>x.type==='frame'&&x.center[3]>100));await reconnected;report.reconnectProbe=probeLines.at(-1);report.checks.push('A new receiver reconnects to the current graphic without replaying TAKE');
 report.sender=ndi.info();report.renderer=bridge.info().status.telemetry;if(seconds>=60){assert.ok(report.sender.replaced<seconds*3,'Excessive paint replacement');assert.ok(report.sender.health.frames-report.sender.health.repeated>report.sender.health.frames*.9,'Excessive animation repetition');}assert.ok(report.sender.health.frames>seconds*40);await ndi.stop();await assert.rejects(()=>ndi.publish(value()),/not ready/);report.checks.push('Stopped NDI rejects TAKE without falling back to desktop');
 await ndi.start({source:'BroadcastCG QA restart',width,height,fps:50,port:17824,background:'transparent'});const restarted=receive(10);await restarted;assert.ok(probeLines.filter(x=>x.type==='frame').every(x=>x.center[3]===0));report.checks.push('Manual restart starts transparent and does not replay the previous program');
 nativeWorker.kill();await waitFor(()=>!ndi.info().ready);await assert.rejects(()=>ndi.publish(value()),/sender stopped|not ready|pipe disconnected/);report.checks.push('Native sender failure marks output unavailable and rejects TAKE without retry');
 report.ok=true;
}catch(e){report.error=e.stack;console.error(e);}finally{receiver?.kill();await ndi.stop();bridge.dispose();writeFileSync(join(cache,'phase11-ndi-'+width+'.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));app.exit(report.ok?0:1);}

}
main().catch(e=>{console.error(e);app.exit(1);});
