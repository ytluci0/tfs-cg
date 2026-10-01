import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {defaultProject} from '../lib/studio-model.ts';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let n=0;n<100;n++){if(await fn())return;await sleep(100);}throw Error('Renderer readiness timed out.');}
export async function run({app,studio,openOutput,getOutput,service,directory}){
 const errors=[];studio.webContents.on('console-message',(_e,...args)=>{const d=args[0];if((typeof d==='object'&&d.level==='error')||d===3)errors.push(typeof d==='object'?d.message:args[1]);});
 await until(()=>studio.webContents.executeJavaScript("document.body.innerText.includes('LOCAL WORKSTATION')").catch(()=>false));
 assert.equal(await studio.webContents.executeJavaScript('typeof window.require'), 'undefined');
 assert.equal(await studio.webContents.executeJavaScript('typeof window.process'), 'undefined');
 const layout=await studio.webContents.executeJavaScript(`(()=>{const c=document.querySelector('.canvas-area .canvas-stage').getBoundingClientRect(),a=document.querySelector('.canvas-area').getBoundingClientRect();return {height:c.height,contained:c.top>=a.top&&c.bottom<=a.bottom+1&&c.left>=a.left&&c.right<=a.right+1};})()`);
 assert.ok(layout.height>200&&layout.contained,'Design canvas must fit inside its visible area: '+JSON.stringify(layout));
 const originalSize=studio.getSize();studio.setSize(1280,720);await sleep(150);
 const compact=await studio.webContents.executeJavaScript(`(()=>{const c=document.querySelector('.canvas-area .canvas-stage').getBoundingClientRect(),a=document.querySelector('.canvas-area').getBoundingClientRect();return {height:c.height,contained:c.top>=a.top&&c.bottom<=a.bottom+1&&c.left>=a.left&&c.right<=a.right+1};})()`);
 assert.ok(compact.height>150&&compact.contained,'Canvas must fit a smaller window: '+JSON.stringify(compact));studio.setSize(...originalSize);await sleep(100);
 const p=defaultProject();p.name='Desktop runtime QA';
 async function api(path,body){return studio.webContents.executeJavaScript(`fetch(${JSON.stringify(path)},${JSON.stringify(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})}).then(async r=>({status:r.status,value:await r.json()}))`);}
 assert.equal((await api('/api/projects',{project:p,revision:0})).status,200);
 assert.equal((await api('/api/projects/'+p.id)).value.project.name,p.name);
 assert.equal((await api('/api/program',{scene:p.scenes[0],variables:p.variables,mode:'show'})).status,503);
 openOutput();await until(()=>getOutput()&&!getOutput().webContents.isLoading());
 const take=await api('/api/program',{scene:p.scenes[0],variables:p.variables,mode:'show'});assert.equal(take.status,200,JSON.stringify(take));
 assert.equal(await getOutput().webContents.executeJavaScript('document.querySelectorAll("svg[data-testid=graphic]").length'),1);
 assert.equal((await api('/api/program')).value.revision,take.value.revision);
 await sleep(700);
 writeFileSync(join(directory,'desktop-smoke.png'),(await studio.webContents.capturePage()).toPNG());
 writeFileSync(join(directory,'output-smoke.png'),(await getOutput().webContents.capturePage()).toPNG());
 assert.equal((await api('/api/program',{scene:null,variables:{},mode:'hide'})).status,200);
 assert.deepEqual(errors,[]);
 writeFileSync(join(directory,'smoke-result.json'),JSON.stringify({ok:true,checks:['native renderer loads','Node globals inaccessible','local project save/read','offline TAKE rejected','native output render acknowledged','program revision matches','hide acknowledged','renderer console clean'],versions:process.versions,storage:service.diagnostics().database},null,2));
 // Tests close only their isolated profile, without triggering operator dialogs.
 studio.destroy();getOutput()?.destroy();app.quit();
}
