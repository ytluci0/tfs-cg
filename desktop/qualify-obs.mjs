// Developer qualification only. Run against the explicitly isolated portable OBS
// profile; this script never starts streaming or recording.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {connectObs} from './obs-client.mjs';
import {createBrowserOutput} from './browser-output-server.mjs';
import {layer} from '../lib/studio-model.ts';
const cache=resolve('desktop/.cache'),profile=join(cache,'obs-phase10/config/obs-studio'),credentials=JSON.parse(readFileSync(join(profile,'plugin_config/obs-websocket/config.json'),'utf8'));
assert.equal(credentials.server_port,17821);assert.equal(credentials.auth_required,true);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));async function until(fn){for(let n=0;n<120;n++){if(await fn())return;await sleep(100);}throw Error('OBS receiver readiness timed out');}
let host,obs;const report={ok:false,checks:[],samples:[],ackMs:[],startedAt:new Date().toISOString()},file=join(cache,'phase10-obs-qualification.json');
try{
 obs=await connectObs({port:17821,password:credentials.server_password});
 const before=await obs.inspect();report.obs=before.version;assert.equal((await obs.request('GetStreamStatus')).outputActive,false);assert.equal((await obs.request('GetRecordStatus')).outputActive,false);
 await obs.request('SetVideoSettings',{baseWidth:1920,baseHeight:1080,outputWidth:1920,outputHeight:1080,fpsNumerator:50,fpsDenominator:1});
 for(const input of (await obs.request('GetInputList')).inputs){if(['wasapi_input_capture','wasapi_output_capture'].includes(input.inputKind))await obs.request('SetInputMute',{inputName:input.inputName,inputMuted:true});}
 const name='BroadcastCG qualification '+Date.now(),input=name+' Source';await obs.request('CreateScene',{sceneName:name});await obs.request('SetCurrentProgramScene',{sceneName:name});
 const config={width:1920,height:1080,fps:50,port:17822,background:'transparent'},secret=randomBytes(32).toString('hex');
 host=await createBrowserOutput({root:resolve('desktop/app/browser-output'),secret,config});
 await obs.addSource({sceneName:name,inputName:input,url:host.url,config,enabled:true});await until(()=>host.status().ready);report.checks.push('OBS authenticated connection, source creation and ready receiver');
 const image=await sharp({create:{width:96,height:96,channels:4,background:'#28b8a0'}}).png().toBuffer();
 const scene={id:'qualification',name:'Broadcast output qualification',width:1920,height:1080,duration:4,layers:[
  layer('rect',{x:140,y:700,width:1450,height:210,color:'#12243b',radius:16}),
  layer('rect',{x:140,y:700,width:12,height:210,color:'#ff7926'}),
  layer('image',{x:180,y:750,width:96,height:96,src:'/api/assets/qa-image'}),
  layer('text',{x:320,y:754,width:1150,height:75,text:'BROADCAST CG  •  {{score}}',fontSize:64,fontFamily:'Arial',fontWeight:700,color:'#ffffff'}),
  layer('text',{x:323,y:835,width:1100,height:40,text:'LOCAL OUTPUT  /  TRANSPARENT GRAPHICS',fontSize:24,fontFamily:'Arial',fontWeight:400,color:'#79d5ca'}),
  ...Array.from({length:32},(_,i)=>layer('rect',{x:160+i*42,y:620,width:24,height:40,color:i%2?'#54d1b3':'#fa852f',shadow:true,keys:{y:[{time:0,value:620,ease:'linear'},{time:2,value:560+(i%5)*12,ease:'smooth'},{time:4,value:620,ease:'smooth'}]}})),
 ]};
 const media=[{id:'qa-image',type:'image/png',bytes:image}];
 let value={scene,mode:'show',startedAt:Date.now(),revision:randomUUID(),variables:{score:0}};
 report.ackMs.push((await host.publish(value,media)).ackMs);await sleep(500);
 const screenshot=async file=>{const shot=await obs.request('GetSourceScreenshot',{sourceName:input,imageFormat:'png',imageWidth:1920,imageHeight:1080});const bytes=Buffer.from(shot.imageData.split(',')[1],'base64');writeFileSync(join(cache,file),bytes);return bytes;};
 const bytes=await screenshot('phase10-obs-alpha.png'),raw=await sharp(bytes).ensureAlpha().raw().toBuffer();assert.equal(raw[3],0,'Top-left alpha');const center=(790*1920+220)*4;assert.ok(raw[center+3]>240&&raw[center+1]>100,'Embedded image rendered');report.checks.push('Real OBS source screenshot verifies transparent empty pixel and decoded embedded image');
 const bad={...value,revision:randomUUID(),scene:{...scene,layers:[...scene.layers,layer('image',{src:'/api/assets/missing',x:10,y:10})]}};
 await assert.rejects(host.publish(bad,media),/images\/fonts/);report.checks.push('Missing image returns failure instead of a rendered acknowledgement');
 value={...value,revision:randomUUID(),startedAt:Date.now()};await host.publish(value,media);
 const source=await obs.request('GetInputSettings',{inputName:input});assert.equal(source.inputSettings.fps_custom,true);assert.equal(source.inputSettings.fps,50);
 await obs.request('PressInputPropertiesButton',{inputName:input,propertyName:'refreshnocache'});await until(()=>!host.status().ready);await until(()=>host.status().ready);await sleep(300);
 assert.equal(host.status().revision,null,'Reload does not confirm a previous TAKE');value={...value,revision:randomUUID(),startedAt:Date.now()};await host.publish(value,media);report.checks.push('OBS source reload resynchronizes state without replaying or acknowledging old commands');
 const startStats=(await obs.inspect()).stats,start=performance.now(),duration=Number(process.env.BROADCASTCG_SOAK_MS||300000);let iteration=0;
 while(performance.now()-start<duration){
  value={...value,revision:randomUUID(),startedAt:Date.now(),variables:{score:++iteration}};report.ackMs.push((await host.publish(value,media)).ackMs);
  for(let n=0;n<20;n++){host.update({...value,variables:{score:iteration+'.'+n}});await sleep(250);}
  const stats=(await obs.inspect()).stats;report.samples.push({elapsedMs:Math.round(performance.now()-start),receiver:host.status(),obs:stats});
  if(iteration%6===0){writeFileSync(file,JSON.stringify(report,null,2));console.log('OBS soak: '+Math.round((performance.now()-start)/1000)+' s; '+stats.activeFps.toFixed(1)+' fps');}
 }
 const finish=(await obs.inspect()).stats;report.soak={elapsedMs:Math.round(performance.now()-start),takes:iteration,rendered:finish.renderTotalFrames-startStats.renderTotalFrames,renderSkipped:finish.renderSkippedFrames-startStats.renderSkippedFrames,encoded:finish.outputTotalFrames-startStats.outputTotalFrames,encodingSkipped:finish.outputSkippedFrames-startStats.outputSkippedFrames};
 await host.publish({...value,revision:randomUUID(),mode:'hide',startedAt:Date.now()},media);await sleep(700);const blank=await sharp(await screenshot('phase10-obs-hidden.png')).ensureAlpha().raw().toBuffer();assert.equal(blank[(800*1920+500)*4+3],0,'Hidden graphic is transparent');
 report.checks.push('HIDE clears OBS source alpha after fade; five-minute animated scene and variable-update soak');report.ok=true;
 console.log(JSON.stringify({ok:report.ok,soak:report.soak,ackMin:Math.min(...report.ackMs),ackMax:Math.max(...report.ackMs)}));
}catch(e){report.error=e.message;report.stack=e.stack;console.error(e.message);process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();writeFileSync(file,JSON.stringify(report,null,2));obs?.close();await host?.close();}
