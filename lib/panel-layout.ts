import type {Control,Panel} from './studio-model';

export type ControlBounds={x:number;y:number;width:number;height:number};
export const panelSize=(panel:Panel)=>({width:panel.canvasWidth??960,height:panel.canvasHeight??540});
export function clampControlBounds(bounds:ControlBounds,size:{width:number;height:number}):ControlBounds{
 const width=Math.max(24,Math.min(size.width,Math.round(bounds.width)));
 const height=Math.max(24,Math.min(size.height,Math.round(bounds.height)));
 return {width,height,x:Math.max(0,Math.min(size.width-width,Math.round(bounds.x))),y:Math.max(0,Math.min(size.height-height,Math.round(bounds.y)))};
}
export function controlBounds(panel:Panel,control:Control,index:number):ControlBounds{
 const size=panelSize(panel);
 if(control.placement)return clampControlBounds(control.placement,size);
 let row=0,column=0;
 for(const c of panel.controls.slice(0,index)){
  const span=Math.min(c.span,panel.columns);
  if(column+span>panel.columns){row++;column=0;}
  column+=span;
 }
 const span=Math.min(control.span,panel.columns);
 if(column+span>panel.columns){row++;column=0;}
 const cell=(size.width+12)/panel.columns;
 return clampControlBounds({x:column*cell,y:row*112,width:cell*span-12,height:100},size);
}
export function arrangePanel(panel:Panel):Panel{
 // Calculate the old grid's rows before assigning positions, preserving existing free positions.
 let rows=1,column=0;
 for(const c of panel.controls){const span=Math.min(c.span,panel.columns);if(column+span>panel.columns){rows++;column=0;}column+=span;}
 const next={...panel,freeLayout:true,canvasWidth:panelSize(panel).width,canvasHeight:Math.min(10000,Math.max(panelSize(panel).height,rows*112-12))};
 return {...next,controls:next.controls.map((c,i)=>({...c,placement:controlBounds(next,c,i)}))};
}
export function resizePanel(panel:Panel,size:{width:number;height:number}):Panel{
 return {...panel,canvasWidth:size.width,canvasHeight:size.height,controls:panel.controls.map((c,i)=>({...c,placement:clampControlBounds(controlBounds(panel,c,i),size)}))};
}
export function appendPanelControl(panel:Panel,control:Control):Panel{
 if(!panel.freeLayout)return {...panel,controls:[...panel.controls,control]};
 const size=panelSize(panel),width=Math.min(control.placement?.width??220,size.width),height=control.placement?.height??100;
 const occupied=panel.controls.map((c,i)=>controlBounds(panel,c,i));
 let placement:ControlBounds={x:0,y:size.height,width,height};
 outer:for(let y=0;y<=size.height;y+=16)for(let x=0;x+width<=size.width;x+=width+12){
  const candidate={x,y,width,height};
  if(!occupied.some(b=>x<b.x+b.width+8&&x+width+8>b.x&&y<b.y+b.height+8&&y+height+8>b.y)){
   placement=candidate;break outer;
  }
 }
 const nextSize={...size,height:Math.min(10000,Math.max(size.height,placement.y+height))};
 return {...panel,canvasHeight:nextSize.height,controls:[...panel.controls,{...control,placement:clampControlBounds(placement,nextSize)}]};
}
