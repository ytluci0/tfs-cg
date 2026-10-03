import assert from 'node:assert/strict';
import {control,action} from '../lib/studio-model.ts';

export async function panelViewportSmoke({studio,js,api,reload,capture,checks,sleep,until,project}){
 const read=async()=>(await api('/api/projects/'+project.id)).value;
 const original=(await read()).project,size=studio.getSize(),p=structuredClone(original);
 p.panels=[{id:'football',name:'News desk · viewport QA',type:'custom',columns:3,freeLayout:true,layoutVersion:2,canvasWidth:960,canvasHeight:1800,controls:Array.from({length:33},(_,i)=>control(i===0?'Score button':'Control '+i,[action('increment','homeScore','1')],{id:'viewport-'+i,placement:{x:32+i%3*300,y:32+Math.floor(i/3)*150,width:240,height:120}}))}];
 p.panels[0].controls[2]={...p.panels[0].controls[2],kind:'counter',label:'Away points',variable:'awayScore',actions:[],minimum:0,maximum:5};
 const put=async value=>assert.equal((await api('/api/projects',{project:value,revision:(await read()).revision})).status,200);
 const click=async s=>{await js(`document.querySelector(${JSON.stringify(s)}).click()`);await sleep(150);};
 const tab=async name=>{await js(`[...document.querySelectorAll('[role=tab]')].find(b=>b.textContent.trim()===${JSON.stringify(name)}).dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}))`);await sleep(250);};
 const button=async text=>{await js(`[...document.querySelectorAll('.panel-canvas-toolbar button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`);await sleep(180);};
 const zoom=async value=>{await js(`(()=>{const e=document.querySelector('[aria-label="Panel zoom"]');e.value=${JSON.stringify(String(value))};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await sleep(220);};
 const key=async(keyCode,modifiers=[])=>{studio.webContents.sendInputEvent({type:'keyDown',keyCode,modifiers});studio.webContents.sendInputEvent({type:'keyUp',keyCode,modifiers});await sleep(170);};
 const save=async()=>{await key('s',['control']);await until(()=>js("document.querySelector('.statusbar').textContent.includes('Saved')"));return (await read()).project;};
 const metrics=()=>js(`(()=>{const v=document.querySelector('.panel-canvas-scroll'),s=document.querySelector('.free-controls'),vr=v.getBoundingClientRect(),r=s.getBoundingClientRect();return{width:v.clientWidth,height:v.clientHeight,left:vr.left,top:vr.top,canvasLeft:r.left,canvasTop:r.top,canvasWidth:r.width,scale:parseFloat(s.style.transform.slice(6)),scrollLeft:v.scrollLeft,scrollTop:v.scrollTop,scrollWidth:v.scrollWidth}})()`);
 const bounds=()=>js("[...document.querySelectorAll('[data-control-id]')].map(e=>({x:parseFloat(e.style.left),y:parseFloat(e.style.top),width:parseFloat(e.style.width),height:parseFloat(e.style.height)}))");
 const tilePoint=async selector=>{await js(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'nearest',inline:'nearest'})`);await sleep(100);return js(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`);};
 async function drag(point,dx,dy,{button='left',cancel=false,space=false}={}){
  if(space){studio.webContents.sendInputEvent({type:'keyDown',keyCode:'Space'});await sleep(80);}
  studio.webContents.sendInputEvent({type:'mouseMove',...point});studio.webContents.sendInputEvent({type:'mouseDown',...point,button,clickCount:1});await sleep(80);
  for(let i=1;i<=5;i++){studio.webContents.sendInputEvent({type:'mouseMove',x:point.x+Math.round(dx*i/5),y:point.y+Math.round(dy*i/5),modifiers:[button==='middle'?'middleButtonDown':'leftButtonDown']});await sleep(25);}
  if(cancel)await key('Escape');studio.webContents.sendInputEvent({type:'mouseUp',x:point.x+dx,y:point.y+dy,button,clickCount:1});if(space)studio.webContents.sendInputEvent({type:'keyUp',keyCode:'Space'});await sleep(180);
 }
 try{
  await put(p);await reload(p.id);await tab('Panels');await tab('Build');studio.show();studio.focus();await sleep(250);await until(()=>studio.isFocused());
  const initial=await bounds();await button('Fit width');
  for(const [width,height] of [[1280,720],[1920,1080]]){
   studio.setSize(width,height);await sleep(350);let m=await metrics();assert.ok(Math.abs(m.canvasWidth-(m.width-16))<3,JSON.stringify(m));assert.ok(m.height>150,'Canvas remains usable at '+width);assert.equal(await js('document.documentElement.scrollWidth>document.documentElement.clientWidth+1'),false);await capture('panel-viewport-'+width+'.png');
  }
  await click('[aria-label="Expand panel canvas"]');let m=await metrics();assert.ok(m.width>1800,'Expanded canvas uses whole workspace');assert.ok(m.scale>1.8,'Fit width enlarges beyond 100%');assert.ok(Math.abs(m.canvasWidth-(m.width-16))<3);await capture('panel-viewport-expanded.png');
  await button('Fill area');assert.equal(await js("document.querySelector('.free-controls').style.transform"),'scale(1)');
  assert.ok(Math.abs((await metrics()).canvasWidth-((await metrics()).width-16))<3,'Fill area covers empty workspace at normal control size');
  await capture('panel-fill-area.png');
  const fillBefore=await bounds();await drag(await tilePoint('[data-control-id=viewport-0] .widget-drag-overlay'),1100,0);
  assert.equal((await bounds())[0].x,fillBefore[0].x+1100,'Control can move into area beyond old 960px canvas');
  const fillSaved=await save();assert.ok(fillSaved.panels[0].canvasWidth>1700);assert.equal(fillSaved.panels[0].controls[0].placement.width,240);
  await key('z',['control']);assert.deepEqual(await bounds(),fillBefore);assert.deepEqual((await save()).panels,p.panels);
  checks.push('Fill area exposes the whole workspace at normal button size; dragging into the new right-hand space grows the saved canvas and undoes in one step');
  await button('100%');m=await metrics();assert.equal(m.scale,1);assert.ok(Math.abs(m.canvasLeft-m.left-(m.width-960)/2)<2,'100% canvas is centered');assert.deepEqual(await bounds(),initial);assert.deepEqual((await save()).panels,p.panels);
  checks.push('Panel canvas fills the available width at 1280×720 and 1920×1080; Canvas only uses the workspace; 100% centers without modifying saved geometry');
  await zoom(2);await js("document.querySelector('.panel-canvas-scroll').scrollTo(80,400)");await sleep(100);m=await metrics();const point={x:Math.round(m.left+m.width*.45),y:Math.round(m.top+m.height*.4)},world={x:(point.x-m.canvasLeft)/m.scale,y:(point.y-m.canvasTop)/m.scale};
  studio.webContents.sendInputEvent({type:'mouseWheel',...point,deltaY:80,deltaX:0,canScroll:true,modifiers:['control']});await sleep(250);const after=await metrics();assert.notEqual(after.scale,m.scale,'Native Ctrl-wheel zoom changes scale');assert.ok(Math.abs(after.canvasLeft+world.x*after.scale-point.x)<2&&Math.abs(after.canvasTop+world.y*after.scale-point.y)<2,'Zoom stays at pointer');
  m=await metrics();await drag(point,-65,-90,{button:'middle'});let moved=await metrics();assert.ok(moved.scrollTop>m.scrollTop+70,'Middle drag pans');assert.deepEqual(await bounds(),initial);
  await js("document.querySelector('.panel-canvas-scroll').focus()");m=await metrics();await drag(point,0,-70,{space:true});assert.ok((await metrics()).scrollTop>m.scrollTop+60,'Space drag pans');
  await click('[aria-label="Pan panel canvas"]');m=await metrics();await drag(point,0,-70,{cancel:true});assert.ok(Math.abs((await metrics()).scrollTop-m.scrollTop)<2,'Escape restores pan');assert.deepEqual((await save()).panels,p.panels);
  checks.push('Native Ctrl-wheel zoom anchors under the mouse; middle/Space/Hand panning never moves or runs controls; Escape cancels pan');
  await button('Fit width');await click('[aria-label="Restore panel sidebars"]');await zoom(1.5);const before=await bounds();m=await metrics();await drag(await tilePoint('[data-control-id=viewport-0] .widget-drag-overlay'),60,30);let positions=await bounds();if(positions[0].x!==before[0].x+40){await capture('panel-viewport-drag-failure.png');throw Error(JSON.stringify({before:before[0],after:positions[0],viewport:await metrics(),state:await js("({hand:document.querySelector('.panel-canvas-scroll').className,selected:[...document.querySelectorAll('[data-selected=true]')].map(e=>e.dataset.controlId),focus:document.activeElement.outerHTML.slice(0,300)})" )}));}assert.equal(positions[0].x,before[0].x+40);assert.equal(positions[0].y,before[0].y+20);const movedBounds=positions;
  await key('z',['control']);assert.deepEqual(await bounds(),before);await key('y',['control']);assert.deepEqual(await bounds(),movedBounds);
  await drag(await tilePoint('[aria-label="Resize selected controls"]'),45,30);positions=await bounds();assert.equal(positions[0].width,movedBounds[0].width+30);assert.equal(positions[0].height,movedBounds[0].height+20);await key('z',['control']);assert.deepEqual(await bounds(),movedBounds);
  await drag(await tilePoint('[data-control-id=viewport-0] .widget-drag-overlay'),50,30,{cancel:true});assert.deepEqual(await bounds(),movedBounds);await click('[aria-label="Lock Score button"]');await drag(await tilePoint('[data-control-id=viewport-0] .widget-drag-overlay'),50,30);assert.deepEqual(await bounds(),movedBounds);
  const saved=await save();await reload(p.id);assert.deepEqual((await read()).project.panels,saved.panels);
  // A raw QA reload can leave its earlier recovery snapshot. Use the verified saved QA fixture.
  await js("[...document.querySelectorAll('.desktop-recovery button')].find(b=>b.textContent==='Use saved project')?.click()");await sleep(150);await tab('Panels');assert.equal((await api('/api/program')).value?.scene??null,null);assert.equal((await read()).project.variables.homeScore,p.variables.homeScore);
  checks.push('Drag and resize use canvas pixels at 150%; each edit undoes/redoes, Escape cancels, locks hold, and layout survives save/reopen without TAKE');
  await tab('Operate');await button('Fit width');m=await metrics();assert.ok(m.width>1800,'Operate has no old max-width cap');assert.ok(Math.abs(m.canvasWidth-(m.width-16))<3);const b=await tilePoint('[data-control-id=viewport-0] .control-build');await capture('panel-viewport-before-operate-click.png');assert.equal(await js("document.querySelector('[data-control-id=viewport-0] .control-build').disabled"),false);studio.webContents.sendInputEvent({type:'mouseMove',...b});studio.webContents.sendInputEvent({type:'mouseDown',...b,button:'left',clickCount:1});studio.webContents.sendInputEvent({type:'mouseUp',...b,button:'left',clickCount:1});try{await until(async()=>(await read()).project.variables.homeScore===Number(p.variables.homeScore)+1);}catch(e){await capture('panel-viewport-operate-failure.png');throw Error(JSON.stringify({point:b,variables:(await read()).project.variables,body:await js('document.body.innerText.slice(-1600)'),hit:await js('document.elementFromPoint('+b.x+','+b.y+').outerHTML.slice(0,500)')}));}await until(()=>js("document.querySelector('.studio').dataset.commandBusy==='false'"));
  const baseline=(await read()).project.variables.homeScore;
  await js(`window.__panelTiles=[...document.querySelectorAll('[data-control-id]')];window.__panelFlashes=[];window.__panelWatch=new MutationObserver(()=>{for(const e of window.__panelTiles){const b=e.querySelector('.advanced-action-button');if(b&&(b.disabled||b.dataset.state==='disabled'||Number(getComputedStyle(b).opacity)<1))window.__panelFlashes.push(e.dataset.controlId);}});window.__panelWatch.observe(document.querySelector('.panel-surface'),{attributes:true,childList:true,subtree:true});`);
  await js(`(()=>{const a=document.querySelector('[data-control-id=viewport-0] .advanced-action-button'),b=document.querySelector('[data-control-id=viewport-1] .advanced-action-button');for(let i=0;i<20;i++)(i%2?a:b).click();})()`);
  await until(async()=>(await read()).project.variables.homeScore===baseline+20);await until(()=>js("document.querySelector('.studio').dataset.commandBusy==='false'"));
  assert.deepEqual(await js('window.__panelFlashes'),[],'Rapid presses never disable or dim action buttons');
  assert.equal(await js("window.__panelTiles.every(e=>e.isConnected)"),true,'Control elements are not recreated during action updates');await js('window.__panelWatch.disconnect()');
  const state=(await api('/api/commands?projectId='+p.id)).value;assert.ok(state.history.slice(0,20).every(c=>c.status==='succeeded'));assert.equal((await api('/api/program')).value?.scene??null,null);
  checks.push('Twenty rapid alternating presses execute exactly once, without disabling/dimming buttons, recreating tiles, or implicit TAKE');
  await js(`(()=>{const b=document.querySelector('[aria-label="Increase Away points"]');for(let i=0;i<12;i++)b.click();})()`);
  await until(async()=>(await read()).project.variables.awayScore===5);await until(()=>js("document.querySelector('.studio').dataset.commandBusy==='false'"));
  await js(`(()=>{const b=document.querySelector('[aria-label="Decrease Away points"]');b.click();b.click();})()`);
  await until(async()=>(await read()).project.variables.awayScore===3);await until(()=>js("document.querySelector('.studio').dataset.commandBusy==='false'"));
  assert.equal(await js("document.querySelector('[aria-label=\"Away points value\"]').value"),'3');checks.push('Rapid counter +/− presses preserve order, enforce maximum 5 and update the displayed confirmed value');
  await tab('Build');await click('.panel-touch-toggle input');await tab('Operate');assert.equal((await metrics()).scale,1);assert.equal(await js("document.querySelector('[aria-label=\"Panel zoom\"]').disabled"),true);await capture('panel-viewport-operate-touch.png');await save();
  checks.push('Operate uses the full workspace and still executes clicks; touch operation retains 100% physical control size');
 }finally{studio.setSize(...size);await put(original);await reload(project.id);}
}
