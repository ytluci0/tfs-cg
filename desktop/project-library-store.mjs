import {compositionResources} from '../lib/studio-model.ts';
import {randomUUID} from 'node:crypto';
import {libraryMetadataSchema,folderName} from '../lib/project-library.ts';
import {ServiceError} from './service-error.mjs';

const json=value=>Response.json(value,{headers:{'Cache-Control':'no-store'}});
const pngPrefix='data:image/png;base64,';
function thumbnail(value){
  if(typeof value!=='string'||!value.startsWith(pngPrefix)||value.length>500000)throw new ServiceError('Choose a thumbnail smaller than 375 KB.');
  const bytes=Buffer.from(value.slice(pngPrefix.length),'base64');
  if(bytes.length<24||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||bytes.toString('base64')!==value.slice(pngPrefix.length))throw new ServiceError('Invalid PNG thumbnail.');
  const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
  if(!width||!height||width>640||height>640)throw new ServiceError('Thumbnails must be at most 640 × 640.');
  return bytes;
}

/** Organization and disposable previews live beside project documents. Old projects need no rewrite. */
export function createProjectLibrary({db,settings,readProject,requirePermission,canAccess,record,now,program,readJson,assertControl,assertIdle,saveProject,recovery}){
  const meta=id=>libraryMetadataSchema.parse(settings.get('library:'+id,{}));
  const key=(revision,m)=>m.cover?.custom?'custom:'+m.version:revision+':'+m.version;
  return async function library(request,context,getActor){
    const url=new URL(request.url),path=url.pathname,method=request.method;
    if(!path.startsWith('/api/library'))return null;
    const data=method==='POST'?await readJson(request,600000):null,actor=getActor();requirePermission(actor,'projects.view');
    if(path==='/api/library'&&method==='GET'){
      const favorites=settings.get('favorites:'+actor.user.id,[]);
      const rows=db.prepare(`SELECT p.id,p.name,p.revision,p.updated_at,
        json_array_length(p.document,'$.scenes') AS scenes,json_array_length(p.document,'$.panels') AS panels,
        json_extract(p.document,'$.scenes[0].width') AS width,json_extract(p.document,'$.scenes[0].height') AS height,
        COALESCE(json_extract(p.document,'$.scenes[0].frameRate'),60) AS frameRate,
        m.document AS metadata,json_extract(t.document,'$.key') AS thumbnailKey
        FROM projects p LEFT JOIN settings m ON m.key='library:'||p.id LEFT JOIN settings t ON t.key='thumbnail:'||p.id
        ORDER BY p.updated_at DESC,p.id`).all().filter(p=>canAccess(actor,p.id));
      const projects=rows.map(({metadata,...p})=>{const m=libraryMetadataSchema.parse(metadata?JSON.parse(metadata):{});return{...p,...m,favorite:favorites.includes(p.id),expectedKey:key(p.revision,m)};});
      const live=program(),draft=recovery(actor);
      const last=settings.get('lastProject:'+actor.user.id);
      return json({projects,folders:[...new Set([...settings.get('libraryFolders:'+actor.user.id,[]),...projects.map(p=>p.folder).filter(Boolean)])].sort(),lastProjectId:projects.some(p=>p.id===last)?last:null,onAirProjectId:live&&live.mode!=='hide'&&actor.user.permissions.includes('outputs.view')&&canAccess(actor,live.projectId)?live.projectId:null,draftProjectId:draft?.project?.id||null});
    }
    if(path==='/api/library/folders'&&method==='POST'){
      requirePermission(actor,'projects.edit');const folder=folderName.parse(data.folder);
      if(!folder)throw new ServiceError('Enter a folder name.');
      const folders=[...new Set([...settings.get('libraryFolders:'+actor.user.id,[]),folder])];
      if(folders.length>500)throw new ServiceError('This account already has 500 folders.');
      settings.set('libraryFolders:'+actor.user.id,folders);return json({folder});
    }
    const match=path.match(/^\/api\/library\/([^/]+)\/(metadata|favorite|rename|duplicate|preview|thumbnail)$/);
    if(!match)throw new ServiceError('Library operation not found.',404);
    const id=decodeURIComponent(match[1]),operation=match[2],row=readProject(actor,id),m=meta(id);
    if(operation==='preview'&&method==='GET'){
      const scene=row.project.scenes.find(s=>s.id===m.cover?.sceneId)||row.project.scenes[0];
      return json({scene,compositions:compositionResources(row.project.scenes,scene),variables:row.project.variables,time:Math.min(scene.duration,m.cover?.time??scene.duration),key:key(row.revision,m)});
    }
    if(operation==='thumbnail'&&method==='GET'){
      const cached=settings.get('thumbnail:'+id);
      if(!cached)throw new ServiceError('No thumbnail yet.',404);
      return new Response(thumbnail(cached.dataUrl),{headers:{'Content-Type':'image/png','Cache-Control':'no-store'}});
    }
    if(method!=='POST')throw new ServiceError('Library operation not found.',404);
    if(operation==='favorite'){
      if(typeof data.favorite!=='boolean')throw new ServiceError('Invalid favorite.');
      const ids=new Set(settings.get('favorites:'+actor.user.id,[]));data.favorite?ids.add(id):ids.delete(id);
      if(ids.size>10000)throw new ServiceError('Too many favorites.');
      settings.set('favorites:'+actor.user.id,[...ids]);return json({favorite:data.favorite});
    }
    requirePermission(actor,operation==='duplicate'?'projects.create':'projects.edit');
    if(operation==='thumbnail'){
      if(data.key!==key(row.revision,m))throw new ServiceError('Project changed while its thumbnail was generated.',409);
      thumbnail(data.dataUrl);settings.set('thumbnail:'+id,{key:data.key,dataUrl:data.dataUrl});return json({key:data.key});
    }
    if(operation!=='duplicate'){assertControl(actor,id);assertIdle(id);}
    if(operation==='metadata'){
      if(data.version!==m.version)throw new ServiceError('Project organization changed. Refresh the library and retry.',409);
      const next=libraryMetadataSchema.parse({...m,...data,version:m.version+1});
      if(next.cover){const s=row.project.scenes.find(s=>s.id===next.cover.sceneId);if(!s||next.cover.time>s.duration)throw new ServiceError('Choose a valid scene and time.');}
      if(next.archived&&program()?.projectId===id&&program()?.mode!=='hide')throw new ServiceError('Hide this project’s live graphic before archiving it.',409);
      // A custom cover and its metadata are committed together; it never references an orphan upload.
      if(next.cover?.custom){if(data.dataUrl){thumbnail(data.dataUrl);}else if(!m.cover?.custom||!settings.get('thumbnail:'+id))throw new ServiceError('Choose a cover image.');}
      db.exec('BEGIN IMMEDIATE');try{
        settings.set('library:'+id,next);
        if(next.cover?.custom)settings.set('thumbnail:'+id,{key:key(row.revision,next),dataUrl:data.dataUrl||settings.get('thumbnail:'+id).dataUrl});
        record('PROJECT_ORGANIZED',id,'success',actor,{projectId:id});db.exec('COMMIT');
      }catch(e){db.exec('ROLLBACK');throw e;}return json(next);
    }
    if(operation==='rename'){
      return saveProject({...row.project,name:data.name},data.revision,context);
    }
    if(operation==='duplicate'){
      if(typeof data.name!=='string'||!data.name.trim()||data.name.trim().length>150)throw new ServiceError('Enter a project name up to 150 characters.');
      const project={...row.project,id:randomUUID(),name:data.name.trim()};
      // The normal creation path validates permissions/assets and grants the creator access.
      const response=await saveProject(project,0,context);if(!response.ok)return response;
      const next={...m,version:1,archived:false};settings.set('library:'+project.id,next);
      const cached=settings.get('thumbnail:'+id);if(cached&&cached.key===key(row.revision,m))settings.set('thumbnail:'+project.id,{...cached,key:key(1,next)});
      return json({id:project.id,revision:1});
    }
    throw new ServiceError('Library operation not found.',404);
  };
}
