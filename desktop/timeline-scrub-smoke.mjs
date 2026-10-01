import assert from 'node:assert/strict';
import {layer} from '../lib/studio-model.ts';

export async function timelineScrubSmoke({studio,js,api,reload,capture,checks,sleep,until,project}){
 const original=(await api('/api/projects/'+project.id)).value.project,p=structuredClone(original);
 p.scenes[0].layers=[layer('rect',{id:'scrub-plate',name:'Scrub plate',x:100,y:100,width:400,height:200,opacity:.5})];
 const read=async()=>(await api('/api/projects/'+p.id)).value;
 const put=async value=>assert.equal((await api('/api/projects',{project:value,revision:(await read()).revision})).status,200);
 const click=async selector=>{await js(`document.querySelector(${JSON.stringify(selector)}).click()`);await sleep(100);};
 const save=async()=>{await click('.projectbar button:last-of-type');await until(()=>js("document.querySelector('.statusbar').textContent.includes('Saved')"));};
 const field=property=>`[aria-label="Scrub plate ${property} value"]`;
 const value=async property=>Number(await js(`document.querySelector(${JSON.stringify(field(property))}).value`));
 const number=async(label,n)=>{await js(`(()=>{const e=document.querySelector('[aria-label="${label}"]');e.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'${n}');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await sleep(40);await js(`document.querySelector('[aria-label="${label}"]').blur()`);await sleep(80);};
 const begin=async property=>{
  const point=await js(`(()=>{const e=document.querySelector(${JSON.stringify(field(property))});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};})()`);
  studio.show();studio.focus();await sleep(120);studio.webContents.sendInputEvent({type:'mouseMove',...point});studio.webContents.sendInputEvent({type:'mouseDown',...point,button:'left',clickCount:1});await sleep(50);return point;
 };
 const move=async(point,dx,modifiers=[])=>{studio.webContents.sendInputEvent({type:'mouseMove',x:point.x+dx,y:point.y,modifiers:['leftButtonDown',...modifiers]});await sleep(100);};
 const end=async(point,dx)=>{studio.webContents.sendInputEvent({type:'mouseUp',x:point.x+dx,y:point.y,button:'left',clickCount:1});await sleep(120);};
 const drag=async(property,dx,modifiers=[])=>{const point=await begin(property);await move(point,dx,modifiers);await end(point,dx);};
 await put(p);await reload();await js("[...document.querySelectorAll('.topbar [role=tab]')].find(b=>b.textContent.trim()==='Animate').dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}))");await sleep(150);await click('.scene-item');await click('[aria-label="Expand Scrub plate animation"]');await number('Timeline time',0);
 const start=await begin('Position X');await move(start,20);assert.equal(await value('Position X'),120);assert.ok(await js("document.querySelector('.canvas-stage [data-layer-id=scrub-plate]').getAttribute('transform').includes('120')"));assert.equal((await read()).project.scenes[0].layers[0].x,100,'Scrubbing must not save a partial drag');await sleep(700);await move(start,40);await end(start,40);await save();assert.equal((await read()).project.scenes[0].layers[0].x,140);
 await click('[aria-label="Undo"]');await save();assert.equal((await read()).project.scenes[0].layers[0].x,100,'One Undo restores the entire drag');await click('[aria-label="Redo"]');await save();assert.equal((await read()).project.scenes[0].layers[0].x,140);
 await drag('Position X',-10);await save();assert.equal((await read()).project.scenes[0].layers[0].x,130);
 checks.push('Native horizontal value drags preview on the canvas, commit on release, move both directions and undo as one edit');
 await drag('Position Y',10,['alt']);await save();assert.equal((await read()).project.scenes[0].layers[0].y,101);
 await drag('Position Y',10,['shift']);await save();assert.equal((await read()).project.scenes[0].layers[0].y,201);
 await drag('Scale X',20);await save();assert.equal((await read()).project.scenes[0].layers[0].scaleX,1.2);
 await drag('Rotation',15);await save();assert.equal((await read()).project.scenes[0].layers[0].rotation,15);
 await drag('Opacity',20,['shift']);await save();assert.equal((await read()).project.scenes[0].layers[0].opacity,1);
 await drag('Opacity',-20,['shift']);await save();assert.equal((await read()).project.scenes[0].layers[0].opacity,0);
 await number('Scrub plate Opacity value',50);
 checks.push('Shift/Alt precision, scale percentages, rotation and opacity limits are respected');
 await click('[aria-label="Enable Scrub plate Position X animation"]');await number('Timeline time',1);await drag('Position X',30);await save();let keys=(await read()).project.scenes[0].layers[0].keys.x;assert.deepEqual(keys.map(k=>[k.time,k.value]),[[0,130],[1,160]]);
 await drag('Position X',-10);await save();keys=(await read()).project.scenes[0].layers[0].keys.x;assert.deepEqual(keys.map(k=>[k.time,k.value]),[[0,130],[1,150]]);
 await number('Timeline time',.5);assert.equal(await value('Position X'),140);await drag('Position X',10);await save();keys=(await read()).project.scenes[0].layers[0].keys.x;assert.deepEqual(keys.map(k=>[k.time,k.value]),[[0,130],[.5,150],[1,150]]);
 checks.push('Scrubbing animated properties updates the current key or adds a key at the interpolated playhead without moving other keys');
 const cancelPoint=await begin('Position X');await move(cancelPoint,30);studio.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});studio.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});await end(cancelPoint,30);await save();assert.equal(await value('Position X'),150);assert.deepEqual((await read()).project.scenes[0].layers[0].keys.x,keys);
 const lost=await begin('Position X');await move(lost,15);await js(`document.querySelector(${JSON.stringify(field('Position X'))}).dispatchEvent(new Event('pointercancel',{bubbles:true}))`);await end(lost,15);await save();assert.equal(await value('Position X'),150);
 const blurPoint=await begin('Position X');await move(blurPoint,20);await js("window.dispatchEvent(new Event('blur'))");await end(blurPoint,20);await save();assert.equal(await value('Position X'),150);
 await click('[aria-label="Lock Scrub plate in timeline"]');assert.equal(await js(`document.querySelector(${JSON.stringify(field('Position X'))}).disabled`),true);await drag('Position X',25);await save();assert.deepEqual((await read()).project.scenes[0].layers[0].keys.x,keys);await click('[aria-label="Unlock Scrub plate in timeline"]');
 const typed=await begin('Position X');await end(typed,0);studio.webContents.sendInputEvent({type:'keyDown',keyCode:'A',modifiers:['control']});studio.webContents.sendInputEvent({type:'keyUp',keyCode:'A',modifiers:['control']});await studio.webContents.insertText('222');await sleep(80);studio.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter'});studio.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter'});await sleep(100);await save();assert.equal(await value('Position X'),222);
 await capture('timeline-scrubbing.png');await reload();assert.equal((await read()).project.scenes[0].layers[0].keys.x.find(k=>k.time===.5).value,222);
 checks.push('Escape, pointer cancellation and focus loss discard drags; locked tracks cannot scrub; click-to-type and saved keyframes survive reload');
 await put(original);await reload();
}
