import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {validateProject,sceneSchema,variablesSchema,sourceSchema} from '../lib/studio-model.ts';

import {ServiceError} from './service-error.mjs';
export {ServiceError} from './service-error.mjs';
import {createSecurity,migrateSecurity} from './security.mjs';
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
export function createLocalService({directory,encrypt,decrypt,beforePublish=()=>{},confirmProgram=async()=>{},event=()=>{},workstation=()=>'Local workstation',now=Date.now}){
  mkdirSync(directory,{recursive:true});
  const db=new DatabaseSync(join(directory,'broadcastcg.sqlite'));
  db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;');
  const version=db.prepare('PRAGMA user_version').get().user_version;
  if(version>2){db.close();throw Error('This data folder belongs to a newer BroadcastCG version.');}
  if(version===0)db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE projects(id TEXT PRIMARY KEY,name TEXT NOT NULL,document TEXT NOT NULL,revision INTEGER NOT NULL,updated_at INTEGER NOT NULL);
    CREATE TABLE assets(id TEXT PRIMARY KEY,name TEXT NOT NULL,mime TEXT NOT NULL,bytes BLOB NOT NULL);
    CREATE TABLE secrets(id TEXT PRIMARY KEY,ciphertext BLOB NOT NULL);
    CREATE TABLE settings(key TEXT PRIMARY KEY,document TEXT NOT NULL);
    CREATE TABLE recovery(id INTEGER PRIMARY KEY CHECK(id=1),document TEXT NOT NULL,revision INTEGER NOT NULL,updated_at INTEGER NOT NULL);
    CREATE TABLE events(id INTEGER PRIMARY KEY AUTOINCREMENT,time INTEGER NOT NULL,action TEXT NOT NULL,target TEXT NOT NULL,status TEXT NOT NULL,detail TEXT NOT NULL);
    PRAGMA user_version=1; COMMIT;`);
  migrateSecurity(db,directory,version===1);
  const security=createSecurity({db,now,workstation,event}),{auth,authenticate,requirePermission,requireWorkspace,canAccess,record}=security;
  const outputContext=Object.freeze({output:true});
  function actorFor(context){return authenticate(context?.token);}
  function readProject(actor,id){requireWorkspace(actor,id);const row=db.prepare('SELECT * FROM projects WHERE id=?').get(id);if(!row)throw new ServiceError('Workspace not found.',404);return {...row,project:JSON.parse(row.document)};}
  function canReadAsset(actor,id){const row=db.prepare('SELECT uploaded_by FROM assets WHERE id=?').get(id);return !!row&&(row.uploaded_by===actor.user.id||db.prepare('SELECT project_id FROM project_assets WHERE asset_id=?').all(id).some(p=>canAccess(actor,p.project_id)));}
  function validateAssets(actor,project){for(const id of assetIds(project))if(!canReadAsset(actor,id))throw new ServiceError('An image is missing or belongs to an inaccessible workspace.',403);}
  // Program deliberately starts empty. A restart never replays a TAKE.
  let program=null,publishing=false;
  const audit=(action,target,status,detail='')=>{db.prepare('INSERT INTO events(time,action,target,status,detail) VALUES(?,?,?,?,?)').run(Date.now(),action,target,status,detail);event(action,status);};
  const settings={get(key,fallback=null){const row=db.prepare('SELECT document FROM settings WHERE key=?').get(key);return row?JSON.parse(row.document):fallback;},set(key,value){db.prepare('INSERT INTO settings(key,document) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET document=excluded.document').run(key,JSON.stringify(value));}};
  audit('APPLICATION_START','local','success');

  async function route(request,context){
    const url=new URL(request.url),path=url.pathname,method=request.method;
    const outputRead=context===outputContext;
    if(outputRead&&(method!=='GET'||!(path==='/api/program'||path.startsWith('/api/assets/'))))throw new ServiceError('Output is read-only.',403);
    const actor=outputRead?null:actorFor(context);
    if(actor)requirePermission(actor,'projects.view');
    if(path==='/api/projects'&&method==='GET')return json(db.prepare('SELECT id,name,revision,updated_at FROM projects ORDER BY updated_at DESC').all().filter(p=>canAccess(actor,p.id)));
    if(path==='/api/projects'&&method==='POST'){
      const data=await readJson(request),project=validateProject(data.project),stamp=now();
      const current=actorFor(context),previous=db.prepare('SELECT document FROM projects WHERE id=?').get(project.id);
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
      settings.set('lastProject:'+actor.user.id,id);return json({project:JSON.parse(row.document),revision:row.revision});
    }
    if(path==='/api/program'&&method==='GET'){if(actor)requirePermission(actor,'outputs.view');return json(!program||outputRead||canAccess(actor,program.projectId)?program:null);}
    if(path==='/api/program'&&method==='POST'){
      const data=await readJson(request);
      if(publishing)throw new ServiceError('An output command is awaiting acknowledgement.',409);
      const current=actorFor(context);const mode=['hide','update','show'].includes(data.mode)?data.mode:'show';
      requirePermission(current,mode==='hide'?'graphics.clear':mode==='update'?'graphics.updateLive':'graphics.take');
      const projectId=mode==='hide'&&program?program.projectId:data.projectId;const saved=readProject(current,projectId).project;
      if(mode==='update'&&program?.projectId!==projectId)throw new ServiceError('Select the workspace currently on output.',409);
      let scene=data.scene===null?null:sceneSchema.parse(data.scene),variables=variablesSchema.parse(data.variables||{}),startedAt=Date.now();
      if(mode==='hide'&&program){scene=program.scene;variables=program.variables;}
      if(mode==='update'&&program?.scene?.id===scene?.id)startedAt=program.startedAt;
      if(mode!=='hide'){const canonical=saved.scenes.find(s=>s.id===scene?.id);if(!canonical||JSON.stringify(canonical)!==JSON.stringify(scene))throw new ServiceError('Save this graphic before sending it to output.',409);checkVariables(current,saved,variables,requirePermission);}
      beforePublish();publishing=true;
      try{
        program={scene,variables,mode,startedAt,revision:randomUUID(),projectId};
        await confirmProgram(program);
        record(mode.toUpperCase(),scene?.id||'program','acknowledged',current,{projectId});return json(program);
      }catch(e){record(mode.toUpperCase(),scene?.id||'program','unconfirmed',current,{projectId});throw e;}
      finally{publishing=false;}
    }
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
        const response=await fetch(endpoint,{headers,redirect:'error',signal:AbortSignal.timeout(10000)});
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
    authorize(token,permission){const actor=authenticate(token);if(permission)requirePermission(actor,permission);return actor;},
    health(){try{return Number.isInteger(db.prepare('PRAGMA schema_version').get().schema_version);}catch{return false;}},
    async handle(request,context){try{return await route(request,context);}catch(e){const status=e instanceof ServiceError?e.status:e?.issues?400:500;if(status>=500)event('SERVICE_ERROR','failed');return json({error:e instanceof ServiceError?e.message:e?.issues?'Project validation failed. Existing data was preserved.':'The local service could not complete the operation.'},status);}},
    diagnostics(){return{database:db.prepare('PRAGMA quick_check').get().quick_check,schemaVersion:2,projects:db.prepare('SELECT count(*) AS n FROM projects').get().n,events:db.prepare('SELECT time,action,target,status FROM events ORDER BY id DESC LIMIT 100').all()};},
    exportProject(raw,token){
      const actor=authenticate(token);requirePermission(actor,'templates.export');const project=validateProject(raw),assets=[],missing=[];
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
    close(){audit('APPLICATION_STOP','local','success');db.exec('PRAGMA wal_checkpoint(TRUNCATE)');db.close();}
  };
}
