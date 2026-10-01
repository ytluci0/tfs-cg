export const permissionLabels = {
 'projects.view':'View assigned workspaces', 'projects.create':'Create workspaces', 'projects.edit':'Rename workspaces',
 'graphics.create':'Create graphics', 'graphics.edit':'Edit graphics and animation', 'graphics.delete':'Delete graphics',
 'graphics.take':'TAKE graphics', 'graphics.updateLive':'Update live graphics', 'graphics.clear':'Hide / clear output',
 'panels.create':'Create panels', 'panels.edit':'Edit panels and formations', 'panels.delete':'Delete panels', 'panels.operate':'Operate controls and exposed data',
 'templates.import':'Import projects / templates', 'templates.export':'Export projects / templates', 'templates.publish':'Approve template publication (reserved)',
 'data.configure':'Configure data sources, bindings and variables', 'data.fetch':'Refresh configured data feeds',
 'users.manage':'Manage users, grants and sessions', 'outputs.view':'Open / monitor desktop output', 'outputs.configure':'Configure output displays',
 'integrations.configure':'Configure integration credentials', 'system.configure':'Configure workstation settings', 'audit.view':'View production audit log', 'diagnostics.view':'Export system diagnostics',
} as const;
export type Permission=keyof typeof permissionLabels;
export type Role=string;
export const rolePermissions:Record<string,Permission[]>={
 ADMIN:Object.keys(permissionLabels) as Permission[],
 DESIGNER:['projects.view','projects.create','projects.edit','graphics.create','graphics.edit','graphics.delete','panels.create','panels.edit','panels.delete','panels.operate','templates.import','templates.export','data.configure','data.fetch','outputs.view'],
 OPERATOR:['projects.view','panels.operate','graphics.take','graphics.updateLive','graphics.clear','data.fetch','outputs.view'],
 ENGINEER:['projects.view','data.configure','data.fetch','outputs.view','outputs.configure','integrations.configure','system.configure','audit.view','diagnostics.view'],
 VIEWER:['projects.view','outputs.view'],
};
export type LocalUser={id:string;username:string;displayName:string;role:string;enabled:boolean;allWorkspaces:boolean;workspaceIds:string[];extraPermissions:Permission[];deniedPermissions:Permission[];permissions:Permission[];mustChangePassword:boolean;lastLogin:number|null};
export type LocalSession={user:LocalUser;sessionId:string;expiresAt:number;idleExpiresAt:number};
