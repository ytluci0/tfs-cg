import {z} from 'zod';
import {layer,type Scene} from './studio-model.ts';
export const psdOptionsSchema=z.object({id:z.string().max(100),projectId:z.string().max(100),revision:z.number().int().nonnegative(),mode:z.enum(['editable','pixels','composite']),fonts:z.record(z.string().max(100),z.string().trim().min(1).max(100)).refine(v=>Object.keys(v).length<=250),fontStatus:z.enum(['checked','unavailable']),missingFonts:z.array(z.string().max(100)).max(250)});
export type PsdOptions=z.infer<typeof psdOptionsSchema>;
export type PsdDraft={id:string;scene:Scene;rasterScene:Scene;images:Record<string,string>;referenceSrc:string;fileName:string;warnings:{layer:string;message:string}[]};
export function psdScene(draft:Omit<PsdDraft,'id'|'images'>,options:Pick<PsdOptions,'mode'|'fonts'|'fontStatus'|'missingFonts'>):Scene{
 if(options.mode==='composite'&&!draft.referenceSrc)throw Error('This PSD has no saved composite.');
 const scene=structuredClone(options.mode==='pixels'?draft.rasterScene:draft.scene);
 const warnings=[...draft.warnings];
 if(options.mode==='composite'){scene.layers=[layer('image',{name:'Photoshop saved composite',x:0,y:0,width:scene.width,height:scene.height,src:draft.referenceSrc})];scene.groups=[];}
 else for(const l of scene.layers)if(l.type==='text'&&l.sourceFont){const mapped=options.fonts[l.sourceFont];if(mapped){l.fontFamily=mapped;if(mapped!==l.sourceFont)warnings.push({layer:l.name,message:`Font mapping: ${l.sourceFont} → ${mapped}. Fonts are not embedded in project exports.`});}}
 if(options.fontStatus==='unavailable')warnings.push({layer:'Fonts',message:'Installed fonts could not be checked. Confirm fonts before using editable text.'});
 for(const font of options.missingFonts)warnings.push({layer:'Fonts',message:`Missing font: ${font}. ${options.fonts[font]?'Substituted with '+options.fonts[font]+'.':'Use saved pixels or install/map this font before editing text.'}`});
 scene.importReport={format:'psd',fileName:draft.fileName,referenceSrc:draft.referenceSrc,mode:options.mode,warnings};return scene;
}

export type SceneNode={kind:'layer';layer:Scene['layers'][number]}|{kind:'group';group:NonNullable<Scene['groups']>[number];children:SceneNode[]};
// Group positions follow the first member in the flat layer order. Within-group
// reordering is kept separate from moving members between groups.
export function sceneTree(scene:Scene):SceneNode[]{
 const groups=scene.groups||[],byId=new Map(groups.map(g=>[g.id,g])),rank=new Map<string,number>();
 scene.layers.forEach((l,index)=>{let id=l.groupId;const seen=new Set<string>();while(id&&byId.has(id)&&!seen.has(id)){seen.add(id);rank.set(id,Math.min(rank.get(id)??Infinity,index));id=byId.get(id)?.parentId;}});
 function children(parentId?:string,depth=0):SceneNode[]{if(depth>20)return[];return [...scene.layers.flatMap((l,index)=>l.groupId===parentId?[{rank:index,node:{kind:'layer' as const,layer:l}}]:[]),...groups.filter(g=>g.parentId===parentId).map(g=>({rank:rank.get(g.id)??Infinity,node:{kind:'group' as const,group:g,children:children(g.id,depth+1)}}))].sort((a,b)=>a.rank-b.rank).map(v=>v.node);}
 return children();
}
