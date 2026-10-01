import {WebSocket} from 'ws';
import {createHash,randomUUID} from 'node:crypto';

export const obsAuthentication=(password,salt,challenge)=>createHash('sha256').update(createHash('sha256').update(password+salt).digest('base64')+challenge).digest('base64');
export function connectObs({port=4455,password='',timeout=5000}={}){
 if(!Number.isInteger(port)||port<1024||port>65535||typeof password!=='string'||password.length>1024)throw Error('Invalid OBS connection settings.');
 return new Promise((resolve,reject)=>{
  const socket=new WebSocket('ws://127.0.0.1:'+port,{maxPayload:16000000,handshakeTimeout:timeout,perMessageDeflate:false}),pending=new Map();let identified=false,settled=false;
  const fail=message=>{const e=Error(message);if(!settled){settled=true;clearTimeout(timer);reject(e);}for(const p of pending.values()){clearTimeout(p.timer);p.reject(e);}pending.clear();};
  const timer=setTimeout(()=>{fail('OBS connection timed out. Enable its WebSocket server in Tools.');socket.terminate();},timeout);
  socket.on('error',()=>fail('Cannot connect to OBS on this PC. Check its WebSocket port and password.'));
  socket.on('close',code=>fail(code===4009?'OBS rejected the password.':'OBS disconnected. Requests were not replayed.'));
  const api={
   connected:()=>identified&&socket.readyState===WebSocket.OPEN,
   request(type,data={}){return new Promise((resolve,reject)=>{if(!api.connected())return reject(Error('OBS is disconnected.'));const id=randomUUID(),timer=setTimeout(()=>{pending.delete(id);reject(Error('OBS response timed out. Inspect OBS before retrying.'));},timeout);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({op:6,d:{requestType:type,requestId:id,requestData:data}}));});},
   async inspect(){const [version,stats,video,scenes]=await Promise.all(['GetVersion','GetStats','GetVideoSettings','GetSceneList'].map(t=>api.request(t)));return{version:version.obsVersion,stats,video,scenes:scenes.scenes.map(s=>({name:s.sceneName})),programScene:scenes.currentProgramSceneName};},
   async addSource({sceneName,inputName,url,config,enabled=false},authorize=()=>{}){
    if(![sceneName,inputName].every(s=>typeof s==='string'&&s.trim().length>0&&s.length<=128)||typeof enabled!=='boolean')throw Error('Choose an OBS scene and a new source name.');
    const u=new URL(url);if(u.hostname!=='127.0.0.1'||u.protocol!=='http:'||!/^\/live\/[a-f0-9]{64}\/$/.test(u.pathname))throw Error('Invalid local output URL.');
    const kinds=await api.request('GetInputKindList');if(!kinds.inputKinds.includes('browser_source'))throw Error('This OBS installation does not have Browser Source.');
    authorize();
    return api.request('CreateInput',{sceneName,inputName,inputKind:'browser_source',sceneItemEnabled:enabled,inputSettings:{url,width:config.width,height:config.height,fps:config.fps,fps_custom:true,is_local_file:false,shutdown:false,restart_when_active:false,webpage_control_level:0,css:'body { margin: 0; overflow: hidden; background: transparent; }'}});
   },
   close(){identified=false;fail('OBS connection closed.');socket.close();},
  };
  socket.on('message',bytes=>{try{const m=JSON.parse(bytes.toString());if(m.op===0&&!identified){const authentication=m.d.authentication?obsAuthentication(password,m.d.authentication.salt,m.d.authentication.challenge):undefined;password='';socket.send(JSON.stringify({op:1,d:{rpcVersion:1,eventSubscriptions:0,...(authentication?{authentication}:{})}}));}
   else if(m.op===2&&!settled){identified=true;settled=true;clearTimeout(timer);resolve(api);}
   else if(m.op===7){const p=pending.get(m.d.requestId);if(!p)return;pending.delete(m.d.requestId);clearTimeout(p.timer);if(m.d.requestStatus?.result)p.resolve(m.d.responseData||{});else p.reject(Error(m.d.requestStatus?.comment||'OBS rejected this request.'));}
  }catch{fail('Invalid OBS protocol response.');socket.terminate();}});
 });
}
