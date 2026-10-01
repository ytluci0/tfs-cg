import type {Project,Scene} from './studio-model';
export type CommandStep={index:number;type:string;target:string;path:string;status:string;message?:string;startedAt?:number;finishedAt?:number};
export type CommandRun={id:string;projectId:string;label:string;username:string;userId:string;sessionId:string;workstation:string;status:string;createdAt:number;updatedAt:number;finishedAt?:number;waitUntil?:number;currentStep:number;completedSteps:number;error?:string;steps:CommandStep[];staged?:{scene:Scene;variables:Project['variables']};leaseId:string};
export type CommandState={active:CommandRun|null;history:CommandRun[];ownership:{commandId:string;username:string;workstation:string;sessionId:string;leaseId:string}|null};
export const commandActive=(job:CommandRun)=>['running','waiting','cancelling'].includes(job.status);
