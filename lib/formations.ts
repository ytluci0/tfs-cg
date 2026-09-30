import type {Project} from './studio-model';

export type FormationPoint={x:number;y:number;role:string};
export type Formation={id:string;name:string;points:FormationPoint[]};
export const formationNames=['4-3-3','4-4-2','4-2-3-1','3-5-2','3-4-3','5-3-2','5-4-1','4-1-4-1','4-4-1-1','4-2-2-2','3-4-2-1','4-3-2-1'];
export function generateFormation(value:string):FormationPoint[]{
 const normalized=value.trim();
 if(!/^\d(?:-\d){1,4}$/.test(normalized))throw Error('Enter a formation such as 4-2-3-1. The lines must total 10 outfield players.');
 const lines=normalized.split('-').map(Number);
 if(lines.some(n=>n<1||n>5)||lines.reduce((a,b)=>a+b,0)!==10)throw Error('Formation lines must contain 1–5 players each and total 10, plus the goalkeeper.');
 const points:FormationPoint[]=[{x:7,y:50,role:'GK'}];
 lines.forEach((count,line)=>{for(let n=0;n<count;n++)points.push({x:19+line*25/(lines.length-1),y:count===1?50:12+n*76/(count-1),role:line===0?'DEF':line===lines.length-1?'FWD':'MID'});});
 return points;
}
export function formationPoints(project:Pick<Project,'formations'>,name:string):FormationPoint[]{
 const saved=project.formations?.find(f=>f.name===name||f.id===name);
 if(saved)return saved.points;
 try{return generateFormation(name);}catch{return generateFormation('4-3-3');}
}
export function formationOptions(project:Pick<Project,'formations'>,current?:string):string[]{
 return [...new Set([...formationNames,...(project.formations||[]).map(f=>f.name),...(current?[current]:[])])];
}
export function formationVariableKeys(project:Project):Set<string>{
 const keys=new Set(['homeFormation','awayFormation']);
 for(const panel of project.panels)for(const c of panel.controls){if(c.kind==='formation'&&c.variable)keys.add(c.variable);for(const field of ['homeFormation','awayFormation'] as const)if(c.dataFields?.[field])keys.add(c.dataFields[field]);}
 return keys;
}
