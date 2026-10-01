import {writePsdBuffer} from 'ag-psd';
export function bitmap(width,height,rgba){const data=new Uint8ClampedArray(width*height*4);for(let i=0;i<data.length;i+=4)data.set(rgba,i);return{width,height,data};}
export function fixtureDocument(){
 const composite=bitmap(640,360,[18,30,48,255]);
 const paint=(x,y,w,h,rgba)=>{for(let row=y;row<y+h;row++)for(let col=x;col<x+w;col++)composite.data.set(rgba,(row*640+col)*4);};
 paint(40,240,560,80,[240,244,250,255]);paint(40,240,12,80,[255,106,0,255]);paint(72,260,150,18,[20,40,60,255]);
 return{width:640,height:360,imageData:composite,children:[{name:'Background',left:0,top:0,imageData:bitmap(640,360,[18,30,48,255])},{name:'Lower third',blendMode:'normal',children:[{name:'Plate',left:40,top:240,imageData:bitmap(560,80,[240,244,250,255])},{name:'Accent',left:40,top:240,imageData:bitmap(12,80,[255,106,0,255])},{name:'Presenter',left:72,top:260,imageData:bitmap(150,18,[20,40,60,255]),text:{text:'PRESENTER',transform:[1,0,0,1,72,278],style:{font:{name:'ArialMT'},fontSize:24,fillColor:{r:20,g:40,b:60}},paragraphStyle:{justification:'left'}}},{name:'Hidden sponsor',hidden:true,left:50,top:50,imageData:bitmap(30,30,[255,0,0,255])}]}]};
}
export function psdFixture(document=fixtureDocument()){return writePsdBuffer(document,{noBackground:true});}
