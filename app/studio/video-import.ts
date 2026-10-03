import {validateVideoFile} from '@/lib/video-tools';
export type VideoInfo={width:number;height:number;duration?:number};
export function probeVideo(src:string):Promise<VideoInfo>{
 return new Promise((resolve,reject)=>{
  const video=document.createElement('video');video.muted=true;video.preload='auto';
  let settled=false;const timer=setTimeout(()=>finish(Error('The video did not load. Try an MP4 with H.264 video or a VP8/VP9 WebM.')),15000);
  function finish(error?:Error){if(settled)return;settled=true;clearTimeout(timer);const info={width:video.videoWidth,height:video.videoHeight,duration:Number.isFinite(video.duration)?video.duration:undefined};video.onloadeddata=null;video.onerror=null;video.pause();video.removeAttribute('src');video.load();if(error)reject(error);else resolve(info);}
  video.onloadeddata=()=>video.videoWidth>0&&video.videoHeight>0?finish():finish(Error('This file does not contain a supported video track.'));
  video.onerror=()=>finish(Error('This video cannot be decoded. Try an MP4 with H.264 video or a VP8/VP9 WebM.'));
  video.src=src;video.load();
 });
}
export async function inspectVideoFile(file:File){
 validateVideoFile(file);const url=URL.createObjectURL(file);
 try{return await probeVideo(url);}finally{URL.revokeObjectURL(url);}
}
