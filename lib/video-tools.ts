export const VIDEO_MAX_BYTES=50_000_000;
export const VIDEO_ACCEPT='.mp4,.webm,video/mp4,video/webm';
export function validateVideoFile(file:{name:string;size:number;type:string}){
 if(!file.size)throw Error('This video file is empty. Choose an MP4 or WebM video.');
 if(file.size>VIDEO_MAX_BYTES)throw Error('Choose a video no larger than 50 MB.');
 if(!/\.(mp4|webm)$/i.test(file.name)||file.type&&!['video/mp4','video/webm','application/octet-stream'].includes(file.type))throw Error('Choose an MP4 or WebM video. Other formats need to be converted first.');
}
export function videoPlacement(width:number,height:number,sceneWidth:number,sceneHeight:number){
 if(![width,height,sceneWidth,sceneHeight].every(n=>Number.isFinite(n)&&n>0))throw Error('The video has invalid dimensions.');
 const scale=Math.min(1,sceneWidth*.8/width,sceneHeight*.8/height),w=Math.max(.001,width*scale),h=Math.max(.001,height*scale);
 return {x:(sceneWidth-w)/2,y:(sceneHeight-h)/2,width:w,height:h};
}
export function videoPosition(duration:number,start:number,elapsed:number,speed:number,loop:boolean){
 if(Number.isNaN(duration)||duration<=0||!Number.isFinite(start)||start<0||start>=duration)return null;
 const length=duration-start,raw=Math.max(0,elapsed)*speed,end=Number.isFinite(duration)?Math.max(start,duration-.001):Infinity;
 return {target:Math.min(end,start+(loop?raw%length:Math.min(length,raw))),ended:!loop&&raw>=length};
}
export const isLocalVideoSource=(src:string)=>/^\/api\/assets\/[a-zA-Z0-9-]+$/.test(src);
