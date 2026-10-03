import {inspectorCategory} from './inspector-test-tools.mjs';
import assert from 'node:assert/strict';
import {writeFileSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {psdFixture,largePsdFixture} from '../tests/fixtures/psd.mjs';

export async function psdSmoke({studio,dialog,js,api,reload,capture,checks,sleep,until,project,directory,getOutput}){
 const file=join(directory,'Phase6-fixture.psd');writeFileSync(file,largePsdFixture());assert.ok(statSync(file).size>100_000_000);
 const picker=dialog.showOpenDialog;dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});
 const click=text=>js(`[...document.querySelectorAll('button')].find(b=>b.textContent===${JSON.stringify(text)}).click()`);
 try{
  const before=(await api('/api/projects/'+project.id)).value,programBefore=(await api('/api/program')).value;
  await js("document.querySelector('[role=tab][value=design]')?.click()");
  await click('Import PSD');await until(()=>js("document.querySelector('.psd-comparison')!==null"));
  assert.equal(await js("document.querySelector('.psd-dialog').open"),true);
  assert.ok(await js("document.querySelector('.psd-fonts').innerText.includes('Checked against fonts')"));
  await capture('psd-import-review.png');
  await js(`(()=>{const s=document.querySelector('[aria-label="PSD import mode"]');s.value='pixels';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);await sleep(100);
  const pixels=await js(`(async()=>{const svg=document.querySelector('.psd-preview svg').cloneNode(true);svg.setAttribute('width','640');svg.setAttribute('height','360');const image=new Image();image.src='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(new XMLSerializer().serializeToString(svg))));await image.decode();const c=document.createElement('canvas');c.width=640;c.height=360;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);const actual=ctx.getImageData(0,0,640,360).data;ctx.clearRect(0,0,640,360);ctx.drawImage(document.querySelector('.psd-preview img'),0,0,640,360);const expected=ctx.getImageData(0,0,640,360).data;let mismatch=0;for(let i=0;i<actual.length;i++)if(actual[i]!==expected[i])mismatch++;return mismatch;})()`);
  assert.equal(pixels,0,'Saved-layer-pixel preview matches the saved composite fixture');
  await click('Cancel');assert.equal((await api('/api/projects/'+project.id)).value.revision,before.revision);
  await click('Import PSD');await until(()=>js("document.querySelector('.psd-comparison')!==null"));await click('Add scene to project');await until(()=>js("!document.querySelector('.psd-dialog')?.open"));
  const result=(await api('/api/projects/'+project.id)).value,scene=result.project.scenes.at(-1);assert.equal(scene.name,'Phase6-fixture');assert.equal(scene.layers.find(l=>l.name==='Presenter').type,'text');assert.equal(scene.layers.find(l=>l.name==='Presenter').fontFamily,'Arial');assert.equal(scene.groups.length,1);assert.equal((await api('/api/program')).value.revision,programBefore.revision);
  await click('PSD reference');assert.equal(await js("!!document.querySelector('.psd-saved-reference')"),true);await click('Show design');
  await js("[...document.querySelectorAll('.layer-select')].find(b=>b.textContent.includes('Presenter')).click()");
  await inspectorCategory(js,sleep,'Style');await js(`(()=>{const el=document.querySelector('.inspector .layer-text-content');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,'EDITED LOCALLY');el.dispatchEvent(new Event('input',{bubbles:true}));})()`);await click('Save');await sleep(250);
  let saved=(await api('/api/projects/'+project.id)).value;assert.equal(saved.project.scenes.at(-1).layers.find(l=>l.name==='Presenter').text,'EDITED LOCALLY');
  await capture('psd-import-designer.png');
  await reload();saved=(await api('/api/projects/'+project.id)).value;assert.equal(saved.project.scenes.at(-1).importReport.format,'psd');
  const take=await api('/api/program',{projectId:project.id,scene:saved.project.scenes.at(-1),variables:saved.project.variables,mode:'show'});assert.equal(take.status,200);assert.ok(await getOutput().webContents.executeJavaScript("document.querySelector('svg').textContent.includes('EDITED LOCALLY')"));
  studio.setSize(1100,740);await sleep(200);await click('Import PSD');await until(()=>js("document.querySelector('.psd-comparison')!==null"));await capture('psd-import-compact.png');
  assert.ok(await js("(()=>{const d=document.querySelector('.psd-dialog');return d.scrollWidth<=d.clientWidth+1&&d.getBoundingClientRect().height<=innerHeight;})()"));await click('Cancel');
  checks.push('PSD over 100 MB + worker + native picker: review, installed fonts, cancel, zero-difference pixel fixture, atomic scene import, editable text, persistence and native output');
  writeFileSync(file,Buffer.from('invalid PSD'));await click('Import PSD');await until(()=>js("!!document.querySelector('.psd-dialog [role=alert]')"));const error=await js("document.querySelector('.psd-dialog [role=alert]').textContent");assert.match(error,/valid Photoshop PSD/);assert.ok(!error.includes('remote method'));assert.ok(await js("document.querySelector('.psd-empty').textContent.includes('2 GB')"));await click('Cancel');
  checks.push('PSD format error is readable in the import dialog; source-size guidance matches the 2 GB parser limit');
 }finally{dialog.showOpenDialog=picker;}
}
