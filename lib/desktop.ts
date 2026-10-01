import type {AeDraft,AeOptions} from './ae-model';
import type {PsdDraft,PsdOptions} from './psd-model';
import type {Project,Program} from './studio-model';
export type DesktopStatus={local:boolean;database:string;output:string;outputUnconfirmed:boolean;authentication:string;network:string;serverName?:string;serverUrl?:string;engineAttached?:boolean;clients?:number;engine?:{username:string;workstation:string}|null};
export type ServerProfile={id?:string;name:string;url:string;fingerprint:string};
export type WorkspaceLease={projectId:string;required:boolean;mine:boolean;owner:{sessionId:string;username:string;workstation:string;expiresAt:number}|null;requests:{username:string;workstation:string;time:number}[]};
export type NetworkState={status:DesktopStatus;error?:string;epoch?:string;projects?:{id:string;name:string;revision:number;updated_at:number}[];locks?:WorkspaceLease[];program?:Program|null};
export type ConnectionInfo={profiles:ServerProfile[];activeId:string|null;backupId:string|null;status:DesktopStatus;host:null|{name:string;host:string;port:number;fingerprint:string;directory:string;running:boolean;mode:string}};
export type DesktopSettings={workstation:string;role:string;location:string;uiScale:number;startup:boolean;displays:{id:number;label:string;width:number;height:number;scaleFactor:number}[]};
export type DesktopBridge={
 network:<T=unknown>(action:string,data?:unknown)=>Promise<T>;
 onNetwork:(listener:(state:NetworkState)=>void)=>()=>void;
 prepareAe:()=>Promise<AeDraft|null>;
 commitAe:(options:AeOptions)=>Promise<{project:Project;revision:number;sceneId:string}>;
 cancelAe:()=>Promise<boolean>;
 aeReference:(options:{id:string;time:number})=>Promise<AeDraft|null>;
 saveAeExporter:()=>Promise<boolean>;
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
