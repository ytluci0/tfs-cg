'use client';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from '@/components/ui/select';
import type {Project} from '@/lib/studio-model';

export function VariableSelect({variables,value,onChange,numericOnly=false,label='Variable'}:{variables:Project['variables'];value:string;onChange:(value:string)=>void;numericOnly?:boolean;label?:string}){
 const entries=Object.entries(variables).filter(([key,v])=>key.length>0&&(!numericOnly||typeof v==='number'&&Number.isFinite(v))).sort(([a],[b])=>a.localeCompare(b));
 const exists=Object.hasOwn(variables,value),valid=entries.some(([key])=>key===value);
 return <div className="variable-picker">
  <Select value={value} onValueChange={onChange}>
   <SelectTrigger aria-label={label} aria-invalid={!!value&&!valid}>
    <SelectValue placeholder="Choose from Data">{value?<span className="variable-picked">{value}{!valid&&(exists?' · not numeric':' · missing in Data')}</span>:undefined}</SelectValue>
   </SelectTrigger>
   <SelectContent position="popper">
    {entries.map(([key,v])=><SelectItem key={key} value={key} textValue={key}><span className="variable-option"><span>{key}</span><small>{typeof v==='number'?'Number':typeof v==='boolean'?'Boolean':'Text'} · {String(v)===''?'(empty)':String(v).slice(0,40)}</small></span></SelectItem>)}
    {!entries.length&&<p className="variable-empty">{numericOnly?'No numeric variables.':'No variables yet.'} Add one in Data.</p>}
   </SelectContent>
  </Select>
  {value&&!valid?<small className="error">{exists?'Choose a numeric variable for this action.':'Create this variable in Data, or choose an existing one.'}</small>:<small className="muted">{numericOnly?'Number variables from Data → Shared variables.':'From Data → Shared variables.'}</small>}
 </div>;
}
