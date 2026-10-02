import {renderToStaticMarkup} from 'react-dom/server';
import {Graphic} from '../app/studio/canvas';
import type {ProjectPreview} from '../lib/project-library';

async function rasterize(url:string){
  const image=new Image();image.src=url;await image.decode();
  const canvas=document.createElement('canvas'),scale=Math.min(1,480/image.naturalWidth,480/image.naturalHeight);
  canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
  const ctx=canvas.getContext('2d')!;ctx.drawImage(image,0,0,canvas.width,canvas.height);
  let png=canvas.toDataURL('image/png');
  // Detailed uploaded images can exceed the cache budget even at 480 px.
  if(png.length>480000){canvas.width=Math.max(1,Math.round(canvas.width/2));canvas.height=Math.max(1,Math.round(canvas.height/2));ctx.drawImage(image,0,0,canvas.width,canvas.height);png=canvas.toDataURL('image/png');}
  return png;
}
export async function imageThumbnail(file:File){
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>10000000)throw Error('Choose a PNG, JPEG or WebP image up to 10 MB.');
  const url=URL.createObjectURL(file);try{return await rasterize(url);}finally{URL.revokeObjectURL(url);}
}
export async function sceneThumbnail(preview:ProjectPreview){
  // Use the shared renderer at a fixed time. Previews do not start media or data feeds.
  const scene={...preview.scene,layers:preview.scene.layers.filter(l=>l.type!=='video')};
  const markup=renderToStaticMarkup(<Graphic scene={scene} time={preview.time} variables={preview.variables} id="library-cover"/>);
  const doc=new DOMParser().parseFromString(markup,'image/svg+xml'),svg=doc.documentElement;
  svg.setAttribute('width',String(scene.width));svg.setAttribute('height',String(scene.height));
  for(const image of Array.from(svg.querySelectorAll('image'))){
    const src=image.getAttribute('href')||'';
    // The library remains offline; remote images can be imported or a custom cover chosen.
    if(!/^\/api\/assets\/[a-zA-Z0-9-]+$/.test(src)){image.remove();continue;}
    const response=await fetch(src);if(!response.ok)throw Error('A cover image could not be loaded.');
    const blob=await response.blob();
    image.setAttribute('href',await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error('Could not read cover image.'));reader.readAsDataURL(blob);}));
  }
  const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml'}));
  try{return await rasterize(url);}finally{URL.revokeObjectURL(url);}
}
