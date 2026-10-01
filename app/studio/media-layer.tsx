'use client';
import {useEffect,useRef,useState} from 'react';
import type {Layer} from '@/lib/studio-model';
export function VideoLayer({layer:l,src,elapsed}:{layer:Layer;src:string;elapsed:number}){
 const ref=useRef<HTMLVideoElement>(null),last=useRef({elapsed:-1,wall:0}),[failed,setFailed]=useState(false),[ready,setReady]=useState(false);
 useEffect(()=>{setFailed(false);setReady(false);},[src]);
 useEffect(()=>{const video=ref.current;if(!video||!ready)return;const speed=l.media?.speed??1,start=l.media?.start??0,length=Math.max(.001,video.duration-start),raw=Math.max(0,elapsed)*speed,target=start+(l.media?.loop!==false?raw%length:Math.min(length-.001,raw)),now=performance.now(),moving=elapsed>last.current.elapsed&&now-last.current.wall<300;
  video.playbackRate=speed;if(Number.isFinite(target)&&Math.abs(video.currentTime-target)>.18)video.currentTime=Math.min(video.duration-.001,target);
  if(moving&&(l.media?.loop!==false||raw<length)){void video.play().catch(()=>setFailed(true));}else video.pause();last.current={elapsed,wall:now};
  const timer=setTimeout(()=>video.pause(),180);return()=>clearTimeout(timer);
 },[elapsed,ready,l.media?.loop,l.media?.speed,l.media?.start]);
 return <foreignObject width={l.width} height={l.height}><div data-media-error={failed?'true':undefined} style={{width:'100%',height:'100%',background:'transparent'}}>{failed&&<span style={{color:'#ff8080'}}>Video unavailable</span>}<video ref={ref} src={src} muted playsInline preload="auto" onLoadedData={()=>{const v=ref.current;if(v&&Number.isFinite(v.duration)&&v.duration<=(l.media?.start||0))setFailed(true);else setReady(true);}} onError={()=>setFailed(true)} style={{width:'100%',height:'100%',visibility:failed?'hidden':'visible',objectFit:l.visual?.imageFit==='contain'?'contain':'cover'}}/></div></foreignObject>;
}
