import React from 'react';
import type {Layer} from '@/lib/studio-model';
let measureContext:CanvasRenderingContext2D|null=null;
type Run=NonNullable<NonNullable<Layer['typography']>['runs']>[number];
export function RichText({layer:l,text,time,fill}:{layer:Layer;text:string;time:number;fill:string}){
 const typography=l.typography||{},spacing=l.visual?.letterSpacing||0,animation=l.textAnimation;
 const rtl=typography.direction==='rtl'||typography.direction!=='ltr'&&/^[^A-Za-z\u0590-\u08ff]*[\u0590-\u08ff]/.test(text);
 const style=(index:number)=>Object.assign({},...(typography.runs||[]).filter(r=>index>=r.start&&index<r.end)) as Partial<Run>;
 const measure=(s:string,r:Partial<Run>)=>{measureContext??=typeof document==='undefined'?null:document.createElement('canvas').getContext('2d');if(measureContext)measureContext.font=`${r.italic?'italic ':''}${r.fontWeight??l.fontWeight} ${r.fontSize??l.fontSize}px ${JSON.stringify(r.fontFamily||l.fontFamily)}`;return (measureContext?.measureText(s).width??s.length*(r.fontSize??l.fontSize)*.6)+spacing*s.length;};
 const lines:{text:string;start:number;width:number;height:number;paragraph:boolean}[]=[];let offset=0;
 for(const paragraph of text.split('\n')){const tokens=paragraph.match(/\S+\s*|\s+/g)||[''];let line='',start=offset,width=0,height=l.fontSize;
  for(const token of tokens){let w=0;for(let i=0;i<token.length;i++){const r=style(offset+i);w+=measure(token[i],r);height=Math.max(height,r.fontSize||l.fontSize);}if(typography.wrap&&line&&width+w>l.width){lines.push({text:line,start,width,height,paragraph:false});line='';width=0;start=offset;height=l.fontSize;}line+=token;width+=w;offset+=token.length;}
  lines.push({text:line,start,width,height,paragraph:true});offset++;
 }
 let y=l.textBaseline??l.fontSize*.85,ordinal=0;
 return <g data-rich-text="true">{lines.map((line,li)=>{if(li)y+=lines[li-1].height*(l.visual?.lineHeight||1.18)+(lines[li-1].paragraph?typography.paragraphSpacing||0:0);const baseline=y,baseX=l.textOriginX??(l.align==='center'?(l.width-line.width)/2:l.align==='right'?l.width-line.width:0);
  const tokens=animation?.unit==='letter'?[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(line.text)].map(v=>v.segment):animation?.unit==='word'?(line.text.match(/\S+\s*|\s+/g)||['']):[line.text];
  let advance=0,index=line.start;
  return <g key={li}>{tokens.map((token,ti)=>{const spans:{text:string;r:Partial<Run>}[]=[];let width=0;for(const char of token){const r=style(index),last=spans.at(-1);if(last&&JSON.stringify(last.r)===JSON.stringify(r))last.text+=char;else spans.push({text:char,r});width+=measure(char,r);index+=char.length;}
   const x=rtl?baseX+line.width-advance:baseX+advance;advance+=width;
   const progress=animation?Math.max(0,Math.min(1,(time-animation.start-ordinal++*animation.stagger)/animation.duration)):1,eased=1-(1-progress)**3;
   const dx=animation?.effect==='slide'?animation.x*(1-eased):0,dy=animation?.effect==='slide'?animation.y*(1-eased):0,visible=animation?.effect==='typewriter'?progress>0?1:0:progress;
   return <g key={ti} opacity={visible} transform={`translate(${dx} ${dy})`} style={animation?.effect==='reveal'?{clipPath:`inset(0 ${100*(1-eased)}% 0 0)`}:undefined}><text x={x} y={baseline} direction={rtl?'rtl':'ltr'} textAnchor={rtl?'end':'start'} fontFamily={l.fontFamily} fontSize={l.fontSize} fontWeight={l.fontWeight} fill={fill} letterSpacing={spacing} xmlSpace="preserve" style={{unicodeBidi:'plaintext'}}>{spans.map((s,i)=><tspan key={i} fontFamily={s.r.fontFamily} fontSize={s.r.fontSize} fontWeight={s.r.fontWeight} fill={s.r.color} fontStyle={s.r.italic?'italic':undefined} textDecoration={s.r.underline?'underline':undefined}>{s.text}</tspan>)}</text></g>;
  })}</g>;
 })}</g>;
}
