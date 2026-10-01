import https from 'node:https';
import {randomUUID,timingSafeEqual} from 'node:crypto';
import {WebSocketServer,WebSocket} from 'ws';
import {createLocalService,ServiceError} from './local-service.mjs';
import {createControlLeases} from './control-leases.mjs';
import {secretCodec,sealBackup} from './server-crypto.mjs';

const asJSON=(v,status=200)=>Response.json(v,{status});
const authActions=new Set(['bootstrap','setup','login','logout','resume','me','touch','changePassword','catalog','users','createUser','updateUser','resetPassword','sessions','audit','revokeSession']);
const equalSecret=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
function draftBytes(draft){
 if(!draft||!Array.isArray(draft.assets)||draft.assets.length>500)throw new ServiceError('Invalid import images.');
 let total=0;const ids=new Set();return{...draft,assets:draft.assets.map(a=>{if(!a||typeof a.id!=='string'||!/^[\w-]{1,100}$/.test(a.id)||ids.has(a.id)||typeof a.name!=='string'||a.name.length>250||a.mime!=='image/png'||typeof a.bytes!=='string'||a.bytes.length>14000000)throw new ServiceError('Invalid import image.');ids.add(a.id);const bytes=Buffer.from(a.bytes,'base64');total+=bytes.length;if(total>55000000||bytes.length>10000000)throw new ServiceError('Import images exceed the supported size.');return{...a,bytes};})};
}
export async function createNetworkServer({directory,tls,secretKey,bootstrapSecret,host='127.0.0.1',port=9443,name='BroadcastCG production',serverId=randomUUID(),now=Date.now,heartbeatMs=1000,ackTimeout=3000}){
 if(!bootstrapSecret||bootstrapSecret.length<32)throw Error('Provision a server bootstrap key before starting.');
 const epoch=randomUUID(),peers=new Set(),waiters=new Map();let engine=null,closed=false,sequence=0,outputUnconfirmed=true,leases;
 const codec=secretCodec(secretKey);
 const service=createLocalService({directory,...codec,now,workstation:()=>name,assertControl:(actor,id)=>leases?.assert(actor,id),beforePublish(){if(!engine||engine.ws.readyState!==WebSocket.OPEN||now()-engine.lastPong>heartbeatMs*4)throw new ServiceError('CG engine offline. Attach an output workstation before TAKE.',503);},confirmProgram(program){
  outputUnconfirmed=true;const target=engine;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{waiters.delete(program.revision);const e=new ServiceError('Engine acknowledgement timed out. Output state is unconfirmed; no command was replayed.',504);e.unconfirmed=true;reject(e);},ackTimeout);waiters.set(program.revision,{target,timer,resolve:()=>{clearTimeout(timer);outputUnconfirmed=false;resolve();},reject});send(target,{type:'program',epoch,serverTime:now(),program});});
 }});
 leases=createControlLeases({settings:service.settings,authorize:(token,id)=>service.controlActor(token,id),assertIdle:service.controlIdle,record:service.recordNetwork,now});
 const status=()=>({protocol:1,version:'0.11.0',serverId,epoch,name,serverTime:now(),database:service.health()?'available':'offline',output:engine?'connected':'offline',outputUnconfirmed,engine:engine?{workstation:engine.actor.workstation,username:engine.actor.user.username}:null,clients:peers.size});
 function send(peer,message){if(!peer||peer.ws.readyState!==WebSocket.OPEN)return;if(peer.ws.bufferedAmount>2000000){peer.ws.close(1013,'Client is too slow');return;}peer.ws.send(JSON.stringify(message));}
 function disconnect(peer){peers.delete(peer);if(engine===peer){engine=null;outputUnconfirmed=true;for(const [id,w] of waiters){clearTimeout(w.timer);waiters.delete(id);const e=new ServiceError('Output workstation disconnected. Command result is unconfirmed; do not replay it.',503);e.unconfirmed=true;w.reject(e);}}}
 function snapshot(peer){try{
  const state=service.networkSnapshot(peer.token);peer.actor=state.actor;leases.renew(state.actor);
  send(peer,{type:'snapshot',...status(),sequence:++sequence,projects:state.projects,program:state.program,locks:state.projects.map(p=>leases.view(state.actor,p.id))});
 }catch{peer.ws.close(4001,'Session ended');}}
 const jsonBody=async request=>{try{return await request.json();}catch{throw new ServiceError('Invalid JSON.');}};
 async function route(request,headers){
  const url=new URL(request.url),path=url.pathname,token=(headers.authorization||'').replace(/^Bearer /,'');
  if(path==='/network/status'&&request.method==='GET')return asJSON(status());
  if(path==='/network/auth'&&request.method==='POST'){
   const body=await jsonBody(request),action=body.action,data=body.data||{};if(!authActions.has(action))throw new ServiceError('Unknown account operation.');
   let value;if(action==='bootstrap'){const b=service.auth.bootstrap(),canSetup=equalSecret(headers['x-bootstrap-key'],bootstrapSecret);value={...b,setupRequired:b.setupRequired&&canSetup,setupBlocked:b.setupRequired&&!canSetup};}
   else if(action==='setup'){if(!equalSecret(headers['x-bootstrap-key'],bootstrapSecret))throw new ServiceError('Set up the first administrator on the server computer.',403);value=await service.auth.setup(data);}
   else if(action==='login')value=await service.auth.login(data);
   else if(action==='resume')value=service.auth.resume(data.rememberToken,data.workstation||'LAN workstation');
   else value=await service.auth[action](token,data);
   return asJSON({value});
  }
  if(path.startsWith('/network/output/api/')){
   if(!engine||engine.token!==token||engine.id!==headers['x-engine-id'])throw new ServiceError('Output connection is not attached.',403);
   service.authorize(token,'outputs.configure');
   return service.handle(new Request('broadcastcg://app'+path.slice('/network/output'.length),{method:request.method}),service.outputContext);
  }
  const actor=service.authorize(token);
  if(path==='/network/authorize'&&request.method==='POST'){const {permission}=await jsonBody(request);return asJSON({value:service.authorize(token,permission)});}
  if(path==='/network/locks'&&request.method==='POST'){const {projectId,operation}=await jsonBody(request);return asJSON({value:leases.operate(token,projectId,operation)});}
  if(path==='/network/diagnostics'&&request.method==='GET'){service.authorize(token,'diagnostics.view');return asJSON({...status(),storage:service.diagnostics(),ownership:'session leases; no automatic takeover',failover:'manual; no command replay'});}
  if(path==='/network/recovery'&&request.method==='POST'){const {action,data={}}=await jsonBody(request);if(!['list','create','verify','export'].includes(action))throw new ServiceError('Unsupported recovery operation.');if(action==='export')return new Response(service.recovery.export(token,data.id),{headers:{'Content-Type':'application/octet-stream'}});return asJSON({value:await service.recovery[action](token,data)});}
  if(path==='/network/backup'&&request.method==='POST'){const {password}=await jsonBody(request);service.authorize(token,'system.configure');const bytes=await sealBackup(service.backup(token),secretKey,password);service.authorize(token,'system.configure');return new Response(bytes,{headers:{'Content-Type':'application/octet-stream'}});}
  if(path==='/network/import/psd'&&request.method==='POST'){const body=await jsonBody(request);return asJSON({value:service.importPsd(draftBytes(body.draft),body.options,token)});}
  if(path==='/network/import/ae'&&request.method==='POST'){const body=await jsonBody(request);return asJSON({value:service.importAe(draftBytes(body.draft),body.options,token)});}
  if(path==='/network/export'&&request.method==='POST'){const body=await jsonBody(request);return asJSON({value:service.exportProject(body.project,token,body.format)});}
  if(path==='/network/inspect'&&request.method==='POST'){const body=await jsonBody(request),{project,missing,external,dependencies}=service.inspectImport(body.text,token);return asJSON({value:{project,missing,external,dependencies}});}
  if(path==='/network/import'&&request.method==='POST'){const body=await jsonBody(request);return asJSON({value:service.importProject(service.inspectImport(body.text,token),token,{save:body.save===true})});}
  if(path.startsWith('/api/'))return service.handle(request,{token});
  throw new ServiceError('Network operation is not supported.',404);
 }
 const server=https.createServer({...tls,minVersion:'TLSv1.2',requestTimeout:30000,headersTimeout:10000},async(req,res)=>{
  const answer=async response=>{res.writeHead(response.status,{'Content-Type':response.headers.get('Content-Type')||'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(Buffer.from(await response.arrayBuffer()));};
  try{
   if(req.headers.origin&&req.headers.origin!=='broadcastcg://app')throw new ServiceError('Use the installed BroadcastCG client.',403);
   const path=new URL(req.url,'https://server').pathname,large=path.startsWith('/network/import')||['/network/inspect','/network/export'].includes(path),limit=large?110000000:path==='/api/assets'?50000000:2000000;
   if(Number(req.headers['content-length']||0)>limit)throw new ServiceError('Request too large.',413);
   let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>limit)throw new ServiceError('Request too large.',413);chunks.push(chunk);}
   const body=Buffer.concat(chunks),request=new Request('https://server'+req.url,{method:req.method,headers:req.headers,...(body.length?{body}:{} )});
   await answer(await route(request,req.headers));
  }catch(e){if(!res.headersSent)await answer(asJSON({error:e instanceof ServiceError?e.message:'The production server could not complete this request.'},e instanceof ServiceError?e.status:500));else res.destroy();}
 });
 const wss=new WebSocketServer({noServer:true,maxPayload:8192,perMessageDeflate:false});
 server.on('upgrade',(request,socket,head)=>{
  try{
   if(request.url!=='/network/events'||request.headers.origin||peers.size>=24)throw Error();
   const token=(request.headers.authorization||'').replace(/^Bearer /,''),actor=service.authorize(token,'projects.view');
   wss.handleUpgrade(request,socket,head,ws=>{
    const peer={ws,token,actor,id:randomUUID(),lastPong:now()};peers.add(peer);ws.on('pong',()=>{peer.lastPong=now();});ws.on('error',()=>{});ws.on('close',()=>disconnect(peer));
    ws.on('message',bytes=>{try{const message=JSON.parse(bytes.toString());peer.actor=service.authorize(token);
     if(message.type==='attach-output'){
      service.authorize(token,'outputs.configure');if(engine&&engine!==peer)throw new ServiceError('Output is already attached to '+engine.actor.workstation+'. Release it there first.',409);
      engine=peer;send(peer,{type:'output-attached',id:peer.id,...status()});
     }else if(message.type==='release-output'){if(engine===peer){disconnect(peer);peers.add(peer);}send(peer,{type:'output-released'});}
     else if(message.type==='ack'&&engine===peer&&typeof message.revision==='string'){const w=waiters.get(message.revision);if(w?.target===peer){waiters.delete(message.revision);w.resolve();}}
     else throw new ServiceError('Unsupported output message.');
    }catch(e){send(peer,{type:'error',error:e instanceof ServiceError?e.message:'Invalid message.'});}});
    snapshot(peer);
   });
  }catch{socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');}
 });
 const timer=setInterval(()=>{for(const peer of peers){if(now()-peer.lastPong>heartbeatMs*4){peer.ws.terminate();continue;}peer.ws.ping();snapshot(peer);}leases.sweep();},heartbeatMs);
 try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});}catch(e){clearInterval(timer);service.close();throw e;}
 return{server,service,status,leases,address:server.address(),async close(){if(closed)return;closed=true;clearInterval(timer);for(const peer of peers){disconnect(peer);peer.ws.terminate();}leases.clear();wss.close();await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});service.close();}};
}
