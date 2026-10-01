import {ServiceError} from './service-error.mjs';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const footballTypes={homeTeam:'string',awayTeam:'string',homeScore:'number',awayScore:'number',matchClock:'string',homeFormation:'string',awayFormation:'string',homeColor:'string',awayColor:'string',playerName:'string',playerNumber:'number',playerPhoto:'string',playerPosition:'string',eventLabel:'string'};
export function exposedVariables(project){
 const names=new Set();
 if(project.sports)['homeScore','awayScore','homeSeries','awaySeries','period','matchPhase','matchClock','shotClock','timeoutClock','homeFouls','awayFouls','homeTimeouts','awayTimeouts','possession','currentMap','homeSide','awaySide','stoppage','matchWinner','homeTeam','awayTeam','homeColor','awayColor','homeFormation','awayFormation','playerName','playerNumber','playerPhoto','playerPosition','playerGoals','playerAssists','playerKills','playerDeaths','playerPoints','playerRebounds','playerFouls','eventLabel'].forEach(k=>names.add(k));
 for(const panel of project.panels){
  if(panel.type==='football'||panel.controls.some(c=>['pitch','bench','scoreboard'].includes(c.kind)))Object.keys(footballTypes).forEach(k=>names.add(k));
  for(const c of panel.controls){if(c.variable)names.add(c.variable);Object.values(c.dataFields||{}).forEach(k=>names.add(k));Object.values(c.selectionBindings||{}).forEach(k=>names.add(k));for(const a of [...c.actions,...Object.values(c.events||{}).flat()])if(['set','increment','counter','clock'].includes(a.type)&&a.target)names.add(a.target);}
 }
 for(const macro of project.macros||[])for(const a of macro.actions)if(['set','increment','counter','clock'].includes(a.type)&&a.target)names.add(a.target);
 for(const b of project.bindings)if(b.destination==='variable'&&b.targetVariable)names.add(b.targetVariable);
 return names;
}
export function checkVariables(actor,old,variables,requirePermission){
 if(same(old.variables,variables))return;
 if(actor.user.permissions.includes('data.configure'))return;
 requirePermission(actor,'panels.operate');const exposed=exposedVariables(old);
 for(const name of new Set([...Object.keys(old.variables),...Object.keys(variables)])){
  if(same(old.variables[name],variables[name]))continue;
  const expected=Object.hasOwn(old.variables,name)?typeof old.variables[name]:footballTypes[name];
  if(!exposed.has(name)||!Object.hasOwn(variables,name)||typeof variables[name]!==expected)throw new ServiceError('Only exposed data fields can be changed by this account.',403);
 }
}
export function checkProjectChanges(actor,old,next,requirePermission){
 const check=permission=>requirePermission(actor,permission);
 if(!actor.user.permissions.some(p=>['projects.create','projects.edit','graphics.create','graphics.edit','graphics.delete','panels.create','panels.edit','panels.delete','panels.operate','data.configure'].includes(p)))throw new ServiceError('This account has read-only access.',403);
 if(!old){check('projects.create');check('graphics.create');check('panels.create');if(next.sources.length||next.bindings.length)check('data.configure');return;}
 if(old.name!==next.name)check('projects.edit');
 if(!same(old.graphicComponents,next.graphicComponents))check('graphics.edit');
 if(!same(old.optionLists,next.optionLists))check('data.fetch');
 if(!same(old.sources,next.sources)||!same(old.bindings,next.bindings))check('data.configure');
 if(!same(old.formations,next.formations)||!same(old.toolPresets,next.toolPresets)||!same(old.panelComponents,next.panelComponents)||!same(old.macros,next.macros))check('panels.edit');
 for(const [key,prefix] of [['scenes','graphics'],['panels','panels']]){
  const before=new Map(old[key].map(v=>[v.id,v])),after=new Map(next[key].map(v=>[v.id,v]));
  if(after.size!==next[key].length||before.size!==old[key].length)throw new ServiceError('Duplicate scene or panel identifiers are not supported.');
  for(const id of after.keys())if(!before.has(id))check(prefix+'.create');
  for(const id of before.keys())if(!after.has(id))check(prefix+'.delete');
  const oldOrder=old[key].filter(v=>after.has(v.id)).map(v=>v.id),newOrder=next[key].filter(v=>before.has(v.id)).map(v=>v.id);
  if(!same(oldOrder,newOrder))check(prefix+'.edit');
  for(const [id,value] of after){const previous=before.get(id);if(!previous||same(previous,value))continue;
   // Data-bound layer values are exposed operator fields; geometry is still protected.
   if(key==='scenes'&&(actor.user.permissions.includes('panels.operate')||actor.user.permissions.includes('data.configure'))){
    const stripped=structuredClone(value);for(const g of stripped.groups||[]){const before=previous.groups?.find(v=>v.id===g.id);if(g.repeat&&before?.repeat&&actor.user.permissions.includes('data.fetch'))g.repeat.rows=before.repeat.rows;}for(const b of old.bindings.filter(b=>b.sceneId===id&&b.destination!=='variable')){const target=stripped.layers.find(l=>l.id===b.layerId),source=previous.layers.find(l=>l.id===b.layerId);if(target&&source)target[b.property]=source[b.property];}
    if(same(previous,stripped))continue;
   }
   check(prefix+'.edit');
  }
 }
 checkVariables(actor,old,next.variables,requirePermission);
 if(!same(old.sports,next.sports)){check('panels.operate');if(!old.sports||!next.sports||['kind','bestOf','periodSeconds','mapPool'].some(key=>!same(old.sports[key],next.sports[key]))){check('panels.edit');check('data.configure');}}
 if(!same(old.players,next.players))check('panels.operate');
}
