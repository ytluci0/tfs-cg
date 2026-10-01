import type {Control,Project} from './studio-model.ts';
import {controlAvailable,controlCondition} from './creative-tools.ts';
export type HardwareInput={kind:'key'|'midi'|'gamepad';code:number;channel?:number;device?:string};
export function hardwareMatch(c:Control,input:HardwareInput){const h=c.hardware;return !!h&&h.kind===input.kind&&h.code===input.code&&(h.kind!=='midi'||(h.channel??0)===(input.channel??0))&&(!h.device||h.device===input.device);}
export function hardwareTarget(controls:Control[],input:HardwareInput,variables:Project['variables']){const matches=controls.filter(c=>hardwareMatch(c,input));if(matches.length>1)throw Error('Hardware mapping is ambiguous. Assign each input to one control in this panel.');const c=matches[0];return c&&controlAvailable(c,variables)&&c.actions.length?c:undefined;}
export function midiInput(data:readonly number[]):HardwareInput|null{if(data.length<3||(data[0]&0xf0)!==0x90||!data[2]||data[1]>127)return null;return {kind:'midi',channel:data[0]&15,code:data[1]};}
export function midiFeedback(c:Control,variables:Project['variables']):number[]{return [0x90+(c.hardware?.channel??0),c.hardware?.code??0,!controlAvailable(c,variables)?0:c.liveWhen&&controlCondition(c.liveWhen,variables)?127:32];}
