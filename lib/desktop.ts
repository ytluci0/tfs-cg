import type {PsdDraft,PsdOptions} from './psd-model';
import type {Project,Program} from './studio-model';
export type DesktopStatus={local:boolean;database:string;output:string;outputUnconfirmed:boolean;authentication:string;network:string};
export type DesktopSettings={workstation:string;role:string;location:string;uiScale:number;startup:boolean;displays:{id:number;label:string;width:number;height:number;scaleFactor:number}[]};
export type DesktopBridge={
 preparePsd:()=>Promise<PsdDraft|null>;
 commitPsd:(options:PsdOptions)=>Promise<{project:Project;revision:number;sceneId:string}>;
 cancelPsd:()=>Promise<boolean>;
 auth:<T=unknown>(action:string,data?:unknown)=>Promise<T>;
 info:()=>Promise<DesktopStatus&{name:string;version:string;dataDirectory:string;phase:string}>;
 status:()=>Promise<DesktopStatus>;
 settings:()=>Promise<DesktopSettings>;
 saveSettings:(value:DesktopSettings)=>Promise<DesktopSettings>;
 openOutput:(displayId?:number)=>Promise<boolean>;
 importProject:()=>Promise<Project|null>;
 exportProject:(project:Project)=>Promise<boolean>;
 exportDiagnostics:()=>Promise<boolean>;
 acknowledgeProgram:(revision:string)=>void;
 onProgram:(listener:(program:Program)=>void)=>()=>void;
};
declare global{interface Window{broadcastCG?:DesktopBridge}}
export function desktopBridge(){return typeof window==='undefined'?undefined:window.broadcastCG;}
