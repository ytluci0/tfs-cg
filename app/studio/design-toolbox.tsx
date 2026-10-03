'use client';
import './design-toolbox.css';
import {useEffect,useRef} from 'react';
import {MousePointer2,Hand,Type,Square,RectangleHorizontal,Circle,Minus,PenTool,Paintbrush,Scan,ZoomIn,Lasso,SquareDashed,CircleDashed,Triangle,Star,MoveUpRight,Hexagon,Eraser,PaintBucket,Pipette,Blend,Route,MousePointer,ArrowDownUp,Undo2} from 'lucide-react';
export const toolGroups=[
 {name:'Select',items:[['select','Select (V)',MousePointer2],['marquee','Rectangle selection (M)',SquareDashed],['lasso','Lasso selection (L)',Lasso],['ellipse-select','Ellipse selection (Shift+M)',CircleDashed]]},
 {name:'Draw',items:[['text','Draw text (T)',Type],['pen','Pen path (P)',PenTool],['nodes','Edit path points (A)',MousePointer],['motion','Edit motion route',Route]]},
 {name:'Shapes',items:[['rect','Draw rectangle (U)',Square],['rounded-rect','Rounded rectangle',RectangleHorizontal],['ellipse','Draw ellipse (O)',Circle],['triangle','Triangle',Triangle],['star','Star',Star],['regular-polygon','Regular polygon',Hexagon],['line','Draw line',Minus],['arrow','Draw arrow',MoveUpRight],['polygon','Polygon path',PenTool]]},
 {name:'Paint',items:[['brush','Brush (B)',Paintbrush],['mask-hide','Eraser mask (E)',Eraser],['mask-reveal','Restore mask (Shift+E)',Undo2],['mask-rectangle','Crop layer mask (C)',Scan],['mask-ellipse','Ellipse mask',CircleDashed]]},
 {name:'Color',items:[['gradient','Gradient (G)',Blend],['fill','Fill layer (K)',PaintBucket],['eyedropper','Eyedropper (I)',Pipette]]},
 {name:'View',items:[['hand','Hand (H / Space)',Hand],['zoom','Zoom (Z)',ZoomIn]]},
] as const;
export type DesignTool=typeof toolGroups[number]['items'][number][0];
export const toolboxItems=toolGroups.flatMap(g=>[...g.items]);
export const toolHint=(tool:DesignTool)=>({
 select:'Drag to move · Handles resize · Shift selects more layers',marquee:'Drag to select layer bounds · Shift adds · Alt subtracts',
 'ellipse-select':'Drag to select layer bounds · Shift adds · Alt subtracts',lasso:'Draw around layer bounds · Shift adds · Alt subtracts',
 brush:'Paint an editable vector stroke · [ / ] changes size', 'mask-hide':'Erase on the selected layer’s mask · Source stays intact',
 'mask-reveal':'Restore painted mask areas · Source stays intact','mask-rectangle':'Drag a crop on the selected layer · Edit or remove it in Masks',
 'mask-ellipse':'Drag an ellipse on the selected layer’s mask',gradient:'Drag on the selected shape or text to set gradient direction',
 fill:'Click a shape or text layer to fill it with the foreground color',eyedropper:'Click artwork to sample its rendered color into the foreground swatch',
 pen:'Click points · Drag for curve handles · Enter finishes · Esc cancels',polygon:'Click points · Enter finishes · Esc cancels',
 zoom:'Click to zoom in · Alt-click to zoom out',hand:'Drag to pan · Double-click to fit',nodes:'Select a path, then drag its points or handles',
 motion:'Select a layer with a motion path to edit its route',
 } as Partial<Record<DesignTool,string>>)[tool]||'Drag to draw · Shift constrains proportions · Esc cancels';
export default function DesignToolbox({tool,setTool,color,setColor,background,setBackground,expanded,setExpanded}:{tool:DesignTool;setTool:(tool:DesignTool)=>void;color:string;setColor:(color:string)=>void;background:string;setBackground:(color:string)=>void;expanded:boolean;setExpanded:(v:boolean)=>void}){
 const groups=useRef<HTMLDivElement>(null);
 useEffect(()=>{const root=groups.current,active=root?.querySelector<HTMLElement>('[aria-pressed=true]');if(!root||!active)return;const r=root.getBoundingClientRect(),a=active.getBoundingClientRect();if(a.bottom>r.bottom)root.scrollTop+=a.bottom-r.bottom+4;else if(a.top<r.top)root.scrollTop-=r.top-a.top+4;},[tool,expanded]);
 return <nav className={'design-tools photoshop-toolbox'+(expanded?' with-labels':'')} aria-label="Design tools">
  <button className="toolbox-expand" aria-label={expanded?'Compact toolbox':'Show tool names'} title={expanded?'Compact toolbox':'Show tool names'} onClick={()=>setExpanded(!expanded)}>{expanded?'«':'»'}</button>
  <div ref={groups} className="toolbox-groups">{toolGroups.map(group=><div key={group.name} role="group" aria-label={group.name+' tools'} className="toolbox-group">{expanded&&<small>{group.name}</small>}{group.items.map(([id,label,Icon])=><button key={id} data-design-tool={id} title={label+' · '+toolHint(id)} aria-label={label} aria-pressed={tool===id} onClick={()=>setTool(id)}><Icon size={16}/>{expanded&&<span>{label}</span>}</button>)}</div>)}</div>
  <div className="toolbox-colors"><label title="Foreground color"><input aria-label="Drawing color" type="color" value={color} onChange={e=>setColor(e.target.value)}/></label><label title="Background / gradient end color"><input aria-label="Background drawing color" type="color" value={background} onChange={e=>setBackground(e.target.value)}/></label><button aria-label="Swap foreground and background colors (X)" title="Swap colors (X)" onClick={()=>{setColor(background);setBackground(color);}}><ArrowDownUp size={12}/></button><button aria-label="Reset drawing colors (D)" title="Default colors (D)" onClick={()=>{setColor('#000000');setBackground('#ffffff');}}>D</button></div>
 </nav>;
}
