import {Fragment} from 'react';
import type {LayerEffect} from '@/lib/editing-schema';
export function EffectsFilter({id,effects}:{id:string;effects:LayerEffect[]}){
 const enabled=effects.filter(e=>e.enabled);
 return <filter id={id} x="-100%" y="-100%" width="300%" height="300%" colorInterpolationFilters="sRGB">{enabled.map((e,i)=>{const input=i?`fx${i-1}`:'SourceGraphic',result=`fx${i}`,amount=Math.max(0,e.amount);switch(e.type){
 case 'brightness':case 'contrast':return <feComponentTransfer key={e.id} in={input} result={result}>{['R','G','B'].map(c=>{const Component=({R:'feFuncR',G:'feFuncG',B:'feFuncB'} as const)[c as 'R'];return <Component key={c} type="linear" slope={amount/100} intercept={e.type==='contrast'?.5-amount/200:0}/>;})}</feComponentTransfer>;
 case 'saturation':return <feColorMatrix key={e.id} in={input} result={result} type="saturate" values={String(amount/100)}/>;
 case 'hue':return <feColorMatrix key={e.id} in={input} result={result} type="hueRotate" values={String(e.amount)}/>;
 case 'blur':return <feGaussianBlur key={e.id} in={input} result={result} stdDeviation={Math.min(100,amount)}/>;
 case 'shadow':return <feDropShadow key={e.id} in={input} result={result} dx={e.x??8} dy={e.y??8} stdDeviation={Math.min(100,amount)} floodColor={e.color||'#000000'}/>;
 case 'outline':return <Fragment key={e.id}><feMorphology in={input} operator="dilate" radius={Math.min(100,amount)} result={result+"-edge"}/><feFlood floodColor={e.color||"#ffffff"} result={result+"-color"}/><feComposite in={result+"-color"} in2={result+"-edge"} operator="in" result={result+"-outline"}/><feMerge result={result}><feMergeNode in={result+"-outline"}/><feMergeNode in={input}/></feMerge></Fragment>;
 }})}</filter>;
}
