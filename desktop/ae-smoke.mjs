import {inspectorCategory} from './inspector-test-tools.mjs';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {aeFixture,aePng} from '../tests/fixtures/ae.mjs';

export async function aeSmoke({studio,dialog,js,api,reload,capture,checks,sleep,until,project,directory,getOutput}){
 const file=join(directory,'Phase7-fixture.bcae'),reference=join(directory,'Phase7-reference.png'),exporter=join(directory,'BroadcastCG-AE-Export.jsx');
 writeFileSync(file,JSON.stringify(aeFixture()));writeFileSync(reference,aePng(640,360));
 const open=dialog.showOpenDialog,save=dialog.showSaveDialog;let selected=file;
 dialog.showOpenDialog=async()=>({canceled:false,filePaths:[selected]});dialog.showSaveDialog=async()=>({canceled:false,filePath:exporter});
 const click=text=>js(`[...document.querySelectorAll('button')].find(b=>b.textContent===${JSON.stringify(text)}).click()`);
 const input=(label,value)=>js(`(()=>{const el=document.querySelector('[aria-label=${JSON.stringify(label)}]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(String(value))});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 try{
  studio.setSize(1440,1000);await sleep(200);
  const before=(await api('/api/projects/'+project.id)).value,programBefore=(await api('/api/program')).value;
  await click('Import AE');await click('Save AE exporter');await until(()=>js("document.querySelector('.ae-dialog [role=status]')!==null"));assert.ok(readFileSync(exporter,'utf8').startsWith('#target aftereffects'));
  await click('Choose AE package');await until(()=>js("document.querySelector('.ae-comparison')!==null"));assert.equal(await js("[...document.querySelectorAll('button')].find(b=>b.textContent==='Add AE scene to project').disabled"),true);
  assert.ok(await js("document.querySelector('.ae-fonts').textContent.includes('Checked against fonts')"));await capture('ae-import-review.png');
  await input('AE time seconds',1);assert.ok(await js("document.querySelector('.ae-result [data-layer-id]')?.getAttribute('transform').includes('292.5')"));
  // Independent raster assertions at a known sampled frame: orange plate at
  // x=292.5,y=85 with a 200x80 extent. No claim of Adobe-rendered reference QA.
  const pixels=await js(`(async()=>{const svg=document.querySelector('.ae-result svg').cloneNode(true);svg.setAttribute('width','640');svg.setAttribute('height','360');const im=new Image();im.src='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(new XMLSerializer().serializeToString(svg))));await im.decode();const c=document.createElement('canvas');c.width=640;c.height=360;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);return [Array.from(ctx.getImageData(350,100,1,1).data),Array.from(ctx.getImageData(250,100,1,1).data)];})()`);assert.deepEqual(pixels,[[255,120,37,255],[0,0,0,0]]);
  selected=reference;await js("[...document.querySelectorAll('.ae-dialog button')].find(b=>b.textContent.startsWith('Attach PNG')).click()");await until(()=>js("document.querySelector('.ae-reference img')!==null"));assert.equal(await js("document.querySelectorAll('[aria-label=\"AE reference time\"] option').length"),2);
  await input('AE time seconds',.5);assert.equal(await js("document.querySelector('.ae-reference img')===null"),true);await click('Play preview');await sleep(160);await click('Pause preview');assert.ok(Number(await js("document.querySelector('[aria-label=\"AE time seconds\"]').value"))>.5);
  await click('Cancel');assert.equal((await api('/api/projects/'+project.id)).value.revision,before.revision);
  selected=file;await click('Import AE');await click('Choose AE package');await until(()=>js("document.querySelector('.ae-comparison')!==null"));await input('AE time seconds',1);selected=reference;await js("[...document.querySelectorAll('.ae-dialog button')].find(b=>b.textContent.startsWith('Attach PNG')).click()");await until(()=>js("document.querySelector('.ae-reference img')!==null"));
  await js("document.querySelector('.ae-accept input').click()");await click('Add AE scene to project');await until(()=>js("!document.querySelector('.ae-dialog')?.open"));
  let saved=(await api('/api/projects/'+project.id)).value,scene=saved.project.scenes.at(-1);assert.equal(scene.importReport.format,'ae');assert.equal(scene.importReport.references.length,1);assert.equal(scene.layers[2].fontFamily,'Arial');assert.equal((await api('/api/program')).value.revision,programBefore.revision);
  await js("[...document.querySelectorAll('.layer-select')].find(b=>b.textContent.includes('Motion plate')).click()");await inspectorCategory(js,sleep,'Motion','keys');await input('Keyframe value 1',60);await input('Keyframe time 1',.05);await click('Save');await sleep(150);saved=(await api('/api/projects/'+project.id)).value;scene=saved.project.scenes.at(-1);assert.equal(scene.layers[0].keys.x[0].value,60);assert.equal(scene.layers[0].keys.x[0].time,.05);
  await js("[...document.querySelectorAll('.layer-select')].find(b=>b.textContent.includes('Presenter')).click()");await inspectorCategory(js,sleep,'Style');await js(`(()=>{const el=document.querySelector('.inspector .layer-text-content');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,'LIVE {{homeTeam}}');el.dispatchEvent(new Event('input',{bubbles:true}));})()`);await click('Save');await sleep(150);await js("[...document.querySelectorAll('.layer-select')].find(b=>b.textContent.includes('Motion plate')).click()");await inspectorCategory(js,sleep,'Motion','keys');await js("document.querySelector('.key-editor').scrollIntoView({block:'center'})");await capture('ae-keyframes-editor.png');
  saved=(await api('/api/projects/'+project.id)).value;scene=saved.project.scenes.at(-1);saved.project.panels[0].controls.push({id:'ae-qa-take',label:'AE TAKE',kind:'button',color:'#37b99c',span:1,variable:'',options:'',shortcut:'',actions:[{id:'ae-preview',type:'preview',target:scene.id,value:'',condition:''},{id:'ae-take',type:'take',target:'',value:'',condition:''}]});
  const persisted=await api('/api/projects',{project:saved.project,revision:saved.revision});assert.equal(persisted.status,200);saved=(await api('/api/projects/'+project.id)).value;
  const run=await api('/api/commands',{id:'ae-command-'+Date.now(),kind:'control',projectId:project.id,revision:saved.revision,panelId:saved.project.panels[0].id,controlId:'ae-qa-take'});assert.equal(run.status,202,JSON.stringify(run));await until(async()=>{const v=(await api('/api/commands/'+run.value.command.id)).value;return v.status==='succeeded';});
  assert.ok(await getOutput().webContents.executeJavaScript("document.querySelector('svg').textContent.includes('LIVE ')"));await reload();const restarted=(await api('/api/projects/'+project.id)).value;assert.equal(restarted.project.scenes.at(-1).layers[0].keys.x[0].time,.05);
  studio.setSize(1100,740);await click('Import AE');selected=file;await click('Choose AE package');await until(()=>js("document.querySelector('.ae-comparison')!==null"));await capture('ae-import-compact.png');assert.ok(await js("(()=>{const d=document.querySelector('.ae-dialog');return d.scrollWidth<=d.clientWidth+1&&d.getBoundingClientRect().height<=innerHeight;})()"));await click('Cancel');
  checks.push('AE native picker/worker/exporter, font review, preview raster geometry, reference attachment, cancel, atomic import, keyframe edits, variable text, custom button TAKE and restart persistence');
 }finally{dialog.showOpenDialog=open;dialog.showSaveDialog=save;}
}
