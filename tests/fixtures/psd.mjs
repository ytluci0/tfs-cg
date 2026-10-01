import {writePsdBuffer} from 'ag-psd';
export function bitmap(width,height,rgba){const data=new Uint8ClampedArray(width*height*4);for(let i=0;i<data.length;i+=4)data.set(rgba,i);return{width,height,data};}
export function fixtureDocument(){
 const composite=bitmap(640,360,[18,30,48,255]);
 const paint=(x,y,w,h,rgba)=>{for(let row=y;row<y+h;row++)for(let col=x;col<x+w;col++)composite.data.set(rgba,(row*640+col)*4);};
 paint(40,240,560,80,[240,244,250,255]);paint(40,240,12,80,[255,106,0,255]);paint(72,260,150,18,[20,40,60,255]);
 return{width:640,height:360,imageData:composite,children:[{name:'Background',left:0,top:0,imageData:bitmap(640,360,[18,30,48,255])},{name:'Lower third',blendMode:'normal',children:[{name:'Plate',left:40,top:240,imageData:bitmap(560,80,[240,244,250,255])},{name:'Accent',left:40,top:240,imageData:bitmap(12,80,[255,106,0,255])},{name:'Presenter',left:72,top:260,imageData:bitmap(150,18,[20,40,60,255]),text:{text:'PRESENTER',transform:[1,0,0,1,72,278],style:{font:{name:'ArialMT'},fontSize:24,fillColor:{r:20,g:40,b:60}},paragraphStyle:{justification:'left'}}},{name:'Hidden sponsor',hidden:true,left:50,top:50,imageData:bitmap(30,30,[255,0,0,255])}]}]};
}
export function psdFixture(document=fixtureDocument()){return writePsdBuffer(document,{noBackground:true});}

// A valid unknown image-resource block, like large application-specific metadata.
// The saved layer pixels and editable text are identical to the small fixture.
export function largePsdFixture(){
 const original=psdFixture(),resourceOffset=30+original.readUInt32BE(26),resourceLength=original.readUInt32BE(resourceOffset);
 const resource=Buffer.alloc(100_000_012);resource.write('8BIM');resource.writeUInt16BE(4000,4);resource.writeUInt32BE(100_000_000,8);
 const length=Buffer.alloc(4);length.writeUInt32BE(resourceLength+resource.length);
 return Buffer.concat([original.subarray(0,resourceOffset),length,original.subarray(resourceOffset+4,resourceOffset+4+resourceLength),resource,original.subarray(resourceOffset+4+resourceLength)]);
}

// Uncompressed planar RGBA: 102.4 MB of real pixels, not appended padding.
export function largePixelPsdFixture(){
 const width=6400,height=4000,count=width*height,bytes=Buffer.alloc(40+count*4);
 bytes.write('8BPS');bytes.writeUInt16BE(1,4);bytes.writeUInt16BE(4,12);bytes.writeUInt32BE(height,14);bytes.writeUInt32BE(width,18);bytes.writeUInt16BE(8,22);bytes.writeUInt16BE(3,24);
 [20,60,180,255].forEach((value,channel)=>bytes.fill(value,40+count*channel,40+count*(channel+1)));
 return bytes;
}
