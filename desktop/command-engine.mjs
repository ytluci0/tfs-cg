import {createHash,randomUUID} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {ServiceError} from './service-error.mjs';
import {conditionMatches} from '../lib/action-logic.ts';
import {textValue} from '../lib/studio-model.ts';
const activeStatuses=['running','waiting','cancelling'];
export function migrateCommands(db,directory,backup){
 if(db.prepare('PRAGMA user_version').get().user_version>=3)return;
 if(backup){mkdirSync(join(directory,'backups'),{recursive:true});db.prepare('VACUUM INTO ?').run(join(directory,'backups','before-commands-'+Date.now()+'-'+randomUUID()+'.sqlite'));}
 try{db.exec(`BEGIN IMMEDIATE;CREATE TABLE commands(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,user_id TEXT NOT NULL,session_id TEXT NOT NULL,request_hash TEXT NOT NULL,status TEXT NOT NULL,document TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);CREATE INDEX commands_project_time ON commands(project_id,created_at);PRAGMA user_version=3;COMMIT;`);}catch(e){db.exec('ROLLBACK');throw e;}
}
export function createCommandEngine({db,authenticate,requirePermission,requireWorkspace,readProject,prepare,execute,record,now=Date.now,assertControl=()=>{}}){
 const running=new Map();let closed=false;
 // Restart never resumes a partially completed production sequence.
 for(const row of db.prepare("SELECT document FROM commands WHERE status IN ('running','waiting','cancelling')").all()){const job=JSON.parse(row.document);job.status='interrupted';job.error='Application stopped before the sequence finished. Inspect completed and unconfirmed steps; no steps were replayed.';job.finishedAt=now();job.steps=job.steps.map(s=>s.status==='running'?{...s,status:'unconfirmed'}:s);save(job);}
 function save(job){if(closed)return;job.updatedAt=now();db.prepare('UPDATE commands SET status=?,document=?,updated_at=? WHERE id=?').run(job.status,JSON.stringify(job),job.updatedAt,job.id);}
 function lookup(id){const row=db.prepare('SELECT * FROM commands WHERE id=?').get(id);if(!row)throw new ServiceError('Command was not found.',404);return row;}
 function get(actor,id){const row=lookup(id);requireWorkspace(actor,row.project_id);return JSON.parse(row.document);}
 function list(actor,projectId){requireWorkspace(actor,projectId);return db.prepare('SELECT document FROM commands WHERE project_id=? ORDER BY created_at DESC,rowid DESC LIMIT 50').all(projectId).map(r=>JSON.parse(r.document));}
 function assertIdle(projectId,commandId){const active=[...running.values()].find(r=>r.job.projectId===projectId&&r.job.id!==commandId);if(active)throw new ServiceError('Workspace is controlled by '+active.job.username+' while '+active.job.label+' runs. Cancel or wait for it to finish.',409);}
 function assertOutputFree(commandId){const active=[...running.values()].find(r=>r.job.usesOutput&&r.job.id!==commandId);if(active)throw new ServiceError('Output is reserved by '+active.job.username+' for '+active.job.label+'.',409);}
 function actorFor(run){if(run.abort.signal.aborted)throw new ServiceError('Sequence cancelled. Completed actions remain applied.',409);const actor=authenticate(run.token);requireWorkspace(actor,run.job.projectId);requirePermission(actor,'panels.operate');assertControl(actor,run.job.projectId);return actor;}
 async function wait(ms,run){const end=performance.now()+ms;run.job.waitUntil=now()+ms;run.job.status='waiting';save(run.job);while(performance.now()<end){actorFor(run);await new Promise(resolve=>{const finish=()=>{clearTimeout(timer);run.abort.signal.removeEventListener('abort',finish);resolve();};const timer=setTimeout(finish,Math.max(1,Math.min(200,end-performance.now())));run.abort.signal.addEventListener('abort',finish,{once:true});});}actorFor(run);delete run.job.waitUntil;run.job.status='running';}
 async function work(run){const job=run.job,branches=new Map();try{
  for(let i=0;i<run.plan.length;i++){if(closed)return;const actor=actorFor(run),entry=run.plan[i],step=job.steps[i];job.currentStep=i;const project=readProject(actor,job.projectId).project;
   if(entry.guards?.some(g=>branches.get(g.index)!==g.value)||entry.action.type!=='branch'&&!conditionMatches(entry.action,project.variables)){for(let j=i;j<entry.end;j++)job.steps[j]={...job.steps[j],status:'skipped',finishedAt:now()};i=entry.end-1;save(job);continue;}
   step.status='running';step.startedAt=now();save(job);
   if(entry.action.type==='branch')branches.set(i,conditionMatches(entry.action,project.variables));
   else if(entry.action.type==='delay'){const ms=Number(textValue(entry.action.value,project.variables));if(!Number.isFinite(ms)||ms<0||ms>10000)throw new ServiceError('Wait must be between 0 and 10000 milliseconds.');await wait(ms,run);}
   else if(entry.action.type!=='macro')await execute(entry.action,{actor,token:run.token,projectId:job.projectId,commandId:job.id,signal:run.abort.signal,stage:run.stage,setStage:value=>{run.stage=value;job.staged=value;},output:run.output});
   if(closed)return;step.status='succeeded';step.finishedAt=now();job.completedSteps=job.steps.filter(s=>s.status==='succeeded').length;save(job);
  }
  job.status=run.abort.signal.aborted?'cancelled':'succeeded';
 }catch(e){if(closed)return;job.status=e?.unconfirmed?'unconfirmed':run.abort.signal.aborted?'cancelled':'failed';job.error=e instanceof ServiceError?e.message:'The step could not finish. Review its configuration and connection before running again.';const step=job.steps[job.currentStep];if(step?.status==='running'){step.status=e?.unconfirmed?'unconfirmed':run.abort.signal.aborted?'cancelled':'failed';step.message=job.error;step.finishedAt=now();}}
 finally{if(!closed){delete job.waitUntil;job.finishedAt=now();save(job);running.delete(job.id);record('COMMAND_'+job.status.toUpperCase(),job.id,job.status,run.actor,{projectId:job.projectId,detail:job.label});}}
 }
 function submit(data,token){
  const actor=authenticate(token);requireWorkspace(actor,data.projectId);requirePermission(actor,'panels.operate');
  if(typeof data.id!=='string'||!/^[a-zA-Z0-9-]{16,100}$/.test(data.id))throw new ServiceError('A unique command ID is required.');
  const hash=createHash('sha256').update(JSON.stringify(data)).digest('hex'),existing=db.prepare('SELECT * FROM commands WHERE id=?').get(data.id);
  if(existing){if(existing.user_id!==actor.user.id||existing.project_id!==data.projectId)throw new ServiceError('This command ID belongs to another operator.',403);if(existing.request_hash!==hash)throw new ServiceError('Command ID was reused with different content.',409);return{command:JSON.parse(existing.document),duplicate:true};}
  assertControl(actor,data.projectId);assertIdle(data.projectId);const saved=readProject(actor,data.projectId);const atomicIncrement=data.kind==='counter'&&data.value===undefined&&Number.isFinite(data.delta);if(!Number.isSafeInteger(data.revision)||(!atomicIncrement&&data.revision!==saved.revision))throw new ServiceError('Save or reopen the latest workspace before running this command.',409);
  const prepared=prepare(data,saved.project,actor);if(!prepared.plan.length)throw new ServiceError('Add at least one action before running.');if(prepared.usesOutput)assertOutputFree();
  const job={id:data.id,projectId:data.projectId,label:prepared.label,username:actor.user.username,userId:actor.user.id,sessionId:actor.sessionId,workstation:actor.workstation,status:'running',createdAt:now(),updatedAt:now(),currentStep:0,completedSteps:0,usesOutput:prepared.usesOutput,leaseId:randomUUID(),steps:prepared.plan.map((s,i)=>({index:i,type:s.action.type,target:s.action.target,path:s.path,status:'pending'}))};
  db.prepare('INSERT INTO commands VALUES(?,?,?,?,?,?,?,?,?)').run(job.id,job.projectId,actor.user.id,actor.sessionId,hash,job.status,JSON.stringify(job),job.createdAt,job.updatedAt);
  const run={job,plan:prepared.plan,actor,token,stage:prepared.stage||null,output:prepared.output,abort:new AbortController()};running.set(job.id,run);record('COMMAND_ACCEPTED',job.id,'accepted',actor,{projectId:job.projectId,detail:job.label});queueMicrotask(()=>work(run));return{command:structuredClone(job),duplicate:false};
 }
 function cancel(actor,id){const job=get(actor,id),run=running.get(id);if(!run)return job;requirePermission(actor,'panels.operate');if(run.actor.sessionId!==actor.sessionId&&!actor.user.permissions.includes('users.manage'))throw new ServiceError('Only the owning session or an administrator may cancel this sequence.',403);run.job.status='cancelling';run.abort.abort();save(run.job);record('COMMAND_CANCEL_REQUESTED',id,'requested',actor,{projectId:job.projectId});return structuredClone(run.job);}
 function state(actor,projectId){const history=list(actor,projectId),active=history.find(c=>activeStatuses.includes(c.status))||null;return{active,history,ownership:active?{commandId:active.id,leaseId:active.leaseId,username:active.username,workstation:active.workstation,sessionId:active.sessionId}:null};}
 return{submit,get,list,state,cancel,assertIdle,assertOutputFree,close(){for(const run of running.values()){run.abort.abort();run.job.status='interrupted';run.job.error='Application shut down. Completed effects remain; pending steps will not resume.';run.job.finishedAt=now();run.job.steps.forEach(s=>{if(s.status==='running')s.status='unconfirmed';});save(run.job);}closed=true;running.clear();}};
}

