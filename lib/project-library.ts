import {z} from 'zod';
import {defaultProject,uid,validateProject,type Project,type Scene} from './studio-model.ts';

export const folderName=z.string().trim().max(180).refine(v=>!v.split('/').some(p=>p==='.'||p==='..'), 'Use a folder name, not a filesystem path.');
export const libraryMetadataSchema=z.object({
  version:z.number().int().nonnegative().default(0),
  folder:folderName.default(''), tags:z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  archived:z.boolean().default(false),
  cover:z.object({sceneId:z.string().max(100),time:z.number().min(0).max(600),custom:z.boolean().default(false)}).optional(),
});
export type LibraryMetadata=z.infer<typeof libraryMetadataSchema>;
export type ProjectCard=LibraryMetadata&{id:string;name:string;revision:number;updated_at:number;scenes:number;panels:number;width:number;height:number;frameRate:number;favorite:boolean;thumbnailKey:string|null;expectedKey:string};
export type LibraryListing={projects:ProjectCard[];folders:string[];lastProjectId:string|null;onAirProjectId:string|null;draftProjectId:string|null};
export type ProjectPreview={scene:Scene;compositions?:Scene[];variables:Project['variables'];time:number;key:string};
export function createLibraryProject(options:{name:string;template:'blank'|'broadcast';width:number;height:number;frameRate:number}):Project{
  const p=defaultProject();p.name=options.name.trim();
  if(options.template==='blank'){
    p.scenes=[{id:uid(),name:'Scene 1',width:options.width,height:options.height,frameRate:options.frameRate,duration:5,layers:[]}];
    p.panels=[{id:uid(),name:'Control panel',type:'custom',columns:3,controls:[],freeLayout:true,canvasWidth:1280,canvasHeight:720}];
    p.variables={};p.sources=[];p.bindings=[];p.players=[];
  }else p.scenes=p.scenes.map(s=>({...s,frameRate:options.frameRate}));
  return validateProject(p);
}
