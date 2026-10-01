import {readFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {serverProfile} from './network-client.mjs';
export function managedPolicy(value){
 if(value?.format!=='broadcastcg-managed-client'||value.version!==1||!Array.isArray(value.profiles)||!value.profiles.length||value.profiles.length>4)throw Error('Invalid managed-client policy. Ask the administrator to repair the deployment configuration.');
 const profiles=value.profiles.map(p=>{const v=serverProfile(p);return{...v,id:createHash('sha256').update(v.url+'|'+v.fingerprint).digest('hex').slice(0,32)};});
 if(new Set(profiles.map(p=>p.id)).size!==profiles.length)throw Error('Managed servers must be unique.');
 return{format:'broadcastcg-managed-client',version:1,profiles};
}
export function readManagedPolicy(file){
 let metadata;try{metadata=statSync(file);}catch(e){if(e.code==='ENOENT')return null;throw e;}
 if(metadata.size>32000)throw Error('Managed-client policy is too large. Ask the administrator to repair it.');
 // Invalid or unreadable policy must stop startup, never enable local mode.
 return managedPolicy(JSON.parse(readFileSync(file,'utf8').replace(/^\uFEFF/,'')));
}
