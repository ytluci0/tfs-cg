import {aeOptionsSchema,aeScene} from '../lib/ae-model.ts';
import {psdOptionsSchema,psdScene} from '../lib/psd-model.ts';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {mkdirSync,readFileSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {validateProject,sceneSchema,variablesSchema,sourceSchema,variableActionValue,textValue,applyDataBindings,action,pathValue} from '../lib/studio-model.ts';

import {migrateSports,createSportsClocks} from './sports-clocks.mjs';
import {parseSportOperation,applySportOperation} from '../lib/sports-logic.ts';
import {boundedNumber} from '../lib/broadcast-tools.ts';
import {exposedVariables} from './project-policy.mjs';
import {ServiceError} from './service-error.mjs';
export {ServiceError} from './service-error.mjs';
import {createSecurity,migrateSecurity} from './security.mjs';
import {planActions} from '../lib/action-logic.ts';
import {createCommandEngine,migrateCommands} from './command-engine.mjs';
import {checkProjectChanges,checkVariables} from './project-policy.mjs';
const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
async function readBytes(request,limit){
  const reader=request.body?.getReader();if(!reader)return Buffer.alloc(0);
  const chunks=[];let length=0;
  while(true){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>limit){await reader.cancel();throw new ServiceError('Request exceeds the supported size.',413);}chunks.push(Buffer.from(value));}
  return Buffer.concat(chunks);
}
async function readJson(request,limit=1600000){try{return JSON.parse((await readBytes(request,limit)).toString('utf8'));}catch(e){if(e instanceof ServiceError)throw e;throw new ServiceError('Invalid JSON.');}}
function imageMime(bytes){
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
  if(bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP')return 'image/webp';
  throw new ServiceError('Upload a PNG, JPEG or WebP image.');
}
function assetIds(project){
  const text=JSON.stringify(project);return [...new Set([...text.matchAll(/\/api\/assets\/([a-zA-Z0-9-]+)/g)].map(m=>m[1]))];
}

/** Single-workstation authority. No network listener and no cloud bindings. */
export function createLocalService({directory,encrypt,decrypt,beforePublish=()=>{},confirmProgram=async()=>{},event=()=>{},workstation=()=>'Local workstation',now=Date.now,monotonic,assertControl=()=>{}}){
  mkdirSync(directory,{recursive:true});
  const db=new DatabaseSync(join(directory,'broadcastcg.sqlite'));
  db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;');
  const version=db.prepare('PRAGMA user_version').get().user_version;
  if(version>6){db.close();throw Error('This data folder belongs to a newer BroadcastCG version.');}
  if(version===0)db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE projects(id TEXT PRIMARY KEY,name TEXT NOT NULL,document TEXT NOT NULL,revision INTEGER NOT NULL,updated_at INTEGER NOT NULL);
    CREATE TABLE assets(id TEXT PRIMARY KEY,name TEXT NOT NULL,mime TEXT NOT NULL,bytes BLOB NOT NULL);
    CREATE TABLE secrets(id TEXT PRIMARY KEY,ciphertext BLOB NOT NULL);
    CREATE TABLE settings(key TEXT PRIMARY KEY,document TEXT NOT NULL);
    CREATE TABLE recovery(id INTEGER PRIMARY KEY CHECK(id=1),document TEXT NOT NULL,revision INTEGER NOT NULL,updated_at INTEGER NOT NULL);
    CREATE TABLE events(id INTEGER PRIMARY KEY AUTOINCREMENT,time INTEGER NOT NULL,action TEXT NOT NULL,target TEXT NOT NULL,status TEXT NOT NULL,detail TEXT NOT NULL);
    PRAGMA user_version=1; COMMIT;`);
  migrateSecurity(db,directory,version===1);
  migrateCommands(db,directory,version===2);
  migrateSports(db,directory,version===3);
  if(db.prepare('PRAGMA user_version').get().user_version<5){
    if(version===4){mkdirSync(join(directory,'backups'),{recursive:true});db.prepare('VACUUM INTO ?').run(join(directory,'backups','before-psd-'+Date.now()+'-'+randomUUID()+'.sqlite'));}
    // Compatibility barrier: older releases must not strip PSD groups on save.
    db.exec('PRAGMA user_version=5');
  }
  if(db.prepare('PRAGMA user_version').get().user_version<6){
    if(version===5){mkdirSync(join(directory,'backups'),{recursive:true});db.prepare('VACUUM INTO ?').run(join(directory,'backups','before-ae-'+Date.now()+'-'+randomUUID()+'.sqlite'));}
    // Protect AE transforms, timing and reference reports from older serializers.
    db.exec('PRAGMA user_version=6');
  }
  const clocks=createSportsClocks({db,monotonic});
  const security=createSecurity({db,now,workstation,event}),{auth,authenticate,requirePermission,requireWorkspace,canAccess,record}=security;
  const outputContext=Object.freeze({output:true});
  function actorFor(context){return authenticate(context?.token);}
  function readProject(actor,id){requireWorkspace(actor,id);const row=db.prepare('SELECT * FROM projects WHERE id=?').get(id);if(!row)throw new ServiceError('Workspace not found.',404);return {...row,project:clocks.project(JSON.parse(row.document))};}
  function canReadAsset(actor,id){const row=db.prepare('SELECT uploaded_by FROM assets WHERE id=?').get(id);return !!row&&(row.uploaded_by===actor.user.id||db.prepare('SELECT project_id FROM project_assets WHERE asset_id=?').all(id).some(p=>canAccess(actor,p.project_id)));}
  function validateAssets(actor,project){for(const id of assetIds(project))if(!canReadAsset(actor,id))throw new ServiceError('An image is missing or belongs to an inaccessible workspace.',403);}
  // Program deliberately starts empty. A restart never replays a TAKE.
  let program=null,publishing=false;
  const audit=(action,target,status,detail='')=>{db.prepare('INSERT INTO events(time,action,target,status,detail) VALUES(?,?,?,?,?)').run(Date.now(),action,target,status,detail);event(action,status);};
  const settings={get(key,fallback=null){const row=db.prepare('SELECT document FROM settings WHERE key=?').get(key);return row?JSON.parse(row.document):fallback;},set(key,value){db.prepare('INSERT INTO settings(key,document) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET document=excluded.document').run(key,JSON.stringify(value));}};
  audit('APPLICATION_START','local','success');
  function commitActionProject(actor,next){
    assertControl(actor,next.id);
    next=clocks.project(next);
    const old=readProject(actor,next.id);checkProjectChanges(actor,old.project,next,requirePermission);validateProject(next);validateAssets(actor,next);
    db.exec('BEGIN IMMEDIATE');try{const revision=old.revision+1;db.prepare('UPDATE projects SET document=?,revision=?,updated_at=? WHERE id=?').run(JSON.stringify(next),revision,now(),next.id);
      for(const key of Object.keys(next.variables))if(old.project.variables[key]!==next.variables[key])record('VARIABLE_CHANGED',key,'success',actor,{projectId:next.id,previous:old.project.variables[key]??null,next:next.variables[key]});
      db.prepare('DELETE FROM project_assets WHERE project_id=?').run(next.id);for(const id of assetIds(next))db.prepare('INSERT INTO project_assets(project_id,asset_id) VALUES(?,?)').run(next.id,id);db.exec('COMMIT');return{project:next,revision};
    }catch(e){db.exec('ROLLBACK');throw e;}
  }
  function stageSnapshot(value,project,actor){if(!value)return null;const scene=sceneSchema.parse(value.scene),variables=variablesSchema.parse(value.variables);const canonical=project.scenes.find(s=>s.id===scene.id);if(!canonical||JSON.stringify(canonical)!==JSON.stringify(scene))throw new ServiceError('Save and stage the latest graphic before running.',409);checkVariables(actor,project,variables,requirePermission);return{scene,variables};}
  const commands=createCommandEngine({db,authenticate,requirePermission,requireWorkspace,readProject,record,now,assertControl,
    prepare(data,project,actor){
      let actions,label,output=null;
      if(data.kind==='control'){const panel=project.panels.find(p=>p.id===data.panelId),control=panel?.controls.find(c=>c.id===data.controlId);if(!control)throw new ServiceError('Control no longer exists.',404);if(control.hidden)throw new ServiceError('This control is hidden from operation.',403);actions=control.actions;label=control.label;}
      else if(data.kind==='macro'){const macro=project.macros?.find(m=>m.id===data.macroId);if(!macro)throw new ServiceError('Macro no longer exists.',404);actions=macro.actions;label=macro.name;}
      else if(data.kind==='clock'){actions=[action('clock',data.variable,JSON.stringify(data.clock))];label='Clock - '+data.variable;}
      else if(data.kind==='counter'){actions=[action('counter',data.variable,JSON.stringify({delta:data.delta,value:data.value,panelId:data.panelId,controlId:data.controlId}))];label='Counter - '+data.variable;}
      else if(data.kind==='sport'){const op=parseSportOperation(data.operation);actions=[action('sport',op.op,JSON.stringify(op))];label='Match - '+op.op;}
      else if(data.kind==='output'){if(!['show','hide','update'].includes(data.output?.mode))throw new ServiceError('Choose a supported output command.');output=data.output;actions=[action(output.mode==='hide'?'clear':output.mode==='update'?'update':'take')];label=output.mode==='show'?'TAKE':output.mode==='hide'?'Hide output':'Update live';}
      else throw new ServiceError('Choose a control, macro or output command.');
      let plan;try{plan=planActions(project,actions);}catch(e){throw new ServiceError(e.message);}
      for(const entry of plan){const a=entry.action,permission={take:'graphics.take',clear:'graphics.clear',update:'graphics.updateLive',fetch:'data.fetch'}[a.type];if(permission)requirePermission(actor,permission);if(a.type==='sport'){const op=parseSportOperation(JSON.parse(a.value));if(op.op==='configure'){requirePermission(actor,'panels.edit');requirePermission(actor,'data.configure');}if(op.op==='fetch-roster')requirePermission(actor,'data.fetch');}if(['clock','counter'].includes(a.type)&&!actor.user.permissions.includes('data.configure')&&!exposedVariables(project).has(a.target))throw new ServiceError('This variable is not exposed for operation.',403);}
      if(publishing&&plan.some(s=>['take','clear','update'].includes(s.action.type)))throw new ServiceError('An output command is awaiting acknowledgement.',409);
      const stage=stageSnapshot(data.stage,project,actor);if(output?.mode!=='hide'&&output)stageSnapshot(output,project,actor);
      return{plan,label,stage,output,usesOutput:plan.some(s=>['take','clear','update'].includes(s.action.type))};
    },
    async execute(a,ctx){
      const current=()=>{if(ctx.signal.aborted)throw new ServiceError('Sequence cancelled.',409);const actor=authenticate(ctx.token);requireWorkspace(actor,ctx.projectId);return{actor,project:readProject(actor,ctx.projectId).project};};
      let {actor,project}=current();const value=textValue(a.value,project.variables);
      if(a.type==='clock'){const options=JSON.parse(a.value);clocks.operate(project,a.target,options);commitActionProject(actor,project);record('CLOCK_'+options.op.toUpperCase(),a.target,'success',actor,{projectId:project.id});}
      else if(a.type==='counter'){if(clocks.has(project.id,a.target))throw new ServiceError('Use a Clock action for a managed time variable.');const options=JSON.parse(a.value);if(typeof project.variables[a.target]!=='number')throw new ServiceError('Choose a numeric counter variable.');let bounds={minimum:0,maximum:999999};if(options.controlId){const c=project.panels.find(p=>p.id===options.panelId)?.controls.find(c=>c.id===options.controlId);if(!c||c.kind!=='counter'||c.variable!==a.target)throw new ServiceError('Counter control no longer matches.');bounds=c;}const n=options.value!==undefined?options.value:Number(project.variables[a.target])+options.delta;if(!Number.isFinite(n))throw new ServiceError('Enter a finite counter value.');commitActionProject(actor,{...project,variables:{...project.variables,[a.target]:boundedNumber(bounds,n)}});}
      else if(a.type==='sport'){let op=parseSportOperation(JSON.parse(a.value));if(op.op==='fetch-roster'){const source=project.sources.find(s=>s.id===op.sourceId);if(!source)throw new ServiceError('Choose a saved roster source.');const response=await route(new Request('broadcastcg://app/api/sources/fetch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source,projectId:project.id}),signal:ctx.signal}),{token:ctx.token});const result=await response.json();if(!response.ok)throw new ServiceError(result.error,response.status);const rows=pathValue(result.data,op.rowsPath);if(!Array.isArray(rows))throw new ServiceError('The roster path must point to an array.');op={op:'roster',team:op.team,rows,mapping:op.mapping};({actor,project}=current());}let next;try{next=applySportOperation(project,op,ctx.commandId,new Date(now()).toISOString());}catch(e){throw new ServiceError(e.message);}validateProject(next);validateAssets(actor,next);if(op.op==='configure'){for(const key of Object.keys(clocks.snapshot(project.id)))clocks.operate(project,key,{op:'pause'});for(const key of ['matchClock','shotClock','timeoutClock'])clocks.operate(next,key,{op:'reset',seconds:key==='matchClock'?(op.kind==='basketball'?next.sports.periodSeconds:0):key==='shotClock'?24:60,direction:key==='matchClock'&&op.kind!=='basketball'?'up':'down'});}if(op.op==='phase'&&['Break','Final'].includes(op.value)||op.op==='finish-game')for(const key of Object.keys(clocks.snapshot(project.id)))clocks.operate(project,key,{op:'pause'});commitActionProject(actor,next);record('SPORT_'+op.op.toUpperCase(),project.id,'success',actor,{projectId:project.id});}
      else
      if(a.type==='set'||a.type==='increment'){if(clocks.has(project.id,a.target))throw new ServiceError('Use a Clock action to change this managed time variable.');let next;try{next=variableActionValue(project.variables,a.target,value,a.type);}catch(e){throw new ServiceError(e.message);}commitActionProject(actor,{...project,variables:{...project.variables,[a.target]:next}});}
      else if(a.type==='preview'){const scene=project.scenes.find(s=>s.id===a.target);ctx.setStage({scene:structuredClone(scene),variables:{...project.variables}});}
      else if(['take','clear','update'].includes(a.type)){
        if(a.type==='clear'&&program?.projectId&&program.projectId!==ctx.projectId)throw new ServiceError('Switch to the workspace currently on output before hiding it.',409);
        let payload=ctx.output;if(!payload){if(a.type==='clear')payload={scene:null,variables:{},mode:'hide'};else if(a.type==='take'){if(!ctx.stage)throw new ServiceError('Stage a graphic before TAKE.');payload={...ctx.stage,mode:'show'};}else{if(program?.projectId!==project.id||program.mode==='hide')throw new ServiceError('This workspace has no graphic on output.');const scene=project.scenes.find(s=>s.id===program.scene?.id);payload={scene,variables:project.variables,mode:'update'};}}
        await publishCommand({...payload,projectId:project.id},{token:ctx.token},ctx.commandId);
      }else if(a.type==='fetch'){
        const source=project.sources.find(s=>s.id===a.target),response=await route(new Request('broadcastcg://app/api/sources/fetch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source,projectId:project.id}),signal:ctx.signal}),{token:ctx.token});const result=await response.json();if(!response.ok)throw new ServiceError(result.error,response.status);
        ({actor,project}=current());if(project.bindings.some(b=>b.sourceId===source.id&&b.destination==='variable'&&clocks.has(project.id,b.targetVariable)))throw new ServiceError('Clock variables are controlled by clock actions, not API value bindings.');const applied=applyDataBindings(project,source.id,result.data);if(applied.missing)throw new ServiceError('API response did not match '+applied.missing+' binding(s). Data was not changed.');commitActionProject(actor,applied.project);
      }
    }
  });


  async function publishCommand(data,context,commandId){
      commands.assertOutputFree(commandId);
      if(publishing)throw new ServiceError('An output command is awaiting acknowledgement.',409);
      const current=actorFor(context);const mode=['hide','update','show'].includes(data.mode)?data.mode:'show';
      requirePermission(current,mode==='hide'?'graphics.clear':mode==='update'?'graphics.updateLive':'graphics.take');
      const projectId=mode==='hide'&&program?program.projectId:data.projectId;const saved=readProject(current,projectId).project;
      assertControl(current,projectId);
      if(mode==='update'&&program?.projectId!==projectId)throw new ServiceError('Select the workspace currently on output.',409);
      let scene=data.scene===null?null:sceneSchema.parse(data.scene),variables=variablesSchema.parse(data.variables||{}),startedAt=Date.now();
      if(mode==='hide'&&program){scene=program.scene;variables=program.variables;}
      if(mode==='update'&&program?.scene?.id===scene?.id)startedAt=program.startedAt;
      if(mode!=='hide'){const canonical=saved.scenes.find(s=>s.id===scene?.id);if(!canonical||JSON.stringify(canonical)!==JSON.stringify(scene))throw new ServiceError('Save this graphic before sending it to output.',409);checkVariables(current,saved,variables,requirePermission);}
      beforePublish();publishing=true;
      try{
        program={scene,variables,mode,startedAt,revision:randomUUID(),projectId,acknowledged:false};
        await confirmProgram(program);program.acknowledged=true;
        record(mode.toUpperCase(),scene?.id||'program','acknowledged',current,{projectId});return program;
      }catch(e){e.unconfirmed=true;record(mode.toUpperCase(),scene?.id||'program','unconfirmed',current,{projectId});throw e;}
      finally{publishing=false;}
    }

  function liveProgram(){if(!program)return null;const variables={...program.variables};for(const [key,value] of Object.entries(clocks.values(program.projectId)))if(Object.hasOwn(variables,key))variables[key]=value;return{...program,variables};}
  async function route(request,context){
    const url=new URL(request.url),path=url.pathname,method=request.method;
    const outputRead=context===outputContext;
    if(outputRead&&(method!=='GET'||!(path==='/api/program'||path.startsWith('/api/assets/'))))throw new ServiceError('Output is read-only.',403);
    const actor=outputRead?null:actorFor(context);
    if(actor)requirePermission(actor,'projects.view');
    if(path==='/api/commands'&&method==='POST'){const result=commands.submit(await readJson(request),context?.token);return json(result,result.duplicate?200:202);}
    if(path==='/api/commands'&&method==='GET')return json(commands.state(actor,url.searchParams.get('projectId')));
    if(path.startsWith('/api/commands/')){const id=decodeURIComponent(path.slice('/api/commands/'.length).replace(/\/cancel$/,''));if(method==='POST'&&path.endsWith('/cancel'))return json(commands.cancel(actor,id));if(method==='GET')return json(commands.get(actor,id));}
    if(path==='/api/clocks'&&method==='GET'){const projectId=url.searchParams.get('projectId');readProject(actor,projectId);return json(clocks.snapshot(projectId));}
    if(path==='/api/projects'&&method==='GET')return json(db.prepare('SELECT id,name,revision,updated_at FROM projects ORDER BY updated_at DESC').all().filter(p=>canAccess(actor,p.id)));
    if(path==='/api/projects'&&method==='POST'){
      const data=await readJson(request),project=clocks.project(validateProject(data.project)),stamp=now();commands.assertIdle(project.id);
      const current=actorFor(context),previous=db.prepare('SELECT document FROM projects WHERE id=?').get(project.id);
      assertControl(current,project.id);
      if(previous)requireWorkspace(current,project.id);
      checkProjectChanges(current,previous?JSON.parse(previous.document):null,project,requirePermission);validateAssets(current,project);
      db.exec('BEGIN IMMEDIATE');let next;
      try{
        const old=db.prepare('SELECT revision FROM projects WHERE id=?').get(project.id);
        if(old&&old.revision!==data.revision)throw new ServiceError('Project changed since it was opened. Export your edits before reopening it.',409);
        next=(old?.revision||0)+1;
        db.prepare('INSERT INTO projects(id,name,document,revision,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,document=excluded.document,revision=excluded.revision,updated_at=excluded.updated_at').run(project.id,project.name,JSON.stringify(project),next,stamp);
        if(!old&&!current.user.allWorkspaces)db.prepare('INSERT INTO workspace_grants(user_id,project_id) VALUES(?,?)').run(current.user.id,project.id);
        db.prepare('DELETE FROM project_assets WHERE project_id=?').run(project.id);for(const id of assetIds(project))db.prepare('INSERT INTO project_assets(project_id,asset_id) VALUES(?,?)').run(project.id,id);
        settings.set('lastProject:'+current.user.id,project.id);
        // A credential is valid only for the endpoint it was configured for.
        if(previous){const oldSources=JSON.parse(previous.document).sources;for(const source of oldSources)if(!project.sources.some(s=>s.id===source.id&&s.url===source.url))db.prepare('DELETE FROM project_secrets WHERE project_id=? AND source_id=?').run(project.id,source.id);}
        record(old?'PROJECT_SAVED':'PROJECT_CREATED',project.id,'success',current,{projectId:project.id,previous:old?.revision||0,next});
        if(previous){const oldProject=JSON.parse(previous.document);for(const key of new Set([...Object.keys(oldProject.variables),...Object.keys(project.variables)]))if(JSON.stringify(oldProject.variables[key])!==JSON.stringify(project.variables[key]))record('VARIABLE_CHANGED',key,'success',current,{projectId:project.id,previous:oldProject.variables[key]??null,next:project.variables[key]??null});}
        for(const [field,label] of [['scenes','GRAPHIC'],['panels','PANEL']]){const before=new Map((previous?JSON.parse(previous.document)[field]:[]).map(v=>[v.id,v])),after=new Map(project[field].map(v=>[v.id,v]));for(const id of new Set([...before.keys(),...after.keys()])){const old=before.get(id),next=after.get(id);if(JSON.stringify(old)!==JSON.stringify(next))record(label+'_'+(!old?'CREATED':!next?'DELETED':'EDITED'),id,'success',current,{projectId:project.id,previous:old?{name:old.name}:null,next:next?{name:next.name}:null});}}
        db.exec('COMMIT');
      }catch(e){db.exec('ROLLBACK');throw e;}
      return json({id:project.id,revision:next,updatedAt:stamp});
    }
    if(path.startsWith('/api/projects/')&&method==='GET'){
      const id=decodeURIComponent(path.slice('/api/projects/'.length)),row=readProject(actor,id);
      if(!row)throw new ServiceError('Project not found.',404);
      settings.set('lastProject:'+actor.user.id,id);return json({project:row.project,revision:row.revision});
    }
    if(path==='/api/program'&&method==='GET'){if(actor)requirePermission(actor,'outputs.view');return json(!program||outputRead||canAccess(actor,program.projectId)?liveProgram():null);}
    if(path==='/api/program'&&method==='POST')return json(await publishCommand(await readJson(request),context));
    if(path==='/api/assets'&&method==='POST'){
      requirePermission(actor,'graphics.edit');const bytes=await readBytes(request,10000000),mime=imageMime(bytes),id=randomUUID(),name=(request.headers.get('x-file-name')||'Image').slice(0,250);const current=actorFor(context);requirePermission(current,'graphics.edit');
      db.prepare('INSERT INTO assets(id,name,mime,bytes,uploaded_by) VALUES(?,?,?,?,?)').run(id,name,mime,bytes,current.user.id);
      return json({id,url:'/api/assets/'+id,mime,name});
    }
    if(path.startsWith('/api/assets/')&&method==='GET'){
      const id=path.slice('/api/assets/'.length);
      if(outputRead?!program||!assetIds(program).includes(id):!canReadAsset(actor,id))throw new ServiceError('Image is not available to this account.',403);
      const row=db.prepare('SELECT mime,bytes FROM assets WHERE id=?').get(id);
      if(!row)throw new ServiceError('Image is missing from this workstation. Import its complete project package.',404);
      return new Response(row.bytes,{headers:{'Content-Type':row.mime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    }
    if(path==='/api/sources'&&method==='POST'){
      const data=await readJson(request,16000);const current=actorFor(context);requirePermission(current,'integrations.configure');const project=readProject(current,data.projectId).project;if(!project.sources.some(s=>s.id===data.sourceId))throw new ServiceError('Save this data source in the workspace first.');
      if(typeof data.sourceId!=='string'||data.sourceId.length>100||!data.headers||typeof data.headers!=='object'||Array.isArray(data.headers))throw new ServiceError('Enter headers as a JSON object.');
      const headers={};
      for(const [key,value] of Object.entries(data.headers)){
        if(typeof value!=='string'||!/^[-a-zA-Z0-9]+$/.test(key)||/[\r\n]/.test(value)||['host','cookie','content-length','connection'].includes(key.toLowerCase()))throw new ServiceError('This header is not supported.');
        headers[key]=value;
      }
      if(!encrypt)throw new ServiceError('Windows credential protection is unavailable. Headers were not saved.',503);
      const cipher=encrypt(JSON.stringify(headers));
      db.prepare('INSERT INTO project_secrets(project_id,source_id,ciphertext) VALUES(?,?,?) ON CONFLICT(project_id,source_id) DO UPDATE SET ciphertext=excluded.ciphertext').run(data.projectId,data.sourceId,cipher);record('DATA_CREDENTIALS_SAVED',data.sourceId,'success',current,{projectId:data.projectId});
      return json({saved:true});
    }
    if(path==='/api/sources/fetch'&&method==='POST'){
      const {source:raw,projectId}=await readJson(request,8000),source=sourceSchema.parse(raw),current=actorFor(context);requirePermission(current,'data.fetch');const project=readProject(current,projectId).project,configured=project.sources.find(s=>s.id===source.id);if(!configured||configured.url!==source.url)throw new ServiceError('Fetch only a data endpoint saved in this workspace.',403);let endpoint;
      try{endpoint=new URL(source.url);}catch{throw new ServiceError('Enter a valid HTTPS data endpoint.');}
      if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password)throw new ServiceError('Data feeds require HTTPS without credentials in the URL.');
      const row=db.prepare('SELECT ciphertext FROM project_secrets WHERE project_id=? AND source_id=?').get(projectId,source.id);
      const headers=new Headers(row?JSON.parse(decrypt(Buffer.from(row.ciphertext))):{});if(!headers.has('Accept'))headers.set('Accept','application/json');
      try{
        const response=await fetch(endpoint,{headers,redirect:'error',signal:AbortSignal.any([AbortSignal.timeout(10000),request.signal])});
        if(!response.ok)throw new ServiceError('Data feed returned HTTP '+response.status+'.',502);
        const data=JSON.parse((await readBytes(response,2000000)).toString('utf8'));
        actorFor(context);record('DATA_FETCH',source.id,'success',current,{projectId});return json({data,fetchedAt:Date.now()});
      }catch(e){record('DATA_FETCH',source.id,'failed',current,{projectId});if(e instanceof ServiceError)throw e;throw new ServiceError('Data feed could not be read. Check its connection and HTTPS endpoint.',502);}
    }
    if(path==='/api/desktop/recovery'&&method==='POST'){
      const data=await readJson(request),project=validateProject(data.project),current=actorFor(context),saved=db.prepare('SELECT document FROM projects WHERE id=?').get(project.id);
      if(saved)requireWorkspace(current,project.id);checkProjectChanges(current,saved?JSON.parse(saved.document):null,project,requirePermission);validateAssets(current,project);
      db.prepare('INSERT INTO recovery(user_id,document,revision,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET document=excluded.document,revision=excluded.revision,updated_at=excluded.updated_at').run(current.user.id,JSON.stringify(project),Number.isSafeInteger(data.revision)?data.revision:0,now());
      return json({saved:true});
    }
    if(path==='/api/desktop/recovery'&&method==='GET'){
      const row=db.prepare('SELECT document,revision,updated_at FROM recovery WHERE user_id=?').get(actor.user.id);
      if(!row)return json(null);
      const project=JSON.parse(row.document),saved=db.prepare('SELECT document,revision FROM projects WHERE id=?').get(project.id);
      if(saved?!canAccess(actor,project.id):!actor.user.permissions.includes('projects.create'))return json(null);if(saved?.document===row.document)return json(null);
      return json({project,revision:row.revision,updatedAt:row.updated_at,conflict:!!saved&&saved.revision!==row.revision});
    }
    if(path==='/api/desktop/recovery'&&method==='DELETE'){db.prepare('DELETE FROM recovery WHERE user_id=?').run(actor.user.id);return json({cleared:true});}
    throw new ServiceError('Local operation is not supported.',404);
  }

  return {
    settings,auth,outputContext,
    controlIdle:projectId=>commands.assertIdle(projectId),
    controlActor(token,projectId){const actor=authenticate(token);readProject(actor,projectId);return actor;},
    recordNetwork:(action,target,status,actor)=>record(action,target,status,actor,{projectId:target||null}),
    networkSnapshot(token){const actor=authenticate(token);requirePermission(actor,'projects.view');return{actor,projects:db.prepare('SELECT id,name,revision,updated_at FROM projects ORDER BY updated_at DESC').all().filter(p=>canAccess(actor,p.id)),program:actor.user.permissions.includes('outputs.view')&&(!program||canAccess(actor,program.projectId))?liveProgram():null};},
    backup(token){const actor=authenticate(token);requirePermission(actor,'system.configure');const file=join(directory,'network-backup-'+randomUUID()+'.sqlite');try{db.prepare('VACUUM INTO ?').run(file);return readFileSync(file);}finally{try{unlinkSync(file);}catch{}}},
    authorize(token,permission){const actor=authenticate(token);if(permission)requirePermission(actor,permission);return actor;},
    health(){try{return Number.isInteger(db.prepare('PRAGMA schema_version').get().schema_version);}catch{return false;}},
    async handle(request,context){try{return await route(request,context);}catch(e){const status=e instanceof ServiceError?e.status:e?.issues?400:500;if(status>=500)event('SERVICE_ERROR','failed');return json({error:e instanceof ServiceError?e.message:e?.issues?'Project validation failed. Existing data was preserved.':'The local service could not complete the operation.'},status);}},
    diagnostics(){return{database:db.prepare('PRAGMA quick_check').get().quick_check,schemaVersion:6,projects:db.prepare('SELECT count(*) AS n FROM projects').get().n,events:db.prepare('SELECT time,action,target,status FROM events ORDER BY id DESC LIMIT 100').all()};},
    importPsd(draft,raw,token){
      const options=psdOptionsSchema.parse(raw),actor=authenticate(token);requirePermission(actor,'templates.import');requirePermission(actor,'graphics.create');
      const old=readProject(actor,options.projectId);commands.assertIdle(options.projectId);
      assertControl(actor,options.projectId);
      if(old.revision!==options.revision)throw new ServiceError('Workspace changed during PSD review. Save and inspect the latest project before importing.',409);
      let scene=sceneSchema.parse(psdScene(draft,options));scene.id=randomUUID();
      const used=new Set(assetIds(scene)),assets=draft.assets.filter(a=>used.has(a.id));
      if(assets.length!==used.size)throw new ServiceError('PSD images are incomplete. Import the file again.');
      let total=0;for(const a of assets){const bytes=Buffer.from(a.bytes);total+=bytes.length;if(bytes.length>10000000||total>55000000||imageMime(bytes)!=='image/png')throw new ServiceError('Invalid PSD images.');}
      db.exec('BEGIN IMMEDIATE');try{
        let text=JSON.stringify(scene);for(const a of assets){const id=randomUUID();db.prepare('INSERT INTO assets(id,name,mime,bytes,uploaded_by) VALUES(?,?,?,?,?)').run(id,a.name,'image/png',Buffer.from(a.bytes),actor.user.id);text=text.split('/api/assets/'+a.id).join('/api/assets/'+id);}
        scene=sceneSchema.parse(JSON.parse(text));const project=validateProject({...old.project,scenes:[...old.project.scenes,scene]});checkProjectChanges(actor,old.project,project,requirePermission);validateAssets(actor,project);
        const revision=old.revision+1;db.prepare('UPDATE projects SET document=?,revision=?,updated_at=? WHERE id=?').run(JSON.stringify(project),revision,now(),project.id);
        for(const id of assetIds(scene))db.prepare('INSERT OR IGNORE INTO project_assets(project_id,asset_id) VALUES(?,?)').run(project.id,id);
        record('PSD_IMPORT',scene.id,'success',actor,{projectId:project.id,mode:options.mode,layers:scene.layers.length});db.exec('COMMIT');return{project,revision,sceneId:scene.id};
      }catch(e){db.exec('ROLLBACK');throw e;}
    },
    importAe(draft,raw,token){
      const options=aeOptionsSchema.parse(raw),actor=authenticate(token);requirePermission(actor,'templates.import');requirePermission(actor,'graphics.create');
      const old=readProject(actor,options.projectId);commands.assertIdle(options.projectId);
      assertControl(actor,options.projectId);
      if(old.revision!==options.revision)throw new ServiceError('Workspace changed during AE review. Save and inspect the latest project before importing.',409);
      let scene=sceneSchema.parse(aeScene(draft,options));scene.id=randomUUID();
      const used=new Set(assetIds(scene)),assets=draft.assets.filter(a=>used.has(a.id));
      if(assets.length!==used.size)throw new ServiceError('AE images are incomplete. Import the file again.');
      let total=0;for(const a of assets){const bytes=Buffer.from(a.bytes);total+=bytes.length;if(bytes.length>10000000||total>55000000||imageMime(bytes)!=='image/png')throw new ServiceError('Invalid AE images.');}
      db.exec('BEGIN IMMEDIATE');try{
        let text=JSON.stringify(scene);for(const a of assets){const id=randomUUID();db.prepare('INSERT INTO assets(id,name,mime,bytes,uploaded_by) VALUES(?,?,?,?,?)').run(id,a.name,'image/png',Buffer.from(a.bytes),actor.user.id);text=text.split('/api/assets/'+a.id).join('/api/assets/'+id);}
        scene=sceneSchema.parse(JSON.parse(text));const project=validateProject({...old.project,scenes:[...old.project.scenes,scene]});checkProjectChanges(actor,old.project,project,requirePermission);validateAssets(actor,project);
        const revision=old.revision+1;db.prepare('UPDATE projects SET document=?,revision=?,updated_at=? WHERE id=?').run(JSON.stringify(project),revision,now(),project.id);
        for(const id of assetIds(scene))db.prepare('INSERT OR IGNORE INTO project_assets(project_id,asset_id) VALUES(?,?)').run(project.id,id);
        record('AE_IMPORT',scene.id,'success',actor,{projectId:project.id,mode:scene.importReport.mode,layers:scene.layers.length});db.exec('COMMIT');return{project,revision,sceneId:scene.id};
      }catch(e){db.exec('ROLLBACK');throw e;}
    },
    exportProject(raw,token){
      const actor=authenticate(token);requirePermission(actor,'templates.export');const project=clocks.project(validateProject(raw)),assets=[],missing=[];
      if(db.prepare('SELECT id FROM projects WHERE id=?').get(project.id))requireWorkspace(actor,project.id);else requirePermission(actor,'projects.create');validateAssets(actor,project);
      for(const id of assetIds(project)){const a=db.prepare('SELECT id,name,mime,bytes FROM assets WHERE id=?').get(id);if(a)assets.push({...a,bytes:Buffer.from(a.bytes).toString('base64')});else missing.push(id);}
      if(missing.length)throw new ServiceError('Cannot export a complete project: '+missing.length+' image(s) are missing. Replace or upload them first.');
      const document=JSON.stringify({format:'broadcastcg-project',version:1,project,assets},null,2);
      if(Buffer.byteLength(document)>100000000)throw new ServiceError('Project package exceeds the current 100 MB limit.');
      return document;
    },
    inspectImport(text,token){
      const actor=authenticate(token);requirePermission(actor,'templates.import');requirePermission(actor,'projects.create');
      if(Buffer.byteLength(text)>100000000)throw new ServiceError('Project package exceeds 100 MB.');
      const data=JSON.parse(text);
      if(data.format&&data.format!=='broadcastcg-project')throw new ServiceError('Unsupported package format.');
      if(data.format&&data.version!==1)throw new ServiceError('Unsupported package version.');
      const project=validateProject(data.project||data),assets=data.format?(data.assets||[]):[];
      if(!Array.isArray(assets)||assets.length>500)throw new ServiceError('Invalid asset manifest.');
      const ids=new Set();
      const checked=assets.map(a=>{
        if(typeof a.id!=='string'||!/^[a-zA-Z0-9-]{1,100}$/.test(a.id)||ids.has(a.id)||typeof a.name!=='string'||a.name.length>250||typeof a.bytes!=='string'||a.bytes.length>14000000)throw new ServiceError('Invalid asset manifest.');
        ids.add(a.id);const bytes=Buffer.from(a.bytes,'base64');if(bytes.length>10000000||imageMime(bytes)!==a.mime)throw new ServiceError('Invalid package image.');return{...a,bytes};
      });
      const missing=assetIds(project).filter(id=>!ids.has(id)&&!canReadAsset(actor,id));
      const external=[...new Set([...JSON.stringify(project).matchAll(/https?:\/\/[^"\s]+/g)].map(m=>m[0]))];
      return{project,assets:checked,missing,external};
    },
    importProject(inspected,token){
      const actor=authenticate(token);requirePermission(actor,'templates.import');checkProjectChanges(actor,null,inspected.project,requirePermission);
      if(inspected.missing.length)throw new ServiceError('Import blocked: '+inspected.missing.length+' local image(s) are missing. Export a complete package from the original workstation.');
      // Remap embedded IDs; an imported package cannot overwrite another project's media.
      let text=JSON.stringify(inspected.project);db.exec('BEGIN IMMEDIATE');
      try{
        for(const a of inspected.assets){const id=randomUUID();db.prepare('INSERT INTO assets(id,name,mime,bytes,uploaded_by) VALUES(?,?,?,?,?)').run(id,a.name,a.mime,a.bytes,actor.user.id);text=text.split('/api/assets/'+a.id).join('/api/assets/'+id);}
        const project=validateProject(JSON.parse(text));project.id=randomUUID();project.name=project.name.slice(0,135)+' (imported)';db.exec('COMMIT');record('IMPORT',project.id,'success',actor);return project;
      }catch(e){db.exec('ROLLBACK');throw e;}
    },
    close(){commands.close();clocks.close();audit('APPLICATION_STOP','local','success');db.exec('PRAGMA wal_checkpoint(TRUNCATE)');db.close();}
  };
}
