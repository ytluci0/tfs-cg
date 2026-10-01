#target photoshop
/* Creates only new QA documents. The Node preparation script supplies a unique
 * output directory. Run from File > Scripts > Browse in Photoshop. */
(function () {
    var folder = new Folder(__OUTPUT_DIRECTORY__);
    var report = {application:'Adobe Photoshop',version:String(app.version),complete:false,cases:[]};
    var dialogs = app.displayDialogs, foreground = app.foregroundColor, background = app.backgroundColor;
    var compatibility = app.preferences.maximizeCompatibility;
    function json(v) {
        if (v === null) return 'null';
        if (typeof v === 'number' || typeof v === 'boolean') return String(v);
        if (typeof v === 'string') return '"'+v.replace(/["\\\u0000-\u001f]/g,function(c){if(c==='"'||c==='\\')return '\\'+c;return '\\u'+('0000'+c.charCodeAt(0).toString(16)).slice(-4);})+'"';
        var values=[],i,k;if(v instanceof Array){for(i=0;i<v.length;i++)values.push(json(v[i]));return '['+values.join(',')+']';}
        for(k in v)if(v.hasOwnProperty(k))values.push(json(k)+':'+json(v[k]));return '{'+values.join(',')+'}';
    }
    function file(name){return new File(folder.fsName+'/'+name);}
    function rgb(r,g,b){var c=new SolidColor();c.rgb.red=r;c.rgb.green=g;c.rgb.blue=b;return c;}
    function png(doc,name){var options=new PNGSaveOptions();options.interlaced=false;doc.saveAs(file(name),options,true,Extension.LOWERCASE);}
    function save(doc,name){var options=new PhotoshopSaveOptions();options.layers=true;options.embedColorProfile=true;doc.saveAs(file(name+'.psd'),options,true,Extension.LOWERCASE);png(doc,name+'.png');}
    function paint(doc,x,y,w,h,color){function point(a,b){return [UnitValue(a,'px'),UnitValue(b,'px')];}doc.selection.select([point(x,y),point(x+w,y),point(x+w,y+h),point(x,y+h)]);doc.selection.fill(color,ColorBlendMode.NORMAL,100,false);doc.selection.deselect();}
    function fixture(name,operation){
        var entry={name:name,filter:operation,file:name+'.psd',reference:name+'.png',before:name+'-before.png',passed:false};report.cases.push(entry);
        var doc=null;
        try{
            doc=app.documents.add(UnitValue(640,'px'),UnitValue(360,'px'),72,name,NewDocumentMode.RGB,DocumentFill.TRANSPARENT,1,BitsPerChannelType.EIGHT,'sRGB IEC61966-2.1');
            doc.activeLayer.name='Plugin artwork';
            paint(doc,0,0,640,360,rgb(20,40,60));paint(doc,40,60,240,210,rgb(245,90,20));paint(doc,350,100,210,150,rgb(50,180,235));
            png(doc,entry.before);
            if(operation==='Clouds')doc.activeLayer.applyClouds();
            else if(operation==='Solarize')executeAction(charIDToTypeID('Slrz'),new ActionDescriptor(),DialogModes.NO);
            else throw Error('Unrecognized test filter');
            save(doc,name);entry.passed=true;
        }catch(error){entry.error=String(error.message);}
        finally{if(doc)doc.close(SaveOptions.DONOTSAVECHANGES);}
    }
    if(file('host-report.json').exists){alert('This output directory already has a host report. Prepare a fresh test directory.');return;}
    try{
        if(app.documents.length)throw Error('Use an empty Photoshop workspace. Existing documents are never closed by this test.');
        if(!folder.exists)throw Error('Run the Node preparation script first.');
        app.displayDialogs=DialogModes.NO;app.preferences.maximizeCompatibility=QueryStateType.ALWAYS;
        app.foregroundColor=rgb(20,50,90);app.backgroundColor=rgb(235,140,30);
        fixture('PSD-QA-Clouds','Clouds');fixture('PSD-QA-Solarize','Solarize');
        report.complete=report.cases.length===2&&report.cases[0].passed&&report.cases[1].passed;
    }catch(error){report.error=String(error.message);}
    finally{app.displayDialogs=dialogs;app.preferences.maximizeCompatibility=compatibility;app.foregroundColor=foreground;app.backgroundColor=background;}
    var output=file('host-report.json');output.encoding='UTF-8';
    if(!output.open('w')){alert('Unable to write the Photoshop QA report.');return;}
    try{output.write(json(report));}finally{output.close();}
    return report.complete?'Photoshop fixtures generated. Run the importer verifier.':'Photoshop fixture generation failed; inspect host-report.json.';
}());
