import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultProject,control,validateProject} from '../lib/studio-model.ts';
import {appendPanelControl,arrangePanel,clampControlBounds,resizePanel} from '../lib/panel-layout.ts';

test('legacy panels can become free canvases and positions survive project serialization',()=>{
 const project=defaultProject();
 assert.equal(validateProject(project).panels[0].freeLayout,undefined);
 const panel=arrangePanel(project.panels[0]);
 panel.controls[0].placement={x:100,y:200,width:250,height:120};
 project.panels[0]=panel;
 const restored=validateProject(JSON.parse(JSON.stringify(project)));
 assert.deepEqual(restored.panels[0].controls[0].placement,panel.controls[0].placement);
 assert.equal(restored.panels[0].freeLayout,true);
 assert.notEqual(panel.controls[1].placement.x,panel.controls[2].placement.x);
});
test('shrinking a canvas keeps controls visible and usable',()=>{
 const panel=arrangePanel(defaultProject().panels[0]);
 panel.controls[0].placement={x:800,y:400,width:150,height:100};
 const resized=resizePanel(panel,{width:320,height:160});
 assert.deepEqual(resized.controls[0].placement,{x:170,y:60,width:150,height:100});
 assert.deepEqual(clampControlBounds({x:-10,y:999,width:1,height:1},{width:320,height:160}),{x:0,y:96,width:80,height:64});
});
test('new or duplicated controls get a vacant location without overwriting existing placement',()=>{
 const panel=arrangePanel(defaultProject().panels[0]);
 const next=appendPanelControl(panel,control('New button',[]));
 const b=next.controls.at(-1).placement;
 for(const c of panel.controls){const a=c.placement;assert.ok(b.x>=a.x+a.width||b.x+b.width<=a.x||b.y>=a.y+a.height||b.y+b.height<=a.y);}
 assert.deepEqual(next.controls[0].placement,panel.controls[0].placement);
});
