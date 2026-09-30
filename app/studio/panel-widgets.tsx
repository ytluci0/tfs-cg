'use client';
import {useRef} from 'react';
import {ImageIcon,Plus,Trash2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Control,Player,Project,safeImage,textValue,uid} from '@/lib/studio-model';
import {Choice,Num} from './controls';import {formationOptions,formationPoints} from '@/lib/formations';

export const visualKinds=['pitch','bench','scoreboard','label','image'];
export const widgetFields=['homeTeam','awayTeam','homeScore','awayScore','matchClock','homeFormation','awayFormation','homeColor','awayColor'] as const;
export function PanelWidget({control:c,project,interactive,chosenPlayer,bench,setBench,onPlayer,onSub,onError,setVar,toggleClock,clockRunning}:{control:Control;project:Project;interactive:boolean;chosenPlayer:string;bench:string|null;setBench:(id:string|null)=>void;onPlayer:(p:Player)=>void;onSub:(out:Player,sub:Player)=>void;onError:(e:unknown)=>void;setVar:(key:string,value:string|number|boolean)=>void;toggleClock:(key:string)=>void;clockRunning:boolean}){
 const drag=useRef<{id:string;x:number;y:number;active:boolean}|null>(null),suppressClick=useRef(false);
 const key=(field:typeof widgetFields[number])=>c.dataFields?.[field]||field;
 const value=(field:typeof widgetFields[number],fallback:string|number)=>project.variables[key(field)]??fallback;
 const teamColor=(team:string)=>{const field=team==='home'?'homeColor':'awayColor',bound=c.dataFields?.[field],v=bound?project.variables[bound]:c[field]||project.variables[field];return typeof v==='string'&&/^#[a-f0-9]{6}$/i.test(v)?v:team==='home'?'#3478ee':'#df3b48';};
 const positions=(team:'home'|'away')=>formationPoints(project,String(value(team==='home'?'homeFormation':'awayFormation','4-3-3')));
 function changeScore(team:'home'|'away',delta:number){const field=team==='home'?'homeScore':'awayScore',current=value(field,0);if(typeof current!=='number'){onError(Error('Connect the scoreboard to numeric score variables.'));return;}setVar(key(field),Math.max(0,current+delta));}
 if(c.kind==='label')return <div className="panel-label-widget" style={{color:c.color,fontSize:c.fontSize||24}}>{textValue(c.label,project.variables)}</div>;
 if(c.kind==='image'){
  const src=textValue(c.imageSrc||'',project.variables);
  return <div className="panel-image-widget">{safeImage(src)?<img src={src} alt={textValue(c.label,project.variables)} style={{objectFit:c.imageFit||'contain'}} draggable={false}/>:<span><ImageIcon/>Choose an image URL in the inspector</span>}</div>;
 }
 if(c.kind==='scoreboard')return <div className="panel-score-widget">
  {(['home','away'] as const).map(team=><div className={'widget-team '+team} key={team} style={{color:teamColor(team)}}><strong>{String(value(team==='home'?'homeTeam':'awayTeam',team.toUpperCase()))}</strong>{c.showFormations!==false&&(interactive?<Choice label={team+' formation'} value={String(value(team==='home'?'homeFormation':'awayFormation','4-3-3'))} options={formationOptions(project,String(value(team==='home'?'homeFormation':'awayFormation','4-3-3')))} onChange={v=>setVar(key(team==='home'?'homeFormation':'awayFormation'),v)}/>:<small>{String(value(team==='home'?'homeFormation':'awayFormation','4-3-3'))}</small>)}{c.showScoreButtons!==false&&<div className="score-adjust"><button disabled={!interactive||Number(value(team==='home'?'homeScore':'awayScore',0))<=0} aria-label={'Decrease '+team+' score'} onClick={()=>changeScore(team,-1)}>−</button><button disabled={!interactive} aria-label={'Increase '+team+' score'} onClick={()=>changeScore(team,1)}>+</button></div>}</div>)}
  <div className="widget-score"><strong>{String(value('homeScore',0))} : {String(value('awayScore',0))}</strong>{interactive?<Button size="sm" variant="ghost" onClick={()=>toggleClock(key('matchClock'))}>{String(value('matchClock','00:00'))} · {clockRunning?'Pause':'Start'}</Button>:<small>{String(value('matchClock','00:00'))}</small>}</div>
 </div>;
 if(c.kind==='pitch')return <div className={'pitch widget-pitch '+(c.orientation==='vertical'?'vertical':'')} style={{backgroundColor:c.color,backgroundImage:'repeating-linear-gradient(90deg,transparent 0%,transparent 10%,#ffffff09 10%,#ffffff09 20%)'}}>
  <div className="pitch-edge"/><div className="pitch-half"/><div className="pitch-circle"/><div className="pitch-box left"/><div className="pitch-box right"/><div className="players">{project.players.filter(p=>!p.bench).map(p=>{
   const pos=positions(p.team)[Math.max(0,Math.min(10,p.slot-1))],x=p.team==='home'?pos.x:100-pos.x,y=pos.y;
   const content=<><span className="shirt" style={{background:teamColor(p.team)}}>{p.number}</span><small>{project.formations?.some(f=>f.name===String(value(p.team==='home'?'homeFormation':'awayFormation',''))||f.id===String(value(p.team==='home'?'homeFormation':'awayFormation','')))?pos.role:p.position}</small>{p.card&&<i className={'card-mark '+p.card}/>}</>;
   const style={left:(c.orientation==='vertical'?y:x)+'%',top:(c.orientation==='vertical'?x:y)+'%'};
   return interactive?<button key={p.id} type="button" data-player={p.id} className={'player '+p.team+(chosenPlayer===p.id?' chosen':'')} style={style} aria-label={p.name+' number '+p.number} onClick={()=>onPlayer(p)}>{content}</button>:<span key={p.id} className={'player '+p.team} style={style}>{content}</span>;
  })}</div>
 </div>;
 return <div className="panel-bench-widget" onPointerDown={e=>{if(!interactive)return;const el=(e.target as HTMLElement).closest('[data-sub]') as HTMLElement;if(el){suppressClick.current=false;drag.current={id:el.dataset.sub!,x:e.clientX,y:e.clientY,active:false};}}} onPointerMove={e=>{const d=drag.current;if(d&&Math.hypot(e.clientX-d.x,e.clientY-d.y)>7){d.active=true;e.currentTarget.setPointerCapture(e.pointerId);e.preventDefault();}}} onPointerUp={e=>{const d=drag.current;drag.current=null;if(!d?.active)return;suppressClick.current=true;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);const el=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-player]') as HTMLElement;const out=project.players.find(p=>p.id===el?.dataset.player),sub=project.players.find(p=>p.id===d.id);if(out&&sub){if(out.team===sub.team)onSub(out,sub);else onError(Error('Choose a substitute from the same team.'));}setBench(null);}} onPointerCancel={()=>{drag.current=null;}}>
  {(['home','away'] as const).map(team=><div key={team}><small>{String(value(team==='home'?'homeTeam':'awayTeam',team.toUpperCase()))} BENCH</small><div className="widget-bench-players">{project.players.filter(p=>p.team===team&&p.bench).map(p=>interactive?<button key={p.id} type="button" data-sub={p.id} style={{background:teamColor(team)}} className={bench===p.id?'chosen':''} aria-label={p.name+' substitute '+p.number} onClick={()=>{if(suppressClick.current){suppressClick.current=false;return;}setBench(bench===p.id?null:p.id);}}>{p.number}</button>:<span key={p.id} style={{background:teamColor(team)}}>{p.number}</span>)}</div></div>)}
  <small className="bench-instruction">{bench?'Select a field player to substitute':'Select or drag a substitute onto the pitch'}</small>
 </div>;
}

export function RosterEditor({project,change,selected,onSelect}:{project:Project;change:(fn:(p:Project)=>Project)=>void;selected:string;onSelect:(id:string)=>void}){
 const person=project.players.find(p=>p.id===selected)||project.players[0];
 function patch(v:Partial<Player>){if(!person)return;change(p=>({...p,players:p.players.map(player=>player.id===person.id?{...player,...v}:player)}));}
 return <details className="roster-editor"><summary>EDIT PLAYER ROSTER · {project.players.length}</summary><p className="helper muted">Pitch and bench components share this roster. In Operate, selecting a player fills playerName, playerNumber, playerPhoto and playerPosition.</p>
  <Choice label="Roster player" value={person?.id||''} options={project.players.map(p=>({value:p.id,label:p.team+' · #'+p.number+' '+p.name}))} onChange={onSelect}/>
  {person&&<><label>Player name<Input value={person.name} onChange={e=>patch({name:e.target.value})}/></label><div className="property-grid"><label>Shirt number<Num label="Shirt number" value={person.number} min={0} max={999} onChange={number=>patch({number:Math.round(number)})}/></label><label>Position<Input value={person.position} onChange={e=>patch({position:e.target.value})}/></label></div><label>Team<Choice value={person.team} options={['home','away']} onChange={team=>patch({team:team as Player['team']})}/></label><label>Placement<Choice value={person.bench?'bench':'field'} options={[{value:'field',label:'On field'},{value:'bench',label:'Bench'}]} onChange={v=>patch({bench:v==='bench'})}/></label>{!person.bench&&<label>Formation slot<Num value={person.slot} min={1} max={11} onChange={slot=>patch({slot:Math.round(slot)})}/></label>}<label>Player photo URL<Input value={person.photo} onChange={e=>patch({photo:e.target.value})}/></label></>}
  <div className="row wrap"><Button size="sm" variant="secondary" disabled={project.players.length>=200} onClick={()=>{const p:Player={id:uid(),team:person?.team||'home',number:1,name:'New player',position:'SUB',photo:'',bench:true,slot:1,card:''};change(v=>({...v,players:[...v.players,p]}));onSelect(p.id);}}><Plus/>Player</Button>{person&&<Button variant="ghost" size="icon" aria-label="Remove roster player" onClick={()=>change(p=>({...p,players:p.players.filter(v=>v.id!==person.id)}))}><Trash2/></Button>}</div>
 </details>;
}
