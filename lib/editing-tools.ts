import {atTime,layer,propertyValue,uid,type Layer,type Scene,type Property} from './studio-model.ts';
import {setTimelineValue,timelineSourceValue} from './timeline-tools.ts';
import {vectorPath} from './production-tools.ts';
import type {CurvePoint} from './editing-schema.ts';
export function editValues(original:Layer,values:Partial<Record<Property,number>>,time:number,animate:boolean){
 if(original.locked)return original;let next=original;
 for(const [name,value] of Object.entries(values)){
  const property=name as Property,shown=propertyValue(atTime(original,time),property),unpathed=timelineSourceValue(original,property,time);
  if(animate)next=setTimelineValue(next,property,time,value-(shown-unpathed));
  else{const delta=value-shown,keys={...next.keys};if(keys[property])keys[property]=keys[property]!.map(k=>({...k,value:k.value+delta}));next={...next,[property]:propertyValue(original,property)+delta,keys};}
 }
 return next;
}
export function curveLayer(points:CurvePoint[],closed:boolean,color:string):Layer{
 if(points.length<2)throw Error('Place at least two Pen points.');
 const xs=points.flatMap(p=>[p.x,p.inX??p.x,p.outX??p.x]),ys=points.flatMap(p=>[p.y,p.inY??p.y,p.outY??p.y]),x=Math.min(...xs),y=Math.min(...ys),width=Math.max(1,Math.max(...xs)-x),height=Math.max(1,Math.max(...ys)-y);
 const normalized=points.map(p=>({x:(p.x-x)/width,y:(p.y-y)/height,inX:p.inX===undefined?undefined:(p.inX-x)/width,inY:p.inY===undefined?undefined:(p.inY-y)/height,outX:p.outX===undefined?undefined:(p.outX-x)/width,outY:p.outY===undefined?undefined:(p.outY-y)/height}));
 return layer('path',{name:'Pen path',x,y,width,height,color,visual:{points:normalized,closed,fill:closed?'solid':'none',stroke:color,strokeWidth:closed?0:4}});
}
export function combineShapes(scene:Scene,ids:string[],operation:'union'|'subtract',time:number):{scene:Scene;id:string}{
 const selected=scene.layers.filter(l=>ids.includes(l.id));if(selected.length<2||selected.length>50)throw Error('Select 2–50 shapes.');
 if(selected.some(l=>l.locked||!['rect','ellipse','path'].includes(l.type)||l.visual?.compound))throw Error('Choose unlocked rectangles, ellipses or Pen paths.');
 if(new Set(selected.map(l=>l.groupId)).size!==1)throw Error('Combine shapes within the same group.');
 if(selected.some(l=>Object.values(l.keys).some(k=>k?.length)||l.motionPath||l.layout||l.visual?.clipLayer||l.visual?.layerMask||l.matte||l.masks?.length||l.formulas?.length||l.propertyTracks?.length))throw Error('Remove animation, layout links and masks before combining shapes.');
 if(scene.layers.some(l=>!ids.includes(l.id)&&(ids.includes(l.visual?.clipLayer||'')||ids.includes(l.layout?.target||'')||ids.includes(l.matte?.layerId||''))))throw Error('These shapes are referenced by another layer. Remove that link first.');
 const matrices=selected.map(l=>{const a=l.rotation*Math.PI/180,sx=l.scaleX??1,sy=l.scaleY??1,ax=l.anchorX??l.width/2,ay=l.anchorY??l.height/2,a0=Math.cos(a)*sx,b=Math.sin(a)*sx,c=-Math.sin(a)*sy,d=Math.cos(a)*sy;return [a0,b,c,d,l.x+ax-a0*ax-c*ay,l.y+ay-b*ax-d*ay] as [number,number,number,number,number,number];});
 const corners=selected.flatMap((l,i)=>[[0,0],[l.width,0],[0,l.height],[l.width,l.height]].map(([x,y])=>({x:matrices[i][0]*x+matrices[i][2]*y+matrices[i][4],y:matrices[i][1]*x+matrices[i][3]*y+matrices[i][5]})));
 const x=Math.min(...corners.map(p=>p.x)),y=Math.min(...corners.map(p=>p.y)),width=Math.max(...corners.map(p=>p.x))-x,height=Math.max(...corners.map(p=>p.y))-y;
 const paths=selected.map((l,i)=>({d:l.type==='path'?vectorPath(l):l.type==='ellipse'?`M 0 ${l.height/2} A ${l.width/2} ${l.height/2} 0 1 0 ${l.width} ${l.height/2} A ${l.width/2} ${l.height/2} 0 1 0 0 ${l.height/2} Z`:`M 0 0 H ${l.width} V ${l.height} H 0 Z`,transform:matrices[i].map((v,n)=>n===4?v-x:n===5?v-y:v) as typeof matrices[number]}));
 const combined=layer('path',{id:uid(),name:operation==='union'?'Combined shapes':'Subtracted shapes',groupId:selected[0].groupId,x,y,width,height,color:selected[0].color,visual:{...selected[0].visual,compound:{operation,width,height,paths}}});
 const last=selected.at(-1)!.id;return{id:combined.id,scene:{...scene,layers:scene.layers.flatMap(l=>l.id===last?[combined]:ids.includes(l.id)?[]:[l])}};
}
export function historyLabel(before:{scenes:Scene[];name:string},after:{scenes:Scene[];name:string}){if(before.name!==after.name)return 'Rename project';if(before.scenes.length!==after.scenes.length)return after.scenes.length>before.scenes.length?'Add scene':'Delete scene';for(const scene of after.scenes){const previous=before.scenes.find(s=>s.id===scene.id);if(!previous)continue;if(scene.layers.length!==previous.layers.length)return (scene.layers.length>previous.layers.length?'Add layers · ':'Delete layers · ')+scene.name;for(const l of scene.layers){const old=previous.layers.find(p=>p.id===l.id);if(old&&JSON.stringify(old)!==JSON.stringify(l)){if(old.text!==l.text)return 'Edit text · '+l.name;if(JSON.stringify(old.keys)!==JSON.stringify(l.keys))return 'Animation · '+l.name;if(JSON.stringify(old.effects)!==JSON.stringify(l.effects))return 'Effects · '+l.name;return 'Edit · '+l.name;}}if(JSON.stringify(scene)!==JSON.stringify(previous))return 'Edit scene · '+scene.name;}return 'Project settings / controls';}
