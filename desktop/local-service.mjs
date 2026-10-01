import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {validateProject,sceneSchema,variablesSchema,sourceSchema} from '../lib/studio-model.ts';

export class ServiceError extends Error {
  constructor(message,status=400){super(message);this.status=status;}
}
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
export function createLocalService({directory,encrypt,decrypt,beforePublish=()=>{},confirmProgram=async()=>{},event=()=>{}}){
  mkdirSync(directory,{recursive:true});
  const db=new DatabaseSync(join(directory,'broadcastcg.sqlite'));
  db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;');
  const version=db.prepare('PRAGMA user_version').get().user_version;
  if(version>1){db.close();throw Error('This data folder belongs to a newer BroadcastCG version.');}
  if(version===0)db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE projects(id TEXT PRIMARY KEY,name TEXT NOT NULL,document TEXT NOT NULL,revision INTEGER NOT NULL,updated_at INTEGER NOT NULL);
    CREATE TABLE assets(id TEXT PRIMARY KEY,name TEXT NOT NULL,mime TEXT NOT NULL,bytes BLOB NOT NULL);
    CREATE TABLE secrets(id TEXT PRIMARY KEY,ciphertext BLOB NOT NULL);
    CREATE TABLE settings(key TEXT PRIMARY KEY,document TEXT NOT NULL);
    CREATE TABLE recovery(id INTEGER PRIMARY KEY CHECK(id=1),document TEXT NOT NULL,revision INTEGER NOT NULL,updated_at INTEGER NOT NULL);
    CREATE TABLE events(id INTEGER PRIMARY KEY AUTOINCREMENT,time INTEGER NOT NULL,action TEXT NOT NULL,target TEXT NOT NULL,status TEXT NOT NULL,detail TEXT NOT NULL);
    PRAGMA user_version=1; COMMIT;`);
  // Program deliberately starts empty. A restart never replays a TAKE.
  let program=null,publishing=false;
  const audit=(action,target,status,detail='')=>{db.prepare('INSERT INTO events(time,action,target,status,detail) VALUES(?,?,?,?,?)').run(Date.now(),action,target,status,detail);event(action,status);};
  const settings={get(key,fallback=null){const row=db.prepare('SELECT document FROM settings WHERE key=?').get(key);return row?JSON.parse(row.document):fallback;},set(key,value){db.prepare('INSERT INTO settings(key,document) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET document=excluded.document').run(key,JSON.stringify(value));}};
  audit('APPLICATION_START','local','success');

  async function route(request){
    const url=new URL(request.url),path=url.pathname,method=request.method;
    if(path==='/api/projects'&&method==='GET')return json(db.prepare('SELECT id,name,revision,updated_at FROM projects ORDER BY updated_at DESC').all());
    if(path==='/api/projects'&&method==='POST'){
      const data=await readJson(request),project=validateProject(data.project),now=Date.now();
      db.exec('BEGIN IMMEDIATE');let next;
      try{
        const old=db.prepare('SELECT revision FROM projects WHERE id=?').get(project.id);
        if(old&&old.revision!==data.revision)throw new ServiceError('Project changed since it was opened. Export your edits before reopening it.',409);
        next=(old?.revision||0)+1;
        db.prepare('INSERT INTO projects(id,name,document,revision,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,document=excluded.document,revision=excluded.revision,updated_at=excluded.updated_at').run(project.id,project.name,JSON.stringify(project),next,now);
        settings.set('lastProject',project.id);
        db.exec('COMMIT');
      }catch(e){db.exec('ROLLBACK');throw e;}
      return json({id:project.id,revision:next,updatedAt:now});
    }
    if(path.startsWith('/api/projects/')&&method==='GET'){
      const id=decodeURIComponent(path.slice('/api/projects/'.length)),row=db.prepare('SELECT document,revision FROM projects WHERE id=?').get(id);
      if(!row)throw new ServiceError('Project not found.',404);
      settings.set('lastProject',id);return json({project:JSON.parse(row.document),revision:row.revision});
    }
    if(path==='/api/program'&&method==='GET')return json(program);
    if(path==='/api/program'&&method==='POST'){
      const data=await readJson(request);
      if(publishing)throw new ServiceError('An output command is awaiting acknowledgement.',409);
      const mode=['hide','update','show'].includes(data.mode)?data.mode:'show';
      let scene=data.scene===null?null:sceneSchema.parse(data.scene),variables=variablesSchema.parse(data.variables||{}),startedAt=Date.now();
      if(mode==='hide'&&program){scene=program.scene;variables=program.variables;}
      if(mode==='update'&&program?.scene?.id===scene?.id)startedAt=program.startedAt;
      beforePublish();publishing=true;
      try{
        program={scene,variables,mode,startedAt,revision:randomUUID()};
        await confirmProgram(program);
        audit(mode.toUpperCase(),scene?.id||'program','acknowledged');return json(program);
      }catch(e){audit(mode.toUpperCase(),scene?.id||'program','unconfirmed');throw e;}
      finally{publishing=false;}
    }
    if(path==='/api/assets'&&method==='POST'){
      const bytes=await readBytes(request,10000000),mime=imageMime(bytes),id=randomUUID(),name=(request.headers.get('x-file-name')||'Image').slice(0,250);
      db.prepare('INSERT INTO assets(id,name,mime,bytes) VALUES(?,?,?,?)').run(id,name,mime,bytes);
      return json({id,url:'/api/assets/'+id,mime,name});
    }
    if(path.startsWith('/api/assets/')&&method==='GET'){
      const id=path.slice('/api/assets/'.length),row=db.prepare('SELECT mime,bytes FROM assets WHERE id=?').get(id);
      if(!row)throw new ServiceError('Image is missing from this workstation. Import its complete project package.',404);
      return new Response(row.bytes,{headers:{'Content-Type':row.mime,'Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff'}});
    }
    if(path==='/api/sources'&&method==='POST'){
      const data=await readJson(request,16000);
      if(typeof data.sourceId!=='string'||data.sourceId.length>100||!data.headers||typeof data.headers!=='object'||Array.isArray(data.headers))throw new ServiceError('Enter headers as a JSON object.');
      const headers={};
      for(const [key,value] of Object.entries(data.headers)){
        if(typeof value!=='string'||!/^[-a-zA-Z0-9]+$/.test(key)||/[\r\n]/.test(value)||['host','cookie','content-length','connection'].includes(key.toLowerCase()))throw new ServiceError('This header is not supported.');
        headers[key]=value;
      }
      if(!encrypt)throw new ServiceError('Windows credential protection is unavailable. Headers were not saved.',503);
      const cipher=encrypt(JSON.stringify(headers));
      db.prepare('INSERT INTO secrets(id,ciphertext) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET ciphertext=excluded.ciphertext').run(data.sourceId,cipher);
      return json({saved:true});
    }
    if(path==='/api/sources/fetch'&&method==='POST'){
      const {source:raw}=await readJson(request,8000),source=sourceSchema.parse(raw);let endpoint;
      try{endpoint=new URL(source.url);}catch{throw new ServiceError('Enter a valid HTTPS data endpoint.');}
      if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password)throw new ServiceError('Data feeds require HTTPS without credentials in the URL.');
      const row=db.prepare('SELECT ciphertext FROM secrets WHERE id=?').get(source.id);
      const headers=new Headers(row?JSON.parse(decrypt(Buffer.from(row.ciphertext))):{});if(!headers.has('Accept'))headers.set('Accept','application/json');
      try{
        const response=await fetch(endpoint,{headers,redirect:'error',signal:AbortSignal.timeout(10000)});
        if(!response.ok)throw new ServiceError('Data feed returned HTTP '+response.status+'.',502);
        const data=JSON.parse((await readBytes(response,2000000)).toString('utf8'));
        audit('DATA_FETCH',source.id,'success');return json({data,fetchedAt:Date.now()});
      }catch(e){audit('DATA_FETCH',source.id,'failed');if(e instanceof ServiceError)throw e;throw new ServiceError('Data feed could not be read. Check its connection and HTTPS endpoint.',502);}
    }
    if(path==='/api/desktop/recovery'&&method==='POST'){
      const data=await readJson(request),project=validateProject(data.project);
      db.prepare('INSERT INTO recovery(id,document,revision,updated_at) VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET document=excluded.document,revision=excluded.revision,updated_at=excluded.updated_at').run(JSON.stringify(project),Number.isSafeInteger(data.revision)?data.revision:0,Date.now());
      return json({saved:true});
    }
    if(path==='/api/desktop/recovery'&&method==='GET'){
      const row=db.prepare('SELECT document,revision,updated_at FROM recovery WHERE id=1').get();
      if(!row)return json(null);
      const project=JSON.parse(row.document),saved=db.prepare('SELECT document,revision FROM projects WHERE id=?').get(project.id);
      if(saved?.document===row.document)return json(null);
      return json({project,revision:row.revision,updatedAt:row.updated_at,conflict:!!saved&&saved.revision!==row.revision});
    }
    if(path==='/api/desktop/recovery'&&method==='DELETE'){db.prepare('DELETE FROM recovery WHERE id=1').run();return json({cleared:true});}
    throw new ServiceError('Local operation is not supported.',404);
  }

  return {
    settings,
    health(){try{return Number.isInteger(db.prepare('PRAGMA schema_version').get().schema_version);}catch{return false;}},
    async handle(request){try{return await route(request);}catch(e){const status=e instanceof ServiceError?e.status:e?.issues?400:500;if(status>=500)event('SERVICE_ERROR','failed');return json({error:e instanceof ServiceError?e.message:e?.issues?'Project validation failed. Existing data was preserved.':'The local service could not complete the operation.'},status);}},
    diagnostics(){return{database:db.prepare('PRAGMA quick_check').get().quick_check,schemaVersion:1,projects:db.prepare('SELECT count(*) AS n FROM projects').get().n,events:db.prepare('SELECT time,action,target,status FROM events ORDER BY id DESC LIMIT 100').all()};},
    exportProject(raw){
      const project=validateProject(raw),assets=[],missing=[];
      for(const id of assetIds(project)){const a=db.prepare('SELECT id,name,mime,bytes FROM assets WHERE id=?').get(id);if(a)assets.push({...a,bytes:Buffer.from(a.bytes).toString('base64')});else missing.push(id);}
      if(missing.length)throw new ServiceError('Cannot export a complete project: '+missing.length+' image(s) are missing. Replace or upload them first.');
      const document=JSON.stringify({format:'broadcastcg-project',version:1,project,assets},null,2);
      if(Buffer.byteLength(document)>100000000)throw new ServiceError('Project package exceeds the current 100 MB limit.');
      return document;
    },
    inspectImport(text){
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
      const missing=assetIds(project).filter(id=>!ids.has(id)&&!db.prepare('SELECT id FROM assets WHERE id=?').get(id));
      const external=[...new Set([...JSON.stringify(project).matchAll(/https?:\/\/[^"\s]+/g)].map(m=>m[0]))];
      return{project,assets:checked,missing,external};
    },
    importProject(inspected){
      if(inspected.missing.length)throw new ServiceError('Import blocked: '+inspected.missing.length+' local image(s) are missing. Export a complete package from the original workstation.');
      // Remap embedded IDs; an imported package cannot overwrite another project's media.
      let text=JSON.stringify(inspected.project);db.exec('BEGIN IMMEDIATE');
      try{
        for(const a of inspected.assets){const id=randomUUID();db.prepare('INSERT INTO assets(id,name,mime,bytes) VALUES(?,?,?,?)').run(id,a.name,a.mime,a.bytes);text=text.split('/api/assets/'+a.id).join('/api/assets/'+id);}
        const project=validateProject(JSON.parse(text));project.id=randomUUID();project.name=project.name.slice(0,135)+' (imported)';db.exec('COMMIT');audit('IMPORT',project.id,'success');return project;
      }catch(e){db.exec('ROLLBACK');throw e;}
    },
    close(){audit('APPLICATION_STOP','local','success');db.exec('PRAGMA wal_checkpoint(TRUNCATE)');db.close();}
  };
}
