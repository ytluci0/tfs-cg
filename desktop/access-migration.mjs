import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
export function migrateAccess(db,directory,backup){
 if(db.prepare('PRAGMA user_version').get().user_version>=7)return;
 if(backup){mkdirSync(join(directory,'backups'),{recursive:true});db.prepare('VACUUM INTO ?').run(join(directory,'backups','before-access-periods-'+Date.now()+'-'+randomUUID()+'.sqlite'));}
 try{db.exec('BEGIN IMMEDIATE');const columns=db.prepare('PRAGMA table_info(auth_users)').all().map(c=>c.name);if(!columns.includes('access_starts_at'))db.exec('ALTER TABLE auth_users ADD COLUMN access_starts_at INTEGER');if(!columns.includes('access_expires_at'))db.exec('ALTER TABLE auth_users ADD COLUMN access_expires_at INTEGER');db.exec('PRAGMA user_version=7; COMMIT;');}catch(e){db.exec('ROLLBACK');throw e;}
}
