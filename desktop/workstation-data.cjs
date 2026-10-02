const fs=require('node:fs');
const {join,dirname}=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {createHash}=require('node:crypto');

const databaseName='broadcastcg.sqlite';
function inspectDatabase(file){
  const db=new DatabaseSync(file,{readOnly:true});
  try{
    if(db.prepare('PRAGMA quick_check').all().some(row=>row.quick_check!=='ok'))throw Error('Database integrity check failed');
    const tables=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row=>row.name));
    if(!tables.has('projects')||!tables.has('assets'))throw Error('Not a BroadcastCG database');
    const accounts=tables.has('auth_users')?db.prepare('SELECT id,username,created_at FROM auth_users ORDER BY id').all():[];
    const projects=db.prepare('SELECT id,revision,document FROM projects ORDER BY id').all();
    const assets=db.prepare('SELECT count(*) AS n FROM assets').get().n;
    return{accounts:accounts.length,projects:projects.length,assets,identity:createHash('sha256').update(JSON.stringify({accounts,projects,assets})).digest('hex')};
  }finally{db.close();}
}

/** Use one local data directory regardless of the Windows app that launched us.
 * Resolve each legacy database file itself: MSIX can redirect the database but
 * leave WAL/SHM in the physical folder, so resolving just its parent is unsafe.
 */
function resolveWorkstationData({home,legacyDirectory,packagesDirectory,recoverDirectory=()=>{}}){
  const root=join(home,'.broadcastcg'),destination=join(root,'data'),target=join(destination,databaseName);
  recoverDirectory(destination);
  if(fs.existsSync(target)){inspectDatabase(target);return destination;}
  if(fs.existsSync(destination)&&fs.readdirSync(destination).length)throw Error('BroadcastCG data exists but its database is missing. Restore a verified backup instead of creating another account. Data folder: '+destination);
  const directories=[legacyDirectory];
  if(packagesDirectory&&fs.existsSync(packagesDirectory)){
    // Inspect only our own data subdirectory, never other applications' data.
    for(const entry of fs.readdirSync(packagesDirectory,{withFileTypes:true}))if(entry.isDirectory())directories.push(join(packagesDirectory,entry.name,'LocalCache','Roaming','BroadcastCG','data'));
  }
  const sources=[],seen=new Set();
  for(const directory of directories){
    if(fs.existsSync(join(directory,'restore-journal.json')))throw Error('Finish recovery of the interrupted BroadcastCG restore before migrating this profile: '+directory);
    const file=join(directory,databaseName);if(!fs.existsSync(file))continue;
    const actual=fs.realpathSync.native(file),key=actual.toLowerCase();if(seen.has(key))continue;seen.add(key);
    try{sources.push({directory:dirname(actual),file:actual,...inspectDatabase(actual)});}
    catch(error){throw Error('BroadcastCG could not safely read an existing profile. No account or project has been replaced. '+actual+': '+error.message);}
  }
  const populated=sources.filter(source=>source.accounts||source.projects||source.assets);
  if(new Set(populated.map(source=>source.identity)).size>1)throw Error('Multiple different BroadcastCG profiles contain saved work. Keep all profiles and choose which to recover before starting: '+populated.map(source=>source.directory).join('; '));
  const source=populated[0]||sources[0];
  fs.mkdirSync(root,{recursive:true});
  const lock=join(root,'data-migration.lock');let handle;
  try{handle=fs.openSync(lock,'wx');}catch{throw Error('BroadcastCG profile migration is already running or was interrupted. Existing profiles are unchanged. Check '+lock);}
  try{
    if(fs.existsSync(target)){inspectDatabase(target);return destination;}
    if(!source){fs.mkdirSync(destination,{recursive:true});return destination;}
    const staging=fs.mkdtempSync(join(root,'data-migration-')),snapshot=join(staging,databaseName);
    const db=new DatabaseSync(source.file,{readOnly:true});
    try{db.prepare('VACUUM INTO ?').run(snapshot);}finally{db.close();}
    const verified=inspectDatabase(snapshot);
    if(verified.identity!==source.identity)throw Error('The source profile changed during migration. Close other BroadcastCG instances and retry; the original data is unchanged.');
    for(const entry of fs.readdirSync(source.directory)){
      if([databaseName,databaseName+'-wal',databaseName+'-shm',databaseName+'-journal'].includes(entry))continue;
      fs.cpSync(join(source.directory,entry),join(staging,entry),{recursive:true,errorOnExist:true,force:false});
    }
    fs.writeFileSync(join(staging,'profile-migration.json'),JSON.stringify({version:1,time:new Date().toISOString(),source:source.directory,destination,accounts:verified.accounts,projects:verified.projects,assets:verified.assets},null,2));
    // An empty destination is safe to remove; never replace a populated folder.
    if(fs.existsSync(destination))fs.rmdirSync(destination);
    fs.renameSync(staging,destination);
    return destination;
  }finally{fs.closeSync(handle);fs.unlinkSync(lock);}
}
module.exports={resolveWorkstationData,inspectDatabase};
