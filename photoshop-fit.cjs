// ES3-compatible Photoshop implementation uses actual Photoshop-rendered bounds.
module.exports = String.raw`
function applyPreviewLayer(layer,job){
 var ti=layer.textItem,p=job.previewLayout,pointsPerPixel=72/app.activeDocument.resolution;
 ti.contents=p.text.replace(/\n/g,"\r");ti.font=p.font;
 // Assign native enum values inside branches: ExtendScript host setters can
 // mis-handle a conditional enum expression (verified against saved PSDs).
 if(job.nativeCreation){if(job.alignment==='center'){ti.justification=Justification.CENTER;}else if(job.alignment==='right'){ti.justification=Justification.RIGHT;}else{ti.justification=Justification.LEFT;}}
 ti.size=UnitValue(p.size*pointsPerPixel,"pt");ti.tracking=p.tracking;
 ti.useAutoLeading=false;ti.leading=UnitValue(p.leading*pointsPerPixel,"pt");
 ti.horizontalScale=ti.horizontalScale*p.stretchX/100;ti.verticalScale=ti.verticalScale*p.stretchY/100;
 if(p.weight!=="original")ti.fauxBold=p.weight==="bold"||p.weight==="black";
 var b=bounds(layer);layer.translate(UnitValue(p.box[0]-b[0],"px"),UnitValue(p.box[1]-b[1],"px"));
 ti=layer.textItem;if(canonical(ti.contents)!==p.text)throw new Error("预览文字写入后不一致："+layer.name);
 return {text:p.text,breaks:p.breaks,size:ti.size.as("pt"),tracking:p.tracking,leading:ti.leading.as("pt"),unchanged:false};
}
function autoFitLayer(layer, job) {
  var ti = layer.textItem, originalBounds = bounds(layer), startSize = ti.size.as("pt"), baseTracking;
  // Some real PSDs omit the tracking descriptor; Photoshop throws on the getter.
  try{baseTracking=ti.tracking;}catch(_){baseTracking=typeof job.originalTracking==="number"?job.originalTracking:0;}
  if(!isFinite(baseTracking))baseTracking=0;
  var originalLeading; try { originalLeading = ti.useAutoLeading ? startSize * ti.autoLeadingAmount / 100 : ti.leading.as("pt"); } catch (_) { originalLeading = startSize * 1.2; }
  if (!isFinite(originalLeading) || originalLeading <= 0) originalLeading = startSize * 1.2;
  var targetBox=job.position?[job.position.x,job.position.y,job.box[2],job.box[3]]:job.box;
  var moved=!!job.position&&(job.position.x!==job.box[0]||job.position.y!==job.box[1]);
  if(moved){var dx=targetBox[0]-job.box[0],dy=targetBox[1]-job.box[1];originalBounds[0]+=dx;originalBounds[2]+=dx;originalBounds[1]+=dy;originalBounds[3]+=dy;}
  // The original allowed region may cross the canvas after alignment; only
  // rendered text is allowed on canvas. Clip the fitting region, not glyphs.
  var clippedX=Math.max(0,targetBox[0]),clippedY=Math.max(0,targetBox[1]);
  targetBox=[clippedX,clippedY,Math.min(app.activeDocument.width.as("px"),targetBox[0]+targetBox[2])-clippedX,Math.min(app.activeDocument.height.as("px"),targetBox[1]+targetBox[3])-clippedY];
  if(targetBox[2]<=0||targetBox[3]<=0)throw new Error("文字目标区域不在画布内："+layer.name);
  var originalSize=startSize, manual=job.manual;
  if(manual){
    // Set the target before changing fonts: applying a Latin font to the old Chinese
    // contents first can make Photoshop retain the old font through glyph fallback.
    ti.contents=canonical(job.target).replace(/\n/g,"\r");
    ti.font=manual.font;ti.size=UnitValue(originalSize*manual.size/job.size,"pt");
    ti.tracking=manual.tracking;ti.useAutoLeading=false;
    ti.leading=UnitValue(originalSize*manual.leading/job.size,"pt");
    if(manual.weight!=="original")ti.fauxBold=manual.weight==="bold"||manual.weight==="black";
    if(manual.stretchX!==undefined)ti.horizontalScale=ti.horizontalScale*manual.stretchX/100;
    if(manual.stretchY!==undefined)ti.verticalScale=ti.verticalScale*manual.stretchY/100;
    startSize=ti.size.as("pt");baseTracking=ti.tracking;originalLeading=ti.leading.as("pt");
  }
  var text = canonical(job.target), minimum = startSize * job.minSize / job.size;
  var policy = job.smart || {allowWrap:true, allowLeading:true, trackingLimit:30};
  if(manual){minimum=startSize;policy={allowWrap:policy.allowWrap,allowLeading:false,trackingLimit:0};}
  var cache = {}, best = null, sizes = [startSize], values = [0], sourceLeadingAuto = ti.useAutoLeading;
  var sourceAlignment = String(ti.justification);
  for (var ratio = .95; startSize * ratio > minimum + .01; ratio -= .05) sizes.push(startSize * ratio);
  if (minimum < startSize) sizes.push(minimum);
  for (var d = 10; d <= policy.trackingLimit; d += 10) values.push(d);
  if (policy.trackingLimit && values[values.length-1] !== policy.trackingLimit) values.push(policy.trackingLimit);
  var points = [];
  for (var p = 1; p < text.length; p++) {
    var a = text.charAt(p-1), b = text.charAt(p);
    if (a === "\n" || b === "\n") continue;
    if (/[ \t]/.test(a) && !/[ \t]/.test(b)) points.push(p);
    else if (/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(a) && /[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(b)) points.push(p);
  }
  function write(value) { ti.contents = value.replace(/\n/g, "\r"); }
  function measure(value) {
    var key = "v:" + ti.size.as("pt") + ":" + ti.tracking + ":" + value;
    if (cache.hasOwnProperty(key)) return cache[key];
    if (!value.replace(/[ \t]/g,"")) return 0;
    write(value); var b = bounds(layer); cache[key] = b[2]-b[0]; return cache[key];
  }
  function wrapped(width) {
    var added = [], start = 0;
    while (start < text.length) {
      var end = text.indexOf("\n", start); if (end < 0) end = text.length;
      if (measure(text.substring(start,end)) <= width) { start = end+1; continue; }
      var chosen = -1;
      for (var n=0;n<points.length;n++) if (points[n]>start && points[n]<end) { if (measure(text.substring(start,points[n]))>width)break; chosen=points[n]; }
      if (chosen<0) { start=end+1; continue; }
      added.push(chosen); start=chosen;
    }
    var value = "", previous=0;
    for (var n=0;n<added.length;n++) { value += text.substring(previous,added[n])+"\n"; previous=added[n]; }
    value += text.substring(previous);
    return {text:value, breaks:added};
  }
  function anchored() {
    var b=bounds(layer), targetX=originalBounds[0];
    if (/CENTER/.test(sourceAlignment)) targetX=(originalBounds[0]+originalBounds[2]-(b[2]-b[0]))/2;
    else if (/RIGHT/.test(sourceAlignment)) targetX=originalBounds[2]-(b[2]-b[0]);
    layer.translate(UnitValue(targetX-b[0],"px"),UnitValue(originalBounds[1]-b[1],"px"));
  }
  // Preserve every original style setting when unmodified text already fits.
  write(text); anchored();
  if (within(layer,targetBox)) return {text:text,breaks:[],size:startSize,tracking:baseTracking,leading:manual?originalLeading:undefined,autoLeading:sourceLeadingAuto,unchanged:!manual&&!moved};
  for (var s=0;s<sizes.length;s++) for (var d=0;d<values.length;d++) {
    ti.size=UnitValue(sizes[s],"pt"); ti.tracking=baseTracking-values[d];
    var leading=originalLeading*sizes[s]/startSize;
    var variants=[{text:text,breaks:[]}];
    if (policy.allowWrap) for (var w=0;w<3;w++) {
      var v=wrapped(targetBox[2]*[1,.9,.8][w]), exists=false;
      for(var k=0;k<variants.length;k++)if(variants[k].text===v.text)exists=true;
      if(!exists)variants.push(v);
    }
    for (var v=0;v<variants.length;v++) {
      var variant=variants[v], lines=variant.text.split("\n").length, leadings=[leading];
      if (policy.allowLeading && lines>1) for(var k=0;k<3;k++){
        var compact=Math.min(leading,sizes[s]*[1.3,1.15,1.05][k]);
        if(compact!==leadings[leadings.length-1])leadings.push(compact);
      }
      for (var q=0;q<leadings.length;q++) {
        ti.useAutoLeading=false; ti.leading=UnitValue(leadings[q],"pt"); write(variant.text); anchored();
        var b=bounds(layer), width=b[2]-b[0], height=b[3]-b[1];
        var overflow=Math.max(width/targetBox[2],height/targetBox[3]);
        if (!best || overflow<best.overflow)best={width:width,height:height,overflow:overflow};
        if(within(layer,targetBox)) {
          if(canonical(ti.contents)!==variant.text)throw new Error("排版写入后文案不一致："+layer.name);
          // Verify added line breaks are the only changes to the canonical source string.
          var rebuilt="",prev=0;
          for(var n=0;n<variant.breaks.length;n++){rebuilt+=text.substring(prev,variant.breaks[n])+"\n";prev=variant.breaks[n];}
          rebuilt+=text.substring(prev);
          if(rebuilt!==variant.text)throw new Error("排版内容校验失败："+layer.name);
          return {text:variant.text,breaks:variant.breaks,size:sizes[s],tracking:ti.tracking,leading:leadings[q],unchanged:false};
        }
      }
    }
  }
  throw new Error("已完成智能适配尝试，仍需调整约束："+layer.name+"。最小字号 "+minimum.toFixed(1)+" pt；原区域 "+job.box[2]+"×"+job.box[3]+" px；最佳结果 "+Math.ceil(best.width)+"×"+Math.ceil(best.height)+" px。可在软件中降低最小字号或更换已有文案；未改写文案、未扩大区域。" );
}
`;
