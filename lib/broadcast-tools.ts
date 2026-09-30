import type {Control,Project} from './studio-model';

export const controlKinds=[{value:'button',label:'Action button'},{value:'counter',label:'Counter + / −'},{value:'text',label:'Text input'},{value:'number',label:'Number input'},{value:'select',label:'Dropdown'},{value:'segmented',label:'Choice buttons'},{value:'formation',label:'Formation selector'},{value:'color',label:'Color picker'},{value:'slider',label:'Slider'},{value:'toggle',label:'Toggle'},{value:'timer',label:'Clock / countdown'},{value:'pitch',label:'Football pitch'},{value:'bench',label:'Bench'},{value:'scoreboard',label:'Scoreboard'},{value:'label',label:'Text label'},{value:'image',label:'Image'}];
export function boundedNumber(control:Pick<Control,'minimum'|'maximum'>,value:number):number{
 if(!Number.isFinite(value))throw Error('Enter a finite number.');
 return Math.round(Math.max(control.minimum??0,Math.min(control.maximum??999999,value))*1000000)/1000000;
}
export function counterValue(c:Control,variables:Project['variables'],delta:number):number{
 if(!c.variable||typeof variables[c.variable]!=='number')throw Error('Connect this control to a numeric variable in the inspector.');
 return boundedNumber(c,(variables[c.variable] as number)+delta);
}
export function clockSeconds(value:unknown):number{
 if(typeof value==='number')return Math.max(0,Math.floor(value));
 if(typeof value==='string'&&/^\d+(?::[0-5]\d){1,2}$/.test(value))return value.split(':').reduce((a,b)=>a*60+Number(b),0);
 return Math.max(0,Math.floor(Number(value)||0));
}
export function clockText(seconds:number):string{const value=Math.max(0,Math.floor(seconds));return String(Math.floor(value/60)).padStart(2,'0')+':'+String(value%60).padStart(2,'0');}
export function clockAt(base:number,startedAt:number,now:number,direction:'up'|'down'):{seconds:number;finished:boolean}{
 const elapsed=Math.max(0,Math.floor((now-startedAt)/1000)),seconds=direction==='down'?Math.max(0,base-elapsed):base+elapsed;
 return {seconds,finished:direction==='down'&&seconds===0};
}
export function optionsList(value:string):string[]{return [...new Set(value.split(/[\n,]/).map(v=>v.trim()).filter(Boolean))];}
