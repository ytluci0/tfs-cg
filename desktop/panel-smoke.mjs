import assert from 'node:assert/strict';
import {control,action} from '../lib/studio-model.ts';
export async function panelSmoke({studio,js,api,reload,capture,checks,sleep,until,project}){
 const click=async(selector)=>{await js(`document.querySelector(${JSON.stringify(selector)}).click()`);await sleep(100);};
 const button=async(text,scope='document')=>{await js(`[...${scope}.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`);await sleep(100);};
 const tab=async text=>{await js(`[...document.querySelectorAll('[role=tab]')].find(b=>b.textContent.trim()===${JSON.stringify(text)}).dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}))`);await sleep(150);};
 const input=async(selector,value)=>{await js(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);await sleep(100);};
 const key=async(key,extra={})=>{await js(`document.querySelector('[aria-label="Custom control canvas"]').dispatchEvent(new KeyboardEvent('keydown',${JSON.stringify({key,bubbles:true,...extra})}))`);await sleep(100);};
 const boxes=()=>js(`[...document.querySelectorAll('[data-control-id]')].map(el=>({id:el.dataset.controlId,x:parseFloat(el.style.left),y:parseFloat(el.style.top),width:parseFloat(el.style.width),height:parseFloat(el.style.height)}))`);
 const saved=()=>api('/api/projects/'+project.id);
 async function save(){await button('Save',"document.querySelector('.projectbar')");await until(()=>js("document.querySelector('.statusbar').textContent.includes('Saved')"));}
 async function drag(selector,dx,dy){
  studio.show();studio.focus();await js(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'nearest',inline:'nearest'})`);await sleep(100);
  const p=await js(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()`);
  studio.webContents.sendInputEvent({type:'mouseDown',...p,button:'left',clickCount:1});await sleep(70);
  for(let i=1;i<=5;i++){studio.webContents.sendInputEvent({type:'mouseMove',x:p.x+Math.round(dx*i/5),y:p.y+Math.round(dy*i/5),button:'left'});await sleep(30);}
  studio.webContents.sendInputEvent({type:'mouseUp',x:p.x+dx,y:p.y+dy,button:'left',clickCount:1});await sleep(200);
 }
 studio.setContentSize(1440,950);studio.show();studio.focus();
 project.name='Phase 3 panel QA';project.panels=[{id:'football',name:'Production panel QA',type:'custom',columns:3,freeLayout:true,layoutVersion:2,canvasWidth:960,canvasHeight:650,controls:[
  control('Home score',[],{id:'score-home',kind:'counter',variable:'homeScore',placement:{x:32,y:32,width:260,height:180}}),
  control('Away score',[],{id:'score-away',kind:'counter',variable:'awayScore',placement:{x:340,y:32,width:260,height:180}}),
  control('Formation',[],{id:'formation',kind:'formation',variable:'homeFormation',placement:{x:32,y:280,width:260,height:130}}),
  control('Match clock',[],{id:'clock',kind:'timer',variable:'matchClock',placement:{x:340,y:280,width:320,height:180}}),
  control('Missing connection',[action('increment','missingVariable','1')],{id:'invalid',placement:{x:32,y:480,width:260,height:100}})
 ]}];
 const revision=(await saved()).value.revision;assert.equal((await api('/api/projects',{project,revision})).status,200);await reload();await until(()=>js("document.querySelector('[aria-label=\"Project name\"]').value==='Phase 3 panel QA'"));await tab('Panels');
 await until(()=>js("document.querySelectorAll('[data-control-id]').length===5"));
 assert.equal(await js("document.querySelector('[aria-label=Formation][role=combobox]').disabled"),true);
 await click('[aria-label="Select Home score"]');await js(`document.querySelector('[aria-label="Select Away score"]').dispatchEvent(new MouseEvent('click',{bubbles:true,shiftKey:true}))`);await sleep(100);
 assert.equal(await js("document.querySelectorAll('[data-selected=true]').length"),2);await button('Group',"document.querySelector('.panel-builder-toolbar')");
 assert.equal(await js("document.querySelectorAll('.panel-group-row').length"),1);await input('[aria-label="Group name"]','Match scores');
 const original=await boxes();await drag('[data-control-id="score-home"] .widget-drag-overlay',38,15);const moved=await boxes();assert.ok(moved[0].x>original[0].x);assert.equal(moved[1].x-moved[0].x,308);
 await key('z',{ctrlKey:true});assert.deepEqual(await boxes(),original);await key('z',{ctrlKey:true,shiftKey:true});assert.deepEqual(await boxes(),moved);
 await drag('[aria-label="Resize selected controls"]',25,12);const resized=await boxes();assert.ok(resized[0].width>moved[0].width);await key('z',{ctrlKey:true});assert.deepEqual(await boxes(),moved);
 await click('[aria-label="Lock group Match scores"]');assert.equal(await js("document.querySelector('[aria-label=\"Resize selected controls\"]')===null"),true);await key('ArrowRight');assert.deepEqual(await boxes(),moved);await click('[aria-label="Unlock group Match scores"]');
 await key('d',{ctrlKey:true});assert.equal((await boxes()).length,7);await key('z',{ctrlKey:true});assert.equal((await boxes()).length,5);
 await click('[aria-label="Select Home score"]');await button('Components',"document.querySelector('.panel-builder-toolbar')");await input('[aria-label="Component name"]','Match score controls');await button('Save 2 selected');await until(()=>js("document.body.innerText.includes('Saved Match score controls.')"));await capture('panels-components.png');
 await input('[aria-label="Component variable prefix"]','game2_');await button('Add Match score controls');assert.equal((await boxes()).length,7);
 await click('[aria-label="Hide Missing connection"]');await click('[aria-label="Show Missing connection"]');
 await click('.panel-touch-toggle input');await js("document.querySelector('[aria-label=\"Select Home score\"]').click()");await save();let data=(await saved()).value.project;assert.equal(data.panelComponents.length,1);assert.equal(data.variables.game2_homeScore,0);assert.equal(data.panels[0].groups.length,2);assert.equal(data.panels[0].touchMode,true);
 await capture('panels-builder.png');const contained=await js("document.querySelector('.panel-surface').getBoundingClientRect().right<=document.querySelector('.control-inspector').getBoundingClientRect().left+1");assert.ok(contained,'Canvas must not overlap the inspector');checks.push('panel multi-select/group, native drag/resize, lock, keyboard undo/redo and reusable components');
 await button('1 issues',"document.querySelector('.panel-builder-toolbar')");await until(()=>js("document.body.innerText.includes('Action refers to a missing variable')"));await capture('panels-validation.png');await js("document.querySelector('[role=dialog]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");await sleep(150);
 // Dialog dismissal through its own accessible close button if the synthetic Escape was not handled.
 if(await js("document.querySelector('[role=dialog]')!==null"))await click('[role=dialog] [data-slot=dialog-close]');
 await tab('Operate');assert.equal(await js("document.querySelector('[data-control-id=invalid] .control-build').disabled"),true);assert.equal(await js("document.querySelector('[aria-label=Formation][role=combobox]').disabled"),false);
 const clipped=await js("[...document.querySelectorAll('.counter-row,.broadcast-control')].some(el=>el.scrollWidth>el.clientWidth+1)");assert.equal(clipped,false,'Touch controls must fit inside their tiles');
 const hit=await js("(()=>{const r=document.querySelector('[data-control-id=score-home] [aria-label=\"Increase Home score\"]').getBoundingClientRect();return{width:r.width,height:r.height};})()");assert.ok(hit.width>=44&&hit.height>=44,JSON.stringify(hit));
 await click('[data-control-id=score-home] [aria-label="Increase Home score"]');assert.equal(await js("document.querySelector('[data-control-id=score-home] input').value"),'1');
 await button('Start',"document.querySelector('[data-control-id=clock]')");await sleep(3400);data=(await saved()).value.project;assert.notEqual(data.variables.matchClock,'00:00','A running clock must not prevent autosave');await button('Pause',"document.querySelector('[data-control-id=clock]')");await save();
 studio.setContentSize(1024,800);await sleep(200);await capture('panels-touch.png');const overflow=await js("document.documentElement.scrollWidth>document.documentElement.clientWidth+1");assert.equal(overflow,false);checks.push('touch targets at least 44 px; validation disables invalid controls; counter and clock operate; autosave runs during clock');
 await reload();await tab('Panels');assert.equal((await boxes()).length,7);assert.equal(await js("document.querySelectorAll('.panel-group-row').length"),2);checks.push('layout, groups, library and variable values persist through renderer restart');
 studio.setContentSize(1440,950);
}
