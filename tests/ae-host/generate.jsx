#target aftereffects
/* Real-AE qualification fixture. Run only in an empty AE project.
 * The preparation script replaces the two path markers in a generated copy.
 * This file is test infrastructure, not part of the installed application.
 */
(function () {
    var NativeFile = File, outputDirectory = new Folder(__OUTPUT_DIRECTORY__), exporterFile = new NativeFile(__EXPORTER_FILE__);
    var report = {application:'Adobe After Effects',version:String(app.version),complete:false,cases:[],messages:[]};
    function json(v) {
        if (v === null) return 'null';
        if (typeof v === 'number' || typeof v === 'boolean') return String(v);
        if (typeof v === 'string') return '"'+v.replace(/["\\\u0000-\u001f]/g,function(c){if(c==='"'||c==='\\')return '\\'+c;return '\\u'+('0000'+c.charCodeAt(0).toString(16)).slice(-4);})+'"';
        var entries=[],i,k;if(v instanceof Array){for(i=0;i<v.length;i++)entries.push(json(v[i]));return '['+entries.join(',')+']';}
        for(k in v)if(v.hasOwnProperty(k))entries.push(json(k)+':'+json(v[k]));return '{'+entries.join(',')+'}';
    }
    function write(name,text){var f=new NativeFile(outputDirectory.fsName+'/'+name);f.encoding='UTF-8';if(!f.open('w'))throw Error('AE cannot write the QA report.');try{if(!f.write(text))throw Error('QA report write failed.');}finally{f.close();}}
    function tr(layer,name){return layer.property('ADBE Transform Group').property(name);}
    function solid(comp,name,color,width,height,position){var l=comp.layers.addSolid(color,name,width,height,1,3);tr(l,'ADBE Position').setValue(position);return l;}
    function composition(name){var c=app.project.items.addComp(name,640,360,1,3,30);c.workAreaStart=.5;c.workAreaDuration=2;c.motionBlur=false;return c;}
    function exporter(source,destination){
        // Shadow dialogs only inside this eval scope. Native File, app settings,
        // installed script and production exporter contents remain unchanged.
        var File=function(path){return new NativeFile(path);};File.saveDialog=function(){return new NativeFile(destination);};
        var alert=function(message){report.messages.push(String(message));};
        eval(source);
        if(!(new NativeFile(destination)).exists)throw Error('Exporter did not create '+destination);
    }
    function expected(comp,layer){
        var p=tr(layer,'ADBE Position'),a=tr(layer,'ADBE Anchor Point'),s=tr(layer,'ADBE Scale'),r=tr(layer,'ADBE Rotate Z'),o=tr(layer,'ADBE Opacity');
        var result={name:layer.name,samples:[]},frames=[0,6,15,30,45,59],i,t,pos,anc,scale;
        for(i=0;i<frames.length;i++){t=comp.workAreaStart+frames[i]/30;pos=p.dimensionsSeparated?[p.getSeparationFollower(0).valueAtTime(t,false),p.getSeparationFollower(1).valueAtTime(t,false)]:p.valueAtTime(t,false);anc=a.valueAtTime(t,false);scale=s.valueAtTime(t,false);result.samples.push({time:frames[i]/30,position:[pos[0],pos[1]],anchor:[anc[0],anc[1]],scale:[scale[0]/100,scale[1]/100],rotation:r.valueAtTime(t,false),opacity:o.valueAtTime(t,false)/100});}
        return result;
    }
    function inspect(comp,source,skipped){
        comp.openInViewer();var file=outputDirectory.fsName+'/'+comp.name+'.bcae';exporter(source,file);
        var entry={name:comp.name,file:comp.name+'.bcae',expectedLayers:[],expectedSkipped:skipped||[],referenceStatus:'not-rendered'};
        for(var i=1;i<=comp.numLayers;i++){var l=comp.layer(i),omit=false;for(var j=0;j<entry.expectedSkipped.length;j++)if(entry.expectedSkipped[j]===l.name)omit=true;if(!omit)entry.expectedLayers.push(expected(comp,l));}
        report.cases.push(entry);
        // A real Render Queue output module is required. No synthetic image can
        // satisfy the reference-render gate. Leave a useful AEP if unavailable.
        var rq=app.project.renderQueue.items.add(comp),om=rq.outputModule(1),templates=om.templates,png=null;
        for(i=0;i<templates.length;i++)if(/PNG/i.test(templates[i])){png=templates[i];break;}
        if(!png){rq.render=false;entry.referenceStatus='needs-PNG-output-template';return;}
        om.applyTemplate(png);om.setSetting('Channels','RGB + Alpha');om.file=new NativeFile(outputDirectory.fsName+'/'+comp.name+'_[#####].png');rq.timeSpanStart=comp.workAreaStart;rq.timeSpanDuration=comp.workAreaDuration;rq.render=true;
        entry.referenceStatus='queued';entry.outputTemplate=png;
    }
    try {
        if(!app.project||app.project.numItems!==0)throw Error('Open an empty After Effects project. This test will not close or replace an existing project.');
        if(!outputDirectory.exists&&!outputDirectory.create())throw Error('Could not create the QA folder.');
        if(!exporterFile.open('r'))throw Error('Exporter file is missing.');var source;try{source=exporterFile.read().replace(/^#target[^\r\n]*[\r\n]+/,'');}finally{exporterFile.close();}
        app.project.bitsPerChannel=8;
        var geometry=composition('AE-QA-Transforms'),plate=solid(geometry,'Linear position',[1,.35,.05],130,45,[100,90]),p=tr(plate,'ADBE Position');p.setValueAtTime(.5,[100,90]);p.setValueAtTime(2.5,[430,90]);
        var pivot=solid(geometry,'Signed scale and pivot',[.1,.7,.45],110,60,[270,230]);tr(pivot,'ADBE Anchor Point').setValue([10,20]);tr(pivot,'ADBE Scale').setValue([-140,70]);tr(pivot,'ADBE Rotate Z').setValueAtTime(.5,-20);tr(pivot,'ADBE Rotate Z').setValueAtTime(2.5,110);
        var hold=solid(geometry,'Hold opacity',[.2,.5,1],70,50,[550,160]),opacity=tr(hold,'ADBE Opacity');opacity.setValueAtTime(.5,20);opacity.setValueAtTime(1.5,100);opacity.setInterpolationTypeAtKey(1,KeyframeInterpolationType.HOLD,KeyframeInterpolationType.HOLD);
        var expression=solid(geometry,'Expression motion',[.85,.2,.65],40,35,[80,280]);tr(expression,'ADBE Position').expression='[70 + time * 35, 290]';
        var separated=solid(geometry,'Separated position',[.8,.75,.1],50,30,[400,300]);p=tr(separated,'ADBE Position');p.dimensionsSeparated=true;p.getSeparationFollower(0).setValueAtTime(.5,350);p.getSeparationFollower(0).setValueAtTime(2.5,500);p.getSeparationFollower(1).setValue(300);
        inspect(geometry,source,[]);
        var typography=composition('AE-QA-Text-PNG'),text=typography.layers.addText('LOCAL BROADCAST'),td=text.property('ADBE Text Properties').property('ADBE Text Document'),doc=td.value;doc.font='ArialMT';doc.fontSize=40;doc.applyFill=true;doc.fillColor=[1,1,1];doc.applyStroke=false;doc.justification=ParagraphJustification.LEFT_JUSTIFY;td.setValue(doc);text.name='Editable point text';tr(text,'ADBE Position').setValue([60,140]);
        var image=app.project.importFile(new ImportOptions(new NativeFile(outputDirectory.fsName+'/logo.png'))),logo=typography.layers.add(image);logo.name='Embedded PNG';tr(logo,'ADBE Position').setValue([120,240]);logo.inPoint=.7;logo.outPoint=2;
        inspect(typography,source,[]);
        var unsupported=composition('AE-QA-Diagnostics'),base=solid(unsupported,'Supported base',[.1,.3,.7],300,80,[320,180]),parented=solid(unsupported,'Skipped parented',[1,1,1],20,20,[50,50]);parented.parent=base;
        var threed=solid(unsupported,'Skipped 3D',[1,0,0],20,20,[60,60]);threed.threeDLayer=true;
        inspect(unsupported,source,['Skipped parented','Skipped 3D']);
        app.project.save(new NativeFile(outputDirectory.fsName+'/AE-qualification.aep'));
        var queued=false;for(var q=1;q<=app.project.renderQueue.numItems;q++)if(app.project.renderQueue.item(q).render)queued=true;
        if(queued){app.project.renderQueue.render();for(q=0;q<report.cases.length;q++)if(report.cases[q].referenceStatus==='queued')report.cases[q].referenceStatus='render-attempted';}
        report.complete=true;
    } catch(error) {report.error=String(error.message);}
    try{write('host-report.json',json(report));}catch(writeError){alert('AE QA could not write its report: '+writeError.message);return;}
    alert('BroadcastCG AE qualification '+(report.complete?'generated':'stopped')+'. See '+outputDirectory.fsName+'/host-report.json. The Node verifier must pass before claiming this test succeeded.');
}());
