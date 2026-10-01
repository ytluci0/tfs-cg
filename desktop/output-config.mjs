export const defaultOutputConfig=Object.freeze({width:1920,height:1080,fps:50,port:17810,background:'transparent'});
export function outputConfig(value={}){
 const v={...defaultOutputConfig,...value};
 if(![[1280,720],[1920,1080],[3840,2160]].some(([w,h])=>w===v.width&&h===v.height))throw Error('Choose 720p, 1080p or 2160p.');
 if(![25,30,50,60].includes(v.fps))throw Error('Choose 25, 30, 50 or 60 fps.');
 if(!Number.isInteger(v.port)||v.port<1024||v.port>65535)throw Error('Choose an unused port from 1024 to 65535.');
 if(v.background!=='transparent'&&!/^#[\da-f]{6}$/i.test(v.background))throw Error('Choose transparency or a six-digit background color.');
 return{width:v.width,height:v.height,fps:v.fps,port:v.port,background:v.background};
}

