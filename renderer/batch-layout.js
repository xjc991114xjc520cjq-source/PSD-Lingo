import {smartFit} from '../layout.cjs';
export function languageLayouts(template,doc,{mode,fitMode,minimumPercent}){
  if(mode==='order'&&doc.records.length!==template.plan.records.length)throw new Error('条目数不一致：模板 '+template.plan.records.length+' 条，文档 '+doc.records.length+' 条');
  const keyed=new Map();if(mode==='key'){for(const r of doc.records){if(!r.key||keyed.has(r.key))throw new Error('文档编号为空或重复：'+r.key);keyed.set(r.key,r);}const seen=new Set();for(const r of template.plan.records){if(!r.key||seen.has(r.key))throw new Error('模板编号为空或重复：'+r.key);seen.add(r.key);}}
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d'),rows=[];
  const layouts=template.bindings.map(b=>{const file=template.plan.files[b.fileIndex],j=file.jobs.find(j=>j.layerId===b.layerId),base=j.previewLayout,r=mode==='order'?doc.records[b.recordIndex]:keyed.get(b.recordKey);if(!r)throw new Error('缺少文案编号：'+b.recordKey);
    const family=j.manual?.family||({ArialMT:'Arial','Arial-BoldMT':'Arial',MicrosoftYaHei:'Microsoft YaHei'}[base.font])||base.font.replace(/[-_]/g,' '),sx=base.stretchX/100,sy=base.stretchY/100;
    // Effective horizontal aspect is recorded when the template is captured.
    const aspect=b.aspectScale||1,measure=(text,size,tracking)=>{ctx.font=`${base.weight==='bold'?'bold ':''}${size}px "${family.replace(/"/g,'')}", "Microsoft YaHei", sans-serif`;const m=ctx.measureText(text);return {width:Math.max(0,m.width+Math.max(0,[...text].length-1)*tracking*size/1000)*sx*aspect,height:(m.actualBoundingBoxAscent+m.actualBoundingBoxDescent)*sy,ascent:m.actualBoundingBoxAscent*sy};};
    const fit=smartFit({text:r.target,size:base.size,minSize:fitMode==='fixed'?base.size:Math.max(1,base.size*minimumPercent/100),width:base.box[2],height:base.box[3],tracking:base.tracking,leading:base.leading*sy,allowWrap:j.smart?.allowWrap!==false,allowLeading:fitMode==='adapt',trackingLimit:fitMode==='adapt'?Math.max(0,Math.min(30,base.tracking+200)):0},measure);
    const offset=b.alignment==='center'?(base.box[2]-fit.width)/2:b.alignment==='right'?base.box[2]-fit.width:0;
    const p={fileIndex:b.fileIndex,layerId:b.layerId,text:fit.text,breaks:fit.breaks,size:fit.size,font:base.font,weight:base.weight,tracking:fit.tracking,leading:fit.leading/sy,stretchX:base.stretchX,stretchY:base.stretchY,box:[base.box[0]+Math.max(0,offset),base.box[1],Math.max(1,fit.width),Math.max(1,fit.height)]};
    rows.push({file:file.name,layer:b.layerName,key:b.recordKey,ordinal:b.recordIndex+1,target:r.target,size:p.size,font:p.font,ok:fit.ok,adjusted:fit.breaks.length>0||Math.abs(p.size-base.size)>.01||p.tracking!==base.tracking||Math.abs(p.leading-base.leading)>.01});return p;
  });
  return {layouts,rows,overflow:rows.filter(r=>!r.ok).length};
}
