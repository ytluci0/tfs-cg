import {createHash} from 'node:crypto';
import {ServiceError} from './service-error.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
export function projectDependencies(project){
 return{fonts:[...new Set(project.scenes.flatMap(s=>s.layers.filter(l=>l.type==='text').flatMap(l=>[l.fontFamily,...(l.typography?.runs||[]).map(r=>r.fontFamily).filter(Boolean)])))].sort(),external:[...new Set([...JSON.stringify(project).matchAll(/https?:\/\/[^"\s]+/g)].map(m=>m[0]))].sort(),credentials:'Configure on the destination; not included',embeddedMedia:['PNG','JPEG','WebP','MP4','WebM']};
}
export function createProjectPackage(project,assets){
 const document={format:'broadcastcg-package',version:1,application:'BroadcastCG',minimumVersion:'0.19.0',project,assets,manifest:{projectSha256:sha(JSON.stringify(project)),assets:assets.map(a=>({id:a.id,name:a.name,mime:a.mime,size:Buffer.from(a.bytes,'base64').length,sha256:sha(Buffer.from(a.bytes,'base64'))})),dependencies:projectDependencies(project)}};
 return document;
}
export function unpackProjectPackage(data){
 if(data?.format!=='broadcastcg-package')return data;
 if(data.version!==1)throw new ServiceError('Unsupported .broadcastpkg version. Upgrade BroadcastCG before importing it.');
 if(!data.manifest||data.manifest.projectSha256!==sha(JSON.stringify(data.project)))throw new ServiceError('Project package integrity check failed: project content changed or is damaged.');
 if(!Array.isArray(data.assets)||data.assets.length>500||!Array.isArray(data.manifest.assets)||data.manifest.assets.length!==data.assets.length)throw new ServiceError('Invalid package manifest.');
 const ids=new Set();for(let i=0;i<data.assets.length;i++){
  const a=data.assets[i],m=data.manifest.assets[i];
  if(!a||!m||typeof a.bytes!=='string'||a.bytes.length>67000000||ids.has(a.id))throw new ServiceError('Invalid package asset.');
  ids.add(a.id);const bytes=Buffer.from(a.bytes,'base64');
  if(m.id!==a.id||m.name!==a.name||m.mime!==a.mime||m.size!==bytes.length||m.sha256!==sha(bytes))throw new ServiceError('Project package integrity check failed: an image changed or is damaged.');
 }
 const referenced=[...JSON.stringify(data.project).matchAll(/\/api\/assets\/([a-zA-Z0-9-]+)/g)].map(m=>m[1]);
 if(referenced.some(id=>!ids.has(id)))throw new ServiceError('A .broadcastpkg must embed every referenced local image.');
 return{format:'broadcastcg-project',version:1,project:data.project,assets:data.assets};
}
