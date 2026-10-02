import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,existsSync,rmSync,renameSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {recoverInterruptedRestore} from '../desktop/recovery-store.mjs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
const {resolveWorkstationData}=createRequire(import.meta.url)('../desktop/workstation-data.cjs');
function fixture(t){const home=mkdtempSync(join(tmpdir(),'bcg-profile-test-')),legacyDirectory=join(home,'roaming','BroadcastCG','data'),packagesDirectory=join(home,'packages');t.after(()=>rmSync(home,{recursive:true,force:true}));return{home,legacyDirectory,packagesDirectory};}
function profile(directory,{populated=false,wal=false,id='owner'}={}){
 mkdirSync(directory,{recursive:true});const db=new DatabaseSync(join(directory,'broadcastcg.sqlite'));
 if(wal)db.exec('PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0');
 db.exec('CREATE TABLE projects(id TEXT PRIMARY KEY,revision INTEGER,document TEXT); CREATE TABLE assets(id TEXT PRIMARY KEY,bytes BLOB); CREATE TABLE auth_users(id TEXT PRIMARY KEY,username TEXT,created_at INTEGER);');
 if(populated){db.prepare('INSERT INTO auth_users VALUES(?,?,1)').run(id,'operator');db.prepare('INSERT INTO projects VALUES(?,41,?)').run('show',JSON.stringify({layers:['existing work']}));db.prepare('INSERT INTO assets VALUES(?,?)').run('image',Buffer.from('existing image'));}
 return db;
}
test('recovers the populated virtualized profile instead of showing setup from an empty shortcut profile',t=>{
 const options=fixture(t);profile(options.legacyDirectory).close();
 const virtual=join(options.packagesDirectory,'EditorLauncher','LocalCache','Roaming','BroadcastCG','data');profile(virtual,{populated:true}).close();
 writeFileSync(join(virtual,'remembered-login.bin'),Buffer.from([1,2,3]));
 const before=readFileSync(join(virtual,'broadcastcg.sqlite')),selected=resolveWorkstationData(options);
 assert.equal(selected,join(options.home,'.broadcastcg','data'));
 const db=new DatabaseSync(join(selected,'broadcastcg.sqlite'),{readOnly:true});assert.equal(db.prepare('SELECT count(*) AS n FROM auth_users').get().n,1);assert.equal(db.prepare('SELECT revision FROM projects').get().revision,41);assert.equal(Buffer.from(db.prepare('SELECT bytes FROM assets').get().bytes).toString(),'existing image');db.close();
 assert.deepEqual(readFileSync(join(selected,'remembered-login.bin')),Buffer.from([1,2,3]));assert.deepEqual(readFileSync(join(virtual,'broadcastcg.sqlite')),before);
 assert.equal(resolveWorkstationData({...options,legacyDirectory:virtual}),selected);
});
test('takes a consistent snapshot including uncheckpointed WAL transactions',t=>{
 const options=fixture(t),source=profile(options.legacyDirectory,{populated:true,wal:true});
 try{const selected=resolveWorkstationData(options),db=new DatabaseSync(join(selected,'broadcastcg.sqlite'),{readOnly:true});assert.equal(db.prepare('PRAGMA quick_check').get().quick_check,'ok');assert.equal(db.prepare('SELECT revision FROM projects').get().revision,41);db.close();assert.equal(existsSync(join(selected,'broadcastcg.sqlite-wal')),false);}finally{source.close();}
});
test('existing stable accounts survive launches with different legacy profiles',t=>{
 const options=fixture(t),stable=join(options.home,'.broadcastcg','data');profile(stable,{populated:true}).close();profile(options.legacyDirectory,{populated:true,id:'other-owner'}).close();assert.equal(resolveWorkstationData(options),stable);
});
test('conflicting populated profiles are preserved and never silently replaced',t=>{
 const options=fixture(t);profile(options.legacyDirectory,{populated:true}).close();const virtual=join(options.packagesDirectory,'Launcher','LocalCache','Roaming','BroadcastCG','data');profile(virtual,{populated:true,id:'different-owner'}).close();assert.throws(()=>resolveWorkstationData(options),/Multiple different/);assert.equal(existsSync(join(options.home,'.broadcastcg','data')),false);
});
test('unreadable existing database and missing stable database do not become first-time setup',t=>{
 const options=fixture(t);mkdirSync(options.legacyDirectory,{recursive:true});writeFileSync(join(options.legacyDirectory,'broadcastcg.sqlite'),'damaged');assert.throws(()=>resolveWorkstationData(options),/could not safely read/);
 const stable=join(options.home,'.broadcastcg','data');mkdirSync(stable,{recursive:true});writeFileSync(join(stable,'remembered-login.bin'),'preserve');assert.throws(()=>resolveWorkstationData(options),/database is missing/);
});
test('a new workstation gets one stable data location across launches',t=>{
 const options=fixture(t),selected=resolveWorkstationData(options);assert.equal(selected,join(options.home,'.broadcastcg','data'));profile(selected,{populated:true}).close();assert.equal(resolveWorkstationData(options),selected);
});
test('an interrupted restore in stable storage rolls back before profile validation',t=>{
 const options=fixture(t),stable=join(options.home,'.broadcastcg','data');profile(stable,{populated:true}).close();const rollback='rollback-'+randomUUID()+'.sqlite';renameSync(join(stable,'broadcastcg.sqlite'),join(stable,rollback));writeFileSync(join(stable,'restore-journal.json'),JSON.stringify({version:1,prepared:'restore-prepared-'+randomUUID()+'.sqlite',rollback,hadOriginal:true,createdAt:Date.now()}));
 assert.equal(resolveWorkstationData({...options,recoverDirectory:recoverInterruptedRestore}),stable);const db=new DatabaseSync(join(stable,'broadcastcg.sqlite'),{readOnly:true});assert.equal(db.prepare('SELECT count(*) AS n FROM auth_users').get().n,1);db.close();
});
