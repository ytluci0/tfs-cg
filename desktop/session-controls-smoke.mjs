import assert from 'node:assert/strict';
import {control,action} from '../lib/studio-model.ts';

export async function sessionControlsSmoke({studio,js,api,reload,capture,checks,sleep,until,project,credentials}){
 const read=async()=>(await api('/api/projects/'+project.id)).value;
 const p=structuredClone((await read()).project);
 p.panels=[{id:'session-controls',name:'Session controls',type:'custom',columns:3,controls:[control('Home +',[action('increment','homeScore','1')],{id:'session-home'}),control('Away +',[action('increment','awayScore','1')],{id:'session-away'})]}];
 const baseHome=Number(p.variables.homeScore),baseAway=Number(p.variables.awayScore);
 assert.equal((await api('/api/projects',{project:p,revision:(await read()).revision})).status,200);
 await reload(p.id);
 const tab=async name=>{await js(`[...document.querySelectorAll('[role=tab]')].find(b=>b.textContent.trim()===${JSON.stringify(name)}).dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}))`);await sleep(100);};
 const presses=count=>js(`(()=>{const buttons=[...document.querySelectorAll('.advanced-action-button')];for(let i=0;i<${count};i++)buttons[i%2].click();})()`);
 const idle=()=>until(()=>js("document.querySelector('.studio').dataset.commandBusy==='false'"));
 const rename=name=>js(`(()=>{const e=document.querySelector('[aria-label="Project name"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(name)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 await tab('Panels');await tab('Operate');await idle();
 await presses(20);await until(async()=>{const v=(await read()).project.variables;return v.homeScore===baseHome+10&&v.awayScore===baseAway+10;});await idle();
 checks.push('Twenty alternating score presses execute exactly once without sequence rejection');

 // Failed saves and a failed status read must not leave an undispatched command busy.
 await js(`window.__realFetch=window.fetch;window.__failSave=true;window.fetch=(url,opts)=>{if(window.__failSave&&((String(url)==='/api/projects'&&opts?.method==='POST')||String(url).startsWith('/api/commands?')))return Promise.resolve(new Response(JSON.stringify({error:'QA temporary storage failure'}),{status:503}));return window.__realFetch(url,opts);};void 0;`);
 await rename('Unsaved QA draft');await sleep(50);await presses(6);await idle();
 assert.equal((await read()).project.name,p.name);
 await js('window.__failSave=false');await presses(2);await until(async()=>(await read()).project.variables.homeScore===baseHome+11);await idle();
 assert.equal((await read()).project.name,'Unsaved QA draft');checks.push('A save failure plus unavailable status read releases the control lock; retry saves the draft and runs only the new presses');

 // Keep a dirty draft in memory, then genuinely revoke the isolated session.
 await js(`window.__failSave=true;window.__studioBeforeLock=document.querySelector('.studio');void 0;`);
 await rename('Draft retained through sign in');await sleep(50);
 await js("window.broadcastCG.auth('logout').then(()=>{window.__failSave=false;})");
 assert.equal((await js("window.broadcastCG.authResult('me')")).status,401);
 await presses(10);
 await until(()=>js("!!document.querySelector('[data-session-locked]')"));await idle();
 assert.equal(await js("window.__studioBeforeLock.isConnected&&!!window.__studioBeforeLock.closest('[hidden][inert]')"),true);
 assert.equal(await js("document.querySelector('[aria-label=\"Project name\"]').value"),'Draft retained through sign in');
 for(const [width,height] of [[1280,720],[1920,1080]]){studio.setSize(width,height);await sleep(100);assert.equal(await js('document.documentElement.scrollWidth>innerWidth+1'),false);await capture('session-locked-'+width+'.png');}
 // Exercise the actual account form and renderer-side bridge error reconstruction.
 const password=async value=>{await js(`(()=>{const e=document.querySelector('[data-session-locked] input[type=password]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await sleep(50);await js("document.querySelector('[data-session-locked] form').requestSubmit()");};
 await password('incorrect QA password');await until(()=>js("document.querySelector('[data-session-locked] .account-card').textContent.includes('Incorrect')"));
 assert.equal(await js('window.__studioBeforeLock.isConnected'),true);
 await js('window.__failSave=false');await password(credentials.password);
 await until(()=>js("!document.querySelector('[data-session-locked]')"));await idle();
 assert.equal(await js('window.__studioBeforeLock===document.querySelector(".studio")'),true);
 await until(async()=>(await read()).project.name==='Draft retained through sign in');
 assert.equal((await read()).project.variables.homeScore,baseHome+11);assert.equal((await read()).project.variables.awayScore,baseAway+11);
 checks.push('Real session revocation locks the UI, preserves the unsaved draft through failed and successful sign-in, and cancels all queued presses without replay');
 await presses(20);await until(async()=>(await read()).project.variables.awayScore===baseAway+21);await idle();
 assert.equal((await read()).project.variables.homeScore,baseHome+21);
 assert.equal((await api('/api/program')).value?.scene??null,null);
 await js('window.fetch=window.__realFetch;void 0');await reload(p.id);
 assert.equal((await read()).project.name,'Draft retained through sign in');
 checks.push('Controls work immediately after reauthentication, draft survives save/reopen, and no graphic was taken to output');
 await js("document.querySelector('.desktop-projects-button').click()");await until(()=>js("!!document.querySelector('.project-library')"));
 await js("window.broadcastCG.auth('logout')");
 await until(()=>js("!!document.querySelector('[data-session-locked]')"));
 assert.equal(await js("document.querySelector('[data-session-locked] [role=alert]').textContent.includes('Your open draft is kept')"),true);
 await password(credentials.password);await until(()=>js("!document.querySelector('[data-session-locked]')"));
 checks.push('The periodic account refresh detects a genuine 401 across Electron context isolation and opens sign-in without needing a button press');

}
