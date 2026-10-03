const fs=require('node:fs');
const {join}=require('node:path');
const {randomBytes,randomUUID}=require('node:crypto');

// This capability only grants read access to local output. It is not an account
// credential and can be replaced on an explicit output start if Windows can no
// longer decrypt it. Never apply this recovery to account/data-feed secrets.
function loadOutputKey({directory,protect,unprotect}){
 const file=join(directory,'browser-output-key.bin');
 let previous=null;
 try{previous=fs.readFileSync(file);}catch(error){if(error.code!=='ENOENT')throw Error('The local output key could not be read. Check access to the application data folder.');}
 if(previous){try{const secret=unprotect(previous);if(typeof secret==='string'&&/^[a-f0-9]{64}$/.test(secret))return{secret,recovered:false};}catch{/* Preserve unreadable ciphertext below before replacing this output-only key. */}}
 const secret=randomBytes(32).toString('hex');let protectedKey;
 try{protectedKey=protect(secret);if(!Buffer.isBuffer(protectedKey)||!protectedKey.length||unprotect(protectedKey)!==secret)throw Error('Protection check failed');}
 catch{throw Error('Windows could not protect the local output key. Output was not started and the existing key was kept.');}
 const temporary=file+'.'+randomUUID()+'.partial';
 try{
  fs.writeFileSync(temporary,protectedKey,{flag:'wx'});
  if(previous)fs.copyFileSync(file,file+'.unreadable-'+randomUUID(),fs.constants.COPYFILE_EXCL);
  fs.renameSync(temporary,file);
 }catch{try{fs.rmSync(temporary,{force:true});}catch{}throw Error('The local output key could not be saved. Output was not started. Check access to the application data folder.');}
 return{secret,recovered:previous!==null};
}
module.exports={loadOutputKey};
