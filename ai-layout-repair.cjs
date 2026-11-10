// Reconcile model estimates with the actual renderer, preserving approved copy/font.
const {validBox}=require('./container-fit.cjs');
const {proposeVisualLayout}=require('./visual-layout.cjs');
const {manualStyleFor,manualStyleIssues}=require('./layout.cjs');
const overlaps=(a,b)=>a[0]<b[0]+b[2]-.1&&a[0]+a[2]>b[0]+.1&&a[1]<b[1]+b[3]-.1&&a[1]+a[3]>b[1]+.1;
function ink(row){const b=row.box,f=row.fit,factor=row.alignment==='center'?.5:row.alignment==='right'?1:0,w=f?.width||b[2],h=f?.height||b[3];return [b[0]+Math.max(0,b[2]-w)*factor,b[1],w,h];}
function repairDesignProposal({layer,record,proposal,request,fitText,file,preserveVisualPlacement=false,deferLayerKeys=[]}){
 const selected=request.layers.find(r=>r.layerKey===String(layer.id));
 if(!selected||!validBox(proposal?.box))return {ok:false,reason:'AI 未返回有效文字区域。'};
 if(selected.containerAmbiguous)return {ok:false,reason:'原稿文字对应多个容器，请先明确指定背景容器。'};
 // A visual proposal must not be re-centered later using a text frame or
 // line-height estimate. Measurements may veto it, never certify aesthetics.
 if(preserveVisualPlacement){
  const candidate={...layer,sourceBox:[...(layer.sourceBox||layer.box)],box:[...proposal.box],position:{x:proposal.box[0],y:proposal.box[1]},alignment:proposal.alignment,manual:manualStyleFor(layer,{size:proposal.size,tracking:proposal.tracking,leading:proposal.leading}),smart:{...layer.smart,allowWrap:true,allowLeading:false,trackingLimit:0}};
  if(proposal.paragraphs){const sourceText=typeof layer.customText==='string'?layer.customText:record.target;try{candidate.textLayout={sourceText,paragraphs:require('./design-text-layout.cjs').validateParagraphs(sourceText,proposal.paragraphs)};}catch(e){return {ok:false,reason:e.message};}}else candidate.textLayout=null;
  const invalid=manualStyleIssues(candidate.manual);if(invalid.length)return {ok:false,reason:'视觉提案样式不完整，已跳过。'};
  let fit,metricRepair=false;try{fit=fitText(candidate,record);}catch{return {ok:false,reason:'视觉提案无法完成本机字体检查，已跳过。'};}
  // Correct only a tiny width estimate on explicitly approved line breaks.
  // Keep its alignment anchor, copy, font, size and leading. A new actual
  // render and relationship review are still mandatory before any commit.
  const excess=fit?.width-candidate.box[2];
  if(candidate.textLayout&&fit?.fontAvailable!==false&&Number.isFinite(excess)&&excess>.1&&excess<=candidate.manual.size*.25&&Number.isFinite(fit.height)&&fit.height<=candidate.box[3]+.1){
   const delta=excess+.25,anchor=candidate.alignment==='center'?.5:candidate.alignment==='right'?1:0;
   candidate.box[0]-=delta*anchor;candidate.box[2]+=delta;candidate.position.x=candidate.box[0];
   try{fit=fitText(candidate,record);metricRepair=true;}catch{return {ok:false,reason:'微量宽度修正后字体检查失败，已保留原状。'};}
  }
  if(!fit?.ok||fit.fontAvailable===false||!Number.isFinite(fit.width)||!Number.isFinite(fit.height)||fit.width>candidate.box[2]+.1||fit.height>candidate.box[3]+.1)return {ok:false,reason:'视觉提案未通过本机容纳检查：'+(fit?.fontAvailable===false?'指定字体不可用':Number.isFinite(fit?.width)&&Number.isFinite(fit?.height)?`当前断行实际需要 ${fit.width.toFixed(2)} × ${fit.height.toFixed(2)}，提案区域只有 ${candidate.box[2].toFixed(2)} × ${candidate.box[3].toFixed(2)}`:'未取得有效字体测量')+'。应重新规划可用区域、合法断行及关联行高；保留原状，不使用字符框重新居中或自动缩小。'};
  const bounds=ink({box:candidate.box,alignment:candidate.alignment,fit});
  if(bounds[0]<0||bounds[1]<0||bounds[0]+bounds[2]>request.canvas.width+.1||bounds[1]+bounds[3]>request.canvas.height+.1||request.layers.filter(r=>r.layerKey!==selected.layerKey&&!deferLayerKeys.includes(r.layerKey)).some(r=>overlaps(bounds,ink(r))))return {ok:false,reason:'视觉提案存在边界或近邻冲突风险，已跳过，需查看渲染图。'};
  const board=selected.boardBox;if(board&&(bounds[0]<board[0]-.1||bounds[1]<board[1]-.1||bounds[0]+bounds[2]>board[0]+board[2]+.1||bounds[1]+bounds[3]>board[1]+board[3]+.1))return {ok:false,reason:'文字实际渲染越过所属画板，已跳过。'};
  let containerEdit;
  if(proposal.containerEdit){const shape=request.containers.find(c=>c.id===selected.containerId),e=proposal.containerEdit;const obstacles=[...request.layers.filter(r=>r.layerKey!==selected.layerKey).map(ink),...request.containers.filter(c=>c.id!==selected.containerId).map(c=>c.box)];if(!shape||obstacles.some(b=>overlaps(e.box,b)&&!overlaps(shape.box,b)))return {ok:false,reason:'视觉容器提案存在相邻冲突风险，已跳过。'};const source=file?.containers?.find(c=>String(c.id)===e.layerId);if(!source)return {ok:false,reason:'视觉容器来源不明确，已跳过。'};containerEdit={layerId:source.id,box:[...e.box]};}
  return {ok:true,candidate,fit,...(containerEdit?{containerEdit}:{}),repaired:metricRepair,requiresVisualReview:true};
 }
 const shape=request.containers.find(c=>c.id===selected.containerId),pad=shape?Math.min(Math.max(6,selected.originalSize*.55),shape.box[2]*.12,shape.box[3]*.18):0;
 let region=shape?[shape.box[0]+pad,shape.box[1]+pad,shape.box[2]-pad*2,shape.box[3]-pad*2]:[...proposal.box];
 if(!validBox(region))return {ok:false,reason:'原稿背景容器没有可用的文字内边距空间。'};
 const peers=request.layers.filter(r=>r.layerKey!==selected.layerKey).map(ink);
 // Keep the original container relationship, and expand an exclusive live
 // rectangle before compressing typography. No fill/stroke/radius changes.
 if(shape&&file){
  const sizing={...layer,manual:manualStyleFor(layer,{size:proposal.size,tracking:proposal.tracking,leading:proposal.leading})};
  let sizingFile=file;
  if(proposal.containerEdit){const e=proposal.containerEdit,source=file.containers?.find(c=>String(c.id)===e.layerId);
   const obstacles=[...peers,...request.containers.filter(c=>c.id!==selected.containerId).map(c=>c.box)];
   const safe=validBox(e.box)&&!obstacles.some(b=>overlaps(e.box,b)&&!overlaps(shape.box,b));
   if(source&&String(source.id)===selected.containerId&&safe){sizingFile={...file,containerEdits:[...(file.containerEdits||[]).filter(c=>c.layerId!==source.id),{...(file.containerEdits||[]).find(c=>c.layerId===source.id),layerId:source.id,box:[...e.box]}]};}
  }
  const planned=proposeVisualLayout(sizingFile,sizing,record,fitText);
  if(planned.ok&&planned.containerEdit){
   const patch=planned.layerPatch,cb=planned.containerEdit.box,sb=shape.sourceBox||shape.box,source=selected.sourceBox;
   const lp=source[0]-sb[0],rp=sb[0]+sb[2]-source[0]-source[2],centered=Math.abs(lp-rp)<=Math.max(4,selected.originalSize*.3);
   const alignment=centered?'center':(layer.sourceAlignment||layer.alignment||'left');
   const fit=fitText({...layer,...patch},record);
   const margin=Math.max(6,Math.min(Math.max(0,alignment==='right'?rp:lp),selected.originalSize));
   const x=alignment==='center'?cb[0]+(cb[2]-fit.width)/2:alignment==='right'?cb[0]+cb[2]-margin-fit.width:cb[0]+margin;
   const y=cb[1]+(cb[3]-fit.height)/2;
   const bounds=[x,y,fit.width,fit.height];
   if(fit.ok&&fit.fontAvailable!==false&&y>=cb[1]&&y+fit.height<=cb[1]+cb[3]+.1&&x>=cb[0]&&x+fit.width<=cb[0]+cb[2]+.1&&!peers.some(b=>overlaps(bounds,b))){
    patch.box[0]=x;patch.position.x=x;patch.box[1]=y;patch.position.y=y;
    return {ok:true,candidate:{...layer,...patch,alignment:'left'},fit,containerEdit:planned.containerEdit,repaired:true};
   }
  }
 }
 const minSize=Math.max(1,Math.min(selected.size,selected.size*.55)),start=Math.min(selected.size*1.15,proposal.size);
 const sizes=[start];for(let n=start*.97;n>minSize+.01;n*=.97)sizes.push(n);sizes.push(minSize);
 for(const size of sizes){
  const ratio=size/proposal.size,leading=Math.max(size*1.05,Math.min(size*1.65,proposal.leading*ratio));
  const candidate={...layer,sourceBox:[...(layer.sourceBox||layer.box)],box:[...region],position:{x:region[0],y:region[1]},alignment:shape?'center':proposal.alignment,manual:manualStyleFor(layer,{size,tracking:proposal.tracking,leading}),smart:{...layer.smart,allowWrap:true,allowLeading:false,trackingLimit:0}};
  const invalid=manualStyleIssues(candidate.manual);if(invalid.length)return {ok:false,reason:'排版建议缺少有效'+invalid.join('、')+'，未应用。'};
  let fit;try{fit=fitText(candidate,record);}catch(e){return {ok:false,reason:'本机文字测量失败：'+e.message};}
  if(fit?.fontAvailable===false)return {ok:false,reason:'本机缺少文字指定字体“'+(candidate.manual?.font||candidate.font)+'”，请安装该字体或手动选择可用字体。'};
  if(!fit?.ok||!Number.isFinite(fit.width)||!Number.isFinite(fit.height)||fit.width>region[2]+.1||fit.height>region[3]+.1)continue;
  if(shape){candidate.box[1]=shape.box[1]+(shape.box[3]-fit.height)/2;candidate.position.y=candidate.box[1];candidate.box[3]=Math.max(fit.height,0.1);}
  const bounds=ink({box:candidate.box,alignment:candidate.alignment,fit});
  if(bounds[0]<0||bounds[1]<0||bounds[0]+bounds[2]>request.canvas.width+.1||bounds[1]+bounds[3]>request.canvas.height+.1||peers.some(b=>overlaps(bounds,b)))continue;
  return {ok:true,candidate,fit,repaired:!!shape||Math.abs(size-proposal.size)>.01};
 }
 return {ok:false,reason:shape?'已按原稿容器重新居中并尝试缩小，仍无法兼顾完整文案与相邻留白；请调整容器或手动排版。':'AI 区域在本机实际字体测量下仍无法容纳完整文案或与相邻文字冲突，当前排版已保留。'};
}
module.exports={repairDesignProposal};

