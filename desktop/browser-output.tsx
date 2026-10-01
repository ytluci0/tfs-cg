import {createRoot} from 'react-dom/client';
import {useEffect,useRef,useState} from 'react';
import {Graphic} from '../app/studio/canvas';
import {Program,safeImage,textValue} from '../lib/studio-model';
import {frameMeter} from './frame-meter.mjs';
import './browser-output.css';

type Format={width:number;height:number;fps:number;background:string};
type Snapshot={type:string;epoch:string;sequence:number;serverTime:number;program:Program|null;config:Format};
const base=location.pathname.replace(/output\.html$/,'');
const imagesFor=(p:Program|null)=>Object.fromEntries((JSON.stringify(p).match(/\/api\/assets\/[a-zA-Z0-9-]+/g)||[]).map(path=>[path,base+'media/'+path.split('/').pop()]));
async function prepare(p:Program|null,images:Record<string,string>){
 if(!p?.scene||p.mode==='hide')return;
 const urls=[...new Set(p.scene.layers.filter(l=>l.type==='image'&&l.visible).map(l=>textValue(l.src,p.variables)).filter(safeImage))];
 let timer:ReturnType<typeof setTimeout>;
 try{await Promise.race([Promise.all([
  ...urls.map(src=>{const image=new Image();image.src=images[src]||src;return image.decode();}),
  ...p.scene.layers.filter(l=>l.type==='text'&&l.visible).map(l=>document.fonts.load(`${l.fontWeight} ${l.fontSize}px ${JSON.stringify(l.fontFamily)}`,textValue(l.text,p.variables)||'A')),
 ]),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Image/font preparation timed out')),1800);})]);}finally{clearTimeout(timer!);}
}
function Receiver(){
 const [view,setView]=useState<{program:Program|null;images:Record<string,string>;epoch:string;origin:number;start:number;ack:boolean}|null>(null),[format,setFormat]=useState<Format>({width:1920,height:1080,fps:50,background:'transparent'}),[now,setNow]=useState(performance.now());
 const connection=useRef<WebSocket|null>(null),epoch=useRef(''),meter=useRef(frameMeter(format.fps,performance.now()));
 const send=(value:object)=>{if(connection.current?.readyState===WebSocket.OPEN)connection.current.send(JSON.stringify({...value,epoch:epoch.current,width:innerWidth,height:innerHeight}));};
 useEffect(()=>{let stopped=false,attempt=0,retry:ReturnType<typeof setTimeout>,generation=0,lastRevision='',lastStart=0,timeline=0,lastSequence=-1;
  function connect(){
   const ws=new WebSocket(location.origin.replace('http:','ws:')+base+'events');connection.current=ws;
   ws.onmessage=async event=>{if(stopped||connection.current!==ws)return;let m:Snapshot;try{m=JSON.parse(event.data);}catch{return;}
    if(m.type==='heartbeat'){send({type:'telemetry',value:meter.current.snapshot(performance.now())});return;}
    if(m.type!=='snapshot')return;
    if(epoch.current!==m.epoch){epoch.current=m.epoch;lastSequence=-1;lastRevision='';lastStart=0;setView(null);}
    if(m.sequence<lastSequence)return;lastSequence=m.sequence;attempt=0;
    setFormat(m.config);document.documentElement.style.background=m.config.background;
    const current=++generation,images=imagesFor(m.program),changed=m.program?.revision!==lastRevision;
    try{if(changed)await prepare(m.program,images);}catch{if(current===generation)send({type:'failed',revision:m.program?.revision});return;}
    if(stopped||current!==generation||connection.current!==ws)return;
    if(m.program?.startedAt!==lastStart){lastStart=m.program?.startedAt||0;timeline=performance.now()-Math.max(0,m.serverTime-lastStart);}
    lastRevision=m.program?.revision||'';
    setView({program:m.program,images,epoch:m.epoch,origin:timeline,start:performance.now(),ack:changed});send({type:'ready'});
   };
   ws.onerror=()=>{};ws.onclose=()=>{if(stopped||connection.current!==ws)return;retry=setTimeout(connect,Math.min(10000,500*2**Math.min(attempt++,5)));};
  }
  connect();return()=>{stopped=true;generation++;clearTimeout(retry);connection.current?.close();connection.current=null;};
 },[]);
 useEffect(()=>{meter.current=frameMeter(format.fps,performance.now());let frame:number;const tick=(time:number)=>{if(meter.current.tick(time))setNow(time);frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);},[format.fps]);
 useEffect(()=>{if(!view?.program||!view.ack)return;let second=0;const first=requestAnimationFrame(()=>{second=requestAnimationFrame(()=>send({type:'rendered',revision:view.program!.revision}));});return()=>{cancelAnimationFrame(first);cancelAnimationFrame(second);};},[view?.program?.revision,view?.epoch]);
 const p=view?.program,elapsed=view?Math.max(0,(now-view.origin)/1000):0;
 return <main style={{width:'100vw',height:'100vh',background:format.background}} data-revision={p?.revision||''} data-epoch={view?.epoch||''}>
  {p?.scene&&!(p.mode==='hide'&&elapsed>=.5)&&<div className="broadcast-picture" style={{opacity:p.mode==='hide'?Math.max(0,1-elapsed/.5):1}}><Graphic scene={p.scene} variables={p.variables} time={p.mode==='hide'?p.scene.duration:Math.min(elapsed,p.scene.duration)} images={view?.images} id="broadcast"/></div>}
 </main>;
}
createRoot(document.getElementById('root')!).render(<Receiver/>);

