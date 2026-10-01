import {encode} from 'fast-png';
export function aePng(width=40,height=30,color=[50,220,140,255]){const data=new Uint8Array(width*height*4);for(let i=0;i<data.length;i+=4)data.set(color,i);return Buffer.from(encode({width,height,data,channels:4,depth:8}));}
export function aeFixture(){
 const samples=Array.from({length:21},(_,i)=>({time:i/10,position:[50+300*(1-Math.pow(1-i/20,3)),100],anchor:[20,15],scale:[100,100],rotation:0,opacity:100,hold:['anchor','scale','rotation','opacity']}));
 const still=[{time:0,position:[40,210],anchor:[0,0],scale:[100,100],rotation:0,opacity:100,hold:['position','anchor','scale','rotation','opacity']}];
 return{format:'broadcastcg-ae',version:1,exporter:{name:'BroadcastCG test fixture',version:'1',aeVersion:'simulated'},composition:{name:'AE motion fixture',width:640,height:360,duration:2,frameRate:10,workAreaStart:5,pixelAspect:1},layers:[
  {id:'plate',name:'Motion plate',type:'solid',width:200,height:80,color:'#ff7825',inPoint:0,outPoint:2,samples},
  {id:'logo',name:'Local logo',type:'image',width:40,height:30,imageId:'logo-png',inPoint:.3,outPoint:1.5,samples:still},
  {id:'title',name:'Presenter',type:'text',width:400,height:48,color:'#ffffff',text:{value:'LOCAL ANIMATION',font:'ArialMT',fontSize:36,fontWeight:700,align:'left',left:0,top:-30},inPoint:0,outPoint:2,samples:[{...still[0],position:[40,280]}]},
 ],assets:[{id:'logo-png',name:'logo.png',mime:'image/png',bytes:aePng().toString('base64')}],references:[],warnings:[{layer:'Camera',message:'Skipped: 3D is outside the supported subset.'}]};
}
