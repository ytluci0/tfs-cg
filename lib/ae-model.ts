import {z} from 'zod';
import type {Scene} from './studio-model.ts';

const n=z.number().finite().min(-1e7).max(1e7);
const pair=z.tuple([n,n]);
export const aeSampleSchema=z.object({time:z.number().min(0).max(600),position:pair,anchor:pair,scale:pair,rotation:n,opacity:z.number().min(0).max(100),hold:z.array(z.enum(['position','anchor','scale','rotation','opacity'])).max(5).optional()}).strict();
export const aePackageSchema=z.object({
 format:z.literal('broadcastcg-ae'),version:z.literal(1),
 exporter:z.object({name:z.string().max(100),version:z.string().max(40),aeVersion:z.string().max(100)}).strict(),
 composition:z.object({name:z.string().min(1).max(200),width:z.number().int().min(100).max(7680),height:z.number().int().min(100).max(4320),duration:z.number().min(.1).max(600),frameRate:z.number().min(1).max(120),workAreaStart:z.number().min(0).max(1e7),pixelAspect:z.literal(1)}).strict(),
 layers:z.array(z.object({id:z.string().regex(/^[a-zA-Z0-9-]{1,100}$/),name:z.string().max(200),type:z.enum(['text','solid','image']),width:z.number().positive().max(20000),height:z.number().positive().max(20000),inPoint:z.number().min(0).max(600),outPoint:z.number().positive().max(600),imageId:z.string().regex(/^[a-zA-Z0-9-]{1,100}$/).optional(),color:z.string().regex(/^#[a-fA-F0-9]{6}$/).optional(),text:z.object({value:z.string().min(1).max(20000),font:z.string().min(1).max(100),fontSize:z.number().min(1).max(2000),fontWeight:z.union([z.literal(400),z.literal(700)]),align:z.enum(['left','center','right']),left:n,top:n}).strict().optional(),samples:z.array(aeSampleSchema).min(1).max(18001)}).strict()).min(1).max(250),
 assets:z.array(z.object({id:z.string().regex(/^[a-zA-Z0-9-]{1,100}$/),name:z.string().max(200),mime:z.literal('image/png'),bytes:z.string().max(13333336)}).strict()).max(270),
 references:z.array(z.object({time:z.number().min(0).max(600),imageId:z.string().regex(/^[a-zA-Z0-9-]{1,100}$/)}).strict()).max(20),
 warnings:z.array(z.object({layer:z.string().max(200),message:z.string().max(1000)}).strict()).max(1500),
}).strict();
export type AePackage=z.infer<typeof aePackageSchema>;
export const aeOptionsSchema=z.object({id:z.string().max(100),projectId:z.string().max(100),revision:z.number().int().nonnegative(),fonts:z.record(z.string().max(100),z.string().trim().min(1).max(100)).refine(v=>Object.keys(v).length<=250),fontStatus:z.enum(['checked','unavailable']),missingFonts:z.array(z.string().max(100)).max(250),acceptWarnings:z.literal(true)});
export type AeOptions=z.infer<typeof aeOptionsSchema>;
export type AeDraft={id:string;scene:Scene;images:Record<string,string>;fileName:string;warnings:{layer:string;message:string}[]};
export function aeScene(draft:Pick<AeDraft,'scene'>,options:Pick<AeOptions,'fonts'|'fontStatus'|'missingFonts'>):Scene{
 const scene=structuredClone(draft.scene),report=scene.importReport;
 if(report?.format!=='ae')throw Error('This is not an After Effects conversion.');
 for(const l of scene.layers)if(l.sourceFont&&options.fonts[l.sourceFont]){l.fontFamily=options.fonts[l.sourceFont];if(l.fontFamily!==l.sourceFont)report.warnings.push({layer:l.name,message:`Font mapping: ${l.sourceFont} → ${l.fontFamily}. Fonts are not embedded.`});}
 if(options.fontStatus==='unavailable')report.warnings.push({layer:'Fonts',message:'Installed fonts could not be checked. Verify editable text against the AE reference.'});
 for(const name of options.missingFonts)report.warnings.push({layer:'Fonts',message:`Missing font: ${name}. Substituted with ${options.fonts[name]||'Arial'}.`});
 return scene;
}
