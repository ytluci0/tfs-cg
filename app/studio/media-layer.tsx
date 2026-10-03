'use client';
import {useEffect,useRef,useState} from 'react';
import type {Layer} from '@/lib/studio-model';
import {videoPosition} from '@/lib/video-tools';
export function VideoLayer({layer:l,src,elapsed}:{layer:Layer;src:string;elapsed:number}){
 const ref=useRef<HTMLVideoElement>(null),last=useRef({elapsed:-1,wall:0}),[failed,setFailed]=useState(false),[ready,setReady]=useState(false);
 useEffect(()=>{setFailed(false);setReady(false);last.current={elapsed:-1,wall:0};},[src]);
 useEffect(()=>{const video=ref.current;if(!video||!ready)return;const speed=l.media?.speed??1,position=videoPosition(video.duration,l.media?.start??0,elapsed,speed,l.media?.loop!==false),now=performance.now(),moving=elapsed>last.current.elapsed&&now-last.current.wall<300;
  if(!position){video.pause();setFailed(true);return;}setFailed(false);
  video.playbackRate=speed;if(Number.isFinite(position.target)&&Math.abs(video.currentTime-position.target)>.18)video.currentTime=position.target;
  if(moving&&!position.ended){void video.play().catch(error=>{if(error?.name!=='AbortError')setFailed(true);});}else video.pause();last.current={elapsed,wall:now};
  const timer=setTimeout(()=>video.pause(),180);return()=>clearTimeout(timer);
 },[elapsed,ready,l.media?.loop,l.media?.speed,l.media?.start]);
 return <foreignObject width={l.width} height={l.height}><div data-media-error={failed?'true':undefined} style={{width:'100%',height:'100%',background:'transparent'}}>{failed&&<span style={{color:'#ff8080'}}>Video unavailable · check its source and start offset</span>}<video key={src} ref={ref} src={src} muted playsInline preload="auto" onLoadedData={()=>setReady(true)} onError={()=>setFailed(true)} style={{width:'100%',height:'100%',visibility:failed?'hidden':'visible',objectFit:l.visual?.imageFit==='stretch'?'fill':l.visual?.imageFit==='contain'?'contain':'cover'}}/></div></foreignObject>;
}
