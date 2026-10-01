import {randomUUID} from 'node:crypto';
import {inflateSync} from 'node:zlib';
import {aePackageSchema} from '../lib/ae-model.ts';
import {layer,sceneSchema} from '../lib/studio-model.ts';

export const AE_LIMITS=Object.freeze({fileBytes:80_000_000,assetBytes:10_000_000,totalAssetBytes:55_000_000,decodedBytes:256_000_000,samples:100_000});
const signature=Buffer.from([137,80,78,71,13,10,26,10]);
const crcTable=Array.from({length:256},(_,i)=>{let c=i;for(let j=0;j<8;j++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function crc32(b){let c=0xffffffff;for(const v of b)c=crcTable[(c^v)&255]^(c>>>8);return(c^0xffffffff)>>>0;}
// Validate and bound compressed pixel data before handing images to Chromium.
// Metadata is removed: this workflow assumes sRGB and does not apply ICC profiles.
export function inspectAePng(input){
 const b=Buffer.from(input);if(b.length<45||b.length>AE_LIMITS.assetBytes||!b.subarray(0,8).equals(signature))throw Error('Use a PNG image no larger than 10 MB.');
 let width,height,channels,ended=false,seenData=false,closedData=false;const chunks=[signature],idat=[];
 for(let offset=8;offset<b.length;){
  if(offset+12>b.length)throw Error('Truncated PNG chunk.');const length=b.readUInt32BE(offset),end=offset+12+length;
  if(end>b.length)throw Error('Truncated PNG chunk.');const type=b.toString('ascii',offset+4,offset+8),data=b.subarray(offset+8,end-4);
  if(crc32(b.subarray(offset+4,end-4))!==b.readUInt32BE(end-4))throw Error('PNG checksum failed.');
  if(offset===8&&type!=='IHDR')throw Error('PNG header is missing.');
  if(type==='IHDR'){
   if(offset!==8||length!==13)throw Error('Invalid PNG header.');width=data.readUInt32BE(0);height=data.readUInt32BE(4);channels=data[9]===6?4:data[9]===2?3:0;
   if(!width||!height||width>20000||height>20000||width*height>33177600||data[8]!==8||!channels||data[10]||data[11]||data[12])throw Error('Use a non-interlaced 8-bit RGB/RGBA PNG, up to 33,177,600 pixels.');chunks.push(b.subarray(offset,end));
  }else if(type==='IDAT'){if(closedData)throw Error('PNG image chunks must be consecutive.');seenData=true;idat.push(data);chunks.push(b.subarray(offset,end));}
  else if(type==='IEND'){if(length||!seenData||end!==b.length)throw Error('Invalid PNG ending.');ended=true;chunks.push(b.subarray(offset,end));}
  else{if(seenData)closedData=true;if(type==='acTL'||type==='tRNS'||type==='PLTE'||type[0]===type[0].toUpperCase())throw Error('Convert this PNG to standard RGB/RGBA before importing.');}
  offset=end;
 }
 if(!ended)throw Error('PNG ending is missing.');const row=width*channels+1,expected=row*height;
 const pixels=inflateSync(Buffer.concat(idat),{maxOutputLength:expected});if(pixels.length!==expected)throw Error('PNG pixel data length is invalid.');
 for(let i=0;i<pixels.length;i+=row)if(pixels[i]>4)throw Error('Invalid PNG row filter.');
 return{bytes:Buffer.concat(chunks),width,height,decodedBytes:width*height*4};
}

// Remove only redundant points. Frame-sampled curves remain editable linear keys;
// hold discontinuities are retained rather than smoothed into ramps.
export function simplifyAeTrack(frames){
 if(frames.every(f=>Math.abs(f.value-frames[0].value)<1e-9))return[];
 const out=[];
 for(const f of frames){out.push(f);while(out.length>=3){const a=out.at(-3),b=out.at(-2),c=out.at(-1);let redundant=false;if(a.ease==='step'&&b.ease==='step')redundant=Math.abs(a.value-b.value)<1e-9;else if(a.ease==='linear'&&b.ease==='linear'){const expected=a.value+(c.value-a.value)*(b.time-a.time)/(c.time-a.time);redundant=Math.abs(expected-b.value)<1e-7;}if(!redundant)break;out.splice(out.length-2,1);}}
 if(out.length>1000)throw Error('An animation track exceeds 1,000 keys after simplification. Export a shorter work area.');return out;
}
export function convertAe(input,fileName='Composition.bcae'){
 if(Buffer.byteLength(input)>AE_LIMITS.fileBytes)throw Error('AE package exceeds 80 MB.');
 let raw;try{raw=JSON.parse(String(input).replace(/^\uFEFF/,''));}catch{throw Error('Choose a .bcae package exported with the BroadcastCG AE script. Direct .aep/.aepx import is not supported.');}
 const parsed=aePackageSchema.safeParse(raw);if(!parsed.success){const issue=parsed.error.issues[0];throw Error('Invalid AE package at '+issue.path.join('.')+': '+issue.message);}
 const p=parsed.data,c=p.composition;
 if(new Set(p.layers.map(l=>l.id)).size!==p.layers.length||new Set(p.assets.map(a=>a.id)).size!==p.assets.length)throw Error('Duplicate layer or asset IDs in AE package.');
 if(p.layers.reduce((n,l)=>n+l.samples.length,0)>AE_LIMITS.samples)throw Error('AE package exceeds 100,000 transform samples. Export a shorter work area.');
 let total=0,decoded=0;const map=new Map(),assets=[];
 for(const a of p.assets){
  if(a.bytes.length%4||/[^A-Za-z0-9+/=]/.test(a.bytes))throw Error('Invalid embedded PNG encoding.');
  const bytes=Buffer.from(a.bytes,'base64');if(bytes.toString('base64')!==a.bytes)throw Error('Invalid embedded PNG encoding.');total+=bytes.length;if(total>AE_LIMITS.totalAssetBytes)throw Error('AE images exceed 55 MB.');
  // Check aggregate decoded allocation before inflation as well as per-image bounds.
  if(bytes.length>=24){decoded+=bytes.readUInt32BE(16)*bytes.readUInt32BE(20)*4;if(decoded>AE_LIMITS.decodedBytes)throw Error('AE decoded images exceed 256 MB.');}
  const image=inspectAePng(bytes),id=randomUUID();map.set(a.id,{id,width:image.width,height:image.height});assets.push({id,name:a.name,bytes:image.bytes});
 }
 const required=new Set(),warnings=[...p.warnings];
 const layers=p.layers.map(source=>{
  if(source.outPoint<=source.inPoint||source.outPoint>c.duration)throw Error('Invalid layer in/out range: '+source.name);
  const samples=source.samples;if(samples[0].time!==0||samples.at(-1).time>c.duration)throw Error('Transform samples must start at zero and stay inside the work area.');
  for(let i=1;i<samples.length;i++)if(samples[i].time<=samples[i-1].time)throw Error('Transform samples must be strictly increasing.');
  if(source.type==='text'&&!source.text||source.type==='image'&&!source.imageId||source.type!=='image'&&!source.color)throw Error('A layer is missing its text, image or color.');
  const image=map.get(source.imageId);if(source.type==='image'&&!image)throw Error('A layer image is missing: '+source.name);
  if(image&&(image.width!==source.width||image.height!==source.height))throw Error('PNG dimensions do not match the layer: '+source.name);
  if(source.type==='image')required.add(source.imageId);
  const left=source.text?.left||0,top=source.text?.top||0;
  const values=samples.map(s=>{const ax=s.anchor[0]-left,ay=s.anchor[1]-top;return{x:s.position[0]-ax,y:s.position[1]-ay,anchorX:ax,anchorY:ay,scaleX:s.scale[0]/100,scaleY:s.scale[1]/100,rotation:s.rotation,opacity:s.opacity/100};});
  const keys={};for(const key of Object.keys(values[0])){const track=samples.map((s,i)=>{const hold=s.hold||[],channel={anchorX:'anchor',anchorY:'anchor',scaleX:'scale',scaleY:'scale'}[key]||key;return{time:s.time,value:values[i][key],ease:(key==='x'||key==='y'?hold.includes('position')&&hold.includes('anchor'):hold.includes(channel))?'step':'linear'};});const reduced=simplifyAeTrack(track);if(reduced.length)keys[key]=reduced;}
  return layer(source.type==='solid'?'rect':source.type,{id:randomUUID(),name:source.name,width:source.width,height:source.height,...values[0],inPoint:source.inPoint,outPoint:source.outPoint,keys,color:source.color||'#ffffff',src:image?'/api/assets/'+image.id:'',...(source.text?{text:source.text.value,sourceFont:source.text.font,fontFamily:source.text.font,fontSize:source.text.fontSize,fontWeight:source.text.fontWeight,align:source.text.align,textOriginX:-left,textBaseline:-top}:{})});
 });
 const references=p.references.map(r=>{const image=map.get(r.imageId);if(!image||image.width!==c.width||image.height!==c.height||r.time>c.duration)throw Error('Reference PNG must match the composition size and time range.');required.add(r.imageId);return{time:r.time,src:'/api/assets/'+image.id};}).sort((a,b)=>a.time-b.time);
 if(map.size!==required.size)throw Error('AE package contains unused images. Export it again.');
 warnings.push({layer:'Animation',message:`2D transforms sampled at ${c.frameRate} fps. Easing and motion are represented by editable sampled keys, not original AE Bezier handles. Expression code is never executed in BroadcastCG.`});
 warnings.push({layer:'Appearance',message:'Browser text metrics and sRGB rendering can differ from After Effects. ICC profiles, motion blur, audio and AE effects are not rendered by this importer.'});
 if(!references.length)warnings.push({layer:'Reference',message:'No AE reference renders were supplied. Attach PNG renders at known work-area times and compare before going on air.'});
 const scene=sceneSchema.parse({id:randomUUID(),name:c.name,width:c.width,height:c.height,duration:c.duration,frameRate:c.frameRate,layers,importReport:{format:'ae',fileName:fileName.slice(0,240),mode:'sampled',referenceSrc:references[0]?.src||'',references,frameRate:c.frameRate,workAreaStart:c.workAreaStart,exporter:[p.exporter.name,p.exporter.version,'AE '+p.exporter.aeVersion].join(' · '),warnings}});
 if(JSON.stringify(scene).length>1_400_000)throw Error('Converted animation is too large for a project. Export a shorter work area or fewer layers.');
 return{scene,assets,fileName:fileName.slice(0,240),warnings};
}
