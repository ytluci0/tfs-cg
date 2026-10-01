import {mkdirSync,readFileSync,writeFileSync,existsSync,renameSync,unlinkSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {DatabaseSync} from 'node:sqlite';
import {secretCodec} from './server-crypto.mjs';
import {prepareRestore,commitRestore,completeRestore,recoverInterruptedRestore} from './recovery-store.mjs';
import {createLocalService} from './local-service.mjs';
const run=promisify(execFile);
export async function provisionServer(directory,certificateTool,{name='BroadcastCG production',host='127.0.0.1',port=9443}={}){
 if(!['127.0.0.1','0.0.0.0'].includes(host)||!Number.isInteger(port)||port<1024||port>65535||typeof name!=='string'||!name.trim()||name.length>80)throw Error('Choose a server name, port 1024–65535, and a supported listen address.');
 mkdirSync(directory,{recursive:true});
 const file=join(directory,'server.json');if(existsSync(file))return loadServer(directory);
 // The bootstrap key, TLS private key and feed encryption key stay inside a
 // Windows directory restricted to this user, administrators and SYSTEM.
 const identity=(await run('whoami.exe',[],{windowsHide:true})).stdout.trim();
 await run('icacls.exe',[directory,'/inheritance:r','/grant:r',identity+':(OI)(CI)F','*S-1-5-18:(OI)(CI)F','*S-1-5-32-544:(OI)(CI)F'],{windowsHide:true});
 const passphrase=randomBytes(32).toString('base64url'),pfx=join(directory,'server.pfx');
 const fingerprint=(await run(certificateTool,['certificate',pfx,passphrase],{windowsHide:true,timeout:30000})).stdout.trim();if(!/^[a-f0-9]{64}$/.test(fingerprint))throw Error('Certificate generation failed.');
 const config={version:1,serverId:randomUUID(),name:name.trim(),host,port,passphrase,fingerprint,secretKey:randomBytes(32).toString('base64'),bootstrapSecret:randomBytes(32).toString('base64url')};
 writeFileSync(file,JSON.stringify(config,null,2),{flag:'wx'});return config;
}
export function loadServer(directory){const c=JSON.parse(readFileSync(join(directory,'server.json'),'utf8'));if(c.version!==1||!/^[a-f0-9]{64}$/.test(c.fingerprint)||Buffer.from(c.secretKey,'base64').length!==32)throw Error('Invalid server configuration.');return c;}
export function serverOptions(directory){const c=loadServer(directory);return{...c,directory:join(directory,'data'),secretKey:Buffer.from(c.secretKey,'base64'),tls:{pfx:readFileSync(join(directory,'server.pfx')),passphrase:c.passphrase}};}
export async function restoreServer(directory,bytes,password,{replace=false}={}){
 if(existsSync(join(directory,'server.lock')))throw Error('Stop the server before restoring a backup.');
 const c=loadServer(directory),data=join(directory,'data'),target=join(data,'broadcastcg.sqlite');
 recoverInterruptedRestore(data);
 if(existsSync(target)&&!replace)throw Error('Restore into a newly provisioned server with an empty database, or explicitly choose replacement.');
 const codec=secretCodec(Buffer.from(c.secretKey,'base64')),prepared=await prepareRestore(data,bytes,password,codec.encrypt);
 try{
  if(existsSync(target)){const old=new DatabaseSync(target);try{old.exec('PRAGMA wal_checkpoint(TRUNCATE)');}finally{old.close();}}
  const result=commitRestore(data,prepared);const check=createLocalService({directory:data,...codec});check.close();completeRestore(data);return{restored:true,...result};
 }catch(e){recoverInterruptedRestore(data);throw e;}
}
