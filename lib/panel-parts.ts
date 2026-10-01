import {action,control,uid,type Control,type Panel,type Player,type Project} from './studio-model.ts';
import {artPart,artPreset,buttonArtwork,type ButtonArt} from './button-art.ts';
import {formationPoints} from './formations.ts';
import {clampControlBounds,controlBounds,panelSize} from './panel-layout.ts';

export const partDefaults:Project['variables']={homeTeam:'HOME',awayTeam:'AWAY',homeScore:0,awayScore:0,homeFormation:'4-3-3',awayFormation:'4-4-2',homeColor:'#3478ee',awayColor:'#df3b48',matchClock:'00:00',playerName:'',playerNumber:0,playerPhoto:'',playerPosition:''};
export const partChoices=[['button','Blank action button'],['artwork','Blank artwork / container'],['text','Text / data display'],['image','Image / logo'],['field','Pitch background'],['line','Pitch line / divider'],['circle','Centre circle'],['box','Pitch outline / box'],['player','Player button'],['bench','Substitute button'],['team','Team name input'],['formation','Formation dropdown'],['color','Team color picker'],['score','Score display'],['plus','Score + button'],['minus','Score − button'],['clock','Clock display'],['start','Start clock button'],['pause','Pause clock button'],['reset','Reset clock button']] as const;
export type PartKind=typeof partChoices[number][0];
const art=(parts:ButtonArt['parts'],width=320,height=120):ButtonArt=>({width,height,fit:'stretch',parts});
export function createPanelPart(kind:PartKind,team:'home'|'away'='home',slot=1):Control{
 const teamName=team==='home'?'Home':'Away',color=team==='home'?'#3478ee':'#df3b48',label=partChoices.find(p=>p[0]===kind)![1];
 let c=control(label,[],{kind:'artwork',color,placement:{x:0,y:0,width:180,height:64}});
 if(kind==='button')return {...c,kind:'button',label:'Custom button',artwork:buttonArtwork('Button',color)};
 if(kind==='artwork')return {...c,artwork:art([])};
 if(kind==='field')return {...c,label:'Pitch background',placement:{x:0,y:0,width:880,height:420},artwork:art([artPart('rect',{name:'Grass',x:0,y:0,width:880,height:420,fill:'#197545'}),...Array.from({length:5},(_,i)=>artPart('rect',{name:'Stripe '+(i+1),x:i*176,y:0,width:88,height:420,fill:'#ffffff',opacity:.035}))],880,420)};
 if(['line','circle','box'].includes(kind))return {...c,placement:{x:0,y:0,width:kind==='line'?400:160,height:kind==='line'?24:160},artwork:art([artPart(kind==='line'?'line':kind==='circle'?'ellipse':'rect',{name:label,x:2,y:2,width:196,height:196,fill:'none',stroke:'#cce5d2',strokeWidth:2,opacity:.6})],200,200)};
 if(kind==='text'||kind==='score'||kind==='clock')return {...c,label:kind==='score'?teamName+' score':label,artwork:art([artPart('text',{name:'Value',x:0,y:0,width:kind==='score'?80:180,height:64,text:kind==='score'?'{{'+team+'Score}}':kind==='clock'?'{{matchClock}}':'Your text',fontSize:kind==='score'?48:38,fontWeight:700})],kind==='score'?80:180,64)};
 if(kind==='image')return {...c,artwork:art([artPart('image',{name:'Image',x:0,y:0,width:320,height:120,imageFit:'contain'})])};
 if(kind==='team'||kind==='formation'||kind==='color')return {...c,label:teamName+' '+(kind==='team'?'name':kind),kind:kind==='team'?'text':kind,variable:team+(kind==='team'?'Team':kind==='formation'?'Formation':'Color'),placement:{x:0,y:0,width:200,height:84}};
 if(kind==='player'||kind==='bench'){
  const artwork=artPreset('shirt','{{player.number}}','{{player.color}}');artwork.height=160;artwork.fit='contain';artwork.parts.push(artPart('text',{name:'Position',x:0,y:124,width:120,height:30,text:'{{player.position}}',fontSize:20}));
  return {...c,label:teamName+' '+(kind==='bench'?'substitute ':'player ')+slot,kind:'player',player:{team,source:kind==='bench'?'bench':'slot',slot},artwork,dataFields:{[team+'Color']:team+'Color',[team+'Formation']:team+'Formation'},placement:{x:0,y:0,width:48,height:64}};
 }
 const clock=['start','pause','reset'].includes(kind),text=kind==='plus'?'+':kind==='minus'?'−':kind==='start'?'▶':kind==='pause'?'Ⅱ':'↺';
 return {...c,kind:'button',label:clock?label:teamName+' score '+text,artwork:art([artPart('rect',{name:'Background',x:0,y:0,width:64,height:40,fill:color,radius:6,states:{hover:{fill:'#356bab'},pressed:{fill:'#183756'},live:{fill:'#127756'},disabled:{opacity:.35}}}),artPart('text',{name:'Label',x:4,y:0,width:56,height:40,text,fontSize:32})],64,40),actions:[clock?action('clock','matchClock',JSON.stringify({op:kind})):action('counter',team+'Score',JSON.stringify({delta:kind==='plus'?1:-1}))],placement:{x:0,y:0,width:64,height:40}};
}
export function resolvePlayer(c:Control,project:Project):Player|undefined{
 const p=c.player;if(!p)return;
 if(p.source==='player')return project.players.find(v=>v.id===p.playerId&&v.team===p.team);
 if(p.source==='bench')return project.players.filter(v=>v.team===p.team&&v.bench)[p.slot-1];
 return project.players.find(v=>v.team===p.team&&!v.bench&&v.slot===p.slot);
}
export function playerVariables(c:Control,project:Project):Project['variables']{
 const p=resolvePlayer(c,project),team=c.player?.team||'home',colorKey=c.dataFields?.[team==='home'?'homeColor':'awayColor']||team+'Color',formationKey=c.dataFields?.[team==='home'?'homeFormation':'awayFormation']||team+'Formation';
 const points=formationPoints(project,String(project.variables[formationKey]||'4-3-3')),role=p&&!p.bench&&c.player?.fieldId?points[Math.max(0,Math.min(10,p.slot-1))].role:p?.position;
 return {...project.variables,'player.number':p?.number??'—','player.name':p?.name||'Unassigned','player.position':role||'SUB','player.photo':p?.photo||'','player.color':String(project.variables[colorKey]|| (team==='home'?'#3478ee':'#df3b48')),'player.team':team,'player.card':p?.card||''};
}
export function positionPlayerControls(panel:Panel,project:Project):Panel{
 if(!panel.freeLayout)return panel;
 return {...panel,controls:panel.controls.map((c,i)=>{
  const cfg=c.player,field=cfg?.fieldId&&panel.controls.find(v=>v.id===cfg.fieldId&&v.kind==='artwork');if(c.kind!=='player'||!cfg||!field)return c;
  const player=resolvePlayer(c,project);if(!player||player.bench)return c;
  const b=controlBounds(panel,c,i),f=controlBounds(panel,field,panel.controls.indexOf(field)),key=c.dataFields?.[cfg.team==='home'?'homeFormation':'awayFormation']||cfg.team+'Formation',pos=formationPoints(project,String(project.variables[key]||'4-3-3'))[Math.max(0,Math.min(10,player.slot-1))];
  return {...c,placement:clampControlBounds({...b,x:f.x+f.width*(cfg.team==='home'?pos.x:100-pos.x)/100-b.width/2,y:f.y+f.height*pos.y/100-b.height/2},panelSize(panel))};
 })};
}
export function detachMovedPlayers(before:Panel,after:Panel):Panel{
 return {...after,controls:after.controls.map(c=>{const old=before.controls.find(v=>v.id===c.id),fieldId=c.player?.fieldId;if(!old||!fieldId||JSON.stringify(c.placement)===JSON.stringify(old.placement))return c;const a=after.controls.find(v=>v.id===fieldId),b=before.controls.find(v=>v.id===fieldId);return JSON.stringify(a?.placement)!==JSON.stringify(b?.placement)?c:{...c,player:{...c.player!,fieldId:undefined}};})};
}
export function footballPartsPanel(project:Project):{panel:Panel;variables:Project['variables']}{
 const controls:Control[]=[];const add=(kind:PartKind,x:number,y:number,width:number,height:number,team:'home'|'away'='home',slot=1)=>{const c={...createPanelPart(kind,team,slot),placement:{x,y,width,height}};controls.push(c);return c;};
 const field=add('field',0,120,960,440);add('box',8,128,944,424);add('line',468,120,24,440).artwork!.parts[0]={...artPart('line'),x:2,y:100,width:196,height:1,rotation:90,stroke:'#cce5d2',strokeWidth:2,opacity:.6};add('circle',390,250,180,180);add('box',8,250,120,180);add('box',832,250,120,180);
 for(const team of ['home','away'] as const){const away=team==='away';add('team',away?760:0,0,200,80,team);add('formation',away?760:0,568,200,84,team);add('color',away?760:0,656,200,84,team);add('score',away?510:370,4,80,48,team);add('minus',away?514:374,62,34,32,team);add('plus',away?554:414,62,34,32,team);for(let slot=1;slot<=11;slot++){const c=add('player',0,120,38,52,team,slot);c.player!.fieldId=field.id;}for(let slot=1;slot<=Math.min(8,project.players.filter(p=>p.team===team&&p.bench).length);slot++)add('bench',(away?500:220)+(slot-1)*44,580,38,52,team,slot);}
 add('clock',430,650,100,35);add('start',374,692,60,36);add('pause',442,692,60,36);add('reset',510,692,60,36);
 const panel:Panel={id:uid(),name:'Football · individual parts',type:'custom',columns:3,freeLayout:true,canvasWidth:960,canvasHeight:752,layoutVersion:2,controls};
 const variables={...partDefaults,...project.variables};return {panel:positionPlayerControls(panel,{...project,variables}),variables};
}
