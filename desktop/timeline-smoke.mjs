import assert from 'node:assert/strict';
import {layer} from '../lib/studio-model.ts';
export async function timelineSmoke({studio,js,api,reload,capture,checks,sleep,until,project}){
 const original=(await api('/api/projects/'+project.id)).value.project,p=structuredClone(original);
 p.scenes[0].duration=5;p.scenes[0].layers=[layer('rect',{id:'timeline-box',name:'Timeline plate',x:100,y:180,width:600,height:260,color:'#245888'}),layer('text',{id:'timeline-text',name:'Timeline headline',x:140,y:250,text:'PROPERTY TRACKS',fontSize:70})];
 const read=async()=>(await api('/api/projects/'+p.id)).value;
 const put=async value=>{const r=await api('/api/projects',{project:value,revision:(await read()).revision});assert.equal(r.status,200,JSON.stringify(r));};
 const click=async selector=>{await js(`document.querySelector(${JSON.stringify(selector)}).click()`);await sleep(100);};
 const number=async(label,value)=>{const selector=`[aria-label="${label}"]`;await js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await sleep(30);await js(`document.querySelector(${JSON.stringify(selector)}).blur()`);await sleep(80);};
 const save=async()=>{await click('.projectbar button:last-of-type');await until(()=>js("document.querySelector('.statusbar').textContent.includes('Saved')"));};
 await put(p);await reload();await js("[...document.querySelectorAll('[role=tab]')].find(b=>b.textContent.trim()==='Animate').dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}))");await sleep(180);await click('.scene-item');
 await click('[aria-label="Expand Timeline plate animation"]');assert.equal(await js("document.querySelectorAll('[data-timeline-layer=timeline-box] [data-timeline-property]').length"),10);
 await number('Timeline time',0);await click('[aria-label="Enable Timeline plate Position X animation"]');await number('Timeline time',1);await number('Timeline plate Position X value',400);await save();
 let saved=(await read()).project.scenes[0];assert.deepEqual(saved.layers[0].keys.x.map(k=>[k.time,k.value]),[[0,100],[1,400]]);
 await number('Timeline time',.5);assert.equal(await js("Number(document.querySelector('[aria-label=\"Timeline plate Position X value\"]').value)"),250);
 assert.ok(await js("document.querySelector('.canvas-stage [data-layer-id=timeline-box]').getAttribute('transform').includes('250')"));
 await click('[aria-label="Add Timeline plate Position X key at playhead"]');await click('[aria-label="Remove Timeline plate Position X key at playhead"]');await save();assert.equal((await read()).project.scenes[0].layers[0].keys.x.length,2);
 checks.push('Expanded timeline property tracks enable animation, auto-key values at the playhead, interpolate the canvas, and add/remove keys directly');
 // Use native mouse events to move the selected key one second on its actual lane.
 await click('[aria-label="Next Timeline plate Position X key"]');
 const geometry=await js("(()=>{const e=document.querySelector('[data-track-layer=timeline-box][data-track-property=x]');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:Math.round(r.left+r.width/5),y:Math.round(r.top+r.height/2),dx:Math.round(r.width/5)};})()");
 studio.show();studio.focus();studio.webContents.sendInputEvent({type:'mouseDown',x:geometry.x,y:geometry.y,button:'left',clickCount:1});studio.webContents.sendInputEvent({type:'mouseMove',x:geometry.x+geometry.dx,y:geometry.y,button:'left'});await sleep(100);studio.webContents.sendInputEvent({type:'mouseUp',x:geometry.x+geometry.dx,y:geometry.y,button:'left',clickCount:1});await sleep(150);await save();
 saved=(await read()).project.scenes[0];assert.ok(Math.abs(saved.layers[0].keys.x[1].time-2)<.02,JSON.stringify(saved.layers[0].keys.x));
 await click('[aria-label="Undo"]');await save();assert.equal((await read()).project.scenes[0].layers[0].keys.x[1].time,1);await click('[aria-label="Redo"]');await save();
 await number('Timeline time',0);await click('[aria-label="Next Timeline plate Position X key"]');await js("(()=>{const e=document.querySelector('[aria-label=\"Timeline selected easing\"]');e.value='smooth';e.dispatchEvent(new Event('change',{bubbles:true}));})()");await sleep(80);await save();assert.equal((await read()).project.scenes[0].layers[0].keys.x[1].ease,'smooth');
 checks.push('Native timeline key drag snaps to frames, persists, and supports Undo/Redo and selected-key easing');
 await click('[aria-label="Expand Timeline headline animation"]');await number('Timeline time',0);await click('[aria-label="Enable Timeline headline Opacity animation"]');await number('Timeline time',1);await number('Timeline headline Opacity value',30);await save();assert.equal((await read()).project.scenes[0].layers[1].keys.opacity[1].value,.3);
 await click('[data-track-layer=timeline-text][data-track-property=opacity] [data-key-time="1"]');await js("[...document.querySelectorAll('.tl-editbar button')].find(b=>b.textContent==='Copy').click()");await number('Timeline time',2.5);await js("[...document.querySelectorAll('.tl-editbar button')].find(b=>b.textContent==='Paste').click()");await sleep(100);await save();assert.equal((await read()).project.scenes[0].layers[1].keys.opacity.length,3);
 await click('[aria-label="Lock Timeline headline in timeline"]');assert.equal(await js("document.querySelector('[aria-label=\"Timeline headline Opacity value\"]').disabled"),true);await click('[aria-label="Unlock Timeline headline in timeline"]');
 await js("(()=>{const e=document.querySelector('[aria-label=\"Timeline headline Opacity value\"]');e.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'80');e.dispatchEvent(new Event('input',{bubbles:true}));})()");await sleep(40);await js("document.querySelector('[aria-label=\"Timeline headline Opacity value\"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");await save();assert.equal((await read()).project.scenes[0].layers[1].keys.opacity[2].value,.3);
 await click('[aria-label="Zoom timeline in"]');assert.ok(await js("document.querySelector('.tl-scroll').scrollWidth>document.querySelector('.tl-scroll').clientWidth"));await click('[aria-label="Zoom timeline out"]');
 await js("document.querySelector('.tl-scroll').scrollTop=0");await sleep(100);await capture('timeline-expanded.png');await reload();await sleep(100);const persisted=(await read()).project.scenes[0];assert.equal(persisted.layers[0].keys.x.length,2);assert.equal(persisted.layers[1].keys.opacity[1].value,.3);
 checks.push('Timeline copy/paste, percent values, locked tracks, Escape cancels edits, horizontal zoom, layout and persistence verified');
 await put(original);await reload();
}
