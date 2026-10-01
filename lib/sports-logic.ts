import {z} from 'zod';
import {type Project,type Player,pathValue} from './studio-model.ts';
import {sportKinds,playerStatsSchema} from './sports-model.ts';
const team=z.enum(['home','away']);
export const sportOperationSchema=z.discriminatedUnion('op',[
 z.object({op:z.literal('configure'),kind:z.enum(sportKinds),bestOf:z.union([z.literal(1),z.literal(3),z.literal(5),z.literal(7)]).default(5),periodSeconds:z.number().int().min(1).max(7200).optional(),mapPool:z.array(z.string().trim().min(1).max(80)).max(30).default([])}),
 z.object({op:z.literal('score'),team,delta:z.number().int().min(-3).max(3)}),
 z.object({op:z.literal('period'),value:z.string().min(1).max(30)}),
 z.object({op:z.literal('phase'),value:z.enum(['Pregame','Live','Break','Overtime','Final'])}),
 z.object({op:z.literal('stat'),playerId:z.string(),stat:z.enum(['goals','assists','kills','deaths','points','rebounds','fouls']),delta:z.number().int().min(-3).max(3)}),
 z.object({op:z.literal('select-player'),playerId:z.string()}),
 z.object({op:z.literal('card'),playerId:z.string(),card:z.enum(['','yellow','red'])}),
 z.object({op:z.literal('substitute'),out:z.string(),incoming:z.string()}),
 z.object({op:z.literal('draft'),team,map:z.string(),choice:z.enum(['pick','ban'])}),
 z.object({op:z.literal('undo-draft')}),
 z.object({op:z.literal('finish-game')}),
 z.object({op:z.literal('undo-game')}),
 z.object({op:z.literal('swap-sides')}),
 z.object({op:z.literal('map'),map:z.string()}),
 z.object({op:z.literal('roster'),team,rows:z.array(z.unknown()).max(100),mapping:z.record(z.string(),z.string().max(100))}),
 z.object({op:z.literal('fetch-roster'),team,sourceId:z.string(),rowsPath:z.string().max(300),mapping:z.record(z.string(),z.string().max(100))})
]);
export type SportOperation=z.input<typeof sportOperationSchema>;
export function parseSportOperation(value:unknown){return sportOperationSchema.parse(value);}
export function mappedRoster(rows:unknown[],side:'home'|'away',mapping:Record<string,string>,kind:string):Player[]{
 if(!rows.length||rows.length>100)throw Error('Roster must contain 1–100 players.');
 const players=rows.map((row,i)=>{const field=(name:string,fallback:unknown)=>mapping[name]?pathValue(row,mapping[name]):fallback;
  const id=field('id',undefined),name=field('name',undefined),number=Number(field('number',i+1)),bench=field('bench',true),slot=Number(field('slot',i+1)),stats=field('stats',{}),photo=String(field('photo','')),position=String(field('position',''));
  if(!['string','number'].includes(typeof id)||!String(id).trim()||String(id).length>90||typeof name!=='string'||!name.trim()||name.length>100||!Number.isInteger(number)||number<0||number>999||typeof bench!=='boolean'||!Number.isInteger(slot)||slot<1||slot>100||position.length>20||photo.length>2000||photo&&!/^https:\/\//i.test(photo))throw Error('Roster rows need unique IDs, names, valid numbers, Boolean bench values, slots and HTTPS photos.');
  return{id:side+'-'+id,team:side,name,number,position,photo,bench,slot,card:'',stats:playerStatsSchema.parse(stats)};
 });
 if(new Set(players.map(p=>p.id)).size!==players.length)throw Error('Roster IDs must be unique.');
 const active=players.filter(p=>!p.bench),limit=kind==='football'?11:kind==='basketball'?5:kind==='volleyball'?6:100;
 if(active.length>limit||new Set(active.map(p=>p.slot)).size!==active.length||kind==='football'&&active.some(p=>p.slot>11))throw Error('Active roster slots must be unique and fit the selected sport.');
 return players;
}
export function applySportOperation(input:Project,raw:unknown,eventId:string,time:string):Project{
 const op=parseSportOperation(raw),p=structuredClone(input),v=p.variables;
 if(op.op==='configure'){
  const seconds=op.periodSeconds??(op.kind==='football'?2700:op.kind==='basketball'?600:120);
  p.sports={kind:op.kind,bestOf:op.kind==='volleyball'?5:op.bestOf,periodSeconds:seconds,mapPool:[...new Set(op.mapPool)],draft:[],results:[],events:[]};
  Object.assign(v,{homeScore:0,awayScore:0,homeSeries:0,awaySeries:0,period:op.kind==='football'?'1H':op.kind==='basketball'?'Q1':'1',matchPhase:'Pregame',matchClock:op.kind==='basketball'?String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0'):'00:00',shotClock:'00:24',timeoutClock:'01:00',homeFouls:0,awayFouls:0,homeTimeouts:0,awayTimeouts:0,possession:'Home',currentMap:p.sports.mapPool[0]||'',homeSide:'Attack',awaySide:'Defense',stoppage:0,matchWinner:'',eventLabel:'',playerName:'',playerNumber:0,playerPhoto:'',playerPosition:'',playerGoals:0,playerAssists:0,playerKills:0,playerDeaths:0,playerPoints:0,playerRebounds:0,playerFouls:0});
  p.players=p.players.map(player=>({...player,card:'',stats:{}}));return p;
 }
 const s=p.sports;if(!s)throw Error('Set up a match in Sports first.');
 let label=op.op as string;
 const person=(id:string)=>{const player=p.players.find(x=>x.id===id);if(!player)throw Error('Player is no longer in this roster.');return player;};
 function select(player:Player){Object.assign(v,{playerName:player.name,playerNumber:player.number,playerPhoto:player.photo,playerPosition:player.position});for(const key of ['goals','assists','kills','deaths','points','rebounds','fouls'])v['player'+key[0].toUpperCase()+key.slice(1)]=player.stats?.[key as keyof NonNullable<Player['stats']>]||0;}
 if(op.op==='score'){if(v.matchPhase==='Final')throw Error('Reopen the match phase before correcting a final score.');if(s.kind!=='basketball'&&Math.abs(op.delta)>1)throw Error('This sport scores one point at a time.');const key=op.team+'Score';if(typeof v[key]!=='number')throw Error('Score must be a number.');v[key]=Math.max(0,Math.min(9999,Number(v[key])+op.delta));label=op.team+' score '+(op.delta>0?'+':'')+op.delta;}
 if(op.op==='phase')v.matchPhase=op.value;
 if(op.op==='period')v.period=op.value;
 if(op.op==='select-player')select(person(op.playerId));
 if(op.op==='stat'){const player=person(op.playerId);player.stats={...player.stats,[op.stat]:Math.max(0,Math.min(9999,(player.stats?.[op.stat]||0)+op.delta))};select(player);label=player.name+' '+op.stat+' '+op.delta;}
 if(op.op==='card'){const player=person(op.playerId);player.card=op.card;select(player);v.eventLabel=op.card?op.card.toUpperCase()+' CARD':'CARD CLEARED';label=player.name+' '+v.eventLabel;}
 if(op.op==='substitute'){const out=person(op.out),incoming=person(op.incoming);if(out.id===incoming.id||out.team!==incoming.team||out.bench||!incoming.bench||incoming.card==='red')throw Error('Choose an active player and an eligible substitute from the same team.');const slot=out.slot;out.bench=true;out.slot=incoming.slot;incoming.bench=false;incoming.slot=slot;incoming.position=out.position;select(incoming);v.eventLabel='#'+out.number+' OFF · #'+incoming.number+' ON';label=String(v.eventLabel);}
 if(op.op==='draft'){if(s.kind!=='esports'||!s.mapPool.includes(op.map)||s.draft.some(d=>d.map===op.map))throw Error('Choose an available map from the esports pool.');s.draft.push({team:op.team,map:op.map,choice:op.choice});if(op.choice==='pick')v.currentMap=op.map;label=op.team+' '+op.choice+' '+op.map;}
 if(op.op==='undo-draft'){if(!s.draft.length)throw Error('No draft entry to undo.');const removed=s.draft.pop()!;if(v.currentMap===removed.map)v.currentMap=s.draft.filter(d=>d.choice==='pick').at(-1)?.map||'';}
 if(op.op==='swap-sides'){[v.homeSide,v.awaySide]=[v.awaySide,v.homeSide];}
 if(op.op==='map'){if(s.kind!=='esports'||!s.mapPool.includes(op.map)||s.draft.some(d=>d.map===op.map&&d.choice==='ban')||s.results.some(r=>r.name===op.map))throw Error('Choose an unplayed, unbanned map.');v.currentMap=op.map;}
 if(op.op==='finish-game'){
  if(!['volleyball','esports'].includes(s.kind))throw Error('Set/map completion is for volleyball and esports.');
  const h=Number(v.homeScore),a=Number(v.awayScore),needed=Math.floor(s.bestOf/2)+1;
  if(v.matchPhase==='Final'||Number(v.homeSeries)>=needed||Number(v.awaySeries)>=needed)throw Error('The series is already complete.');
  if(!Number.isInteger(h)||!Number.isInteger(a)||h===a)throw Error('The game needs an unequal integer score.');
  const target=s.results.length===4?15:25;if(s.kind==='volleyball'&&(Math.max(h,a)<target||Math.abs(h-a)<2))throw Error('A volleyball set needs '+target+' points and a two-point lead.');
  const name=s.kind==='volleyball'?'Set '+(s.results.length+1):String(v.currentMap||'');
  if(s.kind==='esports'&&(!s.mapPool.includes(name)||s.results.some(r=>r.name===name)||s.draft.some(d=>d.map===name&&d.choice==='ban')))throw Error('Choose an unplayed, unbanned map before completing it.');
  const winner=h>a?'home':'away';s.results.push({name,home:h,away:a,winner});v[winner+'Series']=s.results.filter(r=>r.winner===winner).length;
  const final=Number(v[winner+'Series'])>=needed;v.matchPhase=final?'Final':'Break';v.matchWinner=final?String(v[winner+'Team']):'';
  if(!final){v.homeScore=0;v.awayScore=0;v.period=String(s.results.length+1);if(s.kind==='esports')v.currentMap='';}label=name+' completed · '+winner;
 }
 if(op.op==='undo-game'){const result=s.results.pop();if(!result)throw Error('No completed game to correct.');Object.assign(v,{homeScore:result.home,awayScore:result.away,homeSeries:s.results.filter(r=>r.winner==='home').length,awaySeries:s.results.filter(r=>r.winner==='away').length,period:String(s.results.length+1),matchPhase:'Break',matchWinner:''});if(s.kind==='esports')v.currentMap=result.name;}
 if(op.op==='roster'){const players=mappedRoster(op.rows,op.team,op.mapping,s.kind);p.players=[...p.players.filter(x=>x.team!==op.team),...players];label=op.team+' roster imported · '+players.length;}
 if(op.op==='fetch-roster')throw Error('Fetch the roster through the local data service.');
 s.events=[{id:eventId,label,time},...s.events].slice(0,100);return p;
}
