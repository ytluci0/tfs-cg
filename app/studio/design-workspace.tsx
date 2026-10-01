'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {desktopBridge} from '@/lib/desktop';
import {GripHorizontal,X} from 'lucide-react';
import './design-workspace.css';
type PanelId='scenes'|'layers'|'properties';
type Placement={dock:'left'|'right'|'float';hidden:boolean;x:number;y:number;width:number;height:number};
export type DesignLayout={left:number;right:number;panels:Record<PanelId,Placement>};
const ids:PanelId[]=['scenes','layers','properties'];
const names={scenes:'Scenes',layers:'Layers',properties:'Properties'};
const defaults=():DesignLayout=>({left:230,right:290,panels:{scenes:{dock:'left',hidden:false,x:30,y:40,width:240,height:230},layers:{dock:'left',hidden:false,x:70,y:100,width:270,height:360},properties:{dock:'right',hidden:false,x:500,y:50,width:300,height:550}}});
export default function DesignWorkspace({projectId,panels,children}:{projectId:string;panels:Record<PanelId,ReactNode>;children:ReactNode}){
 const [layout,setLayout]=useState(defaults),[ready,setReady]=useState(''),[size,setSize]=useState({width:1200,height:650}),[dragging,setDragging]=useState<PanelId|null>(null);
 const root=useRef<HTMLDivElement>(null),gesture=useRef<{kind:'move'|'resize'|'left'|'right'|'height';id?:PanelId;x:number;y:number;start:DesignLayout;left:number;top:number}|null>(null);
 useEffect(()=>{let active=true;setReady('');setLayout(defaults());const bridge=desktopBridge();if(!bridge){setReady(projectId);return;}bridge.editorState<DesignLayout>('design',projectId).then(v=>{if(active){if(v)setLayout(v);setReady(projectId);}}).catch(()=>active&&setReady(projectId));return()=>{active=false;};},[projectId]);
 useEffect(()=>{if(ready!==projectId||dragging)return;const timer=setTimeout(()=>desktopBridge()?.editorState('design',projectId,layout).catch(()=>{}),350);return()=>clearTimeout(timer);},[projectId,ready,layout,dragging]);
 useEffect(()=>{if(!root.current)return;const observer=new ResizeObserver(([e])=>setSize({width:e.contentRect.width,height:e.contentRect.height}));observer.observe(root.current);return()=>observer.disconnect();},[]);
 const patch=(id:PanelId,v:Partial<Placement>)=>setLayout(l=>({...l,panels:{...l.panels,[id]:{...l.panels[id],...v}}}));
 function begin(e:React.PointerEvent,kind:NonNullable<typeof gesture.current>['kind'],id?:PanelId){if(e.button!==0)return;const r=root.current!.getBoundingClientRect();e.preventDefault();root.current!.setPointerCapture(e.pointerId);gesture.current={kind,id,x:e.clientX,y:e.clientY,start:structuredClone(layout),left:r.left,top:r.top};if(kind==='move')setDragging(id!);}
 function move(e:React.PointerEvent){const g=gesture.current;if(!g)return;const dx=e.clientX-g.x,dy=e.clientY-g.y,p=g.id?g.start.panels[g.id]:null;
  if(g.kind==='left'||g.kind==='right'){setLayout({...g.start,[g.kind]:Math.max(180,Math.min(Math.min(480,size.width*.35),g.start[g.kind]+dx*(g.kind==='left'?1:-1)))});return;}
  if(!p||!g.id)return;
  if(g.kind==='move'&&Math.abs(dx)+Math.abs(dy)>4)patch(g.id,{dock:'float',x:Math.max(0,Math.min(size.width-180,e.clientX-g.left-90)),y:Math.max(28,Math.min(size.height-40,e.clientY-g.top-14))});
  if(g.kind==='resize')patch(g.id,{width:Math.max(180,Math.min(650,size.width-p.x,p.width+dx)),height:Math.max(100,Math.min(size.height-p.y,p.height+dy))});
  if(g.kind==='height')patch(g.id,{height:Math.max(100,Math.min(size.height-100,p.height+dy))});
 }
 function end(e:React.PointerEvent){const g=gesture.current;if(g?.kind==='move'&&g.id&&Math.abs(e.clientX-g.x)+Math.abs(e.clientY-g.y)>4){const x=e.clientX-g.left;if(x<90)patch(g.id,{dock:'left'});else if(x>size.width-90)patch(g.id,{dock:'right'});}gesture.current=null;setDragging(null);}
 const left=ids.filter(id=>!layout.panels[id].hidden&&layout.panels[id].dock==='left'),right=ids.filter(id=>!layout.panels[id].hidden&&layout.panels[id].dock==='right');
 const panel=(id:PanelId,last=false)=>{const p=layout.panels[id],floating=p.dock==='float',width=Math.min(p.width,Math.max(180,size.width)),height=Math.min(p.height,Math.max(100,size.height-28));return <section key={id} data-design-panel={id} data-dock={p.dock} className={'design-panel '+(floating?'floating':'docked')} style={floating?{width,height,left:Math.max(0,Math.min(p.x,size.width-width)),top:Math.max(28,Math.min(p.y,size.height-height)),zIndex:dragging===id?25:20}:{flex:last?'1 1 100px':`0 1 ${p.height}px`}}>
  <header className="design-panel-header" onPointerDown={e=>{if((e.target as HTMLElement).closest('button,select'))return;begin(e,'move',id);}}><GripHorizontal size={13}/><strong>{names[id]}</strong><select aria-label={names[id]+' panel position'} value={p.dock} onChange={e=>patch(id,{dock:e.target.value as Placement['dock']})}><option value="left">Left</option><option value="right">Right</option><option value="float">Float</option></select><button aria-label={'Hide '+names[id]+' panel'} onClick={()=>patch(id,{hidden:true})}><X size={12}/></button></header>
  <div className={'design-panel-content '+(id==='properties'?'inspector':id==='scenes'?'scene-library':'design-layer-list')}>{panels[id]}</div>
  <div role="separator" aria-label={'Resize '+names[id]+' panel'} className={floating?'design-float-resize':'design-panel-resize'} onPointerDown={e=>begin(e,floating?'resize':'height',id)}/>
 </section>;};
 return <div ref={root} className="editor-layout design-workspace" onPointerMove={move} onPointerUp={end} onPointerCancel={()=>{if(gesture.current)setLayout(gesture.current.start);gesture.current=null;setDragging(null);}}>
  <div className="design-layout-bar"><span>WORKSPACE</span>{ids.map(id=><button key={id} aria-pressed={!layout.panels[id].hidden} onClick={()=>patch(id,{hidden:!layout.panels[id].hidden})}>{names[id]}</button>)}<button onClick={()=>setLayout(defaults())}>Reset layout</button><small>Drag a panel header to float · drop at an edge to dock</small></div>
  {!!left.length&&<div className="design-dock left" style={{width:Math.min(layout.left,size.width*.32)}}>{left.map((id,i)=>panel(id,i===left.length-1))}<div role="separator" aria-label="Resize left dock" className="design-dock-resize" onPointerDown={e=>begin(e,'left')}/></div>}
  <div className="design-center">{children}</div>
  {!!right.length&&<div className="design-dock right" style={{width:Math.min(layout.right,size.width*.35)}}>{right.map((id,i)=>panel(id,i===right.length-1))}<div role="separator" aria-label="Resize right dock" className="design-dock-resize" onPointerDown={e=>begin(e,'right')}/></div>}
  {ids.filter(id=>!layout.panels[id].hidden&&layout.panels[id].dock==='float').map(id=>panel(id))}
  {dragging&&<><div className="design-dock-target left">Dock left</div><div className="design-dock-target right">Dock right</div></>}
 </div>;
}
