import {parseSportOperation} from './sports-logic.ts';
import type {Action,ActionCondition,Project} from './studio-model.ts';
export function checkCondition(when:ActionCondition,variables:Project['variables']):void{
 for(const rule of when.rules){if(!Object.hasOwn(variables,rule.variable))throw Error('Condition variable is missing: '+(rule.variable||'(choose a variable)'));const current=variables[rule.variable];if(['truthy','falsy'].includes(rule.operator))continue;if(rule.value===undefined||typeof current!==typeof rule.value)throw Error('Condition value must match the type of '+rule.variable+'.');if(['gt','gte','lt','lte'].includes(rule.operator)&&typeof current!=='number')throw Error('Ordered comparisons require a number: '+rule.variable);}
}
export function conditionMatches(action:Action,variables:Project['variables']):boolean{
 if(action.when){checkCondition(action.when,variables);const results=action.when.rules.map(r=>{const v=variables[r.variable],other=r.value;switch(r.operator){case'eq':return v===other;case'neq':return v!==other;case'gt':return(v as number)>(other as number);case'gte':return(v as number)>=(other as number);case'lt':return(v as number)<(other as number);case'lte':return(v as number)<=(other as number);case'truthy':return !!v;case'falsy':return !v;}});return action.when.mode==='all'?results.every(Boolean):results.some(Boolean);}
 if(!action.condition.trim())return true;const[key,...parts]=action.condition.split('=');if(!Object.hasOwn(variables,key.trim()))throw Error('Condition variable is missing: '+key.trim());return parts.length?String(variables[key.trim()])===parts.join('=').trim():!!variables[key.trim()];
}
export type PlannedAction={action:Action;path:string;end:number;guards?:{index:number;value:boolean}[]};
export function planActions(project:Project,actions:Action[]):PlannedAction[]{
 const result:PlannedAction[]=[];
 function visit(items:Action[],stack:string[],path:string,guards:{index:number;value:boolean}[]=[]){for(const a of items){if(result.length>=200)throw Error('A run supports at most 200 expanded steps.');if(a.when)checkCondition(a.when,project.variables);else if(a.condition.trim()&&!Object.hasOwn(project.variables,a.condition.split('=')[0].trim()))throw Error('Condition variable is missing.');
  if(a.type==='sport')parseSportOperation(JSON.parse(a.value));
  if(a.type==='clock'){const options=JSON.parse(a.value);if(!['start','pause','reset','adjust'].includes(options.op))throw Error('Choose a clock operation.');}
  if(['set','increment','counter','clock'].includes(a.type)){if(!Object.hasOwn(project.variables,a.target))throw Error('Action refers to a missing variable: '+(a.target||'(choose a variable)'));if(a.type==='increment'&&typeof project.variables[a.target]!=='number')throw Error('Increment requires a numeric variable.');}
  if(a.type==='preview'&&!project.scenes.some(s=>s.id===a.target))throw Error('Action refers to a missing graphic.');
  if(a.type==='fetch'&&!project.sources.some(s=>s.id===a.target&&s.url))throw Error('Action API source is missing or has no endpoint.');
  for(const m of a.value.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g))if(!Object.hasOwn(project.variables,m[1]))throw Error('Action template variable is missing: '+m[1]);
  if(a.type==='cue'&&!project.scenes.some(s=>s.id===a.target&&s.cues?.some(c=>c.id===a.value)))throw Error('Choose an existing animation cue.');
  const index=result.length,step:PlannedAction={action:a,path,end:index+1,...(guards.length?{guards}:{})};result.push(step);
  const expand=(id:string,branchGuards=guards)=>{const macro=project.macros?.find(m=>m.id===id);if(!macro)throw Error('Choose an existing macro.');if(stack.includes(macro.id))throw Error('Macro calls form a cycle: '+macro.name);if(stack.length>=8)throw Error('Macros may nest at most 8 levels.');visit(macro.actions,[...stack,macro.id],path?path+' / '+macro.name:macro.name,branchGuards);};
  if(a.type==='macro'){expand(a.target);step.end=result.length;}
  if(a.type==='branch'){if(!a.when)throw Error('An IF / ELSE action requires a condition.');expand(a.target,[...guards,{index,value:true}]);if(a.elseTarget)expand(a.elseTarget,[...guards,{index,value:false}]);step.end=result.length;}
 }}
 visit(actions,[],'');return result;
}
