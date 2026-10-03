import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateVideoFile,videoPlacement,videoPosition,isLocalVideoSource,VIDEO_MAX_BYTES} from '../lib/video-tools.ts';
test('local video validation accepts MP4/WebM and missing Windows MIME hints',()=>{
 for(const file of [{name:'Clip.MP4',type:'video/mp4'},{name:'Alpha.webm',type:'video/webm'},{name:'Clip.mp4',type:''},{name:'Clip.webm',type:'application/octet-stream'}])assert.doesNotThrow(()=>validateVideoFile({...file,size:VIDEO_MAX_BYTES}));
});
test('unsupported, empty and oversized videos fail before an asset or layer is created',()=>{
 for(const file of [{name:'clip.mov',type:'video/quicktime',size:10},{name:'clip.mp4',type:'image/png',size:10},{name:'clip.mp4',type:'video/mp4',size:0},{name:'clip.webm',type:'video/webm',size:VIDEO_MAX_BYTES+1}])assert.throws(()=>validateVideoFile(file));
});
test('video imports preserve widescreen and portrait aspect ratio and center within the scene',()=>{
 for(const [w,h] of [[1920,1080],[1080,1920],[160,90]]){const p=videoPlacement(w,h,1920,1080);assert.ok(Math.abs(p.width/p.height-w/h)<1e-8);assert.ok(p.width<=1536&&p.height<=864);assert.equal(p.x*2+p.width,1920);assert.equal(p.y*2+p.height,1080);}
 assert.throws(()=>videoPlacement(0,1080,1920,1080));
});
test('video clock handles loop, speed, offset and end frame without negative seeks',()=>{
 assert.deepEqual(videoPosition(10,2,5,2,true),{target:4,ended:false});
 assert.deepEqual(videoPosition(10,2,5,2,false),{target:9.999,ended:true});
 assert.deepEqual(videoPosition(.0005,0,1,1,false),{target:0,ended:true});
 assert.deepEqual(videoPosition(10,2,-1,1,false),{target:2,ended:false});
});
test('unknown WebM duration remains playable and an invalid start can recover',()=>{
 assert.deepEqual(videoPosition(Infinity,0,2,1,true),{target:2,ended:false});assert.equal(videoPosition(3,4,0,1,true),null);assert.deepEqual(videoPosition(3,0,0,1,true),{target:0,ended:false});assert.equal(videoPosition(NaN,0,0,1,true),null);
});
test('resolved video data bindings allow local assets only',()=>{
 assert.ok(isLocalVideoSource('/api/assets/abc-123'));for(const value of ['{{video}}','https://example.com/a.mp4','file:///private.mp4','/api/assets/../users','/api/assets/abc?token=x',''])assert.equal(isLocalVideoSource(value),false);
});
