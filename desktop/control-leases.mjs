import {ServiceError} from './service-error.mjs';

// Leases belong to a session, expire without a live client, and are never
// restored after server restart. Configuration is persisted separately.
export function createControlLeases({settings,authorize,assertIdle,record=()=>{},now=Date.now,ttl=15000}){
 const held=new Map(),requests=new Map();
 const policy=id=>settings.get('network-lock:'+id,{required:false});
 function sweep(){for(const [id,lease] of held)if(lease.expiresAt<=now()){held.delete(id);record('CONTROL_EXPIRED',id,'expired',lease.actor);}}
 function visible(actor,id){sweep();const l=held.get(id);return{projectId:id,required:policy(id).required,owner:l?{sessionId:l.actor.sessionId,username:l.actor.user.username,workstation:l.actor.workstation,expiresAt:l.expiresAt}:null,requests:(requests.get(id)||[]).filter(r=>r.time>now()-60000).map(({username,workstation,time})=>({username,workstation,time})),mine:l?.actor.sessionId===actor.sessionId};}
 function assert(actor,id){sweep();const l=held.get(id);if(l&&l.actor.sessionId!==actor.sessionId)throw new ServiceError('Workspace controlled by '+l.actor.user.username+' on '+l.actor.workstation+'. Request control first.',423);if(policy(id).required&&!l)throw new ServiceError('Request control of this workspace before changing it.',423);}
 function operate(token,id,operation){
  const actor=authorize(token,id);sweep();const l=held.get(id);
  if(!['status','request','release','takeover','require','optional'].includes(operation))throw new ServiceError('Choose a supported ownership operation.');
  if(operation==='status')return visible(actor,id);
  if(!actor.user.permissions.some(p=>['panels.operate','graphics.edit','data.configure'].includes(p)))throw new ServiceError('This account cannot control a workspace.',403);
  if(operation==='require'||operation==='optional'){
   if(!actor.user.permissions.includes('system.configure'))throw new ServiceError('Only an engineer or administrator may change ownership policy.',403);
   assertIdle(id);settings.set('network-lock:'+id,{required:operation==='require'});record('CONTROL_POLICY',id,'success',actor);
  }else if(operation==='release'){
   if(l&&l.actor.sessionId!==actor.sessionId&&!actor.user.permissions.includes('system.configure'))throw new ServiceError('Only the owner or an engineer can release control.',403);
   assertIdle(id);held.delete(id);record('CONTROL_RELEASED',id,'success',actor);
  }else if(operation==='request'&&l&&l.actor.sessionId!==actor.sessionId){
   const queue=(requests.get(id)||[]).filter(r=>r.sessionId!==actor.sessionId&&r.time>now()-60000).slice(-15);queue.push({sessionId:actor.sessionId,username:actor.user.username,workstation:actor.workstation,time:now()});requests.set(id,queue);record('CONTROL_REQUESTED',id,'requested',actor);
  }else{
   if(operation==='takeover'&&!actor.user.permissions.includes('system.configure'))throw new ServiceError('Only an engineer or administrator may take over control.',403);
   if(l?.actor.sessionId!==actor.sessionId)assertIdle(id);
   held.set(id,{actor,expiresAt:now()+ttl});requests.delete(id);record('CONTROL_ACQUIRED',id,'success',actor);
  }
  return visible(actor,id);
 }
 return{assert,operate,sweep,view:visible,renew(actor){sweep();for(const l of held.values())if(l.actor.sessionId===actor.sessionId)l.expiresAt=now()+ttl;},revoke(sessionId){for(const [id,l] of held)if(l.actor.sessionId===sessionId)held.delete(id);},clear(){held.clear();requests.clear();}};
}
