import https from 'node:https';
import tls from 'node:tls';
import {isIP} from 'node:net';
import {createHash,timingSafeEqual} from 'node:crypto';
import {WebSocket} from 'ws';
import {ServiceError} from './service-error.mjs';
import {validateProject} from '../lib/studio-model.ts';

export function serverProfile(value){
 if(!value||typeof value.name!=='string'||!value.name.trim()||value.name.length>80)throw new ServiceError('Enter a server name (up to 80 characters).');
 let url;try{url=new URL(value.url);}catch{throw new ServiceError('Enter an HTTPS server address, for example https://studio-pc:9443.');}
 if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new ServiceError('Use an HTTPS address and port, without a path or credentials.');
 const fingerprint=String(value.fingerprint||'').replace(/:/g,'').toLowerCase();if(!/^[a-f0-9]{64}$/.test(fingerprint))throw new ServiceError('Copy the server’s SHA-256 certificate fingerprint from its host settings.');
 return{id:typeof value.id==='string'&&/^[a-zA-Z0-9-]{1,100}$/.test(value.id)?value.id:undefined,name:value.name.trim(),url:url.origin,fingerprint};
}
export function pinnedAgent(fingerprint){
 const expected=Buffer.from(fingerprint,'hex');if(expected.length!==32)throw Error('A SHA-256 certificate pin is required.');
 const agent=new https.Agent({keepAlive:true,maxSockets:8});
 // No HTTP request bytes (including passwords) are released before this check.
 agent.createConnection=(options,done)=>{
  const host=String(options.host).replace(/^\[|\]$/g,'');
  const socket=tls.connect({...options,host,servername:isIP(host)?undefined:host,rejectUnauthorized:false,minVersion:'TLSv1.2'});
  let finished=false;const complete=(error,value)=>{if(finished)return;finished=true;socket.setTimeout(0);done(error,value);};
  socket.setTimeout(8000,()=>socket.destroy(Error('Server TLS connection timed out.')));
  socket.once('error',e=>complete(e));socket.once('secureConnect',()=>{
   const cert=socket.getPeerCertificate(),actual=cert.raw&&createHash('sha256').update(cert.raw).digest();
   if(!actual||!timingSafeEqual(actual,expected)||Date.parse(cert.valid_from)>Date.now()||Date.parse(cert.valid_to)<Date.now()){socket.destroy(Error('Server certificate does not match the saved fingerprint or has expired. No credentials were sent.'));return;}
   complete(null,socket);
  });
 };
 return agent;
}
export function createRemoteAuthority({profile,settings,workstation='LAN workstation',bootstrapSecret='',recoveryStore,onState=()=>{},onProgram=()=>{},onLost=()=>{}}){
 profile=serverProfile(profile);const agent=pinnedAgent(profile.fingerprint);let token=null,actor=null,ws=null,closed=false,reconnect=null,attempt=0,engineId=null,latest=null,lastSnapshot=0,offset=0,heldProgram=null,epoch=null;
 const outputContext=Object.freeze({remoteOutput:true});
 const status=()=>({local:false,database:latest?.database||'unknown',output:latest?.output||'offline',outputUnconfirmed:!connected()||latest?.outputUnconfirmed!==false,authentication:'server-accounts',network:connected()?'connected':'disconnected',serverName:profile.name,serverUrl:profile.url,epoch:latest?.epoch,engine:latest?.engine,engineAttached:!!engineId,clients:latest?.clients||0});
 const connected=()=>!!ws&&ws.readyState===WebSocket.OPEN&&Date.now()-lastSnapshot<5000;
 const program=p=>p?{...p,startedAt:p.startedAt-offset}:null;
 async function request(path,{method='GET',body,headers={},sessionToken=token,limit=210000000}={}){
  if(closed)throw new ServiceError('Connection closed.',503);
  const bytes=body===undefined?undefined:Buffer.isBuffer(body)?body:Buffer.from(JSON.stringify(body));
  return new Promise((resolve,reject)=>{
   const req=https.request(new URL(path,profile.url),{agent,method,headers:{...(sessionToken?{Authorization:'Bearer '+sessionToken}:{}),...(bytes?{'Content-Type':'application/json','Content-Length':bytes.length}:{}),...headers}},res=>{
    const chunks=[];let size=0;res.on('data',b=>{size+=b.length;if(size>limit){req.destroy(Error('Server response exceeds the supported size.'));return;}chunks.push(b);});
    res.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers:{'Content-Type':res.headers['content-type']||'application/json'}})));res.on('error',reject);
   });
   req.setTimeout(30000,()=>req.destroy(Error('Server response timed out. Check command history before retrying an action.')));req.on('error',e=>reject(new ServiceError(e.message,503)));if(bytes)req.write(bytes);req.end();
  });
 }
 async function json(path,options){const response=await request(path,options),data=await response.json();if(!response.ok)throw new ServiceError(data.error||'Server request failed.',response.status);return data;}
 function stopSocket(){clearTimeout(reconnect);reconnect=null;const old=ws;ws=null;old?.terminate();engineId=null;lastSnapshot=0;}
 function connect(){
  if(closed||!token)return;const activeToken=token,socket=new WebSocket(profile.url.replace(/^https:/,'wss:')+'/network/events',{agent,headers:{Authorization:'Bearer '+token},maxPayload:8000000,perMessageDeflate:false,handshakeTimeout:10000});ws=socket;
  socket.on('error',()=>{});socket.on('message',bytes=>{if(ws!==socket)return;try{const m=JSON.parse(bytes.toString());if(m.type==='snapshot'){
   const changed=epoch&&epoch!==m.epoch;epoch=m.epoch;offset=m.serverTime-Date.now();latest=m;lastSnapshot=Date.now();attempt=0;
   if(heldProgram&&m.program?.revision===heldProgram.revision)heldProgram={...heldProgram,variables:m.program.variables};
   if(changed){engineId=null;onLost('Server restarted. Output holds its last frame until a new acknowledged command.');}
   onState({...m,program:program(m.program),status:status()});
  }else if(m.type==='program'&&engineId){offset=m.serverTime-Date.now();heldProgram=program(m.program);onProgram(heldProgram);}
  else if(m.type==='output-attached'){engineId=m.id;onState({status:status()});}
  else if(m.type==='output-released'){engineId=null;onState({status:status()});}
  else if(m.type==='error')onState({error:m.error,status:status()});}catch{/* Malformed streams never dispatch actions. */}});
  socket.on('close',code=>{if(ws!==socket)return;ws=null;engineId=null;lastSnapshot=0;onState({status:status()});onLost('Server connection lost. No commands will be retried.');if(code===4001){token=null;actor=null;onState({status:status(),sessionEnded:true,error:'Your server session ended or access expired. Sign in again or contact the administrator.'});return;}if(!closed&&token===activeToken)reconnect=setTimeout(connect,Math.min(10000,500*2**Math.min(attempt++,5)));});
 }
 function authorize(_token,permission){if(!actor||_token!==token)throw new ServiceError('Sign in to this server.',401);if(actor.user.accessExpiresAt!==null&&actor.user.accessExpiresAt<=Date.now()+offset)throw new ServiceError('Your access period has expired. Contact the administrator to renew it.',401);if(actor.user.mustChangePassword)throw new ServiceError('Change your temporary password first.',403);if(permission&&!actor.user.permissions.includes(permission))throw new ServiceError('Your account does not have permission: '+permission+'.',403);return actor;}
 function requireConnection(){if(!connected())throw new ServiceError('Server connection is offline or stale. Reconnect before changing production state. No action was sent.',503);}
 const auth=new Proxy({}, {get:(_target,action)=>async(...args)=>{
  if(action==='endSession')action='logout';let data=['login','setup'].includes(action)?{...args[0],workstation}:action==='resume'?{rememberToken:args[0],workstation}:args[1]||{};
  const value=(await json('/network/auth',{method:'POST',body:{action,data},headers:bootstrapSecret?{'x-bootstrap-key':bootstrapSecret}:{}})).value;
  if(['login','setup','resume','changePassword'].includes(action)){stopSocket();token=value.token;actor={...value.session,workstation};connect();}
  else if(action==='me'&&value)actor={...value,workstation};
  else if(action==='logout'){stopSocket();token=null;actor=null;}
  return value;
 }});
 const draftBody=(draft,options)=>({draft:{...draft,assets:draft.assets.map(a=>({...a,bytes:Buffer.from(a.bytes).toString('base64')}))},options});
 const recovery={async list(){return(await json('/network/recovery',{method:'POST',body:{action:'list'}})).value;},async create(_token,data){return(await json('/network/recovery',{method:'POST',body:{action:'create',data}})).value;},async verify(_token,data){return(await json('/network/recovery',{method:'POST',body:{action:'verify',data}})).value;},async export(_token,id){const response=await request('/network/recovery',{method:'POST',body:{action:'export',data:{id}}});if(!response.ok)throw new ServiceError((await response.json()).error,response.status);return Buffer.from(await response.arrayBuffer());}};
 return{auth,settings,authorize,outputContext,status,recovery,health:()=>connected(),connected,
  async test(){const start=Date.now(),value=await json('/network/status',{sessionToken:null,limit:100000});if(value.protocol!==1)throw new ServiceError('Incompatible production server protocol.');return{...value,latencyMs:Date.now()-start};},
  async handle(incoming,context){try{
   const url=new URL(incoming.url),output=context===outputContext;
   if(output&&(incoming.method!=='GET'||!(url.pathname==='/api/program'||/^\/api\/assets\/[a-zA-Z0-9-]+$/.test(url.pathname))))throw new ServiceError('The output window is read-only.',403);
   if(output&&url.pathname==='/api/program')return Response.json(heldProgram||program(latest?.program));
   if(!output&&url.pathname==='/api/desktop/recovery'&&recoveryStore){
    const a=authorize(token,'projects.view');
    if(incoming.method==='GET'){const draft=recoveryStore.read(a.user.id);if(draft){const row=latest?.projects?.find(p=>p.id===draft.project.id);draft.conflict=!connected()||!!row&&row.revision!==draft.revision;if(!a.user.allWorkspaces&&!a.user.workspaceIds.includes(draft.project.id))return Response.json(null);}return Response.json(draft);}
    if(incoming.method==='DELETE'){recoveryStore.clear(a.user.id);return Response.json({cleared:true});}
    if(incoming.method==='POST'){const text=await incoming.text();if(text.length>1600000)throw new ServiceError('Recovery draft exceeds the supported size.');const value=JSON.parse(text),project=validateProject(value.project);if(!Number.isSafeInteger(value.revision)||value.revision<0)throw new ServiceError('Invalid recovery revision.');if(!a.user.allWorkspaces&&!a.user.workspaceIds.includes(project.id)&&!a.user.permissions.includes('projects.create'))throw new ServiceError('Workspace is not assigned to this account.',403);recoveryStore.write(a.user.id,{project,revision:value.revision,updatedAt:Date.now()});return Response.json({saved:true});}
   }
   if(!output&&incoming.method!=='GET')requireConnection();const path=(output&&engineId?'/network/output':'')+url.pathname+url.search;const headers={...(output&&engineId?{'x-engine-id':engineId}:{}),...Object.fromEntries(['content-type','x-file-name'].filter(k=>incoming.headers.has(k)).map(k=>[k,incoming.headers.get(k)]))};const response=await request(path,{method:incoming.method,body:['GET','HEAD'].includes(incoming.method)?undefined:Buffer.from(await incoming.arrayBuffer()),headers});if(url.pathname==='/api/program'&&response.ok)return Response.json(program(await response.json()));return response;
  }catch(e){return Response.json({error:e.message},{status:e.status||503});}},
  async locks(projectId,operation){requireConnection();return(await json('/network/locks',{method:'POST',body:{projectId,operation}})).value;},
  attachOutput(){authorize(token,'outputs.configure');requireConnection();ws.send(JSON.stringify({type:'attach-output'}));},
  releaseOutput(){if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'release-output'}));engineId=null;},
  acknowledge(revision){if(engineId&&connected())ws.send(JSON.stringify({type:'ack',revision}));},
  async importPsd(draft,options){requireConnection();return(await json('/network/import/psd',{method:'POST',body:draftBody(draft,options)})).value;},
  async importAe(draft,options){requireConnection();return(await json('/network/import/ae',{method:'POST',body:draftBody(draft,options)})).value;},
  async exportProject(project,_token,format='legacy'){return(await json('/network/export',{method:'POST',body:{project,format}})).value;},
  async inspectImport(text){return{...(await json('/network/inspect',{method:'POST',body:{text}})).value,text};},
  async importProject(inspected,_token,{save=false}={}){requireConnection();return(await json('/network/import',{method:'POST',body:{text:inspected.text,save}})).value;},
  async backup(password){requireConnection();const response=await request('/network/backup',{method:'POST',body:{password}});if(!response.ok)throw new ServiceError((await response.json()).error,response.status);return Buffer.from(await response.arrayBuffer());},
  diagnostics:()=>json('/network/diagnostics'),
  close(){closed=true;stopSocket();agent.destroy();actor=null;token=null;},
 };
}
