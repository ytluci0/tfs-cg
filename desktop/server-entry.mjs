import {writeFileSync,readFileSync,existsSync,unlinkSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createNetworkServer} from './network-server.mjs';
import {serverOptions} from './server-host.mjs';
(async()=>{
const directory=resolve(process.argv[2]||'');if(!process.argv[2])throw Error('A provisioned server directory is required.');
const lock=join(directory,'server.lock');mkdirSync(directory,{recursive:true});
if(existsSync(lock)){const prior=Number(readFileSync(lock,'utf8'));try{process.kill(prior,0);throw Error('Another production server is already running.');}catch(e){if(e.code!=='ESRCH')throw e;}unlinkSync(lock);}
writeFileSync(lock,String(process.pid),{flag:'wx'});const stopFile=join(directory,'stop.request');if(existsSync(stopFile))unlinkSync(stopFile);
let server,timer,stopping=false;
async function stop(){if(stopping)return;stopping=true;clearInterval(timer);await server?.close();try{unlinkSync(lock);}catch{}try{unlinkSync(stopFile);}catch{}process.exit(0);}
try{server=await createNetworkServer(serverOptions(directory));writeFileSync(join(directory,'status.json'),JSON.stringify(server.status()));timer=setInterval(()=>{if(existsSync(stopFile))void stop();},1000);process.on('SIGTERM',stop);process.on('SIGINT',stop);process.on('message',m=>{if(m==='stop')void stop();});console.log('BroadcastCG production service ready.');}catch(e){try{unlinkSync(lock);}catch{}console.error(e.message);process.exit(1);}
})().catch(e=>{console.error(e.message);process.exit(1);});
