/** Samples the shared SVG artwork without selection bounds or guides. No screen capture. */
export async function sampleCanvasColor(source:SVGSVGElement,x:number,y:number,width:number,height:number){
 if(x<0||y<0||x>=width||y>=height)throw Error('Pick a color inside the canvas.');
 if(source.querySelector('video'))throw Error('Color sampling is available for shapes, text and still images. Hide video layers to sample this canvas.');
 const svg=source.cloneNode(true) as SVGSVGElement;
 svg.setAttribute('width',String(width));svg.setAttribute('height',String(height));
 svg.querySelectorAll('rect[fill="transparent"],rect[stroke-dasharray][pointer-events="none"]').forEach(e=>e.remove());
 for(const image of svg.querySelectorAll('image')){
  const src=image.getAttribute('href');if(!src||src.startsWith('data:'))continue;
  const response=await fetch(src,{signal:AbortSignal.timeout(8000)});if(!response.ok)throw Error('This image could not be sampled. Import a local copy first.');
  const blob=await response.blob();const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(blob);});image.setAttribute('href',data);
 }
 const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml'}));
 try{
  const img=new Image();img.src=url;await img.decode();const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
  const ctx=canvas.getContext('2d')!;ctx.drawImage(img,-Math.floor(x),-Math.floor(y));const rgba=ctx.getImageData(0,0,1,1).data;
  if(rgba[3]===0)throw Error('This point is transparent. Pick a visible color.');
  return '#'+[...rgba.slice(0,3)].map(v=>v.toString(16).padStart(2,'0')).join('');
 }finally{URL.revokeObjectURL(url);}
}
