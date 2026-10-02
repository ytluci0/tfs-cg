import assert from 'node:assert/strict';

export async function librarySmoke({studio,js,api,reload,capture,checks,sleep,until,project,openOutput,getOutput}){
 const click=async selector=>{await js(`document.querySelector(${JSON.stringify(selector)}).click()`);await sleep(100);};
 const button=async text=>{await js(`[...(document.querySelector('dialog')||document).querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`);await sleep(100);};
 const input=async(label,value)=>{await js(`(()=>{const el=document.querySelector('[aria-label='+${JSON.stringify(JSON.stringify(label))}+']');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(String(value))});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);await sleep(80);};
 const select=async(label,value)=>{await js(`(()=>{const el=document.querySelector('[aria-label='+${JSON.stringify(JSON.stringify(label))}+']');el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('change',{bubbles:true}));})()`);await sleep(80);};
 const home=async()=>{await click('.desktop-projects-button');await until(()=>js("!!document.querySelector('.project-library')"));};
 const menu=async(id,text)=>{await click(`[data-project-id="${id}"] summary`);await js(`[...document.querySelector('[data-project-id="${id}"] .library-menu').querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`);await sleep(100);};
 const open=async id=>{await click(`[data-project-id="${id}"] .library-open`);await until(()=>js("!!document.querySelector('.studio')"));await sleep(300);};
 await js("window.libraryOriginalFetch=window.fetch;window.fetch=(url,options)=>String(url)==='/api/projects'&&options?.method==='POST'?Promise.resolve(Response.json({error:'QA save conflict'}, {status:409})):window.libraryOriginalFetch(url,options);true");
 await input('Project name','Library match graphics');await click('.desktop-projects-button');await until(()=>js("document.body.innerText.includes('QA save conflict')"));
 assert.equal(await js("!!document.querySelector('.studio')"),true);assert.equal((await api('/api/projects/'+project.id)).value.project.name,project.name);
 await js("window.fetch=window.libraryOriginalFetch;delete window.libraryOriginalFetch");await home();
 assert.equal((await api('/api/projects/'+project.id)).value.project.name,'Library match graphics');checks.push('A failed save keeps the editor and draft open; returning to Projects saves successfully before unmounting');
 await until(()=>js(`!!document.querySelector('[data-project-id="${project.id}"] img')`));
 await button('New project');await input('New project name','Library blank 60');await input('Project width',1280);await input('Project height',720);await input('Project folder','Esports/Finals');await button('Create project');await until(()=>js("!!document.querySelector('.studio')"));await sleep(300);
 const blank=(await api('/api/projects')).value.find(p=>p.name==='Library blank 60');assert.ok(blank);const blankProject=(await api('/api/projects/'+blank.id)).value.project;assert.equal(blankProject.scenes[0].frameRate,60);assert.equal(blankProject.scenes[0].width,1280);assert.equal(blankProject.scenes[0].layers.length,0);
 await home();await click(`[data-project-id="${blank.id}"] [aria-label="Favorite Library blank 60"]`);await until(async()=>!!(await api('/api/library')).value.projects.find(p=>p.id===blank.id).favorite);
 await menu(blank.id,'Folder & tags');await input('Project tags','Esports, Finals');await button('Save changes');await until(()=>js("!document.querySelector('dialog')"));
 await input('Search projects','Esports');assert.equal(await js("document.querySelectorAll('.library-card').length"),1);await input('Search projects','');
 await menu(blank.id,'Duplicate');await input('New project name','Library duplicate');await button('Duplicate');await until(()=>js("!!document.querySelector('.studio')"));await sleep(250);await home();
 const copy=(await api('/api/projects')).value.find(p=>p.name==='Library duplicate');await menu(copy.id,'Archive project');await until(async()=>(await api('/api/library')).value.projects.find(p=>p.id===copy.id).archived);
 await js("[...document.querySelectorAll('[aria-label=\"Project categories\"] button')].find(b=>b.textContent.startsWith('Archived')).click()");await sleep(100);await menu(copy.id,'Restore project');await until(async()=>!(await api('/api/library')).value.projects.find(p=>p.id===copy.id).archived);
 await js("[...document.querySelectorAll('[aria-label=\"Project categories\"] button')].find(b=>b.textContent.startsWith('All projects')).click()");await sleep(100);
 await menu(project.id,'Change thumbnail');await until(()=>js("document.querySelector('[aria-label=\"Cover scene\"]').options.length===3"));await select('Cover scene','score');await input('Cover time',1.5);await button('Save changes');await until(()=>js("!document.querySelector('dialog')"));
 await until(async()=>{const card=(await api('/api/library')).value.projects.find(p=>p.id===project.id);return card.thumbnailKey===card.expectedKey;});
 checks.push('Library creates blank 60 fps projects, searches tags, favorites, duplicates, archives/restores, and caches a chosen scene/time cover');
 for(const [width,height] of [[1280,720],[1920,1080]]){studio.setContentSize(width,height);await sleep(150);const layout=await js("({overflow:document.documentElement.scrollWidth>innerWidth,cards:[...document.querySelectorAll('.library-card')].map(e=>({width:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right})),button:[...(document.querySelector('dialog')||document).querySelectorAll('button')].find(b=>b.textContent.trim()==='New project').getBoundingClientRect().right})");assert.equal(layout.overflow,false);assert.ok(layout.cards.every(c=>c.width>=220&&c.right<=width));assert.ok(layout.button<=width);await capture(`project-library-${width}.png`);}
 await click('[aria-label="List view"]');assert.ok(await js("document.querySelector('.library-cards').classList.contains('list')"));await capture('project-library-list.png');
 openOutput();await until(()=>getOutput()&&!getOutput().webContents.isLoading());const saved=(await api('/api/projects/'+project.id)).value;
 const live=await api('/api/program',{projectId:project.id,scene:saved.project.scenes[0],variables:saved.project.variables,mode:'show'});assert.equal(live.status,200);
 await open(blank.id);await home();assert.equal((await api('/api/program')).value.revision,live.value.revision);assert.equal(await getOutput().webContents.executeJavaScript('document.querySelector("main").dataset.revision'),live.value.revision);
 checks.push('Opening another project and returning to the library preserve acknowledged output');
 await api('/api/program',{projectId:project.id,mode:'hide'});getOutput().close();
 studio.reload();await until(()=>js("!!document.querySelector('.project-library')").catch(()=>false));assert.equal(await js("!!document.querySelector('.studio')"),false);await until(()=>js("document.querySelectorAll('.library-card').length===3"));assert.ok((await api('/api/library')).value.projects.find(p=>p.id===blank.id).favorite);
 checks.push('Library is the startup screen after reload; card state persists; grid/list layouts fit 1280×720 and 1920×1080');
 const current=(await api('/api/projects/'+project.id)).value;await api('/api/projects',{project,revision:current.revision});await reload();studio.setContentSize(1440,950);
}
