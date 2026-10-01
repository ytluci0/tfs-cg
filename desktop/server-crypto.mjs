import {randomBytes,createCipheriv,createDecipheriv,scrypt as derive} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(derive);
export function secretCodec(key){
 if(!Buffer.isBuffer(key)||key.length!==32)throw Error('Invalid server encryption key.');
 return{encrypt(text){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);return Buffer.concat([iv,cipher.update(text,'utf8'),cipher.final(),cipher.getAuthTag()]);},decrypt(bytes){if(bytes.length<28)throw Error('Invalid encrypted credential.');const cipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));cipher.setAuthTag(bytes.subarray(-16));return Buffer.concat([cipher.update(bytes.subarray(12,-16)),cipher.final()]).toString('utf8');}};
}
export async function sealBackup(database,key,password){
 if(typeof password!=='string'||password.length<15||password.length>128)throw Error('Use a backup password of 15–128 characters.');
 if(database.length>200000000)throw Error('Server backup exceeds the 200 MB qualification limit.');
 const salt=randomBytes(16),iv=randomBytes(12),derived=await scrypt(password,salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024});
 const cipher=createCipheriv('aes-256-gcm',derived,iv);cipher.setAAD(Buffer.from('BroadcastCG server backup v1'));
 const payload=Buffer.concat([key,database]),encrypted=Buffer.concat([cipher.update(payload),cipher.final()]);derived.fill(0);
 return Buffer.concat([Buffer.from('BCGSBACK1'),salt,iv,cipher.getAuthTag(),encrypted]);
}
export async function openBackup(bytes,password){
 if(bytes.length<86||bytes.length>200000086||bytes.subarray(0,9).toString()!=='BCGSBACK1')throw Error('Choose a valid BroadcastCG server backup.');
 if(typeof password!=='string'||password.length<15||password.length>128)throw Error('Enter the backup password.');
 const derived=await scrypt(password,bytes.subarray(9,25),32,{N:32768,r:8,p:1,maxmem:64*1024*1024});
 try{const cipher=createDecipheriv('aes-256-gcm',derived,bytes.subarray(25,37));cipher.setAAD(Buffer.from('BroadcastCG server backup v1'));cipher.setAuthTag(bytes.subarray(37,53));const payload=Buffer.concat([cipher.update(bytes.subarray(53)),cipher.final()]);if(payload.subarray(32,48).toString()!=='SQLite format 3\0')throw Error();return{key:payload.subarray(0,32),database:payload.subarray(32)};}catch{throw Error('Backup password is incorrect or the file is damaged.');}finally{derived.fill(0);}
}
