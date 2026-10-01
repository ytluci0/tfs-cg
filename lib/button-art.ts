import {buttonArtSchema,type ArtPart,type ArtState,type ArtStyle,type ButtonArt} from './button-art-schema.ts';
export type {ArtPart,ArtState,ArtStyle,ButtonArt};
export const artId=()=>crypto.randomUUID();
export function artPart(kind:ArtPart['kind'],value:Partial<ArtPart>={}):ArtPart{return {id:artId(),name:kind,kind,x:20,y:20,width:180,height:70,rotation:0,opacity:1,visible:true,locked:false,fill:'#eaf2ff',gradient:'',angle:90,stroke:'#ffffff',strokeWidth:0,radius:0,text:'Text',fontFamily:'Arial',fontSize:30,fontWeight:600,align:'center',image:'',imageFit:'cover',...value};}
export function resolvedArtPart(part:ArtPart,state:ArtState):ArtPart{return {...part,...(state==='normal'?{}:part.states?.[state])};}
export function patchArtPart(art:ButtonArt,id:string,state:ArtState,value:Partial<ArtStyle>):ButtonArt{return buttonArtSchema.parse({...art,parts:art.parts.map(p=>p.id!==id||p.locked?p:state==='normal'?{...p,...value}:{...p,states:{...p.states,[state]:{...p.states?.[state],...value}}})});}
export function buttonArtwork(label='Button',color='#245388'):ButtonArt{return {width:320,height:120,fit:'stretch',parts:[artPart('rect',{name:'Background',x:0,y:0,width:320,height:120,fill:color,radius:12,stroke:'#ffffff',strokeWidth:1,states:{hover:{fill:'#356bab'},pressed:{fill:'#183756'},disabled:{opacity:.35},live:{fill:'#127756'}}}),artPart('text',{name:'Label',x:12,y:20,width:296,height:80,text:label})]};}
export function artPreset(kind:'blank'|'rounded'|'circle'|'hexagon'|'shirt'|'image',label='Button',color='#245388'):ButtonArt{
 const art=buttonArtwork(label,color);if(kind==='blank')return {...art,parts:[]};if(kind==='rounded')return art;
 if(kind==='image'){art.parts[0]=artPart('image',{name:'Photo',x:0,y:0,width:320,height:120});return art;}
 art.width=art.height=120;const base=artPart(kind==='circle'?'ellipse':'polygon',{name:kind,x:4,y:4,width:112,height:112,fill:color,stroke:'#ffffff',strokeWidth:1,states:{hover:{strokeWidth:4},pressed:{opacity:.65},disabled:{opacity:.3},live:{stroke:'#55ffb0',strokeWidth:4}}});
 if(kind==='hexagon')base.points=[{x:.25,y:0},{x:.75,y:0},{x:1,y:.5},{x:.75,y:1},{x:.25,y:1},{x:0,y:.5}];
 if(kind==='shirt')base.points=[{x:.3,y:0},{x:.42,y:.08},{x:.58,y:.08},{x:.7,y:0},{x:1,y:.24},{x:.85,y:.43},{x:.75,y:.37},{x:.75,y:1},{x:.25,y:1},{x:.25,y:.37},{x:.15,y:.43},{x:0,y:.24}];
 art.parts=[base,artPart('text',{name:'Label',x:25,y:25,width:70,height:65,text:label,fontSize:32})];return art;
}
