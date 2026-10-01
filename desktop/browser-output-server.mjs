import http from 'node:http';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve,join,relative} from 'node:path';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {WebSocketServer,WebSocket} from 'ws';
import {outputConfig} from './output-config.mjs';

// A separate process serves only immutable renderer files, current output images and
// snapshots. It has no database, accounts, credentials, filesystem API or command API.
export async function createBrowserOutput({root,config,secret,onEvent=()=>{},ackTimeout=2500}){
 config=outputConfig(config);
 if(!/^[a-f0-9]{64}$/.test(secret))throw Error('Invalid output capability.');
 const prefix='/live/'+secret+'/',epoch=randomUUID(),files=new Map(),peers=new Set();
 function load(dir){for(const e of readdirSync(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())load(p);else if(/\.(html|js|css|woff2)$/.test(e.name)){files.set(relative(root,p).replaceAll('\\','/'),readFileSync(p));}}}
 load(resolve(root));
 let active=null,program=null,assets=new Map(),waiter=null,closed=false,sequence=0;
 let metrics={connected:false,ready:false,receiver:null,ackMs:null,revision:null,error:null,telemetry:null,receivedAt:null};
 const send=(ws,m)=>{if(ws.readyState!==WebSocket.OPEN)return;if(ws.bufferedAmount>8000000){ws.terminate();return;}ws.send(JSON.stringify(m));};
 const emit=()=>onEvent({type:'status',status:status()});
 const status=()=>({...metrics,connected:!!active,ready:!!active&&performance.now()-active.lastReport<4000&&active.ready,uptimeMs:Math.round(performance.now()-started),peers:peers.size,epoch});
 const snapshot=()=>({type:'snapshot',epoch,sequence,config,program,serverTime:Date.now()});
 function rejectPending(message){if(waiter){const w=waiter;waiter=null;clearTimeout(w.timer);w.reject(Error(message));}}
 function gone(peer){peers.delete(peer);if(active===peer){active=null;metrics.error='Receiver disconnected. Inspect output before another TAKE.';metrics.telemetry=null;rejectPending(metrics.error);emit();}}
 const server=http.createServer((req,res)=>{
  const fail=code=>{res.writeHead(code,{'Cache-Control':'no-store'});res.end();};
  if(req.headers.host!==`127.0.0.1:${config.port}`)return fail(403);
  if(req.method!=='GET'&&req.method!=='HEAD')return fail(405);
  if(req.headers.origin&&req.headers.origin!==`http://127.0.0.1:${config.port}`)return fail(403);
  const path=req.url?.split('?')[0];if(!path?.startsWith(prefix)||path.includes('%')||path.includes('..'))return fail(404);
  const name=path.slice(prefix.length)||'output.html';let bytes,type;
  if(name.startsWith('media/')){const asset=assets.get(name.slice(6));if(!asset)return fail(404);bytes=asset.bytes;type=asset.type;}
  else{bytes=files.get(name);type=name.endsWith('.html')?'text/html':name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'font/woff2';}
  if(!bytes)return fail(404);
  if(type?.startsWith('video/')&&req.headers.range){const m=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);const start=m?Number(m[1]):-1,end=m?Math.min(bytes.length-1,m[2]?Number(m[2]):bytes.length-1):-1;if(start<0||start>end||start>=bytes.length){res.writeHead(416,{'Content-Range':'bytes */'+bytes.length});res.end();return;}res.writeHead(206,{'Content-Type':type,'Accept-Ranges':'bytes','Content-Range':`bytes ${start}-${end}/${bytes.length}`,'Content-Length':end-start+1,'Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:bytes.subarray(start,end+1));return;}
  res.writeHead(200,{'Accept-Ranges':'bytes','Content-Type':type,'Cache-Control':'no-store','Content-Length':bytes.length,'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; media-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"});
  res.end(req.method==='HEAD'?undefined:bytes);
 });
 server.headersTimeout=5000;server.requestTimeout=5000;server.maxConnections=32;
 const wss=new WebSocketServer({noServer:true,maxPayload:16384,perMessageDeflate:false});
 server.on('upgrade',(req,socket,head)=>{
  if(closed||req.headers.host!==`127.0.0.1:${config.port}`||req.headers.origin!==`http://127.0.0.1:${config.port}`||req.url!==prefix+'events'||peers.size>=4){socket.destroy();return;}
  wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
 });
 wss.on('connection',ws=>{
  if(active){ws.close(4009,'One receiver is already attached');return;}
  const peer={ws,ready:false,lastReport:performance.now(),id:randomUUID()};active=peer;peers.add(peer);metrics={...metrics,error:null,telemetry:null,receiver:peer.id,revision:null};
  send(ws,snapshot());emit();
  ws.on('error',()=>{});ws.on('close',()=>gone(peer));
  ws.on('message',bytes=>{try{
   const m=JSON.parse(bytes.toString());if(active!==peer||m.epoch!==epoch)return;
   const viewportValid=m.width===config.width&&m.height===config.height;
   if(m.type==='ready'){peer.ready=viewportValid;peer.lastReport=performance.now();if(!viewportValid)metrics.error=`Receiver size does not match ${config.width} × ${config.height}. Set the Browser Source width and height.`;else if(metrics.error?.startsWith('Receiver size'))metrics.error=null;emit();}
   else if(m.type==='telemetry'){
    const t=m.value;
    if(!t||!['callbacks','lateIntervals','maxIntervalMs','meanIntervalMs','elapsedMs','renderUpdates'].every(k=>Number.isFinite(t[k])&&t[k]>=0&&t[k]<1e12))return;
    peer.lastReport=performance.now();peer.ready=viewportValid;if(!viewportValid)metrics.error=`Receiver size does not match ${config.width} × ${config.height}. Set the Browser Source width and height.`;metrics.telemetry=Object.fromEntries(['callbacks','lateIntervals','maxIntervalMs','meanIntervalMs','elapsedMs','renderUpdates'].map(k=>[k,t[k]]));metrics.receivedAt=Date.now();emit();
   }else if(m.type==='rendered'&&viewportValid&&waiter&&waiter.peer===peer&&m.revision===waiter.revision){
    const w=waiter;waiter=null;clearTimeout(w.timer);metrics.revision=m.revision;metrics.ackMs=Math.round((performance.now()-w.start)*10)/10;metrics.error=null;w.resolve({revision:m.revision,ackMs:metrics.ackMs});emit();
   }else if(m.type==='failed'&&waiter&&m.revision===waiter.revision){metrics.error='Receiver could not prepare all graphic images/fonts.';rejectPending(metrics.error);emit();}
  }catch{ws.close(1008,'Invalid output message');}});
 });
 const started=performance.now();const heartbeat=setInterval(()=>{if(active&&performance.now()-active.lastReport>6000){active.ws.terminate();}else if(active)send(active.ws,{type:'heartbeat',epoch});},1000);heartbeat.unref();
 try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(config.port,'127.0.0.1',resolve);});}catch(e){clearInterval(heartbeat);wss.close();throw e;}
 server.on('error',()=>{});
 return{
  status,url:`http://127.0.0.1:${config.port}${prefix}`,config,
  async publish(next,media=[]){
   if(!status().ready)throw Error('Browser receiver is offline or stale.');if(waiter)throw Error('Another browser output command is pending.');
   if(!next||typeof next.revision!=='string'||JSON.stringify(next).length>8000000)throw Error('Invalid output snapshot.');
   let total=0;const fresh=new Map();for(const asset of media){if(!/^[a-zA-Z0-9-]{1,120}$/.test(asset.id)||!['image/png','image/jpeg','image/webp','video/mp4','video/webm'].includes(asset.type))throw Error('Invalid output image.');const bytes=Buffer.from(asset.bytes);total+=bytes.length;if(total>128000000)throw Error('Output images exceed 128 MB.');fresh.set(asset.id,{bytes,type:asset.type});}
   assets=fresh;program=next;sequence++;
   return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{if(waiter?.revision===next.revision){metrics.error='Receiver acknowledgement timed out. Output is unconfirmed.';rejectPending(metrics.error);emit();}},ackTimeout);waiter={revision:next.revision,peer:active,start:performance.now(),timer,resolve,reject};send(active.ws,snapshot());});
  },
  update(next){if(program&&next?.revision===program.revision){program=next;sequence++;if(active)send(active.ws,snapshot());}},
  async close(){if(closed)return;closed=true;clearInterval(heartbeat);rejectPending('Browser output stopped.');for(const p of peers)p.ws.terminate();wss.close();await new Promise(r=>{server.close(r);server.closeAllConnections();});assets.clear();files.clear();},
 };
}

