import {randomUUID} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {clockSeconds,clockText} from '../lib/broadcast-tools.ts';
import {ServiceError} from './service-error.mjs';

export function migrateSports(db,directory,backup){
 if(db.prepare('PRAGMA user_version').get().user_version>=4)return;
 if(backup){mkdirSync(join(directory,'backups'),{recursive:true});db.prepare('VACUUM INTO ?').run(join(directory,'backups','before-sports-'+Date.now()+'-'+randomUUID()+'.sqlite'));}
 db.exec('BEGIN IMMEDIATE; CREATE TABLE sports_clocks(project_id TEXT NOT NULL,variable TEXT NOT NULL,document TEXT NOT NULL,PRIMARY KEY(project_id,variable)); PRAGMA user_version=4; COMMIT;');
}
// Wall-clock adjustments never change elapsed match time. Restart pauses at the
// last checkpoint; it cannot silently add downtime or restart a match clock.
export function createSportsClocks({db,monotonic=()=>performance.now()}){
 const clocks=new Map();let closed=false;
 const id=(project,key)=>JSON.stringify([project,key]);
 function save(c){db.prepare('INSERT INTO sports_clocks VALUES(?,?,?) ON CONFLICT(project_id,variable) DO UPDATE SET document=excluded.document').run(c.projectId,c.variable,JSON.stringify({...c,anchor:undefined}));}
 for(const row of db.prepare('SELECT document FROM sports_clocks').all()){const c=JSON.parse(row.document);c.interrupted=!!c.running;c.running=false;c.anchor=monotonic();clocks.set(id(c.projectId,c.variable),c);save(c);}
 function sample(c,at=monotonic()){const elapsed=c.running?Math.max(0,at-c.anchor):0;return Math.max(0,Math.min(86400000,c.ms+(c.direction==='up'?elapsed:-elapsed)));}
 function checkpoint(c){const at=monotonic();c.ms=sample(c,at);c.anchor=at;if(c.ms===0&&c.direction==='down'||c.ms===86400000&&c.direction==='up')c.running=false;save(c);}
 function snapshot(projectId){const out={};for(const c of clocks.values())if(c.projectId===projectId){const ms=sample(c),seconds=c.direction==='down'?Math.ceil(ms/1000):Math.floor(ms/1000);out[c.variable]={seconds,value:c.formatted?clockText(seconds):seconds,direction:c.direction,running:c.running&&!(c.direction==='down'&&ms===0)&&ms<86400000,interrupted:c.interrupted};}return out;}
 function values(projectId){return Object.fromEntries(Object.entries(snapshot(projectId)).map(([k,v])=>[k,v.value]));}
 function operate(project,key,options){
  if(!key||!Object.hasOwn(project.variables,key)||!['number','string'].includes(typeof project.variables[key]))throw new ServiceError('Choose an existing time variable.');
  if(!['start','pause','reset','adjust'].includes(options.op))throw new ServiceError('Choose start, pause, reset or adjust.');
  if(options.direction!==undefined&&!['up','down'].includes(options.direction))throw new ServiceError('Choose a clock direction.');
  if(['reset','adjust'].includes(options.op)&&(!Number.isFinite(options.seconds)||Math.abs(options.seconds)>86400))throw new ServiceError('Clock adjustment must be within 24 hours.');
  const found=clocks.get(id(project.id,key));if(!found&&Object.values(snapshot(project.id)).length>=32)throw new ServiceError('A workspace supports at most 32 clocks.');
  const c=found||{projectId:project.id,variable:key,ms:clockSeconds(project.variables[key])*1000,anchor:monotonic(),direction:options.direction||'up',running:false,formatted:typeof project.variables[key]==='string',interrupted:false};
  const at=monotonic();c.ms=sample(c,at);c.anchor=at;c.interrupted=false;
  if(options.op==='start'){if(options.direction)c.direction=options.direction;c.running=c.direction==='up'?c.ms<86400000:c.ms>0;}
  if(options.op==='pause')c.running=false;
  if(options.op==='reset'){if(options.seconds<0)throw new ServiceError('Clock time cannot be negative.');c.ms=options.seconds*1000;c.running=false;if(options.direction)c.direction=options.direction;}
  if(options.op==='adjust')c.ms=Math.max(0,Math.min(86400000,c.ms+options.seconds*1000));
  clocks.set(id(project.id,key),c);checkpoint(c);return snapshot(project.id)[key];
 }
 const timer=setInterval(()=>{if(!closed)for(const c of clocks.values())if(c.running)checkpoint(c);},250);timer.unref?.();
 return{snapshot,values,operate,project:p=>({...p,variables:{...p.variables,...values(p.id)}}),has:(project,key)=>clocks.has(id(project,key)),running:projectId=>Object.values(snapshot(projectId)).some(c=>c.running),close(){for(const c of clocks.values()){checkpoint(c);c.running=false;save(c);}closed=true;clearInterval(timer);}};
}
