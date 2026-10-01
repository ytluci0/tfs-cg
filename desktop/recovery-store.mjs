import {DatabaseSync} from 'node:sqlite';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,renameSync,unlinkSync,existsSync,readdirSync,statSync} from 'node:fs';
import {join,basename} from 'node:path';
import {sealBackup,openBackup,secretCodec} from './server-crypto.mjs';
import {validateProject} from '../lib/studio-model.ts';
import {ServiceError} from './service-error.mjs';
const digest=b=>createHash('sha256').update(b).digest('hex');
const safeId=id=>{if(typeof id!=='string'||!/^\d{13}-[a-f0-9-]{36}$/.test(id))throw Error('Choose an existing recovery backup.');return id;};
const atomic=(file,bytes)=>{const temp=file+'.partial-'+randomUUID();writeFileSync(temp,bytes,{flag:'wx'});renameSync(temp,file);};
function inspectDatabase(db){
 db.exec('PRAGMA trusted_schema=OFF; PRAGMA foreign_keys=ON;');
 if(db.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw Error('Backup database failed integrity verification.');
 const schemaVersion=db.prepare('PRAGMA user_version').get().user_version;
 if(schemaVersion<2||schemaVersion>7)throw Error('Backup schema is unsupported. Use a compatible BroadcastCG release.');
 if(db.prepare("SELECT name FROM sqlite_master WHERE type IN ('trigger','view') LIMIT 1").get())throw Error('Backup contains unsupported database objects.');
 for(const name of ['projects','assets','settings','auth_users','auth_sessions','auth_remember','auth_failures','secrets','project_secrets'])if(!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name))throw Error('Backup is missing '+name+'.');
 if(db.prepare('PRAGMA foreign_key_check').get())throw Error('Backup contains broken database relationships.');
 for(const row of db.prepare('SELECT document FROM projects').all())validateProject(JSON.parse(row.document));
 return{schemaVersion,projects:db.prepare('SELECT count(*) n FROM projects').get().n,accounts:db.prepare('SELECT count(*) n FROM auth_users').get().n,images:db.prepare('SELECT count(*) n FROM assets').get().n};
}
function rewrap(db,from,to){
 for(const row of db.prepare('SELECT id,ciphertext FROM secrets').all())db.prepare('UPDATE secrets SET ciphertext=? WHERE id=?').run(to(from(Buffer.from(row.ciphertext))),row.id);
 for(const row of db.prepare('SELECT project_id,source_id,ciphertext FROM project_secrets').all())db.prepare('UPDATE project_secrets SET ciphertext=? WHERE project_id=? AND source_id=?').run(to(from(Buffer.from(row.ciphertext))),row.project_id,row.source_id);
}
function temporary(directory,bytes,fn){
 mkdirSync(directory,{recursive:true});const file=join(directory,'verify-'+randomUUID()+'.sqlite');writeFileSync(file,bytes,{flag:'wx'});let db;
 try{db=new DatabaseSync(file);return fn(db,file);}finally{db?.close();for(const suffix of ['','-wal','-shm'])try{unlinkSync(file+suffix);}catch{}}
}
export async function inspectBackup(directory,bytes,password){
 const opened=await openBackup(bytes,password);try{return temporary(directory,opened.database,db=>{const summary=inspectDatabase(db),codec=secretCodec(opened.key);for(const row of db.prepare('SELECT ciphertext FROM secrets UNION ALL SELECT ciphertext FROM project_secrets').all())codec.decrypt(Buffer.from(row.ciphertext));return{...summary,sha256:digest(bytes),bytes:bytes.length,verified:true};});}finally{opened.key.fill(0);opened.database.fill(0);}
}
export function createRecoveryStore({directory,snapshot,authorize,encrypt,decrypt,now=Date.now}){
 const folder=join(directory,'recovery-backups'),temp=join(directory,'recovery-work');mkdirSync(folder,{recursive:true});
 const allow=token=>{const actor=authorize(token,'system.configure');authorize(token,'users.manage');if(actor.user.accessExpiresAt!==null)throw new ServiceError('Recovery administration requires an unlimited administrator account.',403);};
 function bytes(id){const file=join(folder,safeId(id)+'.bcbackup');if(statSync(file).size>200000086)throw Error('Backup exceeds 200 MB.');return readFileSync(file);}
 return{
  list(token){allow(token);return readdirSync(folder).filter(n=>/^\d{13}-[a-f0-9-]{36}\.bcbackup$/.test(n)).map(n=>{const id=n.slice(0,-9);let meta={};try{meta=JSON.parse(readFileSync(join(folder,id+'.json'),'utf8'));}catch{}return{id,createdAt:Number(id.slice(0,13)),label:typeof meta.label==='string'?meta.label.slice(0,100):'Recovery backup',bytes:statSync(join(folder,n)).size,sha256:meta.sha256||null};}).sort((a,b)=>b.createdAt-a.createdAt);},
  async create(token,{password,label='Manual backup'}={}){
   allow(token);if(typeof label!=='string'||label.length>100)throw Error('Use a backup label of up to 100 characters.');
   const key=randomBytes(32);let portable;
   try{portable=temporary(temp,snapshot(token),(db,file)=>{inspectDatabase(db);db.exec('PRAGMA journal_mode=DELETE; BEGIN IMMEDIATE;');try{rewrap(db,decrypt,secretCodec(key).encrypt);db.exec('COMMIT;');}catch(e){db.exec('ROLLBACK');throw e;}return readFileSync(file);});const sealed=await sealBackup(portable,key,password);allow(token);const id=now()+'-'+randomUUID();atomic(join(folder,id+'.bcbackup'),sealed);atomic(join(folder,id+'.json'),JSON.stringify({label:label.trim()||'Manual backup',sha256:digest(sealed)}));return{id,label,bytes:sealed.length,sha256:digest(sealed)};}finally{key.fill(0);portable?.fill(0);}
  },
  async verify(token,{id,password}){allow(token);const result=await inspectBackup(temp,bytes(id),password);allow(token);return result;},
  export(token,id){allow(token);return bytes(id);},
  async inspect(token,content,password){allow(token);const result=await inspectBackup(temp,content,password);allow(token);return result;},
  async prepareRestore(token,content,password){allow(token);const prepared=await prepareRestore(directory,content,password,encrypt);try{allow(token);return prepared;}catch(e){unlinkSync(prepared.file);throw e;}},
 };
}
export async function prepareRestore(directory,bytes,password,encrypt){
 const opened=await openBackup(bytes,password),file=join(directory,'restore-prepared-'+randomUUID()+'.sqlite');mkdirSync(directory,{recursive:true});let db;
 try{
  writeFileSync(file,opened.database,{flag:'wx'});db=new DatabaseSync(file);const summary=inspectDatabase(db);db.exec('PRAGMA journal_mode=DELETE; BEGIN IMMEDIATE;');
  try{rewrap(db,secretCodec(opened.key).decrypt,encrypt);db.exec('DELETE FROM auth_sessions; DELETE FROM auth_remember; DELETE FROM auth_failures; COMMIT;');}catch(e){db.exec('ROLLBACK');throw e;}
  inspectDatabase(db);db.close();db=null;return{file,...summary};
 }catch(e){db?.close();try{unlinkSync(file);}catch{}throw e;}finally{opened.key.fill(0);opened.database.fill(0);}
}
function journal(directory){
 const file=join(directory,'restore-journal.json');if(!existsSync(file))return null;
 const j=JSON.parse(readFileSync(file,'utf8'));
 if(j.version!==1||!/^restore-prepared-[a-f0-9-]{36}\.sqlite$/.test(j.prepared)||!/^rollback-[a-f0-9-]{36}\.sqlite$/.test(j.rollback))throw Error('Restore journal is invalid. Original database files have been preserved for manual recovery.');
 return j;
}
export function recoverInterruptedRestore(directory){
 const j=journal(directory);if(!j)return null;
 const target=join(directory,'broadcastcg.sqlite'),old=join(directory,j.rollback);
 if(existsSync(old)){
  if(existsSync(target))renameSync(target,join(directory,'interrupted-restore-'+randomUUID()+'.sqlite'));
  // A failed opening may have created sidecars. Preserve them separately.
  for(const suffix of ['-wal','-shm'])if(existsSync(target+suffix))renameSync(target+suffix,join(directory,'interrupted-sidecar-'+randomUUID()+suffix));
  renameSync(old,target);
 }else if(j.hadOriginal===false){if(existsSync(target))renameSync(target,join(directory,'interrupted-restore-'+randomUUID()+'.sqlite'));}
 else if(!existsSync(target))throw Error('Restore recovery requires manual attention. No database files were deleted.');
 renameSync(join(directory,'restore-journal.json'),join(directory,'restore-recovered-'+randomUUID()+'.json'));return{recovered:true};
}
export function commitRestore(directory,prepared,{afterStep=()=>{}}={}){
 const target=join(directory,'broadcastcg.sqlite');
 if(join(directory,basename(prepared.file))!==prepared.file||!/^restore-prepared-[a-f0-9-]{36}\.sqlite$/.test(basename(prepared.file)))throw Error('Invalid prepared restore path.');
 if(existsSync(join(directory,'restore-journal.json')))throw Error('Resolve the earlier restore before replacing the database.');
 if(existsSync(target+'-wal')&&statSync(target+'-wal').size>0)throw Error('Close the database cleanly before restoring. Its WAL is still active.');
 const value={version:1,prepared:basename(prepared.file),rollback:'rollback-'+randomUUID()+'.sqlite',hadOriginal:existsSync(target),createdAt:Date.now()};
 atomic(join(directory,'restore-journal.json'),JSON.stringify(value));afterStep('journal');
 if(existsSync(target))renameSync(target,join(directory,value.rollback));afterStep('old-moved');
 for(const suffix of ['-wal','-shm'])if(existsSync(target+suffix))renameSync(target+suffix,join(directory,'previous-sidecar-'+randomUUID()+suffix));
 renameSync(prepared.file,target);afterStep('new-promoted');
 return{rollback:join(directory,value.rollback)};
}
export function completeRestore(directory){if(journal(directory))renameSync(join(directory,'restore-journal.json'),join(directory,'restore-completed-'+randomUUID()+'.json'));}
