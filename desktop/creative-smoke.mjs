import {inspectorCategory} from './inspector-test-tools.mjs';
import assert from 'node:assert/strict';
import {control,action,layer} from '../lib/studio-model.ts';
export async function creativeSmoke({studio,js,api,reload,capture,checks,sleep,until,project}){
 const original=(await api('/api/projects/'+project.id)).value.project,p=structuredClone(original);
 const tab=async text=>{await js(`[...document.querySelectorAll('[role=tab]')].find(b=>b.textContent.trim()===${JSON.stringify(text)}).dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}))`);await sleep(180);};
 const click=async selector=>{await js(`document.querySelector(${JSON.stringify(selector)}).click()`);await sleep(120);};
 const button=async(text,scope='document')=>{await js(`[...${scope}.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`);await sleep(120);};
 const input=async(selector,value)=>{await js(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);await sleep(100);};
 const read=async()=>(await api('/api/projects/'+p.id)).value;
 const put=async value=>{const old=await read();const result=await api('/api/projects',{project:value,revision:old.revision});assert.equal(result.status,200,JSON.stringify(result));};
 const idle=async()=>until(()=>js("document.querySelector('.studio').dataset.commandBusy==='false'"));
 async function save(){await button('Save',"document.querySelector('.projectbar')");await until(()=>js("document.querySelector('.statusbar').textContent.includes('Saved')"));}
 const src=await js(`(async()=>{const c=document.createElement('canvas');c.width=c.height=100;const ctx=c.getContext('2d');ctx.fillStyle='#00bbcc';ctx.fillRect(0,0,100,100);ctx.fillStyle='#ff9900';ctx.fillRect(50,0,50,100);const blob=await new Promise(r=>c.toBlob(r));return (await (await fetch('/api/assets',{method:'POST',headers:{'Content-Type':'image/png','X-File-Name':'creative-test.png'},body:blob})).json()).url;})()`);
 p.scenes[0].layers=[layer('rect',{id:'creative-bg',name:'Gradient plate',x:120,y:140,width:1000,height:350,color:'#176cb2',visual:{fill:'linear',gradientColor:'#152741',stroke:'#50dcff',strokeWidth:4,glow:2},shadow:true}),layer('text',{id:'creative-text',name:'Fitted headline',x:180,y:230,width:520,height:95,text:'A VERY LONG LIVE BROADCAST PLAYER NAME',fontSize:85,visual:{autoFit:true},keys:{x:[{time:0,value:120,ease:'bezier',curve:[.2,.8,.2,1]},{time:1,value:180,ease:'linear'}]}}),layer('image',{id:'creative-image',x:750,y:210,width:180,height:180,src,visual:{mask:'ellipse',cropZoom:1.5}}),layer('arrow',{id:'creative-arrow',x:120,y:580,width:500,height:100,color:'#ffa030'}),layer('path',{id:'creative-path',x:850,y:540,width:200,height:150,visual:{points:[{x:0,y:1},{x:.5,y:0},{x:1,y:1}],fill:'radial',gradientColor:'#2244aa'}})];
 p.scenes[0].cues=[{id:'intro',name:'Intro',start:0,end:1,loop:false,finish:'hold'},{id:'loop',name:'Hold',start:0,end:1,loop:true,finish:'hold'}];
 p.variables={...p.variables,homeScore:0,awayScore:0,armed:true,selectedPlayer:'',playerPhoto:'',homePossession:65};p.players[0].photo=src;
 p.panels=[{id:'football',name:'Creative control QA',type:'custom',columns:3,freeLayout:true,canvasWidth:960,canvasHeight:680,controls:[
 control('HOME {{homeScore}}',[action('increment','homeScore','1')],{id:'hold-score',appearance:{background:'#235091',radius:24,borderColor:'#53d2ff',borderWidth:3,icon:'+'},stateStyles:{pressed:{background:'#d45c16'},live:{background:'#147854'},disabled:{background:'#333333'}},liveWhen:{mode:'all',rules:[{variable:'armed',operator:'eq',value:true}]},events:{hold:[action('increment','homeScore','1'),action('delay','','350')],release:[action('increment','awayScore','1')]},holdDelay:250,holdRepeat:100,placement:{x:20,y:20,width:280,height:130}}),
 control('Players',[],{id:'player-choice',kind:'roster',variable:'selectedPlayer',selectionBindings:{name:'playerName',number:'playerNumber',photo:'playerPhoto'},placement:{x:330,y:20,width:360,height:320}}),
 control('Possession',[],{id:'progress',kind:'progress',variable:'homePossession',minimum:0,maximum:100,placement:{x:20,y:180,width:280,height:120}}),
 control('Unavailable',[action('increment','homeScore','99')],{id:'disabled',enabledWhen:{mode:'all',rules:[{variable:'armed',operator:'eq',value:false}]},placement:{x:20,y:340,width:280,height:110}}),
 control('Invisible',[],{id:'hidden',visibleWhen:{mode:'all',rules:[{variable:'armed',operator:'eq',value:false}]},placement:{x:20,y:480,width:280,height:100}})
 ]}];
 await put(p);await reload();await tab('Design');
 await js("document.querySelector('.scene-item').click()");await sleep(200);
 assert.equal(await js("document.querySelectorAll('#editor-creative-bg-fill stop').length"),2);
 assert.equal(await js("document.querySelector('[data-layer-id=creative-image] image').getAttribute('width')"),'270');
 assert.ok(await js("document.querySelector('#editor-creative-image-mask ellipse')!==null"));
 const fit=await js("(()=>{const t=document.querySelector('#editor-creative-text-mask').closest('[data-layer-id]').querySelector('text');return{width:t.getBBox().width,size:Number(t.getAttribute('font-size'))};})()");assert.ok(fit.width<=521&&fit.size<85,JSON.stringify(fit));
 await js("[...document.querySelectorAll('.layer-select')].find(b=>b.textContent.includes('Fitted headline')).click()");await sleep(100);
 await inspectorCategory(js,sleep,'Style');await input('[aria-label="Outline width"]','3');await save();assert.equal((await read()).project.scenes[0].layers.find(l=>l.id==='creative-text').visual.strokeWidth,3);
 await capture('creative-designer.png');checks.push('Creative renderer: gradients, effects, vectors, cropped ellipse image and measured text fitting; inspector edits persist');
 await tab('Animate');await inspectorCategory(js,sleep,'Motion','keys');await button('Select all keys');await input('[aria-label="Keyframe offset"]','0.25');await button('Move 2 keys');await button('Select all keys');await button('Copy keys');await click('[aria-label="Go to keyframe 2"]');await button('Paste at playhead');await input('[aria-label="Bezier X1"]','0.4');await save();
 let s=(await read()).project.scenes[0];assert.ok(s.layers.find(l=>l.id==='creative-text').keys.x.some(k=>k.time===.25));assert.ok(s.layers.find(l=>l.id==='creative-text').keys.x.length>=3);
 await capture('creative-animation.png');checks.push('Animation UI: multi-key selection, shift, copy/paste and editable Bezier easing persist');
 await tab('Panels');await tab('Operate');await idle();
 assert.equal(await js("document.querySelector('[data-control-id=hold-score] button').dataset.state"),'live');assert.equal(await js("document.querySelector('[data-control-id=disabled] button').disabled"),true);assert.equal(await js("document.querySelector('[data-control-id=hidden]')===null"),true);assert.equal(await js("document.querySelector('progress').value"),65);
 await input('[aria-label="Search Players"]','Home player 1');await js("document.querySelector('.selector-results button').click()");await idle();await until(async()=>(await read()).project.variables.selectedPlayer==='home-1');let saved=(await read()).project;assert.equal(saved.variables.playerNumber,1);assert.equal(saved.variables.playerPhoto,src);
 await click('[data-control-id=hold-score] button');await idle();await until(async()=>(await read()).project.variables.homeScore===1);
 studio.show();studio.focus();const pos=await js("(()=>{const e=document.querySelector('[data-control-id=hold-score] button');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()");
 studio.webContents.sendInputEvent({type:'mouseDown',...pos,button:'left',clickCount:1});await sleep(1300);studio.webContents.sendInputEvent({type:'mouseUp',...pos,button:'left',clickCount:1});await sleep(600);await idle();saved=(await read()).project;assert.ok(saved.variables.homeScore>=3,'Holding the button repeats increments');assert.equal(saved.variables.awayScore,1,'Release runs once after a held gesture');const score=saved.variables.homeScore;await sleep(700);assert.equal((await read()).project.variables.homeScore,score,'Repeat stops on release');
 await capture('creative-controls.png');checks.push('Native controls: dynamic live/disabled/hidden states, searchable roster mapping, progress bar, click and hold/release without post-release repeats');
 await put(original);await reload();
}
