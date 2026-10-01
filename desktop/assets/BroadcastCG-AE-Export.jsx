#target aftereffects
/* BroadcastCG AE exporter 0.7.0. Local, read-only composition inspection.
 * Run via File > Scripts > Run Script File. Exports the active comp's work area.
 * No expressions/scripts are copied into the package. Supported transform values
 * (including expression results) are sampled by AE, then validated by BroadcastCG.
 */
(function () {
    function quote(s) {
        return '"' + String(s).replace(/["\\\u0000-\u001f\u2028\u2029]/g, function (c) {
            if (c === '"' || c === '\\') return '\\' + c;
            var h = c.charCodeAt(0).toString(16); return '\\u' + ('0000' + h).slice(-4);
        }) + '"';
    }
    function json(v) {
        if (v === null) return 'null';
        if (typeof v === 'string') return quote(v);
        if (typeof v === 'number') { if (!isFinite(v)) throw Error('Non-finite animation value.'); return String(v); }
        if (typeof v === 'boolean') return String(v);
        var out = [], i, key;
        if (v instanceof Array) { for (i = 0; i < v.length; i++) out.push(json(v[i])); return '[' + out.join(',') + ']'; }
        for (key in v) if (v.hasOwnProperty(key) && v[key] !== undefined) out.push(quote(key) + ':' + json(v[key]));
        return '{' + out.join(',') + '}';
    }
    function base64(s) {
        var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/', parts = [], block = '', i, a, b, c;
        for (i = 0; i < s.length; i += 3) {
            a = s.charCodeAt(i) & 255; b = i + 1 < s.length ? s.charCodeAt(i + 1) & 255 : 0; c = i + 2 < s.length ? s.charCodeAt(i + 2) & 255 : 0;
            block += alphabet.charAt(a >> 2) + alphabet.charAt(((a & 3) << 4) | (b >> 4)) + (i + 1 < s.length ? alphabet.charAt(((b & 15) << 2) | (c >> 6)) : '=') + (i + 2 < s.length ? alphabet.charAt(c & 63) : '=');
            if (block.length >= 16384) { parts.push(block); block = ''; }
        }
        parts.push(block); return parts.join('');
    }
    function color(rgb) { var s = '#', i, h; for (i = 0; i < 3; i++) { h = Math.round(Math.max(0, Math.min(1, rgb[i])) * 255).toString(16); s += h.length < 2 ? '0' + h : h; } return s; }
    function prop(group, name) { var p = group.property(name); if (!p) throw Error('Missing AE property ' + name); return p; }
    function value(p, t) { var v = p.valueAtTime(t, false); if (p.expressionEnabled && p.expressionError) throw Error('Expression could not be evaluated: ' + p.expressionError); return v; }
    function holds(p, t) {
        if (p.expressionEnabled) return false;
        if (!p.numKeys) return true;
        var k = p.nearestKeyIndex(t); if (p.keyTime(k) > t + 0.0000001) k--;
        return k < 1 || k >= p.numKeys || p.keyOutInterpolationType(k) === KeyframeInterpolationType.HOLD;
    }
    function readPng(file) {
        if (!file || !file.exists) throw Error('Linked PNG is missing.');
        if (!/\.png$/i.test(file.name)) throw Error('Only PNG still footage is supported. Render or convert this source to an RGB/RGBA PNG.');
        if (file.length > 10000000) throw Error('PNG is larger than 10 MB.');
        file.encoding = 'BINARY'; if (!file.open('r')) throw Error('Could not open linked PNG.');
        var bytes; try { bytes = file.read(); } finally { file.close(); }
        return base64(bytes);
    }
    var warnings = [];
    function note(name, message) { if (warnings.length < 1400) warnings.push({layer:String(name).slice(0,200), message:String(message).slice(0,1000)}); }
    try {
        var comp = app.project && app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) throw Error('Open a composition and set its work area before exporting.');
        if (comp.pixelAspect !== 1) throw Error('Use a square-pixel composition.');
        if (comp.width < 100 || comp.width > 7680 || comp.height < 100 || comp.height > 4320) throw Error('Composition must be 100–7680 by 100–4320 pixels.');
        if (comp.numLayers > 250) throw Error('Export at most 250 layers.');
        var start = comp.workAreaStart, duration = Math.min(comp.workAreaDuration, comp.duration - start), fps = comp.frameRate;
        if (duration < 0.1 || duration > 600 || fps < 1 || fps > 120 || Math.ceil(duration * fps) > 18000) throw Error('Export a work area of 0.1–600 seconds, with at most 18,000 frames.');
        var target = File.saveDialog('Export BroadcastCG animation package', '*.bcae');
        if (!target) return;
        // The selected extension is explicit; never write over a source AEP.
        if (!/\.bcae$/i.test(target.name)) throw Error('Save with a .bcae extension.');
        var output = {format:'broadcastcg-ae',version:1,exporter:{name:'BroadcastCG AE Export',version:'0.7.0',aeVersion:String(app.version)},composition:{name:String(comp.name).slice(0,200),width:comp.width,height:comp.height,duration:duration,frameRate:fps,workAreaStart:start,pixelAspect:1},layers:[],assets:[],references:[],warnings:warnings};
        var totalSamples = 0, assetBytes = 0, anySolo = false, index;
        for (index = 1; index <= comp.numLayers; index++) if (comp.layer(index).solo) anySolo = true;
        if (comp.motionBlur) note('Composition','Motion blur is not exported.');
        note('Composition','AE working-space transforms and color profiles are not converted. Use sRGB assets and compare reference renders. Audio is not exported.');
        // AE index 1 is the top layer. BroadcastCG stores bottom-to-top order.
        for (index = comp.numLayers; index >= 1; index--) {
            var source = comp.layer(index), name = String(source.name).slice(0,200);
            try {
                if (!source.enabled || source.guideLayer || (anySolo && !source.solo) || source.nullLayer) { note(name,'Skipped: disabled, guide, non-solo or null layer.'); continue; }
                if (source.outPoint <= start || source.inPoint >= start + duration) { note(name,'Skipped: outside the exported work area.'); continue; }
                if (source.threeDLayer || source.parent || source.adjustmentLayer) throw Error('3D, parenting and adjustment layers require a rendered fallback.');
                if (source.blendingMode !== BlendingMode.NORMAL) throw Error('Only normal layer blending is supported.');
                if (source.hasTrackMatte || source.isTrackMatte) throw Error('Track mattes require a rendered fallback.');
                if (source.autoOrient !== undefined && source.autoOrient !== AutoOrientType.NO_AUTO_ORIENT) throw Error('Auto orientation is not supported.');
                var masks = source.property('ADBE Mask Parade'), effects = source.property('ADBE Effect Parade'), styles = source.property('ADBE Layer Styles'), j;
                if (masks && masks.numProperties) throw Error('Masks require a rendered fallback.');
                if (effects) for (j = 1; j <= effects.numProperties; j++) if (effects.property(j).enabled) throw Error('Enabled effects/plugins require a rendered fallback.');
                if (styles) for (j = 1; j <= styles.numProperties; j++) if (styles.property(j).matchName !== 'ADBE Blend Options Group' && styles.property(j).enabled) throw Error('Layer styles require a rendered fallback.');
                var transform = prop(source,'ADBE Transform Group'), position = prop(transform,'ADBE Position'), anchor = prop(transform,'ADBE Anchor Point'), scale = prop(transform,'ADBE Scale'), rotation = prop(transform,'ADBE Rotate Z'), opacity = prop(transform,'ADBE Opacity');
                var px = position.dimensionsSeparated ? position.getSeparationFollower(0) : null, py = position.dimensionsSeparated ? position.getSeparationFollower(1) : null;
                var item = {id:'layer-'+index,name:name,width:source.width,height:source.height,inPoint:Math.max(0,source.inPoint-start),outPoint:Math.min(duration,source.outPoint-start),samples:[]};
                var textGroup = source.property('ADBE Text Properties'), asset = null;
                if (textGroup) {
                    var textProp = prop(textGroup,'ADBE Text Document'), animators = textGroup.property('ADBE Text Animators'), document = value(textProp,start);
                    if (textProp.numKeys || textProp.expressionEnabled || (animators && animators.numProperties)) throw Error('Animated text content/styles and text animators are not supported.');
                    if (!document.pointText || /[\r\n]/.test(document.text) || !document.applyFill || document.applyStroke || document.fauxItalic || /italic|oblique/i.test(document.fontStyle || '') || document.tracking || document.baselineShift || (document.horizontalScale !== undefined && document.horizontalScale !== 100) || (document.verticalScale !== undefined && document.verticalScale !== 100)) throw Error('Use single-line point text with a solid fill and standard metrics; complex typography requires rendered artwork.');
                    var align = document.justification === ParagraphJustification.LEFT_JUSTIFY ? 'left' : document.justification === ParagraphJustification.CENTER_JUSTIFY ? 'center' : document.justification === ParagraphJustification.RIGHT_JUSTIFY ? 'right' : null;
                    if (!align || !document.text) throw Error('Unsupported or empty text.');
                    var bounds = source.sourceRectAtTime(start,false);
                    item.type = 'text'; item.width = Math.max(1,bounds.width); item.height = Math.max(1,bounds.height); item.color = color(document.fillColor);
                    item.text = {value:document.text,font:document.font,fontSize:document.fontSize,fontWeight:document.fauxBold || /bold/i.test(document.fontStyle || document.font) ? 700 : 400,align:align,left:bounds.left,top:bounds.top};
                    note(name,'Editable point text uses the first character style. Mixed character styles, kerning and browser font metrics may differ; compare an AE reference render.');
                } else if (source.source && source.source.mainSource instanceof SolidSource) {
                    item.type = 'solid'; item.color = color(source.source.mainSource.color);
                } else if (source.source && source.source instanceof FootageItem && source.source.mainSource.isStill && source.source.file) {
                    if (source.source.pixelAspect !== 1 || source.source.useProxy) throw Error('Convert non-square pixels or proxy footage to a square-pixel PNG.');
                    item.type = 'image'; item.imageId = 'image-'+index;
                    asset = {id:item.imageId,name:String(source.source.file.name).slice(0,200),mime:'image/png',bytes:readPng(source.source.file)};
                } else throw Error('Shape paths, precomps, cameras, lights, video and sequences are not supported. Use PNG artwork or rebuild these layers.');
                var times = [], props = px ? [px,py,anchor,scale,rotation,opacity] : [position,anchor,scale,rotation,opacity], frame, t, k;
                for (frame = 0; frame <= Math.ceil(duration * fps); frame++) times.push(Math.min(duration,frame/fps));
                for (j = 0; j < props.length; j++) for (k = 1; k <= props[j].numKeys; k++) { t = props[j].keyTime(k)-start; if (t > 0 && t < duration) times.push(t); }
                times.sort(function(a,b){return a-b;});
                for (j = 0; j < props.length; j++) if (props[j].expressionEnabled) note(name,'Transform expression results were sampled in AE. The expression itself is not exported or re-evaluated when data changes.');
                for (j = 0; j < times.length; j++) {
                    if (j && Math.abs(times[j]-times[j-1]) < 0.0000001) continue;
                    t = start + times[j]; var pos = px ? [value(px,t),value(py,t)] : value(position,t), anc = value(anchor,t), sc = value(scale,t), hold = [];
                    if (px ? holds(px,t) && holds(py,t) : holds(position,t)) hold.push('position');
                    if (holds(anchor,t)) hold.push('anchor'); if (holds(scale,t)) hold.push('scale'); if (holds(rotation,t)) hold.push('rotation'); if (holds(opacity,t)) hold.push('opacity');
                    item.samples.push({time:times[j],position:[pos[0],pos[1]],anchor:[anc[0],anc[1]],scale:[sc[0],sc[1]],rotation:value(rotation,t),opacity:value(opacity,t),hold:hold});
                }
                if (item.samples.length > 18001 || totalSamples + item.samples.length > 100000) throw Error('Transform sample limit reached. Export a shorter work area or fewer layers.');
                if (asset && assetBytes + asset.bytes.length * 0.75 > 55000000) throw Error('Embedded images exceed 55 MB.');
                totalSamples += item.samples.length; output.layers.push(item); if (asset) { output.assets.push(asset); assetBytes += asset.bytes.length * 0.75; }
            } catch (layerError) { note(name,'Skipped: '+layerError.message); }
        }
        if (!output.layers.length) throw Error('No supported layers were found.\n'+json(warnings));
        var encoded = json(output); if (encoded.length > 80000000) throw Error('Package exceeds 80 MB. Export fewer layers or a shorter work area.');
        target.encoding = 'UTF-8'; if (!target.open('w')) throw Error('Cannot write the package. Enable Allow Scripts To Write Files in After Effects scripting preferences.');
        try { if (!target.write(encoded)) throw Error('Package could not be written.'); } finally { target.close(); }
        alert('Exported '+output.layers.length+' layers to '+target.fsName+'\nOpen BroadcastCG > Import AE > Choose package. Review all '+warnings.length+' conversion notes and attach reference PNGs before using it on air.\nYour AE project was not modified.');
    } catch (error) { alert('BroadcastCG export: '+error.message); }
}());
