import {randomBytes,randomUUID,createHash,scrypt,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {permissionLabels,rolePermissions} from '../lib/permissions.ts';
import {ServiceError} from './service-error.mjs';

const derive=promisify(scrypt);
const PASSWORD_OPTIONS={N:131072,r:8,p:1,maxmem:160*1024*1024};
const SESSION_MS=12*60*60*1000,IDLE_MS=30*60*1000,REMEMBER_MS=30*24*60*60*1000;
const tokenHash=value=>createHash('sha256').update(value).digest('hex');
const tokens=()=>randomBytes(32).toString('base64url');
const checkPassword=value=>{if(typeof value!=='string'||value.length<15||value.length>128)throw new ServiceError('Use a password or passphrase between 15 and 128 characters.');};
const username=value=>{if(typeof value!=='string'||!/^[a-z][a-z0-9_.-]{2,31}$/i.test(value.trim()))throw new ServiceError('Username must be 3–32 characters: letters, numbers, dots, underscores or hyphens.');return value.trim().toLowerCase();};
const string=(value,max=100)=>{if(typeof value!=='string'||value.length>max)throw new ServiceError('Invalid text field.');return value.trim();};
const validPermissionList=value=>{if(!Array.isArray(value)||value.length>Object.keys(permissionLabels).length||value.some(p=>!Object.hasOwn(permissionLabels,p)))throw new ServiceError('Invalid permission list.');return [...new Set(value)];};

export function migrateSecurity(db,directory,makeBackup){
 if(db.prepare('PRAGMA user_version').get().user_version>=2)return;
 if(makeBackup){const folder=join(directory,'backups');mkdirSync(folder,{recursive:true});db.prepare('VACUUM INTO ?').run(join(folder,'before-accounts-'+Date.now()+'-'+randomUUID()+'.sqlite'));}
 try{db.exec(`BEGIN IMMEDIATE;
 CREATE TABLE auth_users(id TEXT PRIMARY KEY,username TEXT UNIQUE NOT NULL COLLATE NOCASE,display_name TEXT NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 1,all_workspaces INTEGER NOT NULL DEFAULT 0,extra_permissions TEXT NOT NULL DEFAULT '[]',denied_permissions TEXT NOT NULL DEFAULT '[]',must_change_password INTEGER NOT NULL DEFAULT 0,last_login INTEGER,created_at INTEGER NOT NULL);
 CREATE TABLE auth_roles(id TEXT PRIMARY KEY,permissions TEXT NOT NULL);
 CREATE TABLE workspace_grants(user_id TEXT NOT NULL REFERENCES auth_users(id),project_id TEXT NOT NULL REFERENCES projects(id),PRIMARY KEY(user_id,project_id));
 CREATE TABLE auth_remember(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES auth_users(id),token_hash TEXT UNIQUE NOT NULL,expires_at INTEGER NOT NULL,workstation TEXT NOT NULL);
 CREATE TABLE auth_sessions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES auth_users(id),token_hash TEXT UNIQUE NOT NULL,created_at INTEGER NOT NULL,last_seen INTEGER NOT NULL,expires_at INTEGER NOT NULL,idle_expires_at INTEGER NOT NULL,revoked_at INTEGER,remember_id TEXT,workstation TEXT NOT NULL);
 CREATE TABLE auth_failures(identity TEXT PRIMARY KEY,failures INTEGER NOT NULL,window_start INTEGER NOT NULL,locked_until INTEGER NOT NULL);
 ALTER TABLE recovery RENAME TO legacy_recovery;
 CREATE TABLE recovery(user_id TEXT PRIMARY KEY REFERENCES auth_users(id),document TEXT NOT NULL,revision INTEGER NOT NULL,updated_at INTEGER NOT NULL);
 ALTER TABLE assets ADD COLUMN uploaded_by TEXT;
 CREATE TABLE project_assets(project_id TEXT NOT NULL REFERENCES projects(id),asset_id TEXT NOT NULL REFERENCES assets(id),PRIMARY KEY(project_id,asset_id));
 CREATE TABLE project_secrets(project_id TEXT NOT NULL REFERENCES projects(id),source_id TEXT NOT NULL,ciphertext BLOB NOT NULL,PRIMARY KEY(project_id,source_id));
 ALTER TABLE events ADD COLUMN user_id TEXT;
 ALTER TABLE events ADD COLUMN username TEXT;
 ALTER TABLE events ADD COLUMN workstation TEXT;
 ALTER TABLE events ADD COLUMN project_id TEXT;
 ALTER TABLE events ADD COLUMN previous_value TEXT;
 ALTER TABLE events ADD COLUMN next_value TEXT;
 CREATE INDEX sessions_token ON auth_sessions(token_hash);
 CREATE INDEX events_time ON events(time);
 `);
  for(const [id,permissions] of Object.entries(rolePermissions))db.prepare('INSERT INTO auth_roles(id,permissions) VALUES(?,?)').run(id,JSON.stringify(permissions));
  for(const row of db.prepare('SELECT id,document FROM projects').all()){
   const project=JSON.parse(row.document);
   for(const m of row.document.matchAll(/\/api\/assets\/([a-zA-Z0-9-]+)/g))if(db.prepare('SELECT id FROM assets WHERE id=?').get(m[1]))db.prepare('INSERT OR IGNORE INTO project_assets(project_id,asset_id) VALUES(?,?)').run(row.id,m[1]);
   for(const source of project.sources||[]){const old=db.prepare('SELECT ciphertext FROM secrets WHERE id=?').get(source.id);if(old)db.prepare('INSERT INTO project_secrets(project_id,source_id,ciphertext) VALUES(?,?,?)').run(row.id,source.id,old.ciphertext);}
  }
  db.exec('PRAGMA user_version=2; COMMIT;');
 }catch(e){db.exec('ROLLBACK');throw e;}
}

export function createSecurity({db,now=Date.now,workstation=()=> 'Local workstation',event=()=>{}}){
 let hashing=false;
 async function passwordHash(value){checkPassword(value);const salt=randomBytes(16);const key=await derive(value,salt,64,PASSWORD_OPTIONS);return 'scrypt$131072$8$1$'+salt.toString('hex')+'$'+key.toString('hex');}
 async function verify(value,stored){
  if(typeof value!=='string'||value.length>128)return false;
  const parts=(stored||('scrypt$131072$8$1$'+'00'.repeat(16)+'$'+'00'.repeat(64))).split('$');
  if(parts.length!==6||parts[0]!=='scrypt'||parts[1]!=='131072'||parts[2]!=='8'||parts[3]!=='1'||!/^[a-f0-9]{32}$/.test(parts[4])||!/^[a-f0-9]{128}$/.test(parts[5]))return false;
  const key=await derive(value,Buffer.from(parts[4],'hex'),64,PASSWORD_OPTIONS);return timingSafeEqual(key,Buffer.from(parts[5],'hex'));
 }
 async function hashOperation(fn){if(hashing)throw new ServiceError('Authentication is busy. Please retry shortly.',429);hashing=true;try{return await fn();}finally{hashing=false;}}
 function userView(row){
  const base=JSON.parse(db.prepare('SELECT permissions FROM auth_roles WHERE id=?').get(row.role)?.permissions||'[]'),extra=JSON.parse(row.extra_permissions),denied=JSON.parse(row.denied_permissions);
  return{id:row.id,username:row.username,displayName:row.display_name,role:row.role,enabled:!!row.enabled,accessStartsAt:row.access_starts_at??null,accessExpiresAt:row.access_expires_at??null,accessStatus:!row.enabled?'disabled':row.access_starts_at>now()?'scheduled':row.access_expires_at!==null&&row.access_expires_at<=now()?'expired':'active',allWorkspaces:!!row.all_workspaces,workspaceIds:db.prepare('SELECT project_id FROM workspace_grants WHERE user_id=?').all(row.id).map(r=>r.project_id),extraPermissions:extra,deniedPermissions:denied,permissions:[...new Set([...base,...extra])].filter(p=>!denied.includes(p)),mustChangePassword:!!row.must_change_password,lastLogin:row.last_login};
 }
 function record(action,target,status,actor=null,{projectId=null,previous=null,next=null,detail=''}={}){
  db.prepare('INSERT INTO events(time,action,target,status,detail,user_id,username,workstation,project_id,previous_value,next_value) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(now(),action,String(target).slice(0,200),status,detail,actor?.user.id||null,actor?.user.username||null,actor?.workstation||workstation(),projectId,previous===null?null:JSON.stringify(previous).slice(0,4000),next===null?null:JSON.stringify(next).slice(0,4000));event(action,status);
 }
 function authenticate(token,{allowPasswordChange=false}={}){
  if(typeof token!=='string'||token.length<30||token.length>100)throw new ServiceError('Sign in to your local account.',401);
  const session=db.prepare('SELECT * FROM auth_sessions WHERE token_hash=?').get(tokenHash(token)),time=now();
  if(!session||session.revoked_at)throw new ServiceError('Your session ended. Sign in again.',401);
  const row=db.prepare('SELECT * FROM auth_users WHERE id=?').get(session.user_id);
  if(!row?.enabled)throw new ServiceError('Your session ended. Sign in again.',401);
  checkAccessWindow(row);
  if(session.expires_at<=time||session.idle_expires_at<=time)throw new ServiceError('Your session ended. Sign in again.',401);
  const actor={user:userView(row),sessionId:session.id,expiresAt:session.expires_at,idleExpiresAt:session.idle_expires_at,workstation:session.workstation};
  if(actor.user.mustChangePassword&&!allowPasswordChange)throw new ServiceError('Change your temporary password before opening a workspace.',403);
  return actor;
 }
 function publicSession(actor){const {workstation:ignored,...view}=actor;return{...view,serverTime:now()};}
 function requirePermission(actor,permission){if(!actor?.user.permissions.includes(permission)){record('ACCESS_DENIED',permission,'denied',actor);throw new ServiceError('Your account does not have permission: '+(permissionLabels[permission]||permission)+'.',403);}}
 function canAccess(actor,projectId){return !!actor&&(actor.user.allWorkspaces||actor.user.workspaceIds.includes(projectId));}
 function requireWorkspace(actor,id){requirePermission(actor,'projects.view');if(typeof id!=='string'||!canAccess(actor,id))throw new ServiceError('This workspace is not assigned to your account.',403);}
 function revokeUser(id){db.prepare('UPDATE auth_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL').run(now(),id);db.prepare('DELETE FROM auth_remember WHERE user_id=?').run(id);}
 function checkAccessWindow(row){
  if(row.access_starts_at!==null&&row.access_starts_at>now())throw new ServiceError('Your access has not started yet. Contact the administrator.',401);
  if(row.access_expires_at!==null&&row.access_expires_at<=now()){
   const active=db.prepare('SELECT id FROM auth_sessions WHERE user_id=? AND revoked_at IS NULL LIMIT 1').get(row.id);revokeUser(row.id);
   if(active)record('ACCESS_EXPIRED',row.id,'expired',{user:userView(row),workstation:workstation()},{next:{accessExpiresAt:row.access_expires_at}});
   throw new ServiceError('Your access period has expired. Contact the administrator to renew it.',401);
  }
 }
 function limitDelegation(actor,c,old){
  const end=actor.user.accessExpiresAt;if(end===null)return;
  if(old&&(old.access_expires_at===null||old.access_expires_at>end)||c&&(c.accessExpiresAt===null||c.accessExpiresAt>end))throw new ServiceError('A time-limited administrator cannot grant or modify access beyond their own expiry.',403);
 }
 function issue(row,remember=false,station=workstation()){
  checkAccessWindow(row);
  const time=now(),token=tokens(),id=randomUUID(),machine=string(station,100);let rememberToken=null,rememberId=null;
  const deadline=row.access_expires_at??Number.MAX_SAFE_INTEGER;
  if(remember&&!row.must_change_password){rememberToken=tokens();rememberId=randomUUID();db.prepare('INSERT INTO auth_remember(id,user_id,token_hash,expires_at,workstation) VALUES(?,?,?,?,?)').run(rememberId,row.id,tokenHash(rememberToken),Math.min(time+REMEMBER_MS,deadline),machine);}
  db.prepare('INSERT INTO auth_sessions(id,user_id,token_hash,created_at,last_seen,expires_at,idle_expires_at,remember_id,workstation) VALUES(?,?,?,?,?,?,?,?,?)').run(id,row.id,tokenHash(token),time,time,Math.min(time+SESSION_MS,deadline),Math.min(time+IDLE_MS,deadline),rememberId,machine);
  db.prepare('UPDATE auth_users SET last_login=? WHERE id=?').run(time,row.id);
  const actor=authenticate(token,{allowPasswordChange:true});record('LOGIN',row.id,'success',actor);return{token,rememberToken,session:publicSession(actor)};
 }
 function checkLimit(identity){const time=now();for(const key of [identity,'*']){const r=db.prepare('SELECT * FROM auth_failures WHERE identity=?').get(key);if(r?.locked_until>time)throw new ServiceError('Too many sign-in attempts. Wait five minutes and try again.',429);}}
 function failure(identity){const time=now();for(const key of [identity,'*']){const old=db.prepare('SELECT * FROM auth_failures WHERE identity=?').get(key),recent=old&&time-old.window_start<15*60*1000,count=recent?old.failures+1:1;db.prepare('INSERT INTO auth_failures(identity,failures,window_start,locked_until) VALUES(?,?,?,?) ON CONFLICT(identity) DO UPDATE SET failures=excluded.failures,window_start=excluded.window_start,locked_until=excluded.locked_until').run(key,count,recent?old.window_start:time,count>=(key==='*'?30:5)?time+5*60*1000:0);}record('LOGIN_FAILED',identity,'failed');}
 function config(data){
  if(!data||typeof data!=='object'||!Object.hasOwn(rolePermissions,data.role))throw new ServiceError('Choose a valid role.');
  const displayName=string(data.displayName||data.username),extra=validPermissionList(data.extraPermissions||[]),denied=validPermissionList(data.deniedPermissions||[]);
  if(data.role==='ADMIN'&&denied.length)throw new ServiceError('Administrators must retain full permissions. Choose another role to restrict access.');
  if(!Array.isArray(data.workspaceIds)||data.workspaceIds.length>500||data.workspaceIds.some(id=>typeof id!=='string'||!db.prepare('SELECT id FROM projects WHERE id=?').get(id)))throw new ServiceError('Choose existing workspaces.');
  const date=value=>{if(value===undefined||value===null||value==='')return null;if(!Number.isSafeInteger(value)||value<0||value>253402300799999)throw new ServiceError('Choose a valid access date.');return value;};
  const accessStartsAt=date(data.accessStartsAt),accessExpiresAt=date(data.accessExpiresAt);if(accessStartsAt!==null&&accessExpiresAt!==null&&accessExpiresAt<=accessStartsAt)throw new ServiceError('Access must end after its start date.');
  return{username:username(data.username),displayName,role:data.role,enabled:data.enabled!==false,accessStartsAt,accessExpiresAt,allWorkspaces:data.role==='ADMIN'||data.allWorkspaces===true,extra,denied,workspaceIds:[...new Set(data.workspaceIds)]};
 }
 function writeGrants(id,ids){db.prepare('DELETE FROM workspace_grants WHERE user_id=?').run(id);for(const projectId of ids)db.prepare('INSERT INTO workspace_grants(user_id,project_id) VALUES(?,?)').run(id,projectId);}
 const auth={
  bootstrap(){return{setupRequired:!db.prepare('SELECT 1 FROM auth_users LIMIT 1').get(),passwordMinimum:15,idleMinutes:30,sessionHours:12,rememberDays:30};},
  async setup(data){return hashOperation(async()=>{
   const station=string(data.workstation||workstation(),100);data={...data,workstation:station};
   if(!auth.bootstrap().setupRequired)throw new ServiceError('Administrator setup is already complete.',409);
   const name=username(data.username),displayName=string(data.displayName||data.username),hash=await passwordHash(data.password),id=randomUUID();
   db.exec('BEGIN IMMEDIATE');try{
    if(!auth.bootstrap().setupRequired)throw new ServiceError('Administrator setup is already complete.',409);
    db.prepare('INSERT INTO auth_users(id,username,display_name,password_hash,role,all_workspaces,created_at) VALUES(?,?,?,?,?,1,?)').run(id,name,displayName,hash,'ADMIN',now());
    const recovery=db.prepare('SELECT * FROM legacy_recovery LIMIT 1').get();if(recovery)db.prepare('INSERT INTO recovery(user_id,document,revision,updated_at) VALUES(?,?,?,?)').run(id,recovery.document,recovery.revision,recovery.updated_at);
    db.prepare('DELETE FROM legacy_recovery').run();db.prepare('UPDATE assets SET uploaded_by=? WHERE uploaded_by IS NULL').run(id);db.exec('COMMIT');
   }catch(e){db.exec('ROLLBACK');throw e;}
   record('ADMIN_SETUP',id,'success');return issue(db.prepare('SELECT * FROM auth_users WHERE id=?').get(id),data.remember===true,data.workstation||workstation());
  });},
  async login(data){return hashOperation(async()=>{
   string(data?.workstation||workstation(),100);
   const name=typeof data?.username==='string'&&/^[a-z][a-z0-9_.-]{2,31}$/i.test(data.username.trim())?data.username.trim().toLowerCase():'invalid';checkLimit(name);
   const old=db.prepare('SELECT * FROM auth_users WHERE username=?').get(name),valid=await verify(data?.password,old?.password_hash),row=old?db.prepare('SELECT * FROM auth_users WHERE id=?').get(old.id):null;
   if(!valid||!row?.enabled||old.password_hash!==row.password_hash){failure(name);throw new ServiceError('Incorrect username or password, or account unavailable.',401);}
   db.prepare('DELETE FROM auth_failures WHERE identity=?').run(name);return issue(row,data.remember===true,data.workstation||workstation());
  });},
  resume(rememberToken,station=workstation()){
   if(typeof rememberToken!=='string'||rememberToken.length>100)throw new ServiceError('Remembered login expired. Sign in again.',401);
   const saved=db.prepare('SELECT * FROM auth_remember WHERE token_hash=?').get(tokenHash(rememberToken));
   if(!saved||saved.expires_at<=now())throw new ServiceError('Remembered login expired. Sign in again.',401);
   const row=db.prepare('SELECT * FROM auth_users WHERE id=?').get(saved.user_id);if(!row?.enabled||row.must_change_password)throw new ServiceError('Sign in again.',401);
   db.exec('BEGIN IMMEDIATE');try{db.prepare('DELETE FROM auth_remember WHERE id=?').run(saved.id);db.prepare('UPDATE auth_sessions SET revoked_at=? WHERE remember_id=?').run(now(),saved.id);const result=issue(row,true,station);db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}
  },
  me(token){return publicSession(authenticate(token,{allowPasswordChange:true}));},
  touch(token){const actor=authenticate(token,{allowPasswordChange:true});db.prepare('UPDATE auth_sessions SET last_seen=?,idle_expires_at=? WHERE id=?').run(now(),Math.min(now()+IDLE_MS,actor.expiresAt),actor.sessionId);return true;},
  logout(token){if(typeof token!=='string')return;const row=db.prepare('SELECT * FROM auth_sessions WHERE token_hash=?').get(tokenHash(token));if(!row)return;db.prepare('UPDATE auth_sessions SET revoked_at=? WHERE id=?').run(now(),row.id);if(row.remember_id)db.prepare('DELETE FROM auth_remember WHERE id=?').run(row.remember_id);const user=db.prepare('SELECT * FROM auth_users WHERE id=?').get(row.user_id);record('LOGOUT',row.user_id,'success',{user:userView(user),workstation:row.workstation});},
  endSession(token){if(typeof token==='string')db.prepare('UPDATE auth_sessions SET revoked_at=? WHERE token_hash=?').run(now(),tokenHash(token));},
  async changePassword(token,data){return hashOperation(async()=>{
   const actor=authenticate(token,{allowPasswordChange:true}),old=db.prepare('SELECT password_hash FROM auth_users WHERE id=?').get(actor.user.id);
   checkLimit(actor.user.username);if(!await verify(data.currentPassword,old.password_hash)){failure(actor.user.username);throw new ServiceError('Current password is incorrect.',401);}
   const hash=await passwordHash(data.password);authenticate(token,{allowPasswordChange:true});
   db.exec('BEGIN IMMEDIATE');try{db.prepare('UPDATE auth_users SET password_hash=?,must_change_password=0 WHERE id=?').run(hash,actor.user.id);revokeUser(actor.user.id);record('PASSWORD_CHANGED',actor.user.id,'success',actor);const result=issue(db.prepare('SELECT * FROM auth_users WHERE id=?').get(actor.user.id),false,actor.workstation);db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}
  });},
  catalog(token){const actor=authenticate(token);requirePermission(actor,'users.manage');return{serverTime:now(),permissions:permissionLabels,roles:rolePermissions,workspaces:db.prepare('SELECT id,name FROM projects ORDER BY name').all().filter(p=>canAccess(actor,p.id))};},
  users(token){const actor=authenticate(token);requirePermission(actor,'users.manage');return db.prepare('SELECT * FROM auth_users ORDER BY username').all().map(userView);},
  async createUser(token,data){return hashOperation(async()=>{
   let actor=authenticate(token);requirePermission(actor,'users.manage');const c=config(data);limitDelegation(actor,c);const hash=await passwordHash(data.password);actor=authenticate(token);requirePermission(actor,'users.manage');limitDelegation(actor,c);
   if(db.prepare('SELECT id FROM auth_users WHERE username=?').get(c.username))throw new ServiceError('Username already exists.',409);
   const id=randomUUID();db.exec('BEGIN IMMEDIATE');try{db.prepare('INSERT INTO auth_users(id,username,display_name,password_hash,role,enabled,all_workspaces,extra_permissions,denied_permissions,must_change_password,created_at,access_starts_at,access_expires_at) VALUES(?,?,?,?,?,?,?,?,?,1,?,?,?)').run(id,c.username,c.displayName,hash,c.role,Number(c.enabled),Number(c.allWorkspaces),JSON.stringify(c.extra),JSON.stringify(c.denied),now(),c.accessStartsAt,c.accessExpiresAt);writeGrants(id,c.workspaceIds);record('USER_CREATED',id,'success',actor,{next:{username:c.username,role:c.role,accessStartsAt:c.accessStartsAt,accessExpiresAt:c.accessExpiresAt}});db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return userView(db.prepare('SELECT * FROM auth_users WHERE id=?').get(id));
  });},
  updateUser(token,data){
   const actor=authenticate(token);requirePermission(actor,'users.manage');const old=db.prepare('SELECT * FROM auth_users WHERE id=?').get(data.id);if(!old)throw new ServiceError('User not found.',404);const c=config({accessStartsAt:old.access_starts_at,accessExpiresAt:old.access_expires_at,...data});
   limitDelegation(actor,c,old);
   if(old.id===actor.user.id&&!c.enabled)throw new ServiceError('You cannot disable your own active account.');
   if(old.role==='ADMIN'&&old.enabled&&(!c.enabled||c.role!=='ADMIN'||c.accessExpiresAt!==null||c.accessStartsAt>now())&&!db.prepare("SELECT id FROM auth_users WHERE id<>? AND enabled=1 AND role='ADMIN' AND access_expires_at IS NULL AND (access_starts_at IS NULL OR access_starts_at<=?) LIMIT 1").get(old.id,now()))throw new ServiceError('Keep at least one enabled administrator with unlimited access.');
   const duplicate=db.prepare('SELECT id FROM auth_users WHERE username=? AND id<>?').get(c.username,old.id);if(duplicate)throw new ServiceError('Username already exists.',409);
   db.exec('BEGIN IMMEDIATE');try{db.prepare('UPDATE auth_users SET username=?,display_name=?,role=?,enabled=?,all_workspaces=?,extra_permissions=?,denied_permissions=?,access_starts_at=?,access_expires_at=? WHERE id=?').run(c.username,c.displayName,c.role,Number(c.enabled),Number(c.allWorkspaces),JSON.stringify(c.extra),JSON.stringify(c.denied),c.accessStartsAt,c.accessExpiresAt,old.id);writeGrants(old.id,c.workspaceIds);revokeUser(old.id);record('USER_UPDATED',old.id,'success',actor,{previous:{role:old.role,enabled:!!old.enabled,accessStartsAt:old.access_starts_at,accessExpiresAt:old.access_expires_at},next:{role:c.role,enabled:c.enabled,accessStartsAt:c.accessStartsAt,accessExpiresAt:c.accessExpiresAt,allWorkspaces:c.allWorkspaces,workspaceIds:c.workspaceIds,extra:c.extra,denied:c.denied}});db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return userView(db.prepare('SELECT * FROM auth_users WHERE id=?').get(old.id));
  },
  async resetPassword(token,data){return hashOperation(async()=>{
   let actor=authenticate(token);requirePermission(actor,'users.manage');if(data.id===actor.user.id)throw new ServiceError('Use Change password for your own account.');
   const hash=await passwordHash(data.password);actor=authenticate(token);requirePermission(actor,'users.manage');const target=db.prepare('SELECT * FROM auth_users WHERE id=?').get(data.id);if(!target)throw new ServiceError('User not found.',404);limitDelegation(actor,null,target);
   db.exec('BEGIN IMMEDIATE');try{db.prepare('UPDATE auth_users SET password_hash=?,must_change_password=1 WHERE id=?').run(hash,data.id);revokeUser(data.id);record('PASSWORD_RESET',data.id,'success',actor);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return true;
  });},
  sessions(token){const actor=authenticate(token);requirePermission(actor,'users.manage');return db.prepare('SELECT s.id,s.user_id,u.username,s.workstation,s.created_at,s.last_seen,s.expires_at,s.idle_expires_at FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id WHERE s.revoked_at IS NULL AND s.expires_at>? AND s.idle_expires_at>? ORDER BY s.last_seen DESC').all(now(),now());},
  revokeSession(token,id){const actor=authenticate(token,{allowPasswordChange:true});if(id!==actor.sessionId){if(actor.user.mustChangePassword)throw new ServiceError('Change your password first.',403);requirePermission(actor,'users.manage');}const target=db.prepare('SELECT * FROM auth_sessions WHERE id=?').get(id);if(!target)throw new ServiceError('Session not found.',404);db.prepare('UPDATE auth_sessions SET revoked_at=? WHERE id=?').run(now(),id);if(target.remember_id)db.prepare('DELETE FROM auth_remember WHERE id=?').run(target.remember_id);record('SESSION_REVOKED',target.user_id,'success',actor);return true;},
  audit(token,filters={}){
   const actor=authenticate(token);requirePermission(actor,'audit.view');const params=[],where=[];
   for(const [key,column] of [['username','username'],['action','action'],['workstation','workstation'],['projectId','project_id']])if(filters[key]){where.push(column+'=?');params.push(string(filters[key],200));}
   for(const [key,operator] of [['from','>='],['to','<=']])if(filters[key]){const time=Date.parse(filters[key]);if(!Number.isFinite(time))throw new ServiceError('Invalid date filter.');where.push('time'+operator+'?');params.push(time);}
   const rows=db.prepare('SELECT id,time,action,target,status,user_id,username,workstation,project_id,previous_value,next_value FROM events'+(where.length?' WHERE '+where.join(' AND '):'')+' ORDER BY id DESC LIMIT 500').all(...params);
   return rows.filter(row=>!row.project_id||canAccess(actor,row.project_id));
  },
 };
 return{auth,authenticate,requirePermission,requireWorkspace,canAccess,record,userView};
}
