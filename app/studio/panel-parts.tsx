'use client';
import {controlActions} from '@/lib/creative-tools';
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {partChoices,resolvePlayer,playerVariables,type PartKind} from '@/lib/panel-parts';
import {artPreset} from '@/lib/button-art';
import type {Control,Panel,Player,Project} from '@/lib/studio-model';
import {ActionButton} from './advanced-controls';
import {Choice,Num} from './controls';
import {VariableSelect} from './variable-select';

export function PartsPalette({onAdd,onFootball}:{onAdd:(kind:PartKind,team:'home'|'away')=>void;onFootball:()=>void}){
 const [team,setTeam]=useState<'home'|'away'>('home');
 return <div className="panel-parts-palette"><div className="panel-heading">BUILD FROM INDIVIDUAL PARTS</div><p>Every part is independent. Design a button from shapes, text and images, then give it actions.</p><label>Team for new parts<select aria-label="Team for new parts" value={team} onChange={e=>setTeam(e.target.value as 'home'|'away')}><option value="home">Home</option><option value="away">Away</option></select></label>{[['Creative parts',0,4],['Pitch & players',4,10],['Match controls',10,20]].map(([name,start,end])=><details key={String(name)} open={start===0}><summary>{name}</summary>{partChoices.slice(Number(start),Number(end)).map(([kind,label])=><Button key={kind} variant="outline" className="widget-button" onClick={()=>onAdd(kind,team)}>+ {label}</Button>)}</details>)}<Button variant="secondary" className="full" onClick={onFootball}>New football panel from parts</Button><p>Creates a separate panel with individually editable pitch markings, player buttons, scores, selectors and clock buttons.</p></div>;
}
export function PlayerSettings({item,project,panel,patch}:{item:Control;project:Project;panel:Panel;patch:(v:Partial<Control>)=>void}){
 const cfg=item.player||{team:'home' as const,source:'slot' as const,slot:1};
 const change=(v:Partial<NonNullable<Control['player']>>)=>patch({player:{...cfg,...v}});
 return <><div className="panel-heading">PLAYER DATA</div><label>Team<Choice label="Player team" value={cfg.team} options={['home','away']} onChange={team=>change({team:team as 'home'|'away',playerId:undefined})}/></label><label>Player source<Choice label="Player source" value={cfg.source} options={[{value:'slot',label:'Formation slot (follows substitutions)'},{value:'bench',label:'Bench position'},{value:'player',label:'Specific roster player'}]} onChange={source=>change({source:source as typeof cfg.source,...(source==='bench'?{fieldId:undefined}:{})})}/></label>{cfg.source==='player'?<label>Roster player<Choice label="Bound roster player" value={cfg.playerId||''} options={[{value:'',label:'Choose a player…'},...project.players.filter(p=>p.team===cfg.team).map(p=>({value:p.id,label:'#'+p.number+' '+p.name}))]} onChange={playerId=>change({playerId})}/></label>:<label>{cfg.source==='bench'?'Bench position':'Formation slot'}<Num label="Player slot" value={cfg.slot} min={1} max={cfg.source==='slot'?11:200} onChange={slot=>change({slot:Math.round(slot)})}/></label>}{cfg.source!=='bench'&&<label>Follow formation inside<Choice label="Player formation field" value={cfg.fieldId||''} options={[{value:'',label:'Free position (drag anywhere)'},...panel.controls.filter(c=>c.kind==='artwork').map(c=>({value:c.id,label:c.label}))]} onChange={fieldId=>change({fieldId:fieldId||undefined})}/></label>}<p className="helper muted">Dragging this button on its own switches it to a free position. Select a pitch background here to follow formations again.</p>{(['Color','Formation'] as const).map(suffix=>{const field=(cfg.team+suffix) as 'homeColor'|'awayColor'|'homeFormation'|'awayFormation';return <label key={field}>{suffix} variable<VariableSelect label={'Player '+suffix+' variable'} variables={project.variables} value={item.dataFields?.[field]||field} onChange={key=>patch({dataFields:{...item.dataFields,[field]:key}})}/></label>;})}</>;
}
export function IndividualPlayer({control:c,project,interactive,chosen,bench,setBench,onPlayer,run,onError}:{control:Control;project:Project;interactive:boolean;chosen:string;bench:string|null;setBench:(id:string|null)=>void;onPlayer:(p:Player)=>void;run:(c:Control,event?:'click'|'press'|'release'|'hold')=>Promise<void>;onError:(e:unknown)=>void}){
 const player=resolvePlayer(c,project),variables=playerVariables(c,project),label=player?'#'+player.number+' '+player.name:c.label;
 if(!player)return <div className="individual-player"><span className="empty-player">Unassigned player</span></div>;
 const choose=async(control:Control,event:'click'|'press'|'release'|'hold'='click')=>{if(event==='click'){if(player.bench){setBench(bench===player.id?null:player.id);return;}onPlayer(player);if(bench)return;}if(controlActions(control,event).length)await run(control,event);};
 return <div className={'individual-player '+(chosen===player.id||bench===player.id?'chosen':'')} data-player={!player.bench?player.id:undefined} data-sub={player.bench?player.id:undefined}>
  <ActionButton control={{...c,label,artwork:c.artwork||artPreset('shirt','{{player.number}}','{{player.color}}')}} project={{...project,variables}} disabled={!interactive} preview={!interactive} run={choose} onError={onError} onEmptyClick={()=>choose(c).catch(onError)}/>
 </div>;
}
