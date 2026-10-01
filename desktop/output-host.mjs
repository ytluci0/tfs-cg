import {createBrowserOutput} from './browser-output-server.mjs';
let host=null,starting=false;
const send=value=>{if(process.connected)process.send(value);};
process.on('message',async m=>{try{
 if(m.action==='start'&&!host&&!starting){starting=true;host=await createBrowserOutput({...m.data,onEvent:send});send({id:m.id,value:{url:host.url,status:host.status()}});}
 else if(m.action==='publish'&&host)send({id:m.id,value:await host.publish(m.data.program,m.data.assets)});
 else if(m.action==='update'&&host)host.update(m.data);
 else if(m.action==='stop'){await host?.close();process.exit(0);}
 else if(m.id)throw Error('Output host is not ready.');
 }catch(e){send({id:m.id,error:e.message});}});
process.on('disconnect',async()=>{await host?.close();process.exit(0);});

