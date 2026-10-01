import {readPsd,getLayerImageData,getCompositeImageData,initializeCanvas} from 'ag-psd';
import {encode} from 'fast-png';
import {randomUUID} from 'node:crypto';
import {layer} from '../lib/studio-model.ts';
import {PSD_LIMITS,PSD_FILE_LIMIT_LABEL,PSD_DECODED_LIMIT_LABEL} from '../lib/psd-limits.ts';

export {PSD_LIMITS};
initializeCanvas(()=>{throw Error('Canvas decoding is disabled.');},(width,height)=>({width,height,data:new Uint8ClampedArray(width*height*4)}));
const clamp=n=>Math.max(0,Math.min(1,n??1));
const color=c=>c&&['r','g','b'].every(k=>Number.isFinite(c[k]))?'#'+['r','g','b'].map(k=>Math.round(Math.max(0,Math.min(255,c[k]))).toString(16).padStart(2,'0')).join(''):null;

// Validate the header before the parser, and every declared bitmap before decoding it.
export function inspectPsdHeader(input,fileBytes=input.byteLength){
 const b=Buffer.from(input.buffer,input.byteOffset,input.byteLength);
 if(b.length<26||b.toString('ascii',0,4)!=='8BPS')throw Error('Choose a valid Photoshop PSD file.');
 if(fileBytes>PSD_LIMITS.fileBytes)throw Error(`PSD exceeds ${PSD_FILE_LIMIT_LABEL}. Save a smaller copy in Photoshop.`);
 if(b.readUInt16BE(4)!==1)throw Error('PSB is not supported. Save a standard PSD from Photoshop.');
 if(b.readUInt16BE(22)!==8||b.readUInt16BE(24)!==3)throw Error('Use an 8-bit RGB PSD. Convert the document in Photoshop first.');
 const height=b.readUInt32BE(14),width=b.readUInt32BE(18);
 if(width<100||height<100||width>7680||height>4320||width*height>PSD_LIMITS.pixels)throw Error('PSD canvas must be 100–7680 × 100–4320 pixels.');
 return{width,height};
}

function editableText(source,base){
 const t=source.text,s=t?.style||{},m=t?.transform||[1,0,0,1,0,0],text=t?.text?.replace(/\r/g,'\n').replace(/\n$/,'');
 if(!t||!text||text.length>20000||text.includes('\n')||t.shapeType==='box'||t.orientation==='vertical'||t.textPath?.bezierCurve||(t.textPath?.data?.textRange||[]).some(n=>n>=0)||t.warp?.style&&t.warp.style!=='none')return null;
 if(m.length!==6||!m.every(Number.isFinite)||m[0]<=0||Math.abs(m[1])+Math.abs(m[2])>.0001||Math.abs(m[0]-m[3])>.0001)return null;
 if(/italic|oblique/i.test(s.font?.name||'')||s.fauxItalic||s.underline||s.strikethrough||s.strokeFlag||s.fillFlag===false||s.tracking||s.kerning||s.baselineShift||s.fontCaps||s.fontBaseline||(s.horizontalScale??1)!==1||(s.verticalScale??1)!==1)return null;
 if((t.styleRuns||[]).some(r=>Object.entries(r.style).some(([k,v])=>JSON.stringify(v)!==JSON.stringify(s[k]))))return null;
 if((t.paragraphStyleRuns||[]).some(r=>Object.entries(r.style).some(([k,v])=>JSON.stringify(v)!==JSON.stringify(t.paragraphStyle?.[k]))))return null;
 const fill=color(s.fillColor),fontSize=s.fontSize*m[0],align=t.paragraphStyle?.justification||'left';
 if(!fill||!s.font?.name||s.font.name==='AdobeInvisFont'||!Number.isFinite(fontSize)||fontSize<1||fontSize>2000||!['left','center','right'].includes(align))return null;
 const width=Math.max(base.width,fontSize),x=m[4]-(align==='center'?width/2:align==='right'?width:0);
 return layer('text',{...base,text,color:fill,fontSize,fontFamily:s.font.name.slice(0,100),sourceFont:s.font.name.slice(0,100),fontWeight:s.fauxBold||/bold/i.test(s.font.name)?700:400,align,x,y:m[5]-fontSize*.85,width,height:Math.max(base.height,fontSize*1.2)});
}

export function convertPsd(input,fileName='Imported PSD.psd'){
 const size=inspectPsdHeader(input);
 const psd=readPsd(input,{useRawData:true,useImageData:true,skipThumbnail:true,skipLinkedFilesData:true,totalMemoryLimit:PSD_LIMITS.decodedBytes});
 let count=0,decoded=size.width*size.height*4;
 function bound(node,depth){
  if(++count>PSD_LIMITS.layers||depth>PSD_LIMITS.depth)throw Error('PSD exceeds 250 layers/groups or 20 nested groups.');
  for(const b of [node,node.mask,node.realMask].filter(Boolean)){
   const w=(b.right??0)-(b.left??0),h=(b.bottom??0)-(b.top??0);
   if(![w,h,b.left??0,b.top??0].every(Number.isFinite)||w<0||h<0||w>20000||h>20000||w*h>PSD_LIMITS.pixels)throw Error('A PSD layer or mask exceeds the bitmap limits.');
   decoded+=w*h*4;
  }
  if(decoded>PSD_LIMITS.decodedBytes)throw Error(`PSD decompressed image data exceeds ${PSD_DECODED_LIMIT_LABEL}. Reduce the dimensions or layers in a copy of the PSD.`);
  node.children?.forEach(n=>bound(n,depth+1));
 }
 psd.children?.forEach(n=>bound(n,0));
 const assets=[],warnings=[],groups=[],layers=[],rasterLayers=[];let total=0;
 const warn=(name,message)=>warnings.push({layer:String(name||'Document').slice(0,200),message});
 function asset(bitmap,name){
  if(!bitmap)return '';
  const bytes=Buffer.from(encode({width:bitmap.width,height:bitmap.height,data:bitmap.data,channels:4,depth:8}));total+=bytes.length;
  if(bytes.length>PSD_LIMITS.assetBytes||total>PSD_LIMITS.totalAssetBytes)throw Error('Extracted PNG images exceed 10 MB each or 55 MB total. Reduce the PSD dimensions or layers.');
  const id='psd-'+randomUUID();assets.push({id,name:String(name).slice(0,240)+'.png',mime:'image/png',bytes});return '/api/assets/'+id;
 }
 warn('', 'The comparison uses the composite saved inside the PSD. Save with Maximize Compatibility in Photoshop. Browser text rendering and color profiles can differ; inspect the result before TAKE.');
 if(psd.imageResources?.iccProfile)warn('','Embedded color profiles are not converted. For closest browser colors, convert the PSD to sRGB in Photoshop first.');
 if(psd.artboards)warn('','Artboards are imported on the full document canvas, not as separate scenes.');
 function visit(node,groupId){
  const name=String(node.name||'Unnamed layer').slice(0,200),id=randomUUID();
  const features=[];
  if(node.blendMode&&!['normal','pass through'].includes(node.blendMode))features.push(node.blendMode+' blending');
  if(node.clipping)features.push('clipping mask');
  if(node.mask&&!node.mask.disabled||node.realMask&&!node.realMask.disabled)features.push('layer mask');
  if(node.vectorMask&&!node.vectorMask.disable)features.push('vector mask');
  if(node.effects&&!node.effects.disabled)features.push('layer effects');
  if(node.adjustment)features.push('adjustment layer');
  const ranges=node.blendingRanges,nonDefault=range=>range&&JSON.stringify(range)!=='[0,0,255,255]';
  if(node.blendOptions||ranges&&(nonDefault(ranges.compositeGrayBlendSource)||nonDefault(ranges.compositeGraphBlendDestinationRange)||ranges.ranges?.some(r=>nonDefault(r.sourceRange)||nonDefault(r.destRange))))features.push('advanced blending');
  if(features.length)warn(name,features.join(', ')+' cannot be reproduced by editable layers. Use the saved composite for the saved appearance.');
  if(node.children){
   groups.push({id,name,parentId:groupId,opacity:clamp(node.opacity),visible:!node.hidden});
   if(node.blendMode==='pass through')warn(name,'Pass-through groups are imported as isolated normal groups; overlapping blends may differ.');
   node.children.forEach(n=>visit(n,id));return;
  }
  const base={id,name,groupId,x:node.left||0,y:node.top||0,width:Math.max(1,(node.right||0)-(node.left||0)),height:Math.max(1,(node.bottom||0)-(node.top||0)),opacity:clamp(node.opacity)*clamp(node.fillOpacity),visible:!node.hidden,locked:!!node.protected?.position};
  let bitmap;try{bitmap=getLayerImageData(node);}catch{warn(name,'The saved layer bitmap could not be decoded.');}
  const src=asset(bitmap,name),raster=src?layer('image',{...base,src}):null;
  const text=!features.length?editableText(node,base):null;
  if(node.text&&!text)warn(name,'Complex text is kept as its saved bitmap when available. Its wording and typography are not editable.');
  if(text)warn(name,'Editable text uses browser font metrics. Check its position and line width against the saved image.');
  if(node.placedLayer)warn(name,'Smart object imported as its saved bitmap. Embedded/linked source files are not opened.');
  if(node.vectorFill||node.vectorStroke)warn(name,'Vector artwork imported as its saved bitmap; paths and strokes are not editable.');
  if(text||raster)layers.push(text||raster);else warn(name,'No supported text or saved pixels were available; this layer was omitted.');
  if(raster)rasterLayers.push(raster);else if(text){rasterLayers.push(text);warn(name,'No saved text bitmap is available; this layer remains text in the saved-layer-pixels option.');}
 }
 psd.children?.forEach(n=>visit(n,undefined));
 let referenceSrc='';try{referenceSrc=asset(getCompositeImageData(psd),'Photoshop saved composite');}catch(e){if(/exceed/.test(e.message))throw e;warn('','The saved composite could not be decoded.');}
 if(!referenceSrc)warn('','No saved composite is available. Save with Maximize Compatibility in Photoshop for a reference image.');
 const scene={id:randomUUID(),name:fileName.replace(/\.psd$/i,'').slice(0,180)||'Imported PSD',...size,duration:5,layers,groups};
 return{scene,rasterScene:{...scene,layers:rasterLayers},assets,referenceSrc,fileName:fileName.slice(0,240),warnings};
}
