export async function renderedMediaReady(root:ParentNode=document,timeout=2200){
 if(root.querySelector('[data-media-error="true"]'))throw Error('A video cannot be decoded or its start time is invalid.');
 await Promise.all(Array.from(root.querySelectorAll('video')).map(video=>new Promise<void>((resolve,reject)=>{
  if(video.error){reject(Error('A video cannot be decoded.'));return;}if(video.readyState>=2&&!video.seeking){resolve();return;}
  const finish=(error?:Error)=>{clearTimeout(timer);video.removeEventListener('loadeddata',ready);video.removeEventListener('seeked',ready);video.removeEventListener('error',failed);error?reject(error):resolve();};
  const ready=()=>{if(video.readyState>=2&&!video.seeking)finish();},failed=()=>finish(Error('A video cannot be decoded.')),timer=setTimeout(()=>finish(Error('Video preparation timed out.')),timeout);
  video.addEventListener('loadeddata',ready);video.addEventListener('seeked',ready);video.addEventListener('error',failed);
 })));
}
